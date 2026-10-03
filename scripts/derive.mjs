// Data made from a city's tiles when it is generated: tall buildings for leaning walls, the
// place list for labels and search, and the night-from-orbit image with its twinkling lights.
// Pure apart from encodeImage (passed in): runs in the browser and in Node tests.

import { VectorTile } from "../lib/mvt/vector-tile.js";
import { PbfReader } from "../lib/mvt/pbf.js";
import { fromWorld, metres, toWorld, tileRange, worldBounds } from "./geo.mjs";
import { DEFAULT_HEIGHT, NIGHT_GROUPS, TALL } from "./style.mjs";

/** Deepest zoom of the tiles, where buildings, places and every road are. */
export const DETAIL_ZOOM = 14;
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/** Every [x, y] tile at the detail zoom covering a lat/lon box. */
export function detailTiles(bounds, z = DETAIL_ZOOM) {
  const r = tileRange(z, worldBounds(bounds));
  const out = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) out.push([x, y]);
  return out;
}

/** Each detail tile decoded, in turn: visit(vt, { x, y, toLonLat(point, layer) }). */
export async function eachTile(getTile, bounds, visit, onProgress) {
  const tiles = detailTiles(bounds);
  const n = 2 ** DETAIL_ZOOM;
  for (let i = 0; i < tiles.length; i++) {
    const [x, y] = tiles[i];
    const bytes = await getTile(DETAIL_ZOOM, x, y);
    if (bytes) {
      const vt = new VectorTile(new PbfReader(bytes));
      const toWorldXY = (p, layer) => [(x + p.x / layer.extent) / n, (y + p.y / layer.extent) / n];
      const toLonLat = (p, layer) => {
        const [wx, wy] = toWorldXY(p, layer);
        const ll = fromWorld(wx, wy);
        return [+ll.lon.toFixed(6), +ll.lat.toFixed(6)];
      };
      visit(vt, { x, y, toLonLat, toWorldXY, inTile: (p, layer) => p.x >= 0 && p.y >= 0 && p.x < layer.extent && p.y < layer.extent });
    }
    if (i % 25 === 0) { onProgress?.(i / tiles.length); await yieldToUi(); }
  }
}

const ringArea = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
};

/**
 * Buildings at least TALL metres high inside a box: [{ id, h, base, rings }] with rings in
 * [lon, lat]. A building split over tiles keeps its largest piece.
 */
export async function tallBuildings(getTile, bounds, onProgress) {
  const byId = new Map();
  await eachTile(getTile, bounds, (vt, { toLonLat }) => {
    const layer = vt.layers.building;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i);
      const h = f.properties.render_height ?? DEFAULT_HEIGHT;
      // hide_3d: the outline of a building mapped in parts (the Empire State's whole lot, at the
      // full height). Its parts carry the real shape; raised, the outline is a slab over them.
      if (f.type !== 3 || h < TALL || f.id === undefined || f.properties.hide_3d) continue;
      const rings = f.loadGeometry().map((r) => r.map((p) => toLonLat(p, layer)));
      const c = rings[0][0];
      if (c[1] > bounds.north || c[1] < bounds.south || c[0] < bounds.west || c[0] > bounds.east) continue;
      const area = ringArea(rings[0]);
      const prev = byId.get(f.id);
      if (!prev || prev.area < area) byId.set(f.id, { id: f.id, h, base: f.properties.render_min_height ?? 0, rings, area });
    }
  }, onProgress);
  return [...byId.values()].map(({ area, ...b }) => b);
}

const insideRing = ([x, y], ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/**
 * Ids of every building (any height) whose outline's centre lies in one of the areas (rings of
 * [lon, lat]): an era clears a whole site this way (the World Trade Center before 2001).
 */
export async function buildingsInAreas(getTile, areas) {
  if (!areas?.length) return [];
  // Only the tiles each area covers (areas can be scattered across the city: landmark footprints).
  const boxes = areas.map((a) => ({
    ring: a,
    west: Math.min(...a.map((p) => p[0])), east: Math.max(...a.map((p) => p[0])),
    south: Math.min(...a.map((p) => p[1])), north: Math.max(...a.map((p) => p[1]))
  }));
  const tiles = new Map();
  for (const b of boxes) for (const [x, y] of detailTiles(b)) tiles.set(`${x},${y}`, [x, y]);
  const n = 2 ** DETAIL_ZOOM;
  const ids = new Set();
  for (const [x, y] of tiles.values()) {
    const bytes = await getTile(DETAIL_ZOOM, x, y);
    if (!bytes) continue;
    const layer = new VectorTile(new PbfReader(bytes)).layers.building;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 3 || f.id === undefined || ids.has(f.id)) continue;
      const ring = f.loadGeometry()[0].map((p) => {
        const ll = fromWorld((x + p.x / layer.extent) / n, (y + p.y / layer.extent) / n);
        return [ll.lon, ll.lat];
      });
      const c = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
      const inBox = (b, p) => p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north && insideRing(p, b.ring);
      // Its centre inside, or most of its corners (a sprawling casino podium's centre can fall
      // in its own courtyard or lake).
      if (boxes.some((b) => inBox(b, c) || ring.filter((p) => inBox(b, p)).length * 2 > ring.length)) ids.add(f.id);
    }
  }
  return [...ids];
}

