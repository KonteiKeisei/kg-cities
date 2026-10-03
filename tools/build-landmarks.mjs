// A city's preconfigured landmarks, from a source list (tools/landmarks/<city>.json) into its
// city pack (data/cities/<city>.json). Each entry is placed on the map and given its building:
//   { id?, name, text, at?: [lat, lon] | find?: "search words", pin?: true,
//     area?: [[lat, lon], ...], from?, until?, model?, angle?, tone? }
// - at: the spot; else find: looked up with OpenStreetMap's Nominatim inside the city's metro
//   area (cached in .cache/geocode.json; one request a second, as its usage policy asks).
// - The building at the spot (all its mapped parts, so a tower keeps its setbacks), from the
//   same OpenFreeMap tiles the module uses; area: every building inside it (a complex such as
//   Rockefeller Center); pin: true, or no building there (a park, a bridge): a gold pin.
// Landmarks already in the pack with a model (the World Trade Center, the Empire State
// Building) are kept as they are; the rest are replaced by this list.
//   node tools/build-landmarks.mjs boston

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { VectorTile } from "../lib/mvt/vector-tile.js";
import { PbfReader } from "../lib/mvt/pbf.js";
import { boxAround } from "../scripts/geo.mjs";

const root = new URL("../", import.meta.url);
const cityId = process.argv[2];
const cities = JSON.parse(await readFile(new URL("data/cities/index.json", root), "utf8"));
const city = cities.find((c) => c.id === cityId);
if (!city) throw new Error(`no city "${cityId}"`);
const source = JSON.parse(await readFile(new URL(`tools/landmarks/${cityId}.json`, root), "utf8"));
const metro = boxAround(city.metro.center, city.metro.miles);

/* Geocoding, cached */
await mkdir(new URL(".cache/", root), { recursive: true });
const cacheUrl = new URL(".cache/geocode.json", root);
const cache = JSON.parse(await readFile(cacheUrl, "utf8").catch(() => "{}"));
let lastAsk = 0;
/** { at: [lat, lon], outline: [[lon, lat], ...] or null (the found place's own shape) } or null. */
async function geocode(query) {
  const key = `v2|${cityId}|${query}`;
  if (key in cache) return cache[key];
  await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - lastAsk))));
  lastAsk = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&bounded=1&polygon_geojson=1&polygon_threshold=0.00002&viewbox=${metro.west},${metro.north},${metro.east},${metro.south}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "kg-cities Foundry VTT module (landmark list build)" } });
  const hit = res.ok ? (await res.json())[0] : null;
  let outline = null;
  const g = hit?.geojson;
  if (g?.type === "Polygon") outline = g.coordinates[0];
  else if (g?.type === "MultiPolygon") outline = g.coordinates.map((p) => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  cache[key] = hit ? { at: [+(+hit.lat).toFixed(6), +(+hit.lon).toFixed(6)], outline: outline?.map(([x, y]) => [+x.toFixed(7), +y.toFixed(7)]) ?? null } : null;
  await writeFile(cacheUrl, JSON.stringify(cache, null, 1));
  return cache[key];
}
/** Square metres of a [lon, lat] ring. */
const ringMetres = (r) => Math.abs(ringArea(r)) * 111320 * 111320 * Math.cos((r[0][1] * Math.PI) / 180);
/** Metres from a point to a ring's nearest edge (0 inside). */
function distanceToRing(p, ring) {
  if (inside(p, ring)) return 0;
  const k = Math.cos((p[1] * Math.PI) / 180) * 111320;
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const ax = (ring[i][0] - p[0]) * k, ay = (ring[i][1] - p[1]) * 111320, bx = (ring[i + 1][0] - p[0]) * k, by = (ring[i + 1][1] - p[1]) * 111320;
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/* Buildings from the tiles */
const Z = 14, N = 2 ** Z;
const template = (await (await fetch("https://tiles.openfreemap.org/planet")).json()).tiles[0];
const tileCache = new Map();
const tileXY = (lat, lon) => { const r = (lat * Math.PI) / 180; return [Math.floor(((lon + 180) / 360) * N), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N)]; };
const toLL = (x, y, p, ext) => { const wx = (x + p.x / ext) / N, wy = (y + p.y / ext) / N; return [+(wx * 360 - 180).toFixed(7), +((Math.atan(Math.sinh(Math.PI * (1 - 2 * wy))) * 180) / Math.PI).toFixed(7)]; };
async function buildingsAround(lat, lon) {
  const [cx, cy] = tileXY(lat, lon);
  const byId = new Map();
  for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
    const key = `${x},${y}`;
    if (!tileCache.has(key)) {
      const res = await fetch(template.replace("{z}", Z).replace("{x}", x).replace("{y}", y));
      tileCache.set(key, res.ok ? new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer()))) : null);
    }
    const L = tileCache.get(key)?.layers.building;
    for (let i = 0; L && i < L.length; i++) {
      const f = L.feature(i);
      if (f.type !== 3 || f.id === undefined) continue;
      const rings = f.loadGeometry().map((r) => r.map((p) => toLL(x, y, p, L.extent)));
      const area = Math.abs(ringArea(rings[0]));
      const prev = byId.get(f.id);
      // A building cut by tile edges: keep its largest piece.
      if (!prev || prev.area < area) byId.set(f.id, { id: f.id, h: f.properties.render_height || 9, base: f.properties.render_min_height ?? 0, outline: !!f.properties.hide_3d, rings: [rings[0]], area });
    }
  }
  return [...byId.values()];
}
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
const inside = ([x, y], ring) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit; } return hit; };
const centre = (ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
const metresBetween = ([lon1, lat1], [lon2, lat2]) => Math.hypot((lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180), (lat2 - lat1) * 111320);
const clean = ({ id, h, base, rings }) => ({ id, h, base, rings });

/** The building at a spot: its parts when it is mapped in parts, else the one footprint. */
function buildingAt(all, lat, lon) {
  const p = [lon, lat];
  const containing = all.filter((b) => inside(p, b.rings[0])).sort((a, b) => Math.abs(ringArea(a.rings[0])) - Math.abs(ringArea(b.rings[0])));
  let hit = containing.find((b) => b.outline) ?? containing.at(-1);
  if (!hit) {
    // Geocoders often give the street door: the building whose edge is nearest, within 25 m.
    const near = all.filter((b) => !b.outline).map((b) => ({ b, d: distanceToRing(p, b.rings[0]) })).sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > 25) return null;
    hit = near.b;
  }
  // The outline of a building mapped in parts covers them all: take the parts (its real shape).
  const outline = hit.outline ? hit : containing.find((b) => b.outline);
  if (outline) {
    const parts = all.filter((b) => !b.outline && inside(centre(b.rings[0]), outline.rings[0]));
    if (parts.length) return parts.map(clean);
  }
  // Parts mapped inside a podium's footprint without an outline (a tower on its base).
  const stacked = all.filter((b) => !b.outline && b !== hit && inside(centre(b.rings[0]), hit.rings[0]));
  return [hit, ...stacked].map(clean);
}

