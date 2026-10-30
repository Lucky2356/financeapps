"use client";

// Провод до службы: исполняет договор из protocol.ts поверх обычного HTTP.
//
// Здесь нет ни одного решения — только перевод договора в запросы. Все решения
// приняты в двух других местах: что отправлять, решает SyncingStorageAdapter,
// а что делать при расхождении — слияние. Этот слой обязан оставаться скучным,
// и если однажды в нём заведётся «если», это будет знак, что решение уехало не
// туда.
//
// Про ошибки. Сеть падает постоянно — в метро, в лифте, при смене вышки, — и
// для местного приложения это не поломка, а обычное состояние. Поэтому всё, что
// похоже на «не доехало», превращается в OfflineError: вызывающий сложит работу
// в очередь и попробует позже. А вот ответ сервера «не пущу» — это другое, и
// путать его с обрывом связи нельзя: повторять такое бесконечно бессмысленно.

import {
  OfflineError,
  ROUTES,
  type KnownVersion,
  type PutRequest,
  type PutResult,
  type SlotChanged,
  type SlotName,
  type SlotSnapshot,
  type SlotSummary,
  type SyncTransport
} from "@/lib/sync/protocol";
import { shellFetch } from "@/lib/sync/shell-fetch";
import { apiText, serverText } from "@/lib/i18n/api-text";

/**
 * Служба больше не узнаёт билет этого устройства. Своими словами, а не «Нужен
 * вход.»: человеку, у которого на экране «Синхронизация включена», голое
 * «нужен вход» не говорит ни что случилось, ни что нажать.
 */
export function lostLink(): string {
  return apiText("api.sync.lostLink");
}

/** Сервер ответил отказом, который повторять бесполезно. */
export class ServerRefused extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServerRefused";
    this.status = status;
  }
}

/** Сколько тишины в потоке событий терпеть, прежде чем счесть его мёртвым. */
const SILENCE_LIMIT_MS = 70_000;

/**
 * Сколько поток должен прожить, чтобы его разрыв считался обычным, а пауза
 * перед новой попыткой начиналась сначала, с секунды.
 *
 * Сбрасывать паузу на самом открытии нельзя: посредник, который отвечает 200 и
 * тут же закрывает соединение, превращал подписку в стук раз в секунду — без
 * конца, и каждое открытие ещё и тянуло сверку списка ячеек. Служба
 * здоровается сразу (": здравствуйте"), так что и первый пришедший кусок —
 * не признак живого потока. Двадцать секунд — меньше шага сердцебиения службы
 * (25 с): поток, который его дождался, точно жил.
 */
const STABLE_STREAM_MS = 20_000;

export function isRefused(error: unknown): boolean {
  return error instanceof ServerRefused;
}

export type Credentials = {
  /** Корень службы, например https://finance.example.org */
  base: string;
  /** Входной билет. */
  token: string;
};

type Json = Record<string, unknown>;

/**
 * Годен ли билет на роль заголовка.
 *
 * Заголовки HTTP не переносят ничего сверх Latin-1, и билет с чем угодно за
 * этими пределами роняет сам вызов fetch — тем же способом, что и обрыв связи.
 * Без этой проверки испорченный билет выглядел бы как «нет связи», и приложение
 * повторяло бы попытку вечно, вместо того чтобы попросить войти заново.
 * Настоящие билеты — base64url, то есть заведомо годны; сюда попадает только
 * испорченное хранилище или чужая рука.
 */
function usable(token: string): boolean {
  return token.length > 0 && /^[\x20-\x7e]+$/.test(token);
}

/**
 * Сколько ждать ответа на один запрос, прежде чем счесть связь пропавшей.
 *
 * Без срока зависший запрос — сервер принял соединение и молчит, посредник
 * держит его, телефон сменил сеть посреди ответа — не кончался НИКОГДА. А с
 * ним вставала вся синхронизация: новая прогонка очереди не заводится, пока
 * идёт прежняя, и ждёт её. Подключение устройства, ждущее первую сверку,
 * висело вместе с ней. Полминуты — с запасом на большую книгу по медленной
 * связи; дальше ждать уже нечего.
 */
const REQUEST_LIMIT_MS = 30_000;

/**
 * Пришедшее — ответ службы, или чужая страница по дороге.
 *
 * Гостевой Wi-Fi отвечает на любой адрес своей страницей входа, посредник —
 * своей страницей ошибки. Это HTML, а не JSON, и разбор падал бы ошибкой,
 * неотличимой от поломки, — хотя до службы просто не дошли. Удачный код с
 * таким телом — значит, перехватили по дороге: это «нет связи». Отказ с
 * таким телом остаётся отказом, только без слов службы.
 */