/**
 * Named places from the tiles: points of interest, with their OpenStreetMap kind (subclass),
 * importance (rank, 1 = most) and position. [{ id, name, kind, cls, rank, lat, lon }].
 */
export async function placeList(getTile, bounds, onProgress) {
  const byKey = new Map();
  await eachTile(getTile, bounds, (vt, { toLonLat, inTile }) => {
    const layer = vt.layers.poi;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      const name = p["name:en"] ?? p.name_en ?? p.name;
      if (!name || f.type !== 1) continue;
      const pt = f.loadGeometry()[0][0];
      if (!inTile(pt, layer)) continue;
      // Bus stops are many and nameless in any useful sense on a city map.
      if (p.class === "bus" && p.subclass === "bus_stop") continue;
      const [lon, lat] = toLonLat(pt, layer);
      const key = f.id ?? `${name}@${lon},${lat}`;
      if (!byKey.has(key)) byKey.set(key, { id: String(f.id ?? key), name, kind: p.subclass ?? p.class, cls: p.class, rank: p.rank ?? 30, lat, lon });
    }
  }, onProgress);
  return [...byKey.values()];
}

/** A segment clipped to the square 0..E (Liang-Barsky), or null; cut is set when its end was clipped. */
function clipSegment(a, b, E) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x], [dx, E - a.x], [-dy, a.y], [dy, E - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  const seg = [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
  seg.cut = t1 < 1;
  return seg;
}

/** Rapid transit kinds drawn as the transit overlay. */
const RAPID = new Set(["subway", "light_rail", "tram", "monorail"]);

/**
 * Today's rapid transit track (subway, light rail, tram, monorail) as GeoJSON lines with a
 * tunnel flag: the overlay every city shows until its era supplies the period's own lines.
 */
export async function transitLines(getTile, bounds, onProgress) {
  const features = [];
  await eachTile(getTile, bounds, (vt, { toLonLat }) => {
    const layer = vt.layers.transportation;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      if (f.type !== 2 || !RAPID.has(p.subclass) || p.service) continue;
      // Each segment clipped to the tile's own square (not its buffer), so neighbouring tiles
      // meet exactly at the edge: no gaps, no doubled line.
      const E = layer.extent;
      for (const line of f.loadGeometry()) {
        let run = [];
        const flush = () => { if (run.length > 1) features.push({ type: "Feature", properties: { mode: p.subclass, tunnel: p.brunnel === "tunnel" }, geometry: { type: "LineString", coordinates: run } }); run = []; };
        for (let j = 1; j < line.length; j++) {
          const seg = clipSegment(line[j - 1], line[j], E);
          if (!seg) { flush(); continue; }
          const [a, b] = seg.map((q) => toLonLat(q, layer));
          if (!run.length || run.at(-1)[0] !== a[0] || run.at(-1)[1] !== a[1]) { flush(); run.push(a); }
          run.push(b);
          if (seg.cut) flush();
        }
        flush();
      }
    }
  }, onProgress);
  return { type: "FeatureCollection", features };
}

/* ---------------------------------------- */
/*  Transit lines in their colours           */
/* ---------------------------------------- */

/** Public Overpass servers, tried in turn: a busy one answers 429 or 504. */
export const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

const hexToHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
};
const hslToHex = ([h, s, l]) => {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/** A line colour made light enough to read on the night map (the MBTA's dark blue would vanish). */
export function nightColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? "")) return null;
  const [h, s, l] = hexToHsl(hex);
  // Lighter but not neon: saturation capped, as the KG Boston MBTA line colours were tuned.
  return hslToHex([h, Math.min(s, 0.72), Math.max(l, 0.56)]);
}

