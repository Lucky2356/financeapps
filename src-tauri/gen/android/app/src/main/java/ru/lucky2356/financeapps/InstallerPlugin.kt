package ru.lucky2356.financeapps

// Обновление на телефоне — не выходя из приложения.
//
// Прежде приложение открывало ссылку на APK в браузере: человек видел страницу
// GitHub, скачивание в шторке и искал файл в «Загрузках». Теперь APK скачивается
// сюда же, в кэш приложения, и сразу открывается системный экран установки.
//
// ЧТО ОСТАЁТСЯ ЗА ANDROID, и так и должно быть:
//   * разрешение «устанавливать из этого источника» — система спросит его сама
//     при первом обновлении;
//   * проверка подписи — Android не поставит APK поверх приложения, если он
//     подписан другим ключом. Подсунуть чужой файл этим путём нельзя.
//
// Скачиваются только файлы выпусков этого проекта: адрес сверяется с началом
// ссылки, и чужой адрес отвергается до всякого соединения.

import android.app.Activity
import android.content.Intent
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.WebView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class SlotArgs {
  var slot: String = "main"
}

@InvokeArg
class InstallArgs {
  lateinit var url: String
  /** Куда сообщать, сколько скачано: 40 МБ по мобильной сети — это минуты. */
  var onProgress: Channel? = null
}

@InvokeArg
class SealArgs {
  lateinit var secret: String
  /** Чей ключ: у каждого человека на устройстве свой. */
  var slot: String = "main"
  lateinit var title: String
  lateinit var cancel: String
}

@InvokeArg
class OpenArgs {
  var slot: String = "main"
  lateinit var iv: String
  lateinit var data: String
  lateinit var title: String
  lateinit var cancel: String
}

private const val RELEASES = "https://github.com/Lucky2356/financeapps/releases/download/"

/**
 * Ссылки, которыми открывают приложение: связка из QR-кода (её открывает
 * обычная камера) и ярлыки на значке — «Расход», «Доход», «Сканировать чек».
 */
private val LINKS = listOf("financeapps://pair", "financeapps://add", "financeapps://receipt")

/** Ключ в хранилище Android, которым запечатан ключ данных под отпечаток. */
private fun biometricAlias(slot: String) =
  "financeapps.biometric." + slot.filter { it.isLetterOrDigit() || it == '_' || it == '-' }

@TauriPlugin
class InstallerPlugin(private val activity: Activity) : Plugin(activity) {
  // ——— ссылка из QR-кода ———————————————————————————————————————————————
  //
  // Человек навёл обычную камеру телефона на QR-код связки, и Android открыл
  // приложение по ссылке financeapps://pair… (фильтр в AndroidManifest.xml).
  // Сама ссылка приходит сюда — с запуском или, если приложение уже было
  // открыто, отдельным намерением. Страница забирает её командой take_link:
  // при запуске и каждый раз, когда приложение снова на экране.
  private var pendingLink: String? = null

  private fun remember(intent: Intent?) {
    val link = intent?.data?.toString() ?: return
    if (LINKS.any { link.startsWith(it) }) pendingLink = link
  }

  override fun load(webView: WebView) {
    super.load(webView)
    remember(activity.intent)
  }

  override fun onNewIntent(intent: Intent) {
    remember(intent)
  }

  @Command
  fun takeLink(invoke: Invoke) {
    val answer = JSObject()
    answer.put("url", pendingLink ?: "")
    // Один раз: иначе каждое возвращение на экран подключало бы заново.
    pendingLink = null
    invoke.resolve(answer)
  }

  // ——— вход по отпечатку —————————————————————————————————————————————————
  //
  // Ключ данных приложения запечатывается ключом из хранилища Android, который
  // открывается только отпечатком (или лицом — тем, что Android считает
  // «сильной» биометрией). Сам ключ хранилища из телефона не достать, а новый
  // отпечаток в настройках телефона делает его недействительным — тогда снова
  // нужен пароль. Здесь нет ничего, что знало бы пароль: только запечатать и
  // распечатать то, что дала страница.

  @Command
  fun biometricStatus(invoke: Invoke) {
    val answer = JSObject()
    val can = BiometricManager.from(activity)
      .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
    answer.put("available", can == BiometricManager.BIOMETRIC_SUCCESS)
    // Отпечатков нет, но датчик есть — можно подсказать, где их добавить.
    answer.put("enrollable", can == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED)
    invoke.resolve(answer)
  }

