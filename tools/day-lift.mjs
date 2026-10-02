// Day palettes made by lifting the night palette toward daylight: every colour keeps its hue
// and gets lighter by `k` (0 = night, 1 = white), so the day look is the night look in sun.
// Text turns dark once the ground is light enough to need it.

import { PALETTES } from "../scripts/style.mjs";

const toHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
};
const toHex = ([h, s, l]) => {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};
/** Lighter by k; saturation fades as it lifts (ground greys out in daylight) unless keepSat is given. */
const lift = (hex, k, keepSat = 1 - 0.55 * k) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [h, s, l] = toHsl(hex);
  return toHex([h, s * keepSat, l + (1 - l) * k]);
};

/** The night palette lifted by k (0..1). */
export function liftNight(k) {
  const N = PALETTES.night;
  const ground = ["water", "land", "park", "wood", "campus", "commercial", "industrial", "hospital", "school", "sand", "airport",
    "building", "buildingLine", "road", "major", "highway", "runway", "rail", "boundary", "wallDark", "wallLit", "roofLow", "roofMid", "roofHigh"];
  const out = {};
  for (const key of ground) out[key] = lift(N[key], k);
  // Edges, walls and roads lift less than the ground, so they keep their contrast against it.
  out.buildingLine = lift(N.buildingLine, k * 0.75);
  out.wallDark = lift(N.wallDark, k * 0.7);
  // Streets keep their teal.
  out.road = lift(N.road, k * 0.8, 0.95);
  out.major = lift(N.major, k * 0.75, 0.95);
  out.highway = lift(N.highway, k * 0.7, 0.95);
  // Water stays deeper and bluer than the land, parks clearly teal, so the shore and greens read.
  out.park = lift(N.park, k * 0.72, 1.05);
  out.water = lift(N.water, k * 0.5, 1.25);
  const darkText = k >= 0.45;
  Object.assign(out, darkText
    ? { label: "#0e1424", roadLabel: "#16203a", minorLabel: "#26324d", waterLabel: "#132a4a", halo: lift(N.land, Math.min(1, k + 0.25)) }
    : { label: N.label, roadLabel: N.roadLabel, minorLabel: lift(N.minorLabel, k * 0.5), waterLabel: lift(N.waterLabel, k * 0.5), halo: lift(N.halo, k) });
  out.casingOpacity = 0;
  return out;
}

/**
 * Round 2, on the 30% step the GM preferred, with colour rules applied:
 *   - quiet, low-chroma slate ground, so accents (parks, water, transit, landmarks) carry colour;
 *   - streets separated from the ground by lightness, and warm against the cool ground;
 *   - road rank by warmth: the busier the road, the warmer (expressways amber, side streets grey);
 *   - water deeper and bluer than the land; parks teal-green, not blue.
 */
const GROUND = {
  land: "#3e4a62", water: "#24406e", park: "#3f7d72", wood: "#386f66", campus: "#46526b",
  commercial: "#3e4a62", industrial: "#3e4a62", hospital: "#46526b", school: "#46526b", sand: "#3e4a62", airport: "#46526b",
  building: "#4a5672", buildingLine: "#2a3346",
  runway: "#5d6984", rail: "#6f7a92", boundary: "#6f7a92",
  wallDark: "#272f41", wallLit: "#55617d", roofLow: "#56637f", roofMid: "#5d6a86", roofHigh: "#65728e",
  label: "#f2f5f8", roadLabel: "#18202f", roadHalo: "#d6dce4", minorLabel: "#b9c3cf", waterLabel: "#a9c4e6", halo: "#2f394d",
  casingOpacity: 0
};
export const ROUND2 = {
  // Warm arterials: grey side streets, sand main roads, amber expressways.
  warm: { ...GROUND, road: "#9aa3b1", major: "#d7c7a3", highway: "#e9b866", transit: "#f2d27a" },
  // Neutral: pale grey streets, near-white main roads, soft gold expressways. Cleanest.
  neutral: { ...GROUND, road: "#8e98a8", major: "#c9d0d9", highway: "#e6d29a", transit: "#f2d27a" },
  // Sand: every road a warm sand, lighter as it gets busier. Most "paper map".
  sand: { ...GROUND, road: "#a59c88", major: "#cdbf9d", highway: "#e8d3a0", transit: "#f2d27a" }
};

export const LIFTS = { lift30: liftNight(0.3), lift50: liftNight(0.5), lift70: liftNight(0.7), ...ROUND2 };