const normalHex = (c) => {
  if (!c) return null;
  c = c.trim();
  if (/^#[0-9a-f]{3}$/i.test(c)) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
};

/**
 * Today's rapid transit routes from OpenStreetMap (via Overpass), each track piece in its line's
 * colour, with the stations: { type: "FeatureCollection", features, lines, stations }.
 *   features: track LineStrings { line, lines, color, colorNight, mode, tunnel }
 *   lines:    [{ id, ref, name, color, colorNight, mode }]
 *   stations: [{ name, lat, lon, lines: [ref] }]
 * The era's own lines (city pack) replace these for a past period.
 */
export async function transitRoutes(bounds, { endpoints = OVERPASS, timeoutMs = 45000 } = {}) {
  const box = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:120];
rel["type"="route"]["route"~"^(subway|light_rail|tram|monorail)$"](${box})->.r;
.r out body;
way(r.r)["railway"];
out geom;
node(r.r)["public_transport"~"^(stop_position|station|platform)$"];
out;`;
  // Overpass asks callers to identify themselves (browsers keep their own User-Agent).
  let elements = null, lastError = null;
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 2 && !elements; attempt++) {
      try {
        // A busy server can hold a request for minutes: give up after timeoutMs and try the next.
        const res = await fetch(endpoint, {
          method: "POST", body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(timeoutMs),
          // Only Node needs to name itself; in a browser the extra header would cost a preflight request.
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...(globalThis.window ? {} : { "User-Agent": "kg-cities Foundry VTT module" }) }
        });
        if (!res.ok) throw new Error(`Overpass answered HTTP ${res.status}`);
        ({ elements } = await res.json());
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (elements) break;
  }
  if (!elements) throw lastError ?? new Error("Overpass could not be reached");
  const rels = elements.filter((e) => e.type === "relation");
  const ways = new Map(elements.filter((e) => e.type === "way").map((w) => [w.id, w]));
  const nodes = new Map(elements.filter((e) => e.type === "node").map((n) => [n.id, n]));

  const lines = rels.map((r) => {
    const color = normalHex(r.tags.colour);
    return { id: r.id, ref: r.tags.ref ?? r.tags.name ?? String(r.id), name: r.tags.name ?? r.tags.ref ?? "", color, colorNight: nightColor(color), mode: r.tags.route };
  });
  const byRel = new Map(lines.map((l) => [l.id, l]));

  // Each way once, with every line that runs on it; coloured by the first line that has a colour.
  const wayLines = new Map();
  for (const r of rels) {
    for (const m of r.members ?? []) {
      if (m.type !== "way" || !ways.has(m.ref)) continue;
      if (!wayLines.has(m.ref)) wayLines.set(m.ref, []);
      const list = wayLines.get(m.ref);
      const l = byRel.get(r.id);
      if (!list.includes(l)) list.push(l);
    }
  }
  const features = [];
  for (const [id, served] of wayLines) {
    const w = ways.get(id);
    if (!w.geometry?.length) continue;
    const main = served.find((l) => l.color) ?? served[0];
    const t = w.tags ?? {};
    features.push({
      type: "Feature",
      properties: {
        line: main.ref, lines: served.map((l) => l.ref).join(";"), color: main.color, colorNight: main.colorNight, mode: main.mode,
        tunnel: t.tunnel === "yes" || t.tunnel === "building_passage" || Number(t.layer) < 0
      },
      geometry: { type: "LineString", coordinates: w.geometry.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)]) }
    });
  }

  // Stations: stops and platforms grouped by name, at their average position.
  const stops = new Map();
  for (const r of rels) {
    for (const m of r.members ?? []) {
      const n = m.type === "node" ? nodes.get(m.ref) : null;
      const name = n?.tags?.name;
      if (!name) continue;
      const key = name.toLowerCase();
      if (!stops.has(key)) stops.set(key, { name, pts: [], lines: new Set() });
      const s = stops.get(key);
      s.pts.push([n.lon, n.lat]);
      s.lines.add(byRel.get(r.id).ref);
    }
  }
  const stations = [...stops.values()].map((s) => ({
    name: s.name,
    lat: +(s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length).toFixed(6),
    lon: +(s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length).toFixed(6),
    lines: [...s.lines]
  }));
  return { type: "FeatureCollection", features, lines, stations };
}

/* ---------------------------------------- */
/*  Night from orbit                         */
/* ---------------------------------------- */

/** How bright a road of each class burns (streetlights per metre, roughly). */
function roadLight(p) {
  switch (p.class) {
    case "motorway": case "trunk": return 1.0;
    case "primary": case "secondary": return 0.75;
    case "tertiary": case "minor": return 0.5;
    case "service": return 0.2;
    case "rail": case "transit": return 0.08;
    default: return 0.12;
  }
}

/** Three box blurs, about a Gaussian of radius r, from src into out (tmp: scratch). */
function blur(src, out, tmp, W, H, r) {
  out.set(src);
  const pass = (from, to, horizontal) => {
    const len = horizontal ? W : H, lines = horizontal ? H : W, step = horizontal ? 1 : W, jump = horizontal ? W : 1;
    for (let l = 0; l < lines; l++) {
      const base = l * jump;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += from[base + Math.min(len - 1, Math.max(0, k)) * step];
      for (let i = 0; i < len; i++) {
        to[base + i * step] = sum / (2 * r + 1);
        sum += from[base + Math.min(len - 1, i + r + 1) * step] - from[base + Math.max(0, i - r) * step];
      }
    }
  };
  for (let i = 0; i < 3; i++) { pass(out, tmp, true); pass(tmp, out, false); }
}

const STOPS = [
  [0, [6, 4, 3]], [0.08, [28, 13, 5]], [0.25, [95, 42, 10]], [0.5, [190, 98, 30]],
  [0.75, [240, 170, 80]], [0.92, [255, 225, 170]], [1, [255, 248, 230]]
];
function ramp(t) {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i], k = (t - t0) / (t1 - t0);
      return c0.map((c, j) => c + (c1[j] - c) * k);
    }
  }
  return STOPS.at(-1)[1];
}

/**
 * The city at night from orbit: every road burning sodium orange, big roofs bright, water dark,
 * fading to black at the edges. Returns { rgba: Uint8ClampedArray, width, height, lights }:
 * lights are [lon, lat, size, group, brightness], weighted to the brightest ground.
 */
export async function nightView(getTile, bounds, { width: W = 3072, twinkles = 5000, onProgress } = {}) {
  const nw = toWorld(bounds.north, bounds.west), se = toWorld(bounds.south, bounds.east);
  const H = Math.round((W * (se.y - nw.y)) / (se.x - nw.x));
  const toPx = ([wx, wy]) => [((wx - nw.x) / (se.x - nw.x)) * W, ((wy - nw.y) / (se.y - nw.y)) * H];
  const mid = (bounds.north + bounds.south) / 2;
  const metresPerPx = metres({ lat: mid, lon: bounds.west }, { lat: mid, lon: bounds.east }) / W;

  const roads = new Float32Array(W * H);
  const builds = new Float32Array(W * H);
  const water = new Uint8Array(W * H);
  const candidates = [];
  const splat = (buf, x, y, v) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return;
    const i = y0 * W + x0;
    buf[i] += v * (1 - fx) * (1 - fy); buf[i + 1] += v * fx * (1 - fy);
    buf[i + W] += v * (1 - fx) * fy; buf[i + W + 1] += v * fx * fy;
  };
  const fill = (rings) => {
    let y0 = H, y1 = 0;
    for (const r of rings) for (const [, y] of r) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5, xs = [];
      for (const r of rings) for (let j = 0; j < r.length; j++) {
        const [ax, ay] = r[j], [bx, by] = r[(j + 1) % r.length];
        if ((ay <= cy) !== (by <= cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = a; x <= b; x++) water[y * W + x] = 1;
      }
    }
  };

  await eachTile(getTile, bounds, (vt, { toWorldXY, inTile }) => {
    const px = (layer) => (p) => toPx(toWorldXY(p, layer));
    const rl = vt.layers.transportation;
    for (let i = 0; rl && i < rl.length; i++) {
      const f = rl.feature(i);
      if (f.type !== 2) continue;
      const v = roadLight(f.properties), toP = px(rl);
      for (const line of f.loadGeometry()) {
        for (let j = 1; j < line.length; j++) {
          if (!inTile(line[j - 1], rl) && !inTile(line[j], rl)) continue;
          const [ax, ay] = toP(line[j - 1]), [bx, by] = toP(line[j]);
          const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len * 2));
          for (let s = 0; s < steps; s++) { const t = (s + 0.5) / steps; splat(roads, ax + (bx - ax) * t, ay + (by - ay) * t, v * 0.5); }
          const c = f.properties.class;
          if (Math.random() < len * (c === "motorway" || c === "trunk" ? 0.05 : c === "primary" || c === "secondary" ? 0.02 : 0.004)) {
            const t = Math.random();
            candidates.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, w: c === "motorway" ? 1.5 : 1 });
          }
        }
      }
    }
    const al = vt.layers.aeroway;
    for (let i = 0; al && i < al.length; i++) {
      const f = al.feature(i);
      if (f.type !== 2) continue;
      const toP = px(al);
      for (const line of f.loadGeometry()) for (let j = 1; j < line.length; j++) {
        const [ax, ay] = toP(line[j - 1]), [bx, by] = toP(line[j]);
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
        for (let s = 0; s < steps; s++) { const t = (s + 0.5) / steps; splat(roads, ax + (bx - ax) * t, ay + (by - ay) * t, 0.3); }
      }
    }
    const bl = vt.layers.building;
    for (let i = 0; bl && i < bl.length; i++) {
      const f = bl.feature(i);
      if (f.type !== 3) continue;
      const ring = f.loadGeometry()[0];
      if (!ring?.length || !inTile(ring[0], bl)) continue;
      const pts = ring.map(px(bl));
      let cx = 0, cy = 0, area = 0;
      for (let j = 0; j < pts.length; j++) {
        const [x1, y1] = pts[j], [x2, y2] = pts[(j + 1) % pts.length];
        area += x1 * y2 - x2 * y1; cx += x1; cy += y1;
      }
      cx /= pts.length; cy /= pts.length;
      const m2 = (Math.abs(area) / 2) * metresPerPx ** 2;
      splat(builds, cx, cy, Math.min(6, 0.04 + m2 / 4000));
      if (m2 > 1500 || Math.random() < 0.01) candidates.push({ x: cx, y: cy, w: m2 > 1500 ? 2 : 1 });
    }
    const wl = vt.layers.water;
    for (let i = 0; wl && i < wl.length; i++) {
      const f = wl.feature(i);
      if (f.type !== 3) continue;
      // Clamped to this tile, so the buffer beyond its edge is not filled twice.
      fill(f.loadGeometry().map((r) => r.map((p) => toPx(toWorldXY({ x: Math.max(0, Math.min(wl.extent, p.x)), y: Math.max(0, Math.min(wl.extent, p.y)) }, wl)))));
    }
  }, (f) => onProgress?.(f * 0.7));

  // Light: sharp road cores, their glow, a wide haze, and the buildings.
  const light = new Float32Array(W * H), haze = new Float32Array(W * H), out = new Float32Array(W * H), tmp = new Float32Array(W * H);
  const add = (src, k) => { for (let i = 0; i < light.length; i++) light[i] += src[i] * k; };
  for (const [src, r, k] of [[roads, 1, 0.7], [roads, 5, 0.45], [builds, 1, 0.5], [builds, 4, 0.35]]) {
    blur(src, out, tmp, W, H, r); add(out, k); await yieldToUi();
  }
  blur(roads, haze, tmp, W, H, 24); add(haze, 0.18);
  onProgress?.(0.85);
  await yieldToUi();

  const rgba = new Uint8ClampedArray(W * H * 4);
  const lum = out; // reuse
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y) / (W * 0.04);
      const fade = Math.min(1, edge) ** 1.5;
      let rgb;
      if (water[i]) {
        const lit = Math.min(1, haze[i] * 0.9);
        rgb = [5 + 10 * lit, 10 + 12 * lit, 22 + 18 * lit];
        lum[i] = 0;
      } else {
        // The running-sum blur can leave tiny negatives, which would power to NaN (white).
        const t = 1 - Math.exp(-((Math.max(0, light[i]) * 1.25) ** 1.35));
        lum[i] = t * fade;
        rgb = ramp(t);
      }
      const o = i * 4;
      rgba[o] = rgb[0] * fade; rgba[o + 1] = rgb[1] * fade; rgba[o + 2] = rgb[2] * fade; rgba[o + 3] = 255;
    }
  }

  // Twinkling lights: from road and building spots, weighted hard to the brightest ground.
  const inset = W * 0.05;
  const weighted = [];
  for (const c of candidates) {
    const i = Math.floor(c.y) * W + Math.floor(c.x);
    if (water[i] || Math.min(c.x, c.y, W - c.x, H - c.y) <= inset || !(lum[i] >= 0.2)) continue;
    weighted.push({ ...c, b: lum[i], key: Math.random() ** (1 / lum[i] ** 4) });
  }
  weighted.sort((p, q) => q.key - p.key);
  const lights = weighted.slice(0, twinkles).map((c) => {
    const { lat, lon } = fromWorld(nw.x + (c.x / W) * (se.x - nw.x), nw.y + (c.y / H) * (se.y - nw.y));
    return [+lon.toFixed(5), +lat.toFixed(5), c.w, Math.floor(Math.random() * NIGHT_GROUPS), +c.b.toFixed(2)];
  });
  onProgress?.(1);
  return { rgba, width: W, height: H, lights };
}
