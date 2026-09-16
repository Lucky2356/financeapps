// Ограничение частоты попыток входа.
//
// В памяти, а не в базе, и это осознанно: перезапуск службы обнуляет счётчики.
// Для десяти человек и подбора паролей это ровно ничего не меняет — перезапуск
// нападающий устроить не может, — зато база не пухнет от записей о каждой
// попытке и не переживает дисковую запись на каждый вход.
//
// Считается ПО ДВУМ ключам сразу: по имени входа и по адресу. По одному имени
// мало — подбор пошёл бы по десяти именам по очереди; по одному адресу мало —
// он меняется. Упёрлись в любой из двух — отказ.

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

type Bucket = { count: number; until: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  // Явные поля, а не свойства-параметры: Node снимает типы без кодогенерации.
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max = MAX_ATTEMPTS, windowMs = WINDOW_MS) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** true — можно; false — пора отказать. Засчитывает попытку сразу. */
  allow(key: string, now: number): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) {
      this.buckets.set(key, { count: 1, until: now + this.windowMs });
      this.sweep(now);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.max;
  }

  /** Удачный вход снимает счётчик: человек, вспомнивший пароль, не наказан. */
  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Чистка старых вёдер — иначе память растёт от одних неудачных попыток. */
  private sweep(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.until <= now) this.buckets.delete(key);
    }
  }
}
