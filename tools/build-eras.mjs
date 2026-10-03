// The 1980s era for every city but Boston (tools/build-boston-pack.mjs), into its city pack:
//   node tools/build-eras.mjs [city]
// - transit: today's lines (data/transit/<city>.json) cut to those that ran in 1986, as listed
//   in tools/eras/1980s.json; none at all where the city had no rail transit then.
// - towers: every building OpenStreetMap dates to 1987 or later (start_date) that is tall
//   (40 m, or 12 storeys, and up), from Overpass; the map hides any tall building at its spot.
//   Cached in .cache/towers-<city>.json (delete it to ask again).
// Era data already in the pack (New York's World Trade Center) is kept. Run after
// tools/build-new-york-pack.mjs and tools/build-landmarks.mjs.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { boxAround } from "../scripts/geo.mjs";
import { OVERPASS } from "../scripts/derive.mjs";

const root = new URL("../", import.meta.url);
const read = async (p, fallback) => JSON.parse(await readFile(new URL(p, root), "utf8").catch(() => JSON.stringify(fallback)));
const config = await read("tools/eras/1980s.json");
const cities = await read("data/cities/index.json");
const only = process.argv[2];
await mkdir(new URL(".cache/", root), { recursive: true });
const ENDPOINTS = [...OVERPASS, "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const LATER = "^(198[7-9]|199[0-9]|20[0-9][0-9])";

/** Today's network cut to the period's lines: track pieces any kept line runs on, recoloured to it. */
function periodTransit(today, keep) {
  const kept = new Set(keep);
  const byRef = new Map((today.lines ?? []).map((l) => [l.ref, l]));
  const features = [];
  for (const f of today.features ?? []) {
    const refs = String(f.properties.lines ?? f.properties.line ?? "").split(";").filter(Boolean);
    const running = refs.filter((r) => kept.has(r));
    if (!running.length) continue;
    const main = kept.has(f.properties.line) ? f.properties.line : running[0];
    const l = byRef.get(main);
    features.push({ ...f, properties: { ...f.properties, line: main, lines: [...new Set(running)].join(";"), ...(l ? { color: l.color, colorNight: l.colorNight } : {}) } });
  }
  const seen = new Set();
  const lines = (today.lines ?? []).filter((l) => kept.has(l.ref) && !seen.has(l.ref) && seen.add(l.ref));
  const stations = (today.stations ?? []).map((s) => ({ ...s, lines: (s.lines ?? []).filter((r) => kept.has(r)) })).filter((s) => s.lines.length);
  return { type: "FeatureCollection", features, lines, stations };
}

/**
 * Extensions built since the era, cut off a kept line at its old end:
 *   cuts: [{ lines: [refs], at: station name | [lat, lon], toward: station name | [lat, lon], radius? }]
 * Each line's track is a graph; every piece reachable from toward without passing within radius
 * metres (default 150) of at is the extension, and leaves that line (a piece no line still runs
 * on goes). Stations on it leave the line too. laterStations: names of stations opened since on
 * track that ran (infill), left off.
 */
function cutExtensions(transit, cuts = [], laterStations = []) {
  const stationAt = (spec) => {
    if (Array.isArray(spec)) return { lat: spec[0], lon: spec[1] };
    const s = transit.stations.find((x) => x.name === spec) ?? transitAll.stations.find((x) => x.name === spec);
    if (!s) throw new Error(`no station "${spec}"`);
    return s;
  };
  const dist = (a, b) => Math.hypot((a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111320);
  const key = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
  // Pieces as single lines, each with its own refs.
  let pieces = transit.features.flatMap((f) => (f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates])
    .map((coords) => ({ props: f.properties, coords, refs: new Set(String(f.properties.lines).split(";").filter(Boolean)) })));
  for (const cut of cuts) {
    const at = stationAt(cut.at), toward = stationAt(cut.toward), radius = cut.radius ?? 150;
    for (const line of cut.lines) {
      // Not closed rings (platform outlines): they join nothing.
      const mine = pieces.filter((p) => p.refs.has(line) && key(p.coords[0]) !== key(p.coords.at(-1)));
      if (!mine.length) continue;
      // Adjacency between vertices; vertices within radius of the old end are the wall.
      const adj = new Map(), pos = new Map();
      for (const p of mine) for (let i = 0; i + 1 < p.coords.length; i++) {
        const a = key(p.coords[i]), b = key(p.coords[i + 1]);
        pos.set(a, p.coords[i]); pos.set(b, p.coords[i + 1]);
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(b); adj.get(b).push(a);
      }
      // Pieces whose ends do not share a point with the track they join (a junction simplified
      // away): each end is joined to any track within 20 m.
      // Only like to like: a subway passing under a surface line is not a junction.
      const CELL = 0.0004, grid = new Map(), cellOf = ([x, y]) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
      const level = new Map();
      for (const p of mine) for (const c of p.coords) level.set(key(c), !!p.props.tunnel);
      for (const [k, p] of pos) { const c = cellOf(p); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(k); }
      for (const p of mine) for (const end of [p.coords[0], p.coords.at(-1)]) {
        const ek = key(end), [cx, cy] = cellOf(end).split(",").map(Number);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const k of grid.get(`${cx + i},${cy + j}`) ?? []) {
          const q = pos.get(k);
          if (k !== ek && level.get(k) === !!p.props.tunnel && dist({ lon: q[0], lat: q[1] }, { lon: end[0], lat: end[1] }) <= 20) { adj.get(ek).push(k); adj.get(k).push(ek); }
        }
      }
      // The old end, and any other place the extension meets track that ran (also).
      const walls = [at, ...(cut.also ?? []).map(stationAt)];
      const wall = new Set([...pos].filter(([, [x, y]]) => walls.some((w) => dist({ lon: x, lat: y }, w) <= radius)).map(([k]) => k));
      const nearest = (pt, skip = wall) => {
        let best = null, bd = Infinity;
        for (const [k, p] of pos) {
          if (skip.has(k)) continue;
          const d = dist({ lon: p[0], lat: p[1] }, pt);
          if (d < bd) { bd = d; best = k; }
        }
        return best && { key: best, d: bd };
      };
      // A line that does not run out there (the Newark Light Rail's other service) is left be.
      const first = nearest(toward);
      if (!first || first.d > 500) { console.log(`  ${line} does not run toward ${cut.toward}: left as it is`); continue; }
      const start = first.key;
      const reached = new Set(start ? [start] : []);
      for (const queue = [...reached]; queue.length;) for (const n of adj.get(queue.pop()) ?? []) if (!wall.has(n) && !reached.has(n)) { reached.add(n); queue.push(n); }
      // Split each piece of the line into runs on and off the extension.
      const next = [];
      let gone = 0;
      for (const p of pieces) {
        if (!p.refs.has(line)) { next.push(p); continue; }
        let run = [p.coords[0]], off = null;
        const flush = (isOff) => {
          if (run.length < 2) return;
          if (!isOff) next.push({ ...p, coords: run });
          else {
            const refs = new Set([...p.refs].filter((r) => r !== line));
            if (refs.size) next.push({ ...p, refs, coords: run });
          }
        };
        for (let i = 0; i + 1 < p.coords.length; i++) {
          const segOff = reached.has(key(p.coords[i])) || reached.has(key(p.coords[i + 1]));
          if (segOff) gone += dist({ lon: p.coords[i][0], lat: p.coords[i][1] }, { lon: p.coords[i + 1][0], lat: p.coords[i + 1][1] });
          if (off !== null && segOff !== off) { flush(off); run = [p.coords[i]]; }
          off = segOff;
          run.push(p.coords[i + 1]);
        }
        flush(off);
      }
      pieces = next;
      // Stations whose nearest track of the line is on the extension.
      for (const s of transit.stations) {
        if (!s.lines.includes(line)) continue;
        const n = nearest(s, new Set());
        if (n && reached.has(n.key) && n.d < 400) s.lines = s.lines.filter((l) => l !== line);
      }
      console.log(`  cut ${line} beyond ${cut.at} toward ${cut.toward}: ${(gone / 1000).toFixed(1)} km of track`);
    }
  }
  const later = new Set(laterStations);
  transit.stations = transit.stations.filter((s) => s.lines.length && !later.has(s.name));
  transit.features = pieces.map(({ props, coords, refs }) => {
    const lines = [...refs];
    const main = refs.has(props.line) ? props.line : lines[0];
    const l = transit.lines.find((x) => x.ref === main);
    return { type: "Feature", properties: { ...props, line: main, lines: lines.join(";"), ...(l ? { color: l.color, colorNight: l.colorNight } : {}) }, geometry: { type: "LineString", coordinates: coords } };
  });
  return transit;
}
let transitAll = { stations: [] };

