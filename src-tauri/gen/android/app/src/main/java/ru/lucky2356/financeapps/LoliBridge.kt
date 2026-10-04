package ru.lucky2356.financeapps

// Лоли — голосовой помощник владельца (github.com/Lucky2356/loli_ai).
//
// «Лоли, потратила 850 на продукты» — и трата оказывается здесь. А на «сколько
// можно тратить сегодня?» Лоли отвечает по здешним цифрам, а не по своим.
//
// КАК ОНИ РАЗГОВАРИВАЮТ. Через ContentProvider.call — прямой вызов одного
// приложения другим на этом же телефоне, без сети и без сервера:
//   * record  — трата из Лоли (создать, поправить, удалить — по её номеру);
//   * summary — короткая сводка для ответов голосом (её кладёт страница);
//   * status  — включена ли связка: Лоли показывает это у себя в настройках.
//
// КТО МОЖЕТ ЗВАТЬ. Только приложение ai.loli.app с подписью Лоли: Android сам
// говорит, кто звонит (callingPackage), а сертификат подписи сверяется с
// отпечатком выпущенной Лоли. Чужое приложение с тем же именем пакета, но
// другой подписью, получает отказ — как и любое другое.
//
// ЧЕГО ЗДЕСЬ НЕТ. Книга сюда не попадает и отсюда не читается: она зашифрована и
// открыта только на странице. Трата ложится в очередь, а страница забирает её
// (loli_take, затем loli_ack) и решает сама — в «Подсказки» или сразу в учёт. Сводку тоже
// готовит страница (loli_summary), и только если человек разрешил отдавать её.

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class LoliProvider : ContentProvider() {
  override fun onCreate(): Boolean = true

  override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
    val context = context ?: return answer("error", "Нет контекста.")
    if (!LoliBridge.trusted(context, callingPackage)) {
      return answer("denied", "Связь разрешена только Лоли.")
    }
    val config = LoliBridge.config(context)
    return when (method) {
      "status" -> answer("ok").apply {
        putBoolean("enabled", config.enabled)
        putBoolean("auto", config.auto)
        putBoolean("share", config.share)
      }
      "record" -> {
        if (!config.enabled) return answer("disabled", "В Финансовом помощнике связь с Лоли выключена.")
        val item = LoliBridge.validate(extras?.getString("json"))
          ?: return answer("invalid", "Не понятна трата.")
        LoliBridge.enqueue(context, item)
        answer("queued").apply { putBoolean("auto", config.auto) }
      }
      "summary" -> {
        if (!config.enabled || !config.share) return answer("disabled", "Сводку для Лоли не отдают.")
        val summary = LoliBridge.summary(context) ?: return answer("empty", "Сводки ещё нет.")
        answer("ok").apply { putString("json", summary) }
      }
      else -> answer("unknown", "Нет такой команды.")
    }
  }

  private fun answer(status: String, message: String? = null) = Bundle().apply {
    putString("status", status)
    if (message != null) putString("message", message)
  }

  // Таблиц нет: всё — через call.
  override fun query(uri: Uri, projection: Array<out String>?, selection: String?,
    selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
  override fun getType(uri: Uri): String? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
  override fun update(uri: Uri, values: ContentValues?, selection: String?,
    selectionArgs: Array<out String>?): Int = 0
}

object LoliBridge {
  const val PACKAGE = "ai.loli.app"

  /**
   * Отпечаток (SHA-256) сертификата, которым подписана выпущенная Лоли
   * (loli-2.5.0-release.apk). Сменит Лоли ключ — сменится и он; до тех пор
   * связка честно отказывает, а не верит имени пакета.
   */
  private val TRUSTED = setOf(
    "BA100383B52F109505B42CD5137D0FD7F3C4D2962CE1163EEE94E37DECDF8F40"
  )

  private const val PREFS = "financeapps.loli"
  private const val QUEUE = "queue"
  private const val SUMMARY = "summary"
  private const val LIMIT = 300

  private val ID = Regex("""^[A-Za-z0-9-]{1,64}$""")
  private val DAY = Regex("""^\d{4}-\d{2}-\d{2}$""")
  private val CURRENCY = Regex("""^[A-Z]{3}$""")

  data class Config(val enabled: Boolean, val auto: Boolean, val share: Boolean)

  fun config(context: Context): Config {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return Config(
      enabled = prefs.getBoolean("enabled", false),
      auto = prefs.getBoolean("auto", false),
      share = prefs.getBoolean("share", true)
    )
  }

  fun configure(context: Context, enabled: Boolean, auto: Boolean, share: Boolean) {
    val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("enabled", enabled)
      .putBoolean("auto", auto)
      .putBoolean("share", share)
    // Выключили — сводка не должна пережить выключение.
    if (!enabled || !share) editor.remove(SUMMARY)
    editor.apply()
  }

