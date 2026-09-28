package ru.lucky2356.financeapps

// Напоминания на телефоне — даже когда приложение закрыто.
//
// Расписание собирает страница (lib/reminders/plan.ts) и отдаёт сюда целиком
// командой notify_schedule. Здесь его запоминают (SharedPreferences — чтобы
// пережить перезагрузку телефона) и ставят будильники AlarmManager. Будильник
// будит ReminderReceiver, тот показывает уведомление; нажатие открывает
// приложение ссылкой — ту же дорогу проходят ярлыки на значке.
//
// Будильники неточные (setAndAllowWhileIdle): напоминанию «запишите траты»
// не нужна секунда в секунду, а точные будильники Android 12+ разрешает
// только с отдельным разрешением, которое пришлось бы выпрашивать.

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

object Reminders {
  private const val PREFS = "financeapps.reminders"
  private const val ITEMS = "items"
  private const val CHANNEL = "reminders"
  const val ACTION = "ru.lucky2356.financeapps.REMINDER"

  /** Заменить всё расписание новым. `json` — массив {id, at, title, body, link}. */
  fun schedule(context: Context, json: String) {
    cancelAll(context)
    val items = JSONArray(json)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putString(ITEMS, items.toString()).apply()
    arm(context, items)
  }

  fun cancelAll(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val previous = JSONArray(prefs.getString(ITEMS, "[]"))
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (index in 0 until previous.length()) {
      val item = previous.getJSONObject(index)
      alarms.cancel(pending(context, item))
    }
    prefs.edit().remove(ITEMS).apply()
  }

  /** После перезагрузки будильники пропадают — ставим запомненные заново. */
  fun rearm(context: Context) {
    val stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ITEMS, "[]")
    arm(context, JSONArray(stored))
  }

  private fun arm(context: Context, items: JSONArray) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val now = System.currentTimeMillis()
    for (index in 0 until items.length()) {
      val item = items.getJSONObject(index)
      val at = item.optLong("at")
      if (at <= now) continue
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, item))
    }
  }

  private fun pending(context: Context, item: JSONObject): PendingIntent {
    val intent = Intent(context, ReminderReceiver::class.java)
      .setAction(ACTION)
      .putExtra("id", item.optInt("id"))
      .putExtra("title", item.optString("title"))
      .putExtra("body", item.optString("body"))
      .putExtra("link", item.optString("link"))
    return PendingIntent.getBroadcast(
      context,
      item.optInt("id"),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun show(context: Context, id: Int, title: String, body: String, link: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Напоминания", NotificationManager.IMPORTANCE_DEFAULT)
      )
    }
    val open = Intent(context, MainActivity::class.java)
      .setAction(Intent.ACTION_VIEW)
      .setData(Uri.parse(link))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val tap = PendingIntent.getActivity(
      context,
      id,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_reminder)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build()
    // Уведомления запрещены — молча: разрешение спрашивает страница.
    if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      manager.notify(id, notification)
    }
  }
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Reminders.ACTION -> Reminders.show(
        context,
        intent.getIntExtra("id", 0),
        intent.getStringExtra("title") ?: return,
        intent.getStringExtra("body") ?: "",
        intent.getStringExtra("link") ?: "financeapps://open?path=/"
      )
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Reminders.rearm(context)
    }
  }
}
