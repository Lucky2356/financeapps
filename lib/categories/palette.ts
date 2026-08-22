// The colours a category can be painted with.
//
// The seed palette used to be stock Tailwind — orange, blue, red, pink at full
// saturation — which is why the spending doughnut looked like a different app
// from everything around it. These are the same hues Nocturne already uses for
// its accent and its three statuses, pulled to one lightness band so a chart
// made of them reads as one picture.

/** The Nocturne set: what the app paints with when nobody has chosen. */
export const SEED_CATEGORY_COLORS = [
  "#9184d9", // accent blurple
  "#b3a7ea", // light blurple
  "#7f8fd8", // periwinkle
  "#6fb2d2", // muted blue
  "#7ed6b7", // mint (the theme's "good")
  "#e2b26e", // amber (the theme's "watch out")
  "#e2788a", // rose (the theme's "bad")
  "#a89bc9", // lavender grey
  "#c9a2d8", // orchid
  "#8fa3c4" // steel blue
] as const;

// Ten colours is enough for a seeded install and nowhere near enough for
// someone keeping forty categories apart at a glance. The rest of the palette
// is a grid: seventeen hues around the circle, each in eight tones. It is built
// rather than typed out so the steps stay even — an eyeballed list of a hundred
// colours drifts, and two neighbouring categories end up the same shade.
//
// Around the circle starting at red, so the picker reads as a rainbow and a
// colour can be found by walking to it. It used to start at violet and put the
// warm end in the middle, which is how "there is no yellow in the palette"
// happened: the yellows were three rows below the fold of a scrolling box.
const HUES = [5, 25, 45, 52, 68, 95, 125, 155, 178, 198, 225, 250, 265, 285, 305, 325, 345];
// The first tone is the vivid one — without it every hue came out muted, and a
// muted yellow is olive. The rest keep the mid band (lightness 38–74%) that
// holds up on both the light surface and the dark one.
const TONES = [
  { s: 78, l: 52 },
  { s: 58, l: 40 },
  { s: 55, l: 48 },
  { s: 52, l: 56 },
  { s: 50, l: 64 },
  { s: 44, l: 72 },
  { s: 30, l: 50 },
  { s: 26, l: 66 }
];

/** HSL → "#rrggbb". Hue in degrees, saturation and lightness in percent. */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  const [r, g, b] = (
    hue < 60
      ? [chroma, secondary, 0]
      : hue < 120
        ? [secondary, chroma, 0]
        : hue < 180
          ? [0, chroma, secondary]
          : hue < 240
            ? [0, secondary, chroma]
            : hue < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  ).map((channel) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0")
  );
  return `#${r}${g}${b}`;
}

const GRID = HUES.flatMap((hue) => TONES.map((tone) => hslToHex(hue, tone.s, tone.l)));

// Greys carry the categories that are not really a colour — "other", transfers,
// anything that should sit back rather than compete in a chart.
const NEUTRALS = [
  "#2f3440",
  "#4a5162",
  "#646d80",
  "#8a919f",
  "#adb3bd",
  "#cbd0d8",
  "#e4e7ec"
] as const;

/** Everything the colour picker offers, seeds first, no duplicates. */
export const CATEGORY_COLORS: string[] = [
  ...new Set([...SEED_CATEGORY_COLORS, ...GRID, ...NEUTRALS])
];

/**
 * The same colours, in the three blocks the picker draws them as. A hundred and
 * forty swatches in one flat wrap is a wall, not a palette: laid out as one hue
 * per row, with the seeds and the greys apart, a colour can be aimed at.
 */
export const CATEGORY_COLOR_GROUPS: Array<{
  id: string;
  labelKey: string;
  colors: readonly string[];
  /** How many swatches per row — the grid block puts one hue on each row. */
  columns?: number;
}> = [
  { id: "seeds", labelKey: "cat.color.seeds", colors: SEED_CATEGORY_COLORS },
  { id: "grid", labelKey: "cat.color.palette", colors: GRID, columns: TONES.length },
  { id: "neutrals", labelKey: "cat.color.neutrals", colors: NEUTRALS }
];

/** Colour for a category the user creates without picking one. */
export const DEFAULT_CATEGORY_COLOR = SEED_CATEGORY_COLORS[0];

// What the seeded categories used to be painted with, and what each becomes.
// The migration rewrites a category's colour ONLY when it still holds its seed
// value — anything the owner picked by hand is left alone.
export const LEGACY_CATEGORY_COLORS: Record<string, string> = {
  "#16a34a": "#7ed6b7", // Зарплата
  "#0d9488": "#6fb2d2", // Прочие доходы
  "#f97316": "#9184d9", // Продукты
  "#2563eb": "#7f8fd8", // Транспорт
  "#7c3aed": "#b3a7ea", // ЖКХ
  "#db2777": "#a89bc9", // Подписки
  "#ea580c": "#e2b26e", // Рестораны
  "#dc2626": "#e2788a", // Здоровье
  // Only present in the built-in example, not in a fresh install.
  "#eab308": "#c9a2d8", // Развлечения
  "#0891b2": "#8fa3c4", // Образование
  "#0284c7": "#6fb2d2" // Путешествия
};