/** Every building inside a place's own outline (a campus, or one building mapped as a site). */
function buildingsIn(all, ring) {
  return all.filter((b) => !b.outline && inside(centre(b.rings[0]), ring)).map(clean);
}

/**
 * A building that is gone (the Sands, the Landmark), from simple masses around its spot:
 *   shape: [{ rect: [w, d] | circle: r | y: [arm, width], h, base?, at?: [east, north], angle? }]
 * in metres; angle turns the mass clockwise, in degrees.
 */
function shapeBuildings(e, lat, lon) {
  const k = Math.cos((lat * Math.PI) / 180) * 111320;
  return e.shape.map((s, i) => {
    const [ox, oy] = s.at ?? [0, 0];
    const a = ((s.angle ?? 0) * Math.PI) / 180;
    let pts;
    if (s.circle) pts = Array.from({ length: 24 }, (_, j) => [Math.cos((j * Math.PI) / 12) * s.circle, Math.sin((j * Math.PI) / 12) * s.circle]);
    else if (s.rect) { const [w, d] = s.rect.map((v) => v / 2); pts = [[-w, -d], [w, -d], [w, d], [-w, d]]; }
    else {
      // Three arms 120 degrees apart, joined at the middle (the Sands' and casino towers' Y).
      // Counter-clockwise: each arm's two tip corners, then the inner corner on the bisector
      // to the next arm. The first arm points north.
      const [arm, width] = s.y, hw = width / 2, inner = hw / Math.sin(Math.PI / 3);
      pts = [];
      for (let j = 0; j < 3; j++) {
        const t = Math.PI / 2 + (j * 2 * Math.PI) / 3;
        const u = [Math.cos(t), Math.sin(t)], p = [-Math.sin(t), Math.cos(t)];
        pts.push([arm * u[0] - hw * p[0], arm * u[1] - hw * p[1]], [arm * u[0] + hw * p[0], arm * u[1] + hw * p[1]],
          [inner * Math.cos(t + Math.PI / 3), inner * Math.sin(t + Math.PI / 3)]);
      }
    }
    const ring = pts.map(([x, y]) => {
      const rx = x * Math.cos(a) + y * Math.sin(a) + ox, ry = -x * Math.sin(a) + y * Math.cos(a) + oy;
      return [+(lon + rx / k).toFixed(7), +(lat + ry / 111320).toFixed(7)];
    });
    ring.push(ring[0]);
    return { id: `${slug(e.name)}-shape-${i}`, h: s.h, base: s.base ?? 0, rings: [ring] };
  });
}

