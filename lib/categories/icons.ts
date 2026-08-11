// The pictures a category can wear.
//
// Grouped the way people think about spending, not the way an icon library is
// organised: you look for "the present box" under gifts, not under "geometry".
// Every group carries at least five, so there is a real choice inside each one
// rather than a single obvious pick and four fillers.
//
// The names are lucide-react export names — `components/category-icon.tsx` maps
// them to the actual components, and a test keeps the two in step.

export type IconGroup = {
  id: string;
  /** i18n key for the group heading in the picker. */
  labelKey: string;
  icons: string[];
};

export const ICON_GROUPS: IconGroup[] = [
  {
    id: "finance",
    labelKey: "cat.icons.finance",
    icons: [
      "Wallet",
      "PiggyBank",
      "Landmark",
      "Coins",
      "Banknote",
      "CreditCard",
      "HandCoins",
      "TrendingUp",
      "Briefcase"
    ]
  },
  {
    id: "transport",
    labelKey: "cat.icons.transport",
    icons: ["Car", "Bus", "Train", "TramFront", "Fuel", "Bike", "Plane", "Ship", "ParkingCircle"]
  },
  {
    id: "shopping",
    labelKey: "cat.icons.shopping",
    icons: ["ShoppingCart", "ShoppingBag", "Store", "Package", "Shirt", "Gift", "Watch", "Gem"]
  },
  {
    id: "food",
    labelKey: "cat.icons.food",
    icons: [
      "Utensils",
      "Coffee",
      "Pizza",
      "Soup",
      "Croissant",
      "CakeSlice",
      "IceCream",
      "Apple",
      "Wine",
      "Beer"
    ]
  },
  {
    id: "home",
    labelKey: "cat.icons.home",
    icons: ["Home", "Sofa", "Bed", "Lamp", "Key", "Hammer", "Wrench", "Plug", "Refrigerator"]
  },
  {
    id: "health",
    labelKey: "cat.icons.health",
    icons: [
      "Stethoscope",
      "Pill",
      "HeartPulse",
      "Syringe",
      "Thermometer",
      "BriefcaseMedical",
      "Ambulance",
      "Cross"
    ]
  },
  {
    id: "beauty",
    labelKey: "cat.icons.beauty",
    icons: ["Scissors", "Sparkles", "Brush", "SprayCan", "Bath", "Palette", "Gem"]
  },
  {
    id: "fun",
    labelKey: "cat.icons.fun",
    icons: [
      "Gamepad2",
      "Music",
      "Film",
      "Tv",
      "Popcorn",
      "Ticket",
      "Drama",
      "PartyPopper",
      "Camera"
    ]
  },
  {
    id: "bills",
    labelKey: "cat.icons.bills",
    icons: ["Receipt", "Zap", "Droplet", "Flame", "Wifi", "Phone", "FileText", "Antenna", "Gauge"]
  },
  {
    id: "sport",
    labelKey: "cat.icons.sport",
    icons: ["Dumbbell", "Trophy", "Medal", "Volleyball", "Footprints", "Waves", "MountainSnow"]
  },
  {
    id: "leisure",
    labelKey: "cat.icons.leisure",
    icons: ["TreePalm", "Luggage", "Tent", "Sun", "Umbrella", "Map", "Compass", "Hotel"]
  },
  {
    id: "education",
    labelKey: "cat.icons.education",
    icons: [
      "GraduationCap",
      "Book",
      "BookOpen",
      "Library",
      "School",
      "NotebookPen",
      "PenTool",
      "Calculator"
    ]
  },
  {
    id: "family",
    labelKey: "cat.icons.family",
    icons: ["Baby", "Users", "Heart", "ToyBrick", "Dog", "Cat", "Rabbit"]
  },
  {
    id: "farm",
    labelKey: "cat.icons.farm",
    icons: ["Tractor", "Wheat", "Carrot", "Egg", "Milk", "Sprout", "TreeDeciduous", "Bird", "Fish"]
  },
  {
    id: "other",
    labelKey: "cat.icons.other",
    icons: [
      "Circle",
      "Star",
      "Tag",
      "Bookmark",
      "Box",
      "Globe",
      "Repeat",
      "ArrowRightLeft",
      "HelpCircle"
    ]
  }
];

/** Every icon name the picker can produce, in group order. */
export const CATEGORY_ICONS: string[] = ICON_GROUPS.flatMap((group) => group.icons);

/** What a category shows when it has no icon of its own. */
export const DEFAULT_CATEGORY_ICON = "Circle";

// The pictures the categories the app creates for you start with. Shared by the
// seed lists and by the migration that hands icons to installs made before the
// picker existed, so a fresh install and an old one end up looking the same.
export const SEED_CATEGORY_ICONS: Record<string, string> = {
  "cat-salary": "Banknote",
  "cat-other-income": "Coins",
  "cat-freelance": "Briefcase",
  "cat-food": "ShoppingCart",
  "cat-transport": "Bus",
  "cat-utilities": "Zap",
  "cat-subscriptions": "Repeat",
  "cat-restaurants": "Utensils",
  "cat-health": "Stethoscope",
  "cat-entertainment": "Popcorn",
  "cat-education": "GraduationCap",
  "cat-travel": "TreePalm"
};
