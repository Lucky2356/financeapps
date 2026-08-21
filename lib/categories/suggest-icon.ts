// Which picture a category called "Продукты" should wear.
//
// Picking an icon by hand means scrolling fourteen groups to find the shopping
// trolley everyone knew was coming. So the name suggests it: the owner types,
// the icon follows, and one tap on any other icon ends the guessing for good.
//
// The dictionary is deliberately small and literal — the words people actually
// name categories after, in Russian and English. No stemming, no fuzzy match:
// a wrong picture is worse than no picture, because a wrong one has to be
// noticed and undone.

import { CATEGORY_ICONS } from "@/lib/categories/icons";
import { normalizeForMatch } from "@/lib/text/normalize";

type IconRule = { icon: string; keys: string[] };

// Order matters only for ties; otherwise the longest matching word wins, so
// "доставка еды" beats "доставка".
const RULES: IconRule[] = [
  // ── Food and drink ────────────────────────────────────────────────────────
  { icon: "ShoppingCart", keys: ["продукт", "магазин", "супермаркет", "grocer", "supermarket"] },
  {
    icon: "Utensils",
    keys: ["кафе", "ресторан", "столовая", "обед", "ужин", "доставка еды", "restaurant", "dining"]
  },
  { icon: "Coffee", keys: ["кофе", "кофейня", "чай", "coffee", "tea"] },
  { icon: "Pizza", keys: ["пицца", "фастфуд", "бургер", "pizza", "burger", "fast food"] },
  { icon: "Wine", keys: ["алкоголь", "вино", "бар", "alcohol", "wine"] },
  { icon: "Beer", keys: ["пиво", "beer"] },
  { icon: "CakeSlice", keys: ["сладости", "десерт", "кондитер", "sweets", "dessert"] },

  // ── Getting around ────────────────────────────────────────────────────────
  { icon: "Car", keys: ["авто", "машина", "автомобиль", "такси", "car", "taxi"] },
  { icon: "Fuel", keys: ["бензин", "топливо", "азс", "заправка", "fuel", "petrol"] },
  { icon: "Bus", keys: ["транспорт", "автобус", "проезд", "метро", "transport", "bus", "metro"] },
  { icon: "Train", keys: ["поезд", "ржд", "электричка", "train", "railway"] },
  { icon: "Plane", keys: ["самолет", "авиа", "перелет", "flight", "plane", "airline"] },
  { icon: "ParkingCircle", keys: ["парковка", "паркинг", "parking"] },
  { icon: "Bike", keys: ["велосипед", "самокат", "bike", "scooter"] },

  // ── Home and bills ────────────────────────────────────────────────────────
  { icon: "Home", keys: ["аренда", "квартира", "жилье", "съем", "rent", "housing", "apartment"] },
  { icon: "Receipt", keys: ["жкх", "коммуналка", "квартплата", "utilities", "bills"] },
  { icon: "Zap", keys: ["электричество", "электроэнерг", "свет", "electricity", "power"] },
  { icon: "Droplet", keys: ["вода", "водоснабжение", "water"] },
  { icon: "Flame", keys: ["газ", "отопление", "heating"] },
  { icon: "Wifi", keys: ["интернет", "провайдер", "internet", "wifi"] },
  { icon: "Phone", keys: ["телефон", "связь", "мобильн", "сотов", "phone", "mobile"] },
  { icon: "Sofa", keys: ["мебель", "интерьер", "furniture"] },
  { icon: "Wrench", keys: ["ремонт", "сервис", "обслуживание", "repair", "service"] },
  { icon: "Hammer", keys: ["стройка", "строительств", "инструмент", "construction", "tools"] },
  { icon: "Plug", keys: ["техника", "электроника", "гаджет", "electronics", "gadgets"] },

  // ── Body and health ───────────────────────────────────────────────────────
  { icon: "Stethoscope", keys: ["здоровье", "врач", "медицин", "клиника", "health", "doctor"] },
  { icon: "Pill", keys: ["аптека", "лекарств", "таблетк", "pharmacy", "medicine"] },
  { icon: "Syringe", keys: ["прививк", "вакцин", "анализ", "vaccine"] },
  { icon: "Scissors", keys: ["парикмахер", "стрижка", "барбершоп", "haircut", "barber"] },
  { icon: "Sparkles", keys: ["красота", "косметик", "салон", "уход", "beauty", "cosmetics"] },
  { icon: "Bath", keys: ["баня", "сауна", "spa", "sauna"] },
  { icon: "Dumbbell", keys: ["спорт", "фитнес", "зал", "тренировк", "sport", "gym", "fitness"] },
  { icon: "Waves", keys: ["бассейн", "плавание", "pool", "swimming"] },

  // ── Life and leisure ──────────────────────────────────────────────────────
  { icon: "Popcorn", keys: ["развлечен", "досуг", "entertainment", "fun"] },
  { icon: "Film", keys: ["кино", "фильм", "cinema", "movies"] },
  { icon: "Music", keys: ["музыка", "music"] },
  { icon: "Ticket", keys: ["билет", "концерт", "tickets", "concert"] },
  { icon: "Drama", keys: ["театр", "theatre", "theater"] },
  { icon: "Tv", keys: ["телевиден", "netflix", "streaming"] },
  { icon: "Gamepad2", keys: ["игры", "игра", "игров", "games", "gaming", "steam"] },
  { icon: "Camera", keys: ["фото", "photo"] },
  { icon: "TreePalm", keys: ["отпуск", "отдых", "путешеств", "туризм", "travel", "vacation"] },
  { icon: "Hotel", keys: ["отель", "гостиниц", "hotel"] },
  { icon: "Luggage", keys: ["командировк", "business trip"] },

  // ── People ────────────────────────────────────────────────────────────────
  { icon: "Baby", keys: ["дети", "ребенок", "детск", "kids", "children", "baby"] },
  { icon: "Dog", keys: ["собака", "питомец", "животн", "dog", "pet"] },
  { icon: "Cat", keys: ["кот", "кошка", "cat"] },
  { icon: "Gift", keys: ["подарок", "подарк", "gift", "present"] },
  { icon: "Heart", keys: ["благотворительн", "пожертвован", "charity", "donation"] },
  { icon: "GraduationCap", keys: ["образован", "учеба", "обучение", "курс", "education", "study"] },
  { icon: "Book", keys: ["книг", "литератур", "books"] },
  { icon: "School", keys: ["школа", "садик", "детсад", "school", "kindergarten"] },

  // ── Things bought ─────────────────────────────────────────────────────────
  { icon: "Shirt", keys: ["одежда", "обувь", "clothes", "clothing", "shoes"] },
  { icon: "ShoppingBag", keys: ["покупк", "шоппинг", "shopping", "маркетплейс"] },
  { icon: "Package", keys: ["доставка", "посылк", "delivery", "package"] },
  { icon: "Gem", keys: ["украшен", "ювелир", "jewelry"] },
  { icon: "Sprout", keys: ["дача", "огород", "растен", "garden", "plants"] },

  // ── Money in, money owed ──────────────────────────────────────────────────
  { icon: "Banknote", keys: ["зарплата", "зп", "оклад", "аванс", "salary", "wage", "payroll"] },
  { icon: "Briefcase", keys: ["работа", "бизнес", "фриланс", "подработк", "work", "freelance"] },
  { icon: "Coins", keys: ["доход", "процент", "income", "interest"] },
  { icon: "PiggyBank", keys: ["накоплен", "сбережен", "копилка", "savings"] },
  { icon: "TrendingUp", keys: ["инвестиц", "дивиденд", "акции", "investments", "dividends"] },
  { icon: "Landmark", keys: ["банк", "кредит", "ипотека", "займ", "долг", "bank", "loan", "debt"] },
  { icon: "CreditCard", keys: ["карта", "кредитка", "card"] },
  { icon: "HandCoins", keys: ["кэшбэк", "кешбэк", "возврат", "cashback", "refund"] },
  { icon: "ArrowRightLeft", keys: ["перевод", "transfer"] },
  { icon: "Repeat", keys: ["подписк", "subscription"] },
  { icon: "FileText", keys: ["налог", "штраф", "документ", "tax", "fine"] },
  { icon: "Umbrella", keys: ["страхов", "insurance"] }
];