const metres = (h) => { const n = parseFloat(String(h ?? "").replace(",", ".")); return Number.isFinite(n) ? (/ft|'/.test(String(h)) ? n * 0.3048 : n) : null; };

async function laterTowers(city) {
  const cacheUrl = new URL(`.cache/towers-${city.id}.json`, root);
  const cached = await readFile(cacheUrl, "utf8").catch(() => null);
  if (cached) return JSON.parse(cached);
  const b = boxAround(city.metro.center, city.metro.miles);
  // A whole metro in one query times out (Overpass then answers 200 with a remark and nothing
  // else): ask in a 5 by 5 grid of cells.
  const elements = [];
  const N = 5, dLat = (b.north - b.south) / N, dLon = (b.east - b.west) / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const s = b.south + i * dLat, w = b.west + j * dLon, cell = `${s},${w},${s + dLat},${w + dLon}`;
    const query = `[out:json][timeout:180];(way["building"]["start_date"~"${LATER}"](${cell});relation["building"]["start_date"~"${LATER}"](${cell});way["building:part"]["start_date"~"${LATER}"](${cell}););out tags center bb;`;
    elements.push(...await overpass(query));
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  const towers = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const h = metres(t.height) ?? (Number(t["building:levels"]) ? Number(t["building:levels"]) * 3.5 : null);
    // Tall, or named with no height recorded (4 Times Square): the map only ever hides tall
    // buildings at the spot, so a low one named here costs nothing.
    // "out bb" answers the bounds only (no center even when asked): the centre is the box's.
    const bb = e.bounds;
    const c = e.center ?? (bb && { lat: (bb.minlat + bb.maxlat) / 2, lon: (bb.minlon + bb.maxlon) / 2 });
    if (!(h >= 40 || (h === null && t.name)) || !c) continue;
    const k = Math.cos((c.lat * Math.PI) / 180) * 111320;
    const radius = bb ? Math.min(120, Math.max(15, Math.hypot((bb.maxlon - bb.minlon) * k, (bb.maxlat - bb.minlat) * 111320) / 2)) : 30;
    towers.push({ name: t.name ?? t["addr:street"] ?? `building ${e.id}`, built: parseInt(t.start_date, 10), lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6), radius: Math.round(radius), minHeight: 25, source: "osm start_date" });
  }
  await writeFile(cacheUrl, JSON.stringify(towers));
  return towers;
}

