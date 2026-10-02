// Leaning buildings: a top-down map where every building's roof is lifted straight north by
// its height times the lean, joined to its footprint by walls. Footprints stay exactly where
// they are, so tokens and notes stay on their streets. Pure: no Foundry.
//
// Tall buildings (style.mjs TALL and up, collected when the city is generated) get real wall
// shapes here, so their edges are smooth at any zoom. Lower ones lean in the map style, in
// stacked slices by their height.

import { metres } from "./geo.mjs";

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
  for (const b of buildings) {
    const c = centre(b);
    const tower = towers.some((t) => b.h >= (t.minHeight ?? 60) && metres(c, t) <= (t.radius ?? 50));
    const zone = !tower && zones.some((z) => b.h >= (z.minHeight ?? 20)
      && c.lat <= z.box.north && c.lat >= z.box.south && c.lon >= z.box.west && c.lon <= z.box.east);
    if (tower || zone) hidden.add(b.id);
  }
  return hidden;
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
 * GeoJSON for the leaning buildings: per building its visible walls (shade 0..1 by the way
 * they face) then its roof, ordered back (north) to front (south) for the painter's algorithm.
 */
/**
 * extra: shapes drawn in the same back-to-front order, e.g. landmarks: [{ south, features }],
 * features already ordered among themselves. A building with near: true (beside a landmark) is
 * marked so the style can draw it see-through over the landmark.
 */
export function leanFeatures(buildings, { lean = 0.5, hidden = new Set(), extra = [] } = {}) {
  const features = [];
  if (lean <= 0 && !extra.length) return { type: "FeatureCollection", features };
  const order = buildings
    .filter((b) => !hidden.has(b.id) && b.rings.length)
    .map((b) => ({ b, south: Math.min(...b.rings.map((r) => Math.min(...r.map((p) => p[1])))) }))
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
