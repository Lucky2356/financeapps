// Which industry a security belongs to.
//
// MOEX's own feed carries no industry field, so the sector used to be filled in
// from the kind of instrument: everything the curated list said nothing about
// became "Прочее", a bond became "Облигации", a fund became "Фонды". The sector
// chart then answered a question nobody asked — it drew the same split as the
// "by kind" chart next to it, and a portfolio of ordinary Russian shares came
// out as one grey slice called "Прочее".
//
// This is the table that was missing: ticker → industry, in the taxonomy the
// owner reads elsewhere. It is deliberately plain data — no network, no
// scraping, nothing to break offline. What it does not know stays honest
// ("Разное"), and any holding can be corrected by hand on the position itself.

import type { AssetKind } from "@/types/enums";

/** The industries the app knows, in the order a picker should list them. */
export const MARKET_SECTORS = [
  "Нефть/Газ",
  "Энергетика",
  "Металлы и добыча",
  "Уголь",
  "Химия",
  "Машиностроение",
  "Оборона",
  "Строительство",
  "Транспорт",
  "Логистика",
  "Телекомы",
  "ПО и IT",
  "Медиа",
  "Медицина",
  "Продовольствие",
  "Розничная торговля",
  "Отели и Рестораны",
  "Пром. услуги",
  "Финансы и Банки",
  "Разное"
] as const;

export type MarketSector = (typeof MARKET_SECTORS)[number];

/** What a holding is filed under when the industry is unknown or does not apply. */
export const SECTOR_BY_ASSET_KIND: Record<AssetKind, string> = {
  STOCK: "Разное",
  // A bond and a broad fund have no single industry — saying so is better than
  // inventing one. They stay their own slice of the structure.
  BOND: "Облигации",
  FUND: "Фонды",
  GOLD: "Драгоценные металлы",
  OTHER: "Разное"
};