/** Ask Overpass, trying each server in turn (and again after a pause). */
async function overpass(query) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, { method: "POST", body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(200000),
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "kg-cities Foundry VTT module (era build)" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        // A query that ran out of time or memory still answers 200, with a remark.
        if (body.remark && /error|timed out|out of memory/i.test(body.remark)) throw new Error(body.remark);
        return body.elements;
      } catch (err) { lastErr = err; }
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error(`Overpass: ${lastErr?.message}`);
}

/** Convex hull of [x, y] points, closed. */
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out;
  };
  const lower = half(p), upper = half(p.reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1), lower[0]];
}

const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2); };

/**
 * Sites rebuilt since the era (a Las Vegas resort on the ground of an older casino): each
 * property's outline found in OpenStreetMap by name, cleared of every building in the era.
 * Cached in .cache/sites-<city>.json.
 */
async function laterSites(city, sites) {
  if (!sites?.length) return [];
  const cacheUrl = new URL(`.cache/sites-${city.id}.json`, root);
  const cache = JSON.parse(await readFile(cacheUrl, "utf8").catch(() => "{}"));
  // The sites' own search box when the era gives one (the Las Vegas Strip), else the metro.
  const box = arguments[2];
  const b = box ? { south: box[0], west: box[1], north: box[2], east: box[3] } : boxAround(city.metro.center, city.metro.miles);
  const out = [];
  for (const site of sites) {
    // Traced by hand (tools/era-preview.html) where OpenStreetMap's outline misses the property.
    if (site.ring) {
      out.push({ name: site.name, until: site.built, ring: site.ring, source: "osm site" });
      continue;
    }
    if (!(site.name in cache)) {
      // A name pattern (case-insensitive regular expression), e.g. "^Bellagio".
      const name = site.osm ?? `^${site.name}`;
      const els = await overpass(`[out:json][timeout:120];(way["name"~"${name}",i](${b.south},${b.west},${b.north},${b.east});relation["name"~"${name}",i](${b.south},${b.west},${b.north},${b.east}););out geom;`);
      // The largest closed outline among the matches: the property, not one of its buildings.
      const rings = [];
      for (const e of els) {
        if (e.type === "way" && e.geometry?.length > 3) rings.push(e.geometry.map((p) => [p.lon, p.lat]));
        for (const m of e.members ?? []) if (m.role === "outer" && m.geometry?.length > 3) rings.push(m.geometry.map((p) => [p.lon, p.lat]));
      }
      const closed = rings.filter((r) => Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < 1e-6);
      cache[site.name] = closed.sort((p, q) => ringArea(q) - ringArea(p))[0] ?? null;
      await writeFile(cacheUrl, JSON.stringify(cache));
      await new Promise((r) => setTimeout(r, 1500));
    }
    // Cleared in the years before it was built; hull: the outline's convex hull, for a property
    // whose outline leaves out parts of it (the Bellagio's lake and its notches).
    const ring = cache[site.name] && (site.hull ? hull(cache[site.name]) : cache[site.name]);
    if (ring) out.push({ name: site.name, until: site.built, ring: ring.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]), source: "osm site" });
    else console.log(`  site not found: ${site.name} (${site.osm ?? site.name})`);
  }
  return out;
}