function parse(status: number, text: string): Json {
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Json;
  } catch {
    // Ниже — тот же исход, что и для JSON, который не объект.
  }
  if (status < 400) {
    throw new OfflineError(new Error("ответ не похож на ответ службы: сеть перехватывает запросы"));
  }
  return {};
}

async function ask(
  credentials: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
  limitMs = REQUEST_LIMIT_MS
): Promise<{ status: number; data: Json }> {
  if (!usable(credentials.token)) {
    throw new ServerRefused(401, lostLink());
  }

  // Срок — на весь обмен целиком, вместе с чтением тела: ответ может и
  // начаться, и оборваться посередине. Отмена запроса через Rust (телефон,
  // Windows) до уже идущего чтения может и не дойти — поэтому, кроме отмены,
  // ожидание просто обрывается само (см. то же в watch).
  const control = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      control.abort();
      reject(new OfflineError(new Error(`служба не ответила за ${limitMs} мс`)));
    }, limitMs);
  });

  const exchange = async (): Promise<{ status: number; text: string }> => {
    let response: Response;
    try {
      response = await shellFetch(`${credentials.base.replace(/\/+$/, "")}${path}`, {
        method: init.method ?? "GET",
        headers: {
          authorization: `Bearer ${credentials.token}`,
          ...(init.body === undefined ? {} : { "content-type": "application/json" })
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: control.signal
      });
    } catch (cause) {
      // fetch бросает только когда до сервера не дошли вовсе.
      throw new OfflineError(cause);
    }
    try {
      return { status: response.status, text: await response.text() };
    } catch (cause) {
      // Связь оборвалась посреди ответа — то же «не доехало».
      throw new OfflineError(cause);
    }
  };

  let reply: { status: number; text: string };
  try {
    reply = await Promise.race([exchange(), expired]);
  } finally {
    clearTimeout(timer);
  }

  // 5xx — сервер есть, но ему сейчас плохо: это то же «попробуйте позже», что и
  // обрыв связи, и обходиться с ним надо так же. Проверяется ДО разбора тела:
  // страница ошибки посредника — HTML, и разбор её как JSON ронял бы всё в
  // «ошибку» вместо «попробуем позже».
  //
  // Кроме 507: это служба говорит «место для ваших данных кончилось». Это не
  // «попробуйте позже» — повтор ничего не изменит, а выдавать отказ за «нет
  // связи» значило прятать от человека единственное, что ему надо знать.
  if (reply.status >= 500 && reply.status !== 507)
    throw new OfflineError(new Error(`сервер ответил ${reply.status}`));

  return { status: reply.status, data: parse(reply.status, reply.text) };
}

export class HttpSyncTransport implements SyncTransport {
  private credentials: Credentials;
  private readonly silenceMs: number;
  private readonly requestMs: number;

  constructor(credentials: Credentials, options: { silenceMs?: number; requestMs?: number } = {}) {
    this.credentials = credentials;
    this.silenceMs = options.silenceMs ?? SILENCE_LIMIT_MS;
    this.requestMs = options.requestMs ?? REQUEST_LIMIT_MS;
  }

  async list(): Promise<SlotSummary[]> {
    const { status, data } = await ask(this.credentials, ROUTES.slots, {}, this.requestMs);
    if (status !== 200)
      throw new ServerRefused(status, serverText(data, apiText("api.sync.listFailed")));
    return (data.slots ?? []) as SlotSummary[];
  }

  async pull(slot: SlotName, known?: KnownVersion): Promise<SlotSnapshot> {
    const { status, data } = await ask(
      this.credentials,
      ROUTES.slot(slot, known),
      {},
      this.requestMs
    );
    if (status !== 200)
      throw new ServerRefused(status, serverText(data, apiText("api.sync.pullFailed")));
    return data as unknown as SlotSnapshot;
  }

  async push(slot: SlotName, request: PutRequest): Promise<PutResult> {
    const { status, data } = await ask(
      this.credentials,
      ROUTES.put(slot),
      { method: "PUT", body: request },
      this.requestMs
    );

    // 409 — не ошибка, а второй законный исход договора: нас обогнали. Вместе с
    // отказом приезжает то, что лежит на сервере, чтобы не ходить второй раз.
    if (status === 409) return data as unknown as PutResult;
    if (status !== 200)
      throw new ServerRefused(status, serverText(data, apiText("api.sync.pushFailed")));
    return data as unknown as PutResult;
  }