// The liquid part of the Moscow Exchange. Not exhaustive on purpose: a wrong
// industry is worse than an honest "Разное", so only names whose business is
// unambiguous are listed here.
const SECTOR_BY_TICKER: Record<string, MarketSector> = {
  // Нефть и газ
  GAZP: "Нефть/Газ",
  NVTK: "Нефть/Газ",
  ROSN: "Нефть/Газ",
  LKOH: "Нефть/Газ",
  SNGS: "Нефть/Газ",
  SNGSP: "Нефть/Газ",
  TATN: "Нефть/Газ",
  TATNP: "Нефть/Газ",
  SIBN: "Нефть/Газ",
  BANE: "Нефть/Газ",
  BANEP: "Нефть/Газ",
  RNFT: "Нефть/Газ",
  TRNFP: "Нефть/Газ",

  // Электроэнергетика
  IRAO: "Энергетика",
  HYDR: "Энергетика",
  FEES: "Энергетика",
  UPRO: "Энергетика",
  OGKB: "Энергетика",
  TGKA: "Энергетика",
  TGKB: "Энергетика",
  MSNG: "Энергетика",
  MSRS: "Энергетика",
  LSNG: "Энергетика",
  LSNGP: "Энергетика",
  DVEC: "Энергетика",
  ELFV: "Энергетика",
  MRKP: "Энергетика",
  MRKC: "Энергетика",
  MRKU: "Энергетика",
  MRKV: "Энергетика",
  MRKZ: "Энергетика",

  // Металлы и добыча
  GMKN: "Металлы и добыча",
  NLMK: "Металлы и добыча",
  MAGN: "Металлы и добыча",
  CHMF: "Металлы и добыча",
  PLZL: "Металлы и добыча",
  POLY: "Металлы и добыча",
  RUAL: "Металлы и добыча",
  ENPG: "Металлы и добыча",
  VSMO: "Металлы и добыча",
  SELG: "Металлы и добыча",
  UGLD: "Металлы и добыча",
  TRMK: "Металлы и добыча",
  CHMK: "Металлы и добыча",
  AMEZ: "Металлы и добыча",
  LNZL: "Металлы и добыча",
  LNZLP: "Металлы и добыча",

  // Уголь
  MTLR: "Уголь",
  MTLRP: "Уголь",
  RASP: "Уголь",

  // Химия
  PHOR: "Химия",
  AKRN: "Химия",
  KAZT: "Химия",
  KAZTP: "Химия",
  NKNC: "Химия",
  NKNCP: "Химия",
  KZOS: "Химия",
  KZOSP: "Химия",

  // Машиностроение и оборона
  KMAZ: "Машиностроение",
  SVAV: "Машиностроение",
  UWGN: "Машиностроение",
  GAZA: "Машиностроение",
  IRKT: "Оборона",
  UNAC: "Оборона",

  // Строительство
  PIKK: "Строительство",
  LSRG: "Строительство",
  SMLT: "Строительство",
  ETLN: "Строительство",

  // Транспорт и логистика
  AFLT: "Транспорт",
  FLOT: "Транспорт",
  DELI: "Транспорт",
  WUSH: "Транспорт",
  FESH: "Логистика",
  NMTP: "Логистика",
  GLTR: "Логистика",

  // Связь
  MTSS: "Телекомы",
  RTKM: "Телекомы",
  RTKMP: "Телекомы",
  MGTS: "Телекомы",
  MGTSP: "Телекомы",

  // ПО и IT
  YDEX: "ПО и IT",
  VKCO: "ПО и IT",
  POSI: "ПО и IT",
  ASTR: "ПО и IT",
  DIAS: "ПО и IT",
  IVAT: "ПО и IT",
  SOFL: "ПО и IT",
  DATA: "ПО и IT",
  CIAN: "ПО и IT",
  HEAD: "ПО и IT",

  // Медицина
  MDMG: "Медицина",
  GEMC: "Медицина",
  OZPH: "Медицина",
  PRMD: "Медицина",
  APTK: "Медицина",
  LIFE: "Медицина",

  // Еда и торговля
  BELU: "Продовольствие",
  AGRO: "Продовольствие",
  GCHE: "Продовольствие",
  MGNT: "Розничная торговля",
  X5: "Розничная торговля",
  FIVE: "Розничная торговля",
  LENT: "Розничная торговля",
  FIXP: "Розничная торговля",
  MVID: "Розничная торговля",
  OZON: "Розничная торговля",
  HNFG: "Розничная торговля",

  // Финансы
  SBER: "Финансы и Банки",
  SBERP: "Финансы и Банки",
  VTBR: "Финансы и Банки",
  T: "Финансы и Банки",
  TCSG: "Финансы и Банки",
  BSPB: "Финансы и Банки",
  BSPBP: "Финансы и Банки",
  CBOM: "Финансы и Банки",
  SVCB: "Финансы и Банки",
  MBNK: "Финансы и Банки",
  RENI: "Финансы и Банки",
  LEAS: "Финансы и Банки",
  SFIN: "Финансы и Банки",
  MOEX: "Финансы и Банки",
  SPBE: "Финансы и Банки",

  // Холдинги
  AFKS: "Пром. услуги"
};

/**
 * The industry of a security. Falls back to what the instrument is when the
 * table has nothing — which is the truth for a bond or a broad fund, and an
 * honest "Разное" for a share nobody has classified yet.
 */
export function sectorForTicker(ticker: string, assetKind: AssetKind = "STOCK"): string {
  const known = SECTOR_BY_TICKER[ticker.trim().toUpperCase()];
  if (known) return known;
  return SECTOR_BY_ASSET_KIND[assetKind] ?? "Разное";
}

/** True when the table names this ticker's industry (as opposed to guessing). */
export function hasKnownSector(ticker: string): boolean {
  return Boolean(SECTOR_BY_TICKER[ticker.trim().toUpperCase()]);
}
