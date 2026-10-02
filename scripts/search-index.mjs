// The search index made from a city's tiles when it is generated (scripts/search.mjs reads it).
// Pure: browser or Node.

import { eachTile } from "./derive.mjs";

const SEARCH_ROADS = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]);
/** Same-named street pieces closer than this (metres) are one street. */
const CLUSTER_GAP = 300;
/** A house number goes to the nearest named street within this many metres. */
const ADDRESS_REACH = 45;
const M = 111320;

/** Douglas-Peucker in metres (K: metres per degree of longitude here). */
function simplify(pts, K, tol = 3) {
  if (pts.length < 3) return pts;
  const P = pts.map(([lon, lat]) => [lon * K, lat * M]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = 0;
    const [ax, ay] = P[a], [bx, by] = P[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / len;
      if (d > bd) { bd = d; best = i; }
    }
    if (bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Every named street, grouped by name and then by nearness (two same-named streets far apart are
 * separate results), each labelled with the neighbourhoods it passes or its town; and every
 * house number, put on the nearest named street (the map data gives numbers no street).
 * Packed: { streets: [{ n, k, a, t, b, l }], addresses: { streetIndex: "num:x:y|..." } }.
 */
export async function searchIndex(getTile, bounds, onProgress) {
  const K = Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180) * M;
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const xy = ([lon, lat]) => [lon * K, lat * M];
  const segmentsByName = new Map();
  const addresses = [], hoods = [], towns = [];
  const nameOf = (p) => p["name:en"] ?? p.name_en ?? p.name;

  await eachTile(getTile, bounds, (vt, { toLonLat, inTile }) => {
    const ll = (p, layer) => toLonLat(p, layer).map(r5);
    const names = vt.layers.transportation_name;
    for (let i = 0; names && i < names.length; i++) {
      const f = names.feature(i);
      const name = nameOf(f.properties);
      if (!name || !SEARCH_ROADS.has(f.properties.class) || f.type !== 2) continue;
      for (const part of f.loadGeometry()) {
        const line = simplify(part.map((pt) => ll(pt, names)), K);
        if (line.length < 2) continue;
        if (!segmentsByName.has(name)) segmentsByName.set(name, []);
        segmentsByName.get(name).push({ line, kind: f.properties.class });
      }
    }
    const hn = vt.layers.housenumber;
    for (let i = 0; hn && i < hn.length; i++) {
      const f = hn.feature(i);
      const pt = f.loadGeometry()[0]?.[0];
      if (f.properties.housenumber && pt && inTile(pt, hn)) addresses.push({ num: String(f.properties.housenumber), at: ll(pt, hn) });
    }
    const pl = vt.layers.place;
    for (let i = 0; pl && i < pl.length; i++) {
      const f = pl.feature(i);
      const name = nameOf(f.properties);
      const pt = f.loadGeometry()[0]?.[0];
      if (!name || !pt || !inTile(pt, pl)) continue;
      if (["suburb", "quarter", "neighbourhood"].includes(f.properties.class)) hoods.push({ name, at: ll(pt, pl) });
      else if (["city", "town", "village"].includes(f.properties.class)) towns.push({ name, at: ll(pt, pl) });
    }
  }, (f) => onProgress?.(f * 0.7));

  const dist = (p, q) => Math.hypot((p[0] - q[0]) * K, (p[1] - q[1]) * M);
  const nearest = (list, at, max = Infinity) => {
    let best = null, bd = max;
    for (const it of list) { const d = dist(it.at, at); if (d < bd) { bd = d; best = it; } }
    return best;
  };

  const streets = [];
  for (const [name, segs] of segmentsByName) {
    const boxes = segs.map((s) => {
      const xs = s.line.map((p) => p[0]), ys = s.line.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    });
    const parent = segs.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const gapX = CLUSTER_GAP / K, gapY = CLUSTER_GAP / M;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const p = boxes[i], q = boxes[j];
        if (p[0] - gapX <= q[2] && q[0] - gapX <= p[2] && p[1] - gapY <= q[3] && q[1] - gapY <= p[3]) parent[find(i)] = find(j);
      }
    }
    const groups = new Map();
    segs.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
    for (const idx of groups.values()) {
      const lines = idx.map((i) => segs[i].line);
      const box = idx.reduce((acc, i) => [Math.min(acc[0], boxes[i][0]), Math.min(acc[1], boxes[i][1]), Math.max(acc[2], boxes[i][2]), Math.max(acc[3], boxes[i][3])], [180, 90, -180, -90]);
      const count = new Map();
      for (const line of lines) {
        const hood = nearest(hoods, line[Math.floor(line.length / 2)], 1200)?.name;
        if (hood) count.set(hood, (count.get(hood) ?? 0) + 1);
      }
      const areas = [...count].sort((p, q) => q[1] - p[1]).map(([h]) => h).slice(0, 3);
      const mid = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
      streets.push({ name, kind: segs[idx[0]].kind, area: areas.join(", ") || null, town: areas.length ? null : nearest(towns, mid)?.name ?? null, box: box.map(r5), lines });
    }
  }
  onProgress?.(0.85);

  // House numbers to the nearest named street, through a 100 m grid of street segments.
  const CELL = 100;
  const grid = new Map();
  streets.forEach((s, si) => {
    for (const line of s.lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [x0, y0] = xy(line[i]), [x1, y1] = xy(line[i + 1]);
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL / 2)));
        const seen = new Set();
        for (let k = 0; k <= steps; k++) {
          const c = `${Math.floor((x0 + ((x1 - x0) * k) / steps) / CELL)},${Math.floor((y0 + ((y1 - y0) * k) / steps) / CELL)}`;
          if (seen.has(c)) continue;
          seen.add(c);
          if (!grid.has(c)) grid.set(c, []);
          grid.get(c).push([si, line[i], line[i + 1]]);
        }
      }
    }
  });
  const segDist = (p, a, b) => {
    const [px, py] = xy(p), [ax, ay] = xy(a), [bx, by] = xy(b);
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const byStreet = new Map();
  for (const ad of addresses) {
    const [px, py] = xy(ad.at);
    const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
    let best = null, bd = ADDRESS_REACH;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [si, p, q] of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = segDist(ad.at, p, q);
        if (d < bd) { bd = d; best = si; }
      }
    }
    if (best === null) continue;
    if (!byStreet.has(best)) byStreet.set(best, []);
    byStreet.get(best).push([ad.num, ad.at[0], ad.at[1]]);
  }
  onProgress?.(1);

  // Coordinates as whole 1e-5 degree steps from the street's south-west corner.
  const q = (v) => Math.round(v * 1e5);
  const packed = streets.map((s) => {
    const [x0, y0] = [q(s.box[0]), q(s.box[1])];
    return {
      n: s.name, k: s.kind, a: s.area, t: s.town, b: s.box,
      l: s.lines.map((line) => {
        let px = x0, py = y0;
        return line.map(([lon, lat]) => { const x = q(lon), y = q(lat); const out = `${x - px},${y - py}`; px = x; py = y; return out; }).join(",");
      })
    };
  });
  const packedAddresses = Object.fromEntries([...byStreet].map(([si, list]) => {
    const [x0, y0] = [q(streets[si].box[0]), q(streets[si].box[1])];
    return [si, list.map(([num, lon, lat]) => `${num.replace(/[|:]/g, " ")}:${q(lon) - x0}:${q(lat) - y0}`).join("|")];
  }));
  return { streets: packed, addresses: packedAddresses };
}
