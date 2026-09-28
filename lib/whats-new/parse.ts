// Разбор CHANGELOG.md для окна «Что нового».
//
// Источник один — CHANGELOG. Второе место, где «что нового» писалось бы
// отдельно для приложения, однажды разошлось бы с первым: на странице выпуска
// одно, в приложении другое. Поэтому приложение получает ровно те слова, что
// лежат в CHANGELOG, — только без разметки и без разделов для владельца службы
// и разработчиков.
//
// Без импортов с «@/»: этот же файл запускает scripts/make-whats-new.ts через
// node, а node про псевдонимы путей не знает.

export type WhatsNewItem = { lead: string; text: string };
export type WhatsNewSection = { title: string; items: WhatsNewItem[] };
export type WhatsNewRelease = {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  /** Строка-итог под заголовком выпуска, с эмодзи. */
  summary: string;
  /** "fixes" — в выпуске только исправления: окно так и говорит. */
  kind: "features" | "fixes";
  sections: WhatsNewSection[];
};

/**
 * Разделы, которые людям в приложении ни к чему: они про службу, проверки и
 * устройство кода. На странице выпуска они остаются.
 */
const HIDDEN_SECTIONS = [
  /^внутреннее/i,
  /^проверки/i,
  /^под капотом/i,
  /^служба/i,
  /владельца службы/i,
  /держит службу/i
];

/** Выпуск, где видимые разделы только такие, — выпуск исправлений. */
const FIX_SECTIONS = [/^исправлен/i, /^безопасность/i];

const HEADING = /^## \[(\d+\.\d+\.\d+)\]\s*[—–-]\s*(\d{4}-\d{2}-\d{2})/;

/** Снять markdown, который в окне выглядел бы мусором. */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function item(raw: string): WhatsNewItem {
  const joined = raw.replace(/\s+/g, " ").trim();
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(joined);
  if (bold) return { lead: plain(bold[1]), text: plain(bold[2]) };
  return { lead: "", text: plain(joined) };
}

function section(title: string, lines: string[]): WhatsNewSection {
  const items: WhatsNewItem[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (current) items.push(item(current.join(" ")));
      current = [line.slice(2)];
    } else if (current && /^\s+\S/.test(line)) {
      // Продолжение пункта или вложенный пункт — одной строкой.
      current.push(line.trim().replace(/^- /, ""));
    } else if (current && line.trim() === "") {
      items.push(item(current.join(" ")));
      current = null;
    }
  }
  if (current) items.push(item(current.join(" ")));
  return { title: title.trim(), items };
}

function release(version: string, date: string, body: string[]): WhatsNewRelease {
  const firstSection = body.findIndex((line) => line.startsWith("### "));
  const intro = firstSection === -1 ? body : body.slice(0, firstSection);
  const summary = plain(
    intro
      .join("\n")
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .find(Boolean) ?? ""
  );

  const sections: WhatsNewSection[] = [];
  if (firstSection !== -1) {
    let title = "";
    let lines: string[] = [];
    const flush = () => {
      if (title && !HIDDEN_SECTIONS.some((hidden) => hidden.test(title))) {
        const built = section(title, lines);
        if (built.items.length > 0) sections.push(built);
      }
    };
    for (const line of body.slice(firstSection)) {
      if (line.startsWith("### ")) {
        flush();
        title = line.slice(4);
        lines = [];
      } else {
        lines.push(line);
      }
    }
    flush();
  }

  const kind =
    sections.length > 0 && sections.every((s) => FIX_SECTIONS.some((fix) => fix.test(s.title)))
      ? "fixes"
      : "features";
  return { version, date, summary, kind, sections };
}

/** Последние `limit` выпусков из текста CHANGELOG, новые первыми. */
export function parseChangelog(markdown: string, limit = 12): WhatsNewRelease[] {
  const lines = markdown.split(/\r?\n/);
  const releases: WhatsNewRelease[] = [];
  let head: RegExpExecArray | null = null;
  let body: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## [")) {
      if (head) releases.push(release(head[1], head[2], body));
      if (releases.length >= limit) return releases;
      head = HEADING.exec(line);
      body = [];
    } else if (head) {
      body.push(line);
    }
  }
  if (head && releases.length < limit) releases.push(release(head[1], head[2], body));
  return releases;
}