// Below this a keyword only matches a whole word: "кот" must not claim
// "котлеты", and "зп" must not claim "зпчасти".
const PREFIX_FROM = 4;

/**
 * The icon a category name asks for, or null when nothing in the dictionary
 * fits — in which case whatever is already selected stays.
 */
export function suggestIconForName(name: string): string | null {
  const normalized = normalizeForMatch(name);
  if (!normalized) return null;
  const words = normalized.split(" ");

  let best: string | null = null;
  let bestScore = 0;

  for (const rule of RULES) {
    for (const key of rule.keys) {
      const hit = key.includes(" ")
        ? normalized.includes(key)
        : words.some((word) => (key.length >= PREFIX_FROM ? word.startsWith(key) : word === key));
      if (!hit) continue;
      if (key.length > bestScore) {
        best = rule.icon;
        bestScore = key.length;
      }
    }
  }

  return best;
}

/** Every icon the dictionary can produce — the test checks they all exist. */
export function suggestableIcons(): string[] {
  return [...new Set(RULES.map((rule) => rule.icon))];
}

/** True when this name has no opinion about its picture. */
export function hasIconSuggestion(name: string): boolean {
  return suggestIconForName(name) !== null;
}

// Guard against a rule naming a picture the picker does not carry: such an
// icon would render as the fallback dot and the suggestion would look broken.
// Checked at module load in development, and by a test in every build.
export function unknownSuggestedIcons(): string[] {
  const known = new Set(CATEGORY_ICONS);
  return suggestableIcons().filter((icon) => !known.has(icon));
}
