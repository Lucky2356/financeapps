package ru.lucky2356.financeapps

// Траты из уведомлений банка.
//
// Банк присылает пуш или SMS «Покупка 450 ₽, Пятёрочка» — приложение
// предлагает записать трату одним нажатием. Для этого Android должен дать
// приложению доступ к уведомлениям: человек включает его сам в настройках
// телефона (кнопка в настройках приложения ведёт прямо туда), без этого
// служба не получает ничего.
//
// ЧТО ЗДЕСЬ ДЕЛАЕТСЯ, И ЧЕГО НЕТ:
//   * сохраняются только уведомления, похожие на движение денег: в тексте есть
//     сумма с рублями и слово вроде «покупка», «оплата», «списание»,
//     «зачисление». Переписка, коды из SMS, новости — мимо;
//   * коды подтверждения отбрасываются даже с суммой («Код 1234 для оплаты
//     500 ₽») — их тут быть не должно ни при каком раскладе;
//   * хранится последнее сотня-другая, в личной памяти приложения, и только до
//     того, как страница их заберёт (bank_take): разбирает текст уже она
//     (lib/bank/notification-parse.ts), там же проверки;
//   * никуда не отправляется: ни на сервер, ни в синхронизацию. Предложение
//     становится операцией, только когда человек нажал «Записать».

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

class BankListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      if (sbn.packageName == packageName) return
      val notification = sbn.notification ?: return
      // Сводка группы повторяет текст своих уведомлений — это не новая трата.
      if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
      val extras = notification.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
      if (!BankNotifications.looksLikeMoney("$title $text")) return
      val app = try {
        val info = packageManager.getApplicationInfo(sbn.packageName, 0)
        packageManager.getApplicationLabel(info).toString()
      } catch (_: Exception) {
        sbn.packageName
      }
      // Время, которое показывает сам банк: при обновлении уведомления Android
      // меняет postTime, а оно остаётся прежним — и повтор узнаётся.
      val at = if (notification.`when` > 0) notification.`when` else sbn.postTime
      BankNotifications.store(this, sbn.packageName, app, title, text, at)
    } catch (_: Exception) {
      // Чужое уведомление странного вида не должно ронять службу.
    }
  }
}

object BankNotifications {
  private const val PREFS = "financeapps.bank"
  private const val KEY = "items"
  private const val LIMIT = 200

  private val CURRENCY = Regex("""\d[\d\s  ]*(?:[.,]\d{1,2})?\s*(?:₽|руб|р\.|р\b|rub|rur)""",
    RegexOption.IGNORE_CASE)
  private val MOVEMENT = Regex(
    """покупк|оплат|списан|спис\.|зачислен|пополнен|поступлен|перевод|возврат|снятие|выдача|payment|purchase""",
    RegexOption.IGNORE_CASE
  )
  private val SECRET = Regex("""код|пароль|code|password""", RegexOption.IGNORE_CASE)

  fun looksLikeMoney(text: String): Boolean =
    CURRENCY.containsMatchIn(text) && MOVEMENT.containsMatchIn(text) && !SECRET.containsMatchIn(text)

  @Synchronized
  fun store(context: Context, pkg: String, app: String, title: String, text: String, at: Long) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val list = try { JSONArray(prefs.getString(KEY, "[]")) } catch (_: Exception) { JSONArray() }
    // Одно и то же уведомление Android присылает повторно при обновлении — с тем
    // же временем. Две одинаковые покупки подряд («Кофе 250 ₽» дважды) — разное
    // время, и вторая не теряется.
    for (index in 0 until list.length()) {
      val item = list.optJSONObject(index) ?: continue
      if (item.optString("title") == title.take(300) && item.optString("text") == text.take(1000) &&
        item.optString("package") == pkg && item.optLong("at") == at) return
    }
    val item = JSONObject()
      .put("package", pkg)
      .put("app", app)
      .put("title", title.take(300))
      .put("text", text.take(1000))
      .put("at", at)
    list.put(item)
    val trimmed = JSONArray()
    val from = maxOf(0, list.length() - LIMIT)
    for (index in from until list.length()) trimmed.put(list.get(index))
    prefs.edit().putString(KEY, trimmed.toString()).apply()
  }

  /** Отдать накопленное странице — и забыть: дальше оно живёт у неё. */
  @Synchronized
  fun take(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val items = prefs.getString(KEY, "[]") ?: "[]"
    prefs.edit().remove(KEY).apply()
    return items
  }

  fun granted(context: Context): Boolean =
    NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

  /** Экран «Доступ к уведомлениям» — сразу на этом приложении, где Android умеет. */
  fun openSettings(context: Context) {
    val intent = if (android.os.Build.VERSION.SDK_INT >= 30) {
      Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
        Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
        ComponentName(context, BankListener::class.java).flattenToString()
      )
    } else {
      Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(intent)
    } catch (_: Exception) {
      context.startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }
}