/* The list */
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
const out = [];
const report = [];
for (const e of source.landmarks) {
  // find is still looked up when at is given: its outline is the building's true shape.
  const found = e.area || (e.at && !e.find) ? null : await geocode(e.find ?? `${e.name}, ${city.name}`);
  let at = e.at ?? found?.at;
  if (e.area) at = (() => { const c = centre(e.area.map(([la, lo]) => [lo, la])); return [c[1], c[0]]; })();
  if (!at) { report.push(`NOT FOUND  ${e.name} (${e.find ?? e.name})`); continue; }
  const [lat, lon] = at;
  let buildings = null;
  if (e.shape) {
    buildings = shapeBuildings(e, lat, lon);
  } else if (e.area) {
    buildings = buildingsIn(await buildingsAround(lat, lon), e.area.map(([la, lo]) => [lo, la]));
  } else if (!e.pin) {
    const all = await buildingsAround(lat, lon);
    // The place's own outline when it is a building or a compact site; a park is too big.
    const compact = found?.outline && ringMetres(found.outline) < 120000;
    if (compact) buildings = buildingsIn(all, found.outline);
    // Only a kiosk or a wing of it is in the tiles (the main building is missing): the outline.
    if (buildings?.length && e.height && (buildings.reduce((s, b) => s + ringMetres(b.rings[0]), 0) < ringMetres(found.outline) * 0.33
      || Math.max(...buildings.map((b) => b.h)) < e.height * 0.6)) buildings = null;
    // Some landmarks are missing from the tiles' buildings altogether (Grand Central, the
    // Guggenheim): the place's own outline, at the height given (metres) or a plain 25.
    if (!buildings?.length && compact && e.height) buildings = [{ id: `${slug(e.name)}-outline`, h: e.height, base: 0, rings: [found.outline] }];
    if (!buildings?.length) buildings = buildingAt(all, lat, lon);
    if (!buildings?.length && compact) buildings = [{ id: `${slug(e.name)}-outline`, h: e.height ?? 25, base: 0, rings: [found.outline] }];
  }
  // A model fitted to a footprint the new map data lacks (a ship at its pier): KG Boston Map's.
  if (!buildings?.length && e.seedShape) {
    const seed = JSON.parse(await readFile(new URL("../kg-bostonmap/data/landmarks/seed.json", root), "utf8"));
    buildings = seed.find((s) => s.id === e.id)?.buildings ?? null;
  }
  const lm = {
    id: e.id ?? `pack:${slug(e.name)}`, name: e.name, lat: +lat.toFixed(6), lon: +lon.toFixed(6), glow: true,
    summary: e.text,
    ...(e.tone ? { tone: e.tone } : {}), ...(e.from ? { from: e.from } : {}), ...(e.until ? { until: e.until } : {}),
    ...(e.model ? { model: e.model, ...(e.angle != null ? { angle: e.angle } : {}) } : {}),
    ...(buildings?.length ? { buildings } : {})
  };
  out.push(lm);
  report.push(`${buildings?.length ? `${String(buildings.length).padStart(3)} parts` : "    pin"}  ${e.name}${buildings?.length ? `  (${Math.round(Math.max(...buildings.map((b) => b.h)) * 3.28084)} ft)` : ""}`);
}

const packUrl = new URL(`data/cities/${cityId}.json`, root);
const pack = JSON.parse(await readFile(packUrl, "utf8").catch(() => JSON.stringify({ id: cityId, landmarks: [], eras: {} })));
// Hand-built ones (with a model and no source entry) stay; the list replaces the rest.
const listed = new Set(out.map((l) => l.id));
pack.landmarks = [...(pack.landmarks ?? []).filter((l) => l.model && !l.id.startsWith("pack:") && !listed.has(l.id)), ...out];
await writeFile(packUrl, JSON.stringify(pack, null, 1) + "\n");
console.log(report.join("\n"));
console.log(`${city.name}: ${out.length} landmarks written to data/cities/${cityId}.json (${(JSON.stringify(pack).length / 1024).toFixed(0)} KB)`);