  /**
   * Подписка на изменения.
   *
   * Поток читается обычным fetch, а не через EventSource, и причина одна:
   * EventSource не умеет заголовков, и билет пришлось бы класть в строку
   * запроса — то есть в журналы Caddy и всякого другого посредника по дороге.
   * Приложение здесь не браузерная страница, а своё; читать поток руками ему
   * ничто не мешает, и билет остаётся там, где ему место.
   *
   * Соединение рвётся — это нормально, и оно поднимается снова. Но подписка
   * остаётся УСКОРЕНИЕМ, а не основой: потеряется событие — синхронизация
   * сойдётся на следующем чтении или записи. Поэтому здесь нет ни разбора
   * пропущенного, ни подтверждений.
   */
  watch(onChange: (event: SlotChanged) => void, onOpen?: () => void): () => void {
    // Негодный билет здесь просто не подписывает: синхронизация обязана
    // сходиться и без подписки, а вечно стучаться с заведомо плохим билетом —
    // это шум и в журнале службы, и в батарее телефона.
    if (!usable(this.credentials.token)) return () => {};

    const control = new AbortController();
    let attempt = 0;

    const read = async (): Promise<void> => {
      while (!control.signal.aborted) {
        // Своя отмена на каждое соединение: сторож ниже рвёт ЭТО соединение, а
        // не подписку целиком.
        const connection = new AbortController();
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        // И отмена запроса, и закрытие чтения: запрос через Rust (телефон,
        // Windows) отмену запроса может и не донести до уже идущего чтения.
        const stopConnection = () => {
          connection.abort();
          void reader?.cancel().catch(() => {});
        };
        control.signal.addEventListener("abort", stopConnection);
        let silence: ReturnType<typeof setTimeout> | undefined;
        // Когда поток открылся; пусто — не открылся вовсе.
        let openedAt: number | undefined;
        // Служба стучит раз в 25 секунд. Тишина дольше — соединение мертво, хотя
        // с виду открыто: телефон уснул, сменилась сеть, посредник его бросил.
        // Такой поток не рвётся сам НИКОГДА, и устройство до перезапуска ждало
        // событий, которые не придут, — «подключено», а чужих правок нет.
        const listen = () => {
          if (silence !== undefined) clearTimeout(silence);
          silence = setTimeout(stopConnection, this.silenceMs);
        };
        try {
          listen();
          const response = await shellFetch(
            `${this.credentials.base.replace(/\/+$/, "")}${ROUTES.events}`,
            {
              headers: { authorization: `Bearer ${this.credentials.token}` },
              signal: connection.signal
            }
          );
          if (!response.ok || !response.body)
            throw new Error(`поток не открылся: ${response.status}`);

          openedAt = Date.now();
          onOpen?.();
          reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          for (;;) {
            listen();
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });

            // Записи разделяются пустой строкой; последний кусок может быть
            // недочитан, поэтому он остаётся в буфере до следующего раза.
            const records = buffer.split("\n\n");
            buffer = records.pop() ?? "";

            for (const record of records) {
              const line = record.split("\n").find((part) => part.startsWith("data:"));
              if (!line) continue; // строка с двоеточия — это комментарий
              try {
                const parsed = JSON.parse(line.slice(5).trim()) as SlotChanged;
                if (typeof parsed.slot === "string" && typeof parsed.version === "number") {
                  onChange(parsed);
                }
              } catch {
                // Мусор в потоке пропускаем: он ничего не решает, а разрыв
                // соединения из-за него стоил бы подписки целиком.
              }
            }
          }
        } catch {
          if (control.signal.aborted) return;
        } finally {
          if (silence !== undefined) clearTimeout(silence);
          control.signal.removeEventListener("abort", stopConnection);
          connection.abort();
        }

        // Поток пожил — разрыв обычный, и ждать долго незачем: переподключение
        // (и сверка при нём) — через секунду. Закрылся сразу — пауза растёт.
        if (openedAt !== undefined && Date.now() - openedAt >= STABLE_STREAM_MS) attempt = 0;

        // Пауза перед новой попыткой, растущая до минуты: соединение рвётся
        // пачками, и долбить сервер в такие минуты незачем.
        const pause = Math.min(1000 * 2 ** attempt++, 60_000);
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
    };

    void read();
    return () => control.abort();
  }
}