  /** Стоит ли Лоли на телефоне и подписана ли она своим ключом. */
  fun installed(context: Context): Pair<Boolean, Boolean> = try {
    context.packageManager.getPackageInfo(PACKAGE, 0)
    true to trusted(context, PACKAGE)
  } catch (_: PackageManager.NameNotFoundException) {
    false to false
  }

  /** Начало отпечатка подписи установленной Лоли — показать, если она не та. */
  fun found(context: Context): String? =
    signatures(context, PACKAGE).firstOrNull()?.let { it.take(4) + "…" + it.takeLast(4) }

  fun trusted(context: Context, caller: String?): Boolean {
    if (caller != PACKAGE) return false
    return signatures(context, caller).any { it in TRUSTED }
  }

  @Suppress("DEPRECATION")
  private fun signatures(context: Context, pkg: String): List<String> = try {
    val pm = context.packageManager
    val raw = if (Build.VERSION.SDK_INT >= 28) {
      val info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
      // Только текущая подпись APK: старые ключи из истории ротации не в счёт.
      info.signingInfo?.apkContentsSigners
    } else {
      pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES).signatures
    }
    (raw ?: emptyArray()).map { sha256(it.toByteArray()) }
  } catch (_: Exception) {
    emptyList()
  }

  private fun sha256(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02X".format(it) }

  /**
   * Трата из Лоли — в том виде, в каком её можно положить в очередь, или null.
   * Проверяется всё: дальше её читает страница, и мусор туда попадать не должен.
   */
  fun validate(json: String?): JSONObject? = try {
    val raw = JSONObject(json ?: "")
    val id = raw.optString("id")
    val op = raw.optString("op", "upsert")
    if (!ID.matches(id) || (op != "upsert" && op != "delete")) null
    else if (op == "delete") JSONObject().put("id", id).put("op", op)
    else {
      val amount = raw.optLong("amountMinor", -1)
      val currency = raw.optString("currency", "RUB")
      val date = raw.optString("date")
      val type = raw.optString("type", "EXPENSE")
      if (amount <= 0 || amount > 100_000_000_000L || !CURRENCY.matches(currency) ||
        !DAY.matches(date) || (type != "EXPENSE" && type != "INCOME")) null
      else JSONObject()
        .put("id", id)
        .put("op", op)
        .put("type", type)
        .put("amountMinor", amount)
        .put("currency", currency)
        .put("category", raw.optString("category").take(100))
        .put("description", raw.optString("description").take(500))
        .put("date", date)
    }
  } catch (_: Exception) {
    null
  }

  /** В очередь. Та же трата, присланная снова (правка), заменяет прежнюю. */
  @Synchronized
  fun enqueue(context: Context, item: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val list = try { JSONArray(prefs.getString(QUEUE, "[]")) } catch (_: Exception) { JSONArray() }
    val kept = JSONArray()
    for (index in 0 until list.length()) {
      val old = list.optJSONObject(index) ?: continue
      if (old.optString("id") != item.optString("id")) kept.put(old)
    }
    item.put("at", System.currentTimeMillis())
    kept.put(item)
    val trimmed = JSONArray()
    for (index in maxOf(0, kept.length() - LIMIT) until kept.length()) trimmed.put(kept.get(index))
    prefs.edit().putString(QUEUE, trimmed.toString()).apply()
  }

  /**
   * Показать очередь странице, не забывая её. Забывается только то, что
   * страница подтвердила (ack), — иначе трата, взятая за миг до того, как
   * приложение закрыли, пропала бы бесследно.
   */
  @Synchronized
  fun peek(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(QUEUE, "[]") ?: "[]"

  /** Забыть разобранное: те же номера с тем же временем. Пришедшее после — остаётся. */
  @Synchronized
  fun ack(context: Context, done: String) {
    val handled = try { JSONArray(done) } catch (_: Exception) { return }
    val keys = HashSet<String>()
    for (index in 0 until handled.length()) {
      val item = handled.optJSONObject(index) ?: continue
      keys.add(item.optString("id") + "@" + item.optLong("at"))
    }
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val list = try { JSONArray(prefs.getString(QUEUE, "[]")) } catch (_: Exception) { JSONArray() }
    val kept = JSONArray()
    for (index in 0 until list.length()) {
      val item = list.optJSONObject(index) ?: continue
      if (item.optString("id") + "@" + item.optLong("at") !in keys) kept.put(item)
    }
    prefs.edit().putString(QUEUE, kept.toString()).apply()
  }

  fun storeSummary(context: Context, json: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!config(context).enabled || !config(context).share) return
    prefs.edit().putString(SUMMARY, json.take(20_000)).apply()
  }

  fun summary(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY, null)
}
