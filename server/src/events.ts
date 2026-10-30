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

/**
 * Кто слушает: человек, его устройство и билет, с которым поток открыли. Билет
 * и устройство нужны, чтобы поток закрылся вместе с ними: устройство, которое
 * выкинули из «Моих устройств» (или вышедшее), раньше продолжало получать
 * имена книг и время правок по уже открытому потоку — сколько угодно долго.
 */
type Listener = { personId: string; deviceId: string | null; token: string; res: ServerResponse };

/**
 * Сколько потоков держать одному человеку. Устройств у человека — несколько,
 * а не сотни; сверх этого закрываются самые старые, иначе один билет мог
 * открыть их тысячи и держать дескрипторы службы.
 */
const MAX_STREAMS_PER_PERSON = 20;

export class EventBus {
  private readonly listeners = new Set<Listener>();

  /**
   * Держит соединение открытым, пока его не закроют с той стороны.
   *
   * Разрешение на чужой источник — здесь, а не только в обычных ответах.
   * Заголовки этому ответу пишутся свои, мимо общего send — и разрешение, добавь
   * его только там, до потока не доходило. Вкладка тогда гасит ответ, не читая:
   * подписка не открывается вовсе, а служба об этом не узнаёт — с её стороны
   * соединение выглядит открытым, пока не отвалится по тайм-ауту.
   *
   * Снаружи это самая тихая из поломок. Синхронизация продолжает сходиться на
   * чтениях и записях — то есть при открытии экрана и при своей правке, — и
   * пропадает ровно одно: чужая правка САМА на экран не приезжает. Человек
   * видит «подключено», всё работает, и только новое с другого устройства
   * появляется лишь после того, как он сам что-нибудь сделает.
   */
  attach(
    who: { personId: string; deviceId: string | null; token: string },
    res: ServerResponse,
    origin: string
  ): void {
    const { personId } = who;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": origin,
      // Без этого Caddy и любой другой посредник копит ответ в буфере, и
      // событие доходит через минуту после того, как случилось.
      "x-accel-buffering": "no"
    });
    res.write(": здравствуйте\n\n");

    const listener: Listener = { ...who, res };
    this.listeners.add(listener);
    res.on("close", () => this.listeners.delete(listener));

    const own = [...this.listeners].filter((item) => item.personId === personId);
    for (const extra of own.slice(0, Math.max(0, own.length - MAX_STREAMS_PER_PERSON))) {
      this.drop(extra);
    }
  }

  /** Закрыть потоки, открытые с этим билетом (выход). */
  closeToken(token: string): void {
    for (const listener of this.listeners) if (listener.token === token) this.drop(listener);
  }

  /** Закрыть потоки этого устройства (его выкинули из списка). */
  closeDevice(personId: string, deviceId: string): void {
    for (const listener of this.listeners) {
      if (listener.personId === personId && listener.deviceId === deviceId) this.drop(listener);
    }
  }

  private drop(listener: Listener): void {
    this.listeners.delete(listener);
    try {
      listener.res.end();
    } catch {
      /* уже закрыт */
    }
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
