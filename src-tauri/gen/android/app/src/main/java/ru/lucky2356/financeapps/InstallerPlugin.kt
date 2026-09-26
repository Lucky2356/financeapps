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
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

@InvokeArg
class InstallArgs {
  lateinit var url: String
}

private const val RELEASES = "https://github.com/Lucky2356/financeapps/releases/download/"

@TauriPlugin
class InstallerPlugin(private val activity: Activity) : Plugin(activity) {
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
        download(args.url, apk)

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
        invoke.reject(error.message ?: "Не удалось скачать обновление.")
      }
    }.start()
  }

  /**
   * Скачать с переходами: ссылка на выпуск отвечает переадресацией на хранилище
   * GitHub, и только по https — переход на http не принимается.
   */
  private fun download(start: String, target: File) {
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
        if (code != 200) throw Exception("Сервер ответил $code.")
        connection.inputStream.use { input -> target.outputStream().use { input.copyTo(it) } }
        return
      } finally {
        connection.disconnect()
      }
    }
    throw Exception("Слишком много переадресаций.")
  }
}