for (const [id, conf] of Object.entries(config.cities)) {
  if (only && id !== only) continue;
  const city = cities.find((c) => c.id === id);
  const packUrl = new URL(`data/cities/${id}.json`, root);
  const pack = await read(`data/cities/${id}.json`, { id, landmarks: [], eras: {} });
  const today = await read(`data/transit/${id}.json`, { features: [], lines: [], stations: [] });
  transitAll = today;
  const transit = cutExtensions(periodTransit(today, conf.transit), conf.cuts, conf.laterStations);
  let towers = [];
  try {
    towers = await laterTowers(city);
  } catch (err) {
    console.log(`${city.name}: towers skipped (${err.message}); run again later`);
  }
  let sites = [];
  try {
    sites = await laterSites(city, conf.sites, conf.sitesBox);
  } catch (err) {
    console.log(`${city.name}: sites skipped (${err.message}); run again later`);
  }
  const era = pack.eras?.["1980s"] ?? {};
  pack.eras = {
    ...(pack.eras ?? {}),
    "1980s": {
      ...era,
      year: era.year ?? config.year,
      transitNote: conf.note,
      map: {
        ...(era.map ?? {}), transit,
        towers: [...(era.map?.towers ?? []).filter((t) => t.source !== "osm start_date"), ...towers],
        hiddenAreas: [...(era.map?.hiddenAreas ?? []).filter((a) => a.source !== "osm site"), ...sites]
      }
    }
  };
  await writeFile(packUrl, JSON.stringify(pack, null, 1) + "\n");
  console.log(`${city.name}: ${transit.lines.length} lines (${transit.features.length} track pieces, ${transit.stations.length} stations) of ${today.lines?.length ?? 0} today; ${towers.length} towers built since 1986 hidden, ${sites.length} sites cleared.`);
}
