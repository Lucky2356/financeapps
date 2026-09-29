package ru.lucky2356.financeapps

// Виджет на рабочем столе: «Можно тратить сегодня» и кнопка «+».
//
// Считает не он — считает приложение (та же цифра, что на главной) и
// присылает её командой widget_update после каждой правки. Здесь её только
// запоминают и рисуют. Приложение давно не открывали — под суммой дата, на
// которую она посчитана, чтобы вчерашняя цифра не выдавала себя за сегодняшнюю.

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class SpendWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, views(context))
  }

  companion object {
    private const val PREFS = "financeapps.widget"

    fun store(context: Context, amount: String, note: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putString("amount", amount).putString("note", note).apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, SpendWidget::class.java))
      for (id in ids) manager.updateAppWidget(id, views(context))
    }

    private fun views(context: Context): RemoteViews {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val views = RemoteViews(context.packageName, R.layout.widget_spend)
      views.setTextViewText(R.id.widget_amount, prefs.getString("amount", "—"))
      views.setTextViewText(
        R.id.widget_note,
        prefs.getString("note", context.getString(R.string.widget_open_app))
      )
      // Нажатие на виджет — открыть приложение; на «+» — сразу записать расход.
      val open = Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      views.setOnClickPendingIntent(
        R.id.widget_root,
        PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE)
      )
      val add = Intent(context, MainActivity::class.java)
        .setAction(Intent.ACTION_VIEW)
        .setData(Uri.parse("financeapps://add?type=EXPENSE"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      views.setOnClickPendingIntent(
        R.id.widget_add,
        PendingIntent.getActivity(
          context,
          2,
          add,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
      return views
    }
  }
}