  @Command
  fun biometricSeal(invoke: Invoke) {
    val args = invoke.parseArgs(SealArgs::class.java)
    try {
      // Каждое включение — новый ключ: старый, если был, больше не нужен.
      forgetKey(args.slot)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, createKey(args.slot))
      prompt(invoke, cipher, args.title, args.cancel) { ready ->
        val sealed = ready.doFinal(args.secret.toByteArray(Charsets.UTF_8))
        val answer = JSObject()
        answer.put("iv", Base64.encodeToString(ready.iv, Base64.NO_WRAP))
        answer.put("data", Base64.encodeToString(sealed, Base64.NO_WRAP))
        answer
      }
    } catch (error: Exception) {
      invoke.reject("[broken] " + (error.message ?: "Не удалось включить вход по отпечатку."))
    }
  }

  @Command
  fun biometricOpen(invoke: Invoke) {
    val args = invoke.parseArgs(OpenArgs::class.java)
    try {
      val key = existingKey(args.slot)
      if (key == null) {
        invoke.reject("[invalidated] Вход по отпечатку сброшен — войдите паролем.")
        return
      }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(
        Cipher.DECRYPT_MODE,
        key,
        GCMParameterSpec(128, Base64.decode(args.iv, Base64.NO_WRAP))
      )
      prompt(invoke, cipher, args.title, args.cancel) { ready ->
        val secret = ready.doFinal(Base64.decode(args.data, Base64.NO_WRAP))
        val answer = JSObject()
        answer.put("secret", String(secret, Charsets.UTF_8))
        answer
      }
    } catch (error: KeyPermanentlyInvalidatedException) {
      // В телефоне добавили новый отпечаток: прежний ключ Android сам сделал
      // недействительным. Так и задумано — чужой палец не должен открыть данные.
      forgetKey(args.slot)
      invoke.reject("[invalidated] В телефоне изменились отпечатки — войдите паролем и включите вход по отпечатку снова.")
    } catch (error: Exception) {
      invoke.reject("[broken] " + (error.message ?: "Не удалось войти по отпечатку."))
    }
  }

  @Command
  fun biometricForget(invoke: Invoke) {
    forgetKey(invoke.parseArgs(SlotArgs::class.java).slot)
    invoke.resolve(JSObject())
  }

  private fun prompt(
    invoke: Invoke,
    cipher: Cipher,
    title: String,
    cancel: String,
    finish: (Cipher) -> JSObject
  ) {
    val host = activity as? FragmentActivity
    if (host == null) {
      invoke.reject("[broken] Окно приложения не поддерживает отпечаток.")
      return
    }
    activity.runOnUiThread {
      val biometric = BiometricPrompt(
        host,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            try {
              val ready = result.cryptoObject?.cipher ?: throw Exception("Нет шифра.")
              invoke.resolve(finish(ready))
            } catch (error: Exception) {
              invoke.reject("[broken] " + (error.message ?: "Не удалось."))
            }
          }

          override fun onAuthenticationError(code: Int, message: CharSequence) {
            val cancelled = code == BiometricPrompt.ERROR_USER_CANCELED ||
              code == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
              code == BiometricPrompt.ERROR_CANCELED
            invoke.reject((if (cancelled) "[cancelled] " else "[broken] ") + message)
          }
        }
      )
      val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(title)
        .setNegativeButtonText(cancel)
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .build()
      biometric.authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun existingKey(slot: String): SecretKey? =
    keyStore().getKey(biometricAlias(slot), null) as? SecretKey

  private fun forgetKey(slot: String) {
    try {
      keyStore().deleteEntry(biometricAlias(slot))
    } catch (ignored: Exception) {
      /* ключа не было — забывать нечего */
    }
  }

  private fun createKey(slot: String): SecretKey {
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    val spec = KeyGenParameterSpec.Builder(
      biometricAlias(slot),
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true)
      .build()
    generator.init(spec)
    return generator.generateKey()
  }

  @Command
  fun install(invoke: Invoke) {
    val args = invoke.parseArgs(InstallArgs::class.java)
    if (!args.url.startsWith(RELEASES) || !args.url.endsWith(".apk")) {
      invoke.reject("Обновление скачивается только со страницы выпусков приложения.")
      return
    }

    // Сеть — не в главном потоке: иначе Android остановит приложение.
    Thread {
      try {
        val dir = File(activity.cacheDir, "updates")
        dir.mkdirs()
        val apk = File(dir, "update.apk")
        download(args.url, apk, args.onProgress)

        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.runOnUiThread {
          try {
            activity.startActivity(intent)
            invoke.resolve(JSObject())
          } catch (error: Exception) {
            invoke.reject(error.message ?: "Не удалось открыть установку.")
          }
        }
      } catch (error: Exception) {
        invoke.reject(say(error))
      }
    }.start()
  }

  /**
   * Скачать с переходами: ссылка на выпуск отвечает переадресацией на хранилище
   * GitHub, и только по https — переход на http не принимается.
   */
  /** Текст для человека: исключения Java сами по себе говорят по-английски и о сокетах. */
  private fun say(error: Exception): String = when (error) {
    is java.net.UnknownHostException -> "Нет соединения с интернетом."
    is java.net.SocketTimeoutException -> "Сервер долго не отвечает. Проверьте интернет и попробуйте ещё раз."
    is java.io.IOException -> "Загрузка прервалась. Проверьте интернет и попробуйте ещё раз."
    else -> error.message ?: "Не удалось скачать обновление."
  }

  private fun download(start: String, target: File, progress: Channel?) {
    var address = start
    for (hop in 0 until 5) {
      val connection = URL(address).openConnection() as HttpURLConnection
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 20_000
      connection.readTimeout = 60_000
      try {
        val code = connection.responseCode
        if (code in 300..399) {
          val next = connection.getHeaderField("Location") ?: throw Exception("Пустая переадресация.")
          address = URL(URL(address), next).toString()
          if (!address.startsWith("https://")) throw Exception("Переадресация не по https.")
          continue
        }
        if (code != 200) throw Exception("Сервер обновлений ответил $code. Попробуйте позже.")
        val total = connection.contentLengthLong
        var received = 0L
        var reported = -1
        connection.inputStream.use { input ->
          target.outputStream().use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val read = input.read(buffer)
              if (read < 0) break
              output.write(buffer, 0, read)
              received += read
              // Раз на процент, а не на каждый кусок: иначе тысячи сообщений.
              val percent = if (total > 0) (received * 100 / total).toInt() else -1
              if (percent != reported) {
                reported = percent
                val message = JSObject()
                message.put("received", received)
                message.put("total", total)
                progress?.send(message)
              }
            }
          }
        }
        // Оборванная загрузка даёт «битый» APK, и Android ответит на него
        // невнятным «ошибка при разборе пакета». Лучше сказать правду здесь.
        if (total > 0 && received != total) {
          throw java.io.IOException("Загрузка прервалась.")
        }
        return
      } finally {
        connection.disconnect()
      }
    }
    throw Exception("Слишком много переадресаций.")
  }
}
