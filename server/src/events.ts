// Постоянное соединение: сервер сам говорит, когда ячейку тронуло другое
// устройство.
//
// Событие говорит «сходи посмотри», а не «вот данные», и это не экономия. Само
// содержимое серверу неизвестно — он его не видит; но дело даже не в этом.
// Соединение рвётся, события теряются, и синхронизация обязана сходиться без
// них — на следующем чтении или записи. Считай устройство события основой, одна
// потерянная строка расходилась бы навсегда и молча. Здесь подписка — ускорение
// поверх надёжного пути, а не сам путь.
//
// Отсюда и простота: ни подтверждений доставки, ни порядковых номеров, ни
// хранения пропущенного. Потерялось — и ладно.

import type { ServerResponse } from "node:http";

type Listener = { personId: string; res: ServerResponse };

export class EventBus {
  private readonly listeners = new Set<Listener>();

  /** Держит соединение открытым, пока его не закроют с той стороны. */
  attach(personId: string, res: ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Без этого Caddy и любой другой посредник копит ответ в буфере, и
      // событие доходит через минуту после того, как случилось.
      "x-accel-buffering": "no"
    });
    res.write(": здравствуйте\n\n");

    const listener: Listener = { personId, res };
    this.listeners.add(listener);
    res.on("close", () => this.listeners.delete(listener));
  }

  /** Всем устройствам этого человека: такая-то ячейка доросла до такой-то версии. */
  announce(personId: string, slot: string, version: number): void {
    const line = `data: ${JSON.stringify({ slot, version })}\n\n`;
    for (const listener of this.listeners) {
      if (listener.personId !== personId) continue;
      try {
        listener.res.write(line);
      } catch {
        // Соединение уже мертво — уберётся по событию close.
      }
    }
  }

  /**
   * Двоеточие в начале строки — комментарий в этом формате: получатель его
   * пропускает. Нужен, чтобы посредники не закрыли молчащее соединение.
   */
  heartbeat(): void {
    for (const listener of this.listeners) {
      try {
        listener.res.write(": тук\n\n");
      } catch {
        /* см. выше */
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }

  closeAll(): void {
    for (const listener of this.listeners) listener.res.end();
    this.listeners.clear();
  }
}
