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
  type PutRequest,
  type PutResult,
  type SlotChanged,
  type SlotName,
  type SlotSnapshot,
  type SlotSummary,
  type SyncTransport
} from "@/lib/sync/protocol";
import { shellFetch } from "@/lib/sync/shell-fetch";

/** Сервер ответил отказом, который повторять бесполезно. */
export class ServerRefused extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServerRefused";
    this.status = status;
  }
}

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

async function ask(
  credentials: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; data: Json }> {
  if (!usable(credentials.token)) {
    throw new ServerRefused(401, "Испорченный входной билет — войдите заново.");
  }

  let response: Response;
  try {
    response = await shellFetch(`${credentials.base.replace(/\/+$/, "")}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${credentials.token}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" })
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
  } catch (cause) {
    // fetch бросает только когда до сервера не дошли вовсе.
    throw new OfflineError(cause);
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Json) : {};

  // 5xx — сервер есть, но ему сейчас плохо: это то же «попробуйте позже», что и
  // обрыв связи, и обходиться с ним надо так же.
  if (response.status >= 500)
    throw new OfflineError(new Error(`сервер ответил ${response.status}`));

  return { status: response.status, data };
}

export class HttpSyncTransport implements SyncTransport {
  private credentials: Credentials;

  constructor(credentials: Credentials) {
    this.credentials = credentials;
  }

  async list(): Promise<SlotSummary[]> {
    const { status, data } = await ask(this.credentials, ROUTES.slots);
    if (status !== 200)
      throw new ServerRefused(status, String(data.error ?? "Не отдаёт перечень."));
    return (data.slots ?? []) as SlotSummary[];
  }

  async pull(slot: SlotName): Promise<SlotSnapshot> {
    const { status, data } = await ask(this.credentials, ROUTES.slot(slot));
    if (status !== 200) throw new ServerRefused(status, String(data.error ?? "Не отдаёт ячейку."));
    return data as unknown as SlotSnapshot;
  }

  async push(slot: SlotName, request: PutRequest): Promise<PutResult> {
    const { status, data } = await ask(this.credentials, ROUTES.put(slot), {
      method: "PUT",
      body: request
    });

    // 409 — не ошибка, а второй законный исход договора: нас обогнали. Вместе с
    // отказом приезжает то, что лежит на сервере, чтобы не ходить второй раз.
    if (status === 409) return data as unknown as PutResult;
    if (status !== 200)
      throw new ServerRefused(status, String(data.error ?? "Не принимает запись."));
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
  watch(onChange: (event: SlotChanged) => void): () => void {
    // Негодный билет здесь просто не подписывает: синхронизация обязана
    // сходиться и без подписки, а вечно стучаться с заведомо плохим билетом —
    // это шум и в журнале службы, и в батарее телефона.
    if (!usable(this.credentials.token)) return () => {};

    const control = new AbortController();
    let attempt = 0;

    const read = async (): Promise<void> => {
      while (!control.signal.aborted) {
        try {
          const response = await shellFetch(
            `${this.credentials.base.replace(/\/+$/, "")}${ROUTES.events}`,
            {
              headers: { authorization: `Bearer ${this.credentials.token}` },
              signal: control.signal
            }
          );
          if (!response.ok || !response.body)
            throw new Error(`поток не открылся: ${response.status}`);

          attempt = 0;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          for (;;) {
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
        }

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
