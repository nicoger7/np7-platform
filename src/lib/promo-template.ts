/**
 * Promo Studio — the data model for NP7 promo graphics.
 *
 * A design is ONE content set with TWO layouts: every positional value is
 * stored per format ("45" feed / "916" story), so switching format never
 * destroys tuning. All coordinates live in canvas pixels of the 1080-wide
 * artboard. The default state reproduces the approved OBX Wind graphic —
 * the scaled-up BrandedTile recipe (sun-to-sea washes, gold Anton place
 * name, screened flag drape, coach cutout with "with NAME").
 */

export type PromoFormat = "45" | "916";

export const PROMO_FORMATS: Record<PromoFormat, { w: number; h: number; label: string }> = {
  "45": { w: 1080, h: 1350, label: "4:5 Feed" },
  "916": { w: 1080, h: 1920, label: "9:16 Story" },
};

export type PerFmt<T> = Record<PromoFormat, T>;

export type Box = { x: number; y: number; w: number; h: number };

export interface PhotoLayer {
  src: string;
  /** background-position-style focal point (0–100) + zoom % (100 = cover). */
  focal: PerFmt<{ x: number; y: number; zoom: number }>;
}

export interface FlagLayer {
  src: string | null;
  visible: boolean;
  rotate: number; // degrees
  opacity: number; // 0–1
  blend: "screen" | "normal";
  /** Sideways fade start % (lower = more flag visible toward the centre). */
  fadeSide: number;
  /** Vertical fade start % of the flag box (fades out before the coach). */
  fadeDown: PerFmt<number>;
  box: PerFmt<Box>;
}

export interface ImageLayer {
  src: string | null;
  visible: boolean;
  box: PerFmt<Box>;
  /** Coach gets the double drop-shadow. */
  shadow?: boolean;
}

export type TextKind =
  | "eyebrow"
  | "place"
  | "subtitle"
  | "chip-gold"
  | "chip-glass"
  | "details"
  | "partner"
  | "with";

export interface TextLayer {
  id: string;
  kind: TextKind;
  visible: boolean;
  /** "\n" = line break; *span* renders in the kind's accent style. */
  text: string;
  size: number; // font px
  /** Top-left anchor — except "with", which anchors top-RIGHT at pos.x. */
  pos: PerFmt<{ x: number; y: number }>;
}

export interface PromoState {
  v: 1;
  name: string;
  format: PromoFormat;
  photo: PhotoLayer;
  washes: { softlight: boolean; veil: boolean; darkenLeft: boolean; darkenBottom: boolean };
  flag: FlagLayer;
  coach: ImageLayer;
  logo: ImageLayer;
  texts: TextLayer[];
}

export const PROMO_FLAGS = [
  { code: "us", name: "USA" },
  { code: "bq", name: "Bonaire" },
  { code: "tr", name: "Turkey" },
  { code: "it", name: "Italy" },
  { code: "es", name: "Spain" },
  { code: "se", name: "Sweden" },
  { code: "mg", name: "Madagascar" },
  { code: "nl", name: "Netherlands" },
];

export const NP7_EXPERIENCE_LOGO = "https://media.np-seven.com/logos/np7-experience-logo.png";

/** The approved OBX Wind design — also the blank-canvas starting point. */
export function defaultPromoState(): PromoState {
  return {
    v: 1,
    name: "New promo",
    format: "45",
    photo: {
      src: "https://media.np-seven.com/surveys/obx-wind-2027/obx-hero.jpg",
      focal: { "45": { x: 24, y: 44, zoom: 100 }, "916": { x: 27, y: 44, zoom: 100 } },
    },
    washes: { softlight: true, veil: true, darkenLeft: true, darkenBottom: true },
    flag: {
      src: "/flags/us.svg",
      visible: true,
      rotate: 12,
      opacity: 0.55,
      blend: "screen",
      fadeSide: 20,
      fadeDown: { "45": 42, "916": 32 },
      box: {
        "45": { x: 691, y: -135, w: 454, h: 1822 },
        "916": { x: 691, y: -192, w: 454, h: 2592 },
      },
    },
    coach: {
      src: "/coaches/dennis-promo.png",
      visible: true,
      shadow: true,
      box: {
        "45": { x: 454, y: 650, w: 666, h: 700 },
        "916": { x: 365, y: 1120, w: 761, h: 800 },
      },
    },
    logo: {
      src: NP7_EXPERIENCE_LOGO,
      visible: true,
      box: {
        "45": { x: 56, y: 48, w: 232, h: 164 },
        "916": { x: 56, y: 96, w: 232, h: 164 },
      },
    },
    texts: [
      { id: "eyebrow", kind: "eyebrow", visible: true, text: "NP7 Coaching Week", size: 27, pos: { "45": { x: 56, y: 592 }, "916": { x: 56, y: 1070 } } },
      { id: "place", kind: "place", visible: true, text: "Outer\nBanks", size: 186, pos: { "45": { x: 56, y: 648 }, "916": { x: 56, y: 1126 } } },
      { id: "subtitle", kind: "subtitle", visible: true, text: "The week before\nOBX Wind kicks off", size: 30, pos: { "45": { x: 56, y: 972 }, "916": { x: 56, y: 1450 } } },
      { id: "chip-gold", kind: "chip-gold", visible: true, text: "10–16 October 2026", size: 25, pos: { "45": { x: 56, y: 1078 }, "916": { x: 56, y: 1556 } } },
      { id: "chip-glass", kind: "chip-glass", visible: true, text: "Avon · Hatteras Island, NC", size: 25, pos: { "45": { x: 56, y: 1150 }, "916": { x: 56, y: 1628 } } },
      { id: "details", kind: "details", visible: true, text: "*8 spots* · from *$950* · gear & stay at the spot", size: 23, pos: { "45": { x: 56, y: 1232 }, "916": { x: 56, y: 1710 } } },
      { id: "partner", kind: "partner", visible: true, text: "Partner event with Ocean Air Sports  ·  *np-seven.com*", size: 21, pos: { "45": { x: 56, y: 1272 }, "916": { x: 56, y: 1750 } } },
      { id: "with", kind: "with", visible: true, text: "Dennis Robinson", size: 34, pos: { "45": { x: 1024, y: 56 }, "916": { x: 1024, y: 104 } } },
    ],
  };
}

/** Human labels for the element list / restore menu. */
export const TEXT_KIND_LABELS: Record<TextKind, string> = {
  eyebrow: "Eyebrow",
  place: "Place name",
  subtitle: "Subtitle",
  "chip-gold": "Date chip",
  "chip-glass": "Location chip",
  details: "Details line",
  partner: "Partner line",
  with: "“with Coach”",
};
