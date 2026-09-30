// Черновик быстрого добавления. Телефон звонит, приходит уведомление, палец
// промахивается мимо окна — и набранная сумма с описанием пропадает. Пока окно
// закрыто не записью, содержимое откладывается, и следующее открытие в течение
// получаса возвращает его.

export type QuickDraftType = "INCOME" | "EXPENSE" | "TRANSFER";

export type QuickDraft = {
  v: 1;
  /** Когда отложен, мс с 1970. */
  savedAt: number;
  type: QuickDraftType;
  amount: string;
  categoryId: string;
  accountId: string;
  description: string;
  tags: string;
  /** Дата операции на момент закрытия. */
  date: string;
};

export const DRAFT_KEY = "quick-add-draft";
/** Полчаса: дольше — уже не «не дописал», а другое дело. */
export const DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

const TYPES: readonly string[] = ["INCOME", "EXPENSE", "TRANSFER"];

/** Есть ли что откладывать: пустой диалог, закрытый крестиком, черновика не оставляет. */
export function hasContent(draft: Pick<QuickDraft, "amount" | "description" | "tags">): boolean {
  return Boolean(draft.amount.trim() || draft.description.trim() || draft.tags.trim());
}

export function encodeDraft(draft: QuickDraft): string {
  return JSON.stringify(draft);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Разобрать сохранённое. Мусор, устаревшее и пустое — `null`. */
export function readDraft(raw: string | null, now: number): QuickDraft | null {
  if (!raw) return null;
  let parsed: Partial<QuickDraft>;
  try {
    parsed = JSON.parse(raw) as Partial<QuickDraft>;
  } catch {
    return null;
  }
  if (parsed?.v !== 1 || typeof parsed.savedAt !== "number") return null;
  if (now - parsed.savedAt > DRAFT_MAX_AGE_MS || parsed.savedAt > now + 60_000) return null;
  const type = TYPES.includes(String(parsed.type)) ? (parsed.type as QuickDraftType) : "EXPENSE";
  const draft: QuickDraft = {
    v: 1,
    savedAt: parsed.savedAt,
    type,
    amount: text(parsed.amount),
    categoryId: text(parsed.categoryId),
    accountId: text(parsed.accountId),
    description: text(parsed.description),
    tags: text(parsed.tags),
    date: text(parsed.date)
  };
  return hasContent(draft) ? draft : null;
}

const day = (ms: number) => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/**
 * Дата из черновика — только если он отложен сегодня: вчерашняя «сегодня» из
 * черновика превратила бы новую трату в старую.
 */
export function draftDate(draft: QuickDraft, now: number): string | null {
  return draft.date && day(draft.savedAt) === day(now) ? draft.date : null;
}
