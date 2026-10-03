// Leaning buildings: a top-down map where every building's roof is lifted straight north by
// its height times the lean, joined to its footprint by walls. Footprints stay exactly where
// they are, so tokens and notes stay on their streets. Pure: no Foundry.
//
// Tall buildings (style.mjs TALL and up, collected when the city is generated) get real wall
// shapes here, so their edges are smooth at any zoom. Lower ones lean in the map style, in
// stacked slices by their height.

import { metres } from "./geo.mjs";
import { DEFAULT_LEAN } from "./style.mjs";

const M_PER_DEG_LAT = 111320;

function centre(b) {
  let lon = 0, lat = 0, n = 0;
  for (const ring of b.rings) for (const [x, y] of ring) { lon += x; lat += y; n++; }
  return { lon: lon / n, lat: lat / n };
}

/** Ids of the buildings an era hides (towers built later): rules { towers: [{ lat, lon, radius, minHeight }], zones: [{ box, minHeight }] }. */
export function hiddenBuildingIds(buildings, rules) {
  const hidden = new Set();
  const towers = rules.towers ?? [];
  const zones = rules.zones ?? [];
  // Towers bucketed in cells of about 1 km, so a city with thousands of later towers (New York)
  // checks each building only against the towers near it. Radii are at most 120 m.
  const CELL = 0.01;
  const buckets = new Map();
  for (const t of towers) {
    const key = `${Math.floor(t.lat / CELL)},${Math.floor(t.lon / CELL)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const near = (c) => {
    const i = Math.floor(c.lat / CELL), j = Math.floor(c.lon / CELL), out = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) out.push(...(buckets.get(`${i + di},${j + dj}`) ?? []));
    return out;
  };
  for (const b of buildings) {
    const c = centre(b);
    const tower = near(c).some((t) => b.h >= (t.minHeight ?? 60) && metres(c, t) <= (t.radius ?? 50));
    const zone = !tower && zones.some((z) => b.h >= (z.minHeight ?? 20)
      && c.lat <= z.box.north && c.lat >= z.box.south && c.lon >= z.box.west && c.lon <= z.box.east);
    if (tower || zone) hidden.add(b.id);
  }
  return hidden;
}

function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const signedArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
};

/** Rings into polygons: each ring with the first ring's winding starts a polygon, the rest are its holes. */
function polygons(rings) {
  const sign = Math.sign(signedArea(rings[0])) || 1;
  const out = [];
  for (const ring of rings) {
    if (ring.length < 4) continue;
    if (Math.sign(signedArea(ring)) === sign || !out.length) out.push([ring]);
    else out[out.length - 1].push(ring);
  }
  return { out, sign };
}

/**
 * Drawing depth of a footprint: its centre's latitude, less a little for height (0.02 m per
 * metre), so the painter's order puts the nearer (more southern) building in front.
 */
export function depthOf(rings, h = 0) {
  const outer = rings[0];
  const lat = outer.reduce((s, p) => s + p[1], 0) / outer.length;
  return lat - ((h ?? 0) * 0.02) / M_PER_DEG_LAT;
}

/** Convex hull of [x, y] points (monotone chain), counter-clockwise, closed. */
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
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  ring.push(ring[0]);
  return ring;
}

/**
 * Ground shadows of the leaning buildings: each footprint swept toward the east-north-east by
 * its height (light from the south-west, as the walls are shaded), so a tower stands apart from
 * what is behind it. One convex shape per building, drawn under every building.
 */
export function shadowFeatures(buildings, { length = 0.42, hidden = new Set(), cleared = [] } = {}) {
  const features = [];
  for (const b of buildings) {
    if (hidden.has(b.id) || !b.rings?.length || !(b.h > 0)) continue;
    const outer = b.rings[0];
    // Standing on a cleared site (the World Trade Center): its shadow is drawn over the site's
    // bare ground, not under it.
    const c = centre(b);
    const over = cleared.some((r) => insideRing([c.lon, c.lat], r));
    const lat = outer[0][1];
    const k = Math.cos((lat * Math.PI) / 180);
    const reach = b.h * length;
    const dx = (reach * 0.92) / (M_PER_DEG_LAT * k), dy = (reach * 0.38) / M_PER_DEG_LAT;
    // Hull in a locally square frame (longitude scaled), then back.
    const pts = outer.flatMap(([x, y]) => [[x * k, y], [(x + dx) * k, y + dy]]);
    features.push({ type: "Feature", properties: { h: b.h, over }, geometry: { type: "Polygon", coordinates: [hull(pts).map(([x, y]) => [x / k, y])] } });
  }
  return { type: "FeatureCollection", features };
}

/**
 * GeoJSON for the leaning buildings: per building its visible walls (shade 0..1 by the way
 * they face) then its roof, ordered back (north) to front (south) for the painter's algorithm.
 */
/**
 * extra: shapes drawn in the same back-to-front order, e.g. landmarks: [{ south, features }],
 * features already ordered among themselves. A building with near: true (beside a landmark) is
 * marked so the style can draw it see-through over the landmark.
 */
export function leanFeatures(buildings, { lean = DEFAULT_LEAN, hidden = new Set(), extra = [] } = {}) {
  const features = [];
  if (lean <= 0 && !extra.length) return { type: "FeatureCollection", features };
  // Back to front by the footprint's centre, not its southernmost corner: on a tilted street grid
  // (Manhattan's is 29 degrees off) a long building across the street reaches further south at
  // one end than a tower in front of it, and was drawn over the tower. Of two footprints sharing
  // a centre (a tower on its podium), the taller is drawn later.
  const order = buildings
    .filter((b) => !hidden.has(b.id) && b.rings.length)
    .map((b) => ({ b, south: depthOf(b.rings, b.h) }))
    .concat(extra)
    .sort((p, q) => q.south - p.south);

  let key = 0;
  for (const { b, features: shapes } of order) {
    if (shapes) {
      for (const f of shapes) features.push({ ...f, properties: { ...f.properties, key: key++ } });
      continue;
    }
    const near = !!b.near;
    const top = (b.h * lean) / M_PER_DEG_LAT;
    const bottom = ((b.base ?? 0) * lean) / M_PER_DEG_LAT;
    const { out, sign } = polygons(b.rings);
    for (const poly of out) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
          const dx = x1 - x0, dy = y1 - y0;
          // Outward normal: left of the edge for rings wound like a clockwise outer ring.
          const nx = sign < 0 ? -dy : dy, ny = sign < 0 ? dx : -dx;
          if (ny >= 0) continue; // faces north: hidden behind the roof
          const len = Math.hypot(nx, ny) || 1;
          // Light from the south-west: south-west walls brightest, east-facing darkest.
          const shade = Math.max(0, Math.min(1, 0.5 - (0.6 * ny + 0.4 * nx) / len / 2));
          features.push({
            type: "Feature",
            properties: { part: "wall", shade: Math.round(shade * 100) / 100, h: b.h, near, key, bid: b.id },
            geometry: { type: "Polygon", coordinates: [[[x0, y0 + bottom], [x1, y1 + bottom], [x1, y1 + top], [x0, y0 + top], [x0, y0 + bottom]]] }
          });
        }
      }
    }
    key++;
    for (const poly of out) {
      features.push({
        type: "Feature",
        properties: { part: "roof", h: b.h, near, key, bid: b.id },
        geometry: { type: "Polygon", coordinates: poly.map((ring) => ring.map(([x, y]) => [x, y + top])) }
      });
    }
    key++;
  }
  return { type: "FeatureCollection", features };
}
