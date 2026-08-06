// The colours a category can be painted with.
//
// The seed palette used to be stock Tailwind — orange, blue, red, pink at full
// saturation — which is why the spending doughnut looked like a different app
// from everything around it. These are the same hues Nocturne already uses for
// its accent and its three statuses, pulled to one lightness band so a chart
// made of them reads as one picture.

export const CATEGORY_COLORS = [
  "#9184d9", // accent blurple
  "#b3a7ea", // light blurple
  "#7f8fd8", // periwinkle
  "#6fb2d2", // muted blue
  "#7ed6b7", // mint (the theme's "good")
  "#e2b26e", // amber (the theme's "watch out")
  "#e2788a", // rose (the theme's "bad")
  "#a89bc9" // lavender grey
] as const;

/** Colour for a category the user creates without picking one. */
export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[0];

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
  "#dc2626": "#e2788a" // Здоровье
};

/** The Nocturne colour for a legacy seed colour, or the colour itself. */
export function modernizeCategoryColor(color: string): string {
  return LEGACY_CATEGORY_COLORS[color.toLowerCase()] ?? color;
}
