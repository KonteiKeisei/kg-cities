// Landmarks: special POIs drawn in glowing gold, with a hover card from a journal page.
// Pure: no Foundry.
//
// A landmark is { id, name, page (journal page UUID), lat, lon, glow, hidden, model?,
// buildings?: [{ id, h, base, rings }], img?, summary? }. With buildings, those buildings are
// drawn in gold instead of the usual blue (and left out of the normal layers). With a model,
// a hand-built shape replaces them (Old North Church). Without either it is a gold pin.
//
// Shapes are drawn in the same oblique view as the leaning buildings: a point (x east, y north,
// z up, in metres) is drawn at (x, y + z * lean). Faces turned away from that view are culled,
// and faces are drawn far to near.

const M_PER_DEG_LAT = 111320;
/** Height for a landmark building the data gives none for. */
const DEFAULT_HEIGHT = 12;

/** Local metres around a point, and back to [lon, lat]. */
function frameAt(lat, lon) {
  const k = Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LAT;
  return {
    toXY: ([lo, la]) => [(lo - lon) * k, (la - lat) * M_PER_DEG_LAT],
    toLonLat: ([x, y]) => [lon + x / k, lat + y / M_PER_DEG_LAT]
  };
}

const area2 = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return a;
};
/** Counter-clockwise (seen from above), without a repeated closing point. */
const ccw = (ring) => {
  const open = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring.slice();
  return area2(open) < 0 ? open.reverse() : open;
};

// Solids as faces: { pts: [[x, y, z], ...] wound counter-clockwise seen from outside, role }.
function prism(ring, base, top, role = "wall") {
  const r = ccw(ring), faces = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    faces.push({ role, pts: [[a[0], a[1], base], [b[0], b[1], base], [b[0], b[1], top], [a[0], a[1], top]] });
  }
  faces.push({ role: "roof", pts: r.map(([x, y]) => [x, y, top]) });
  return faces;
}

function pyramid(ring, base, apex, role = "roof") {
  const r = ccw(ring), faces = [];
  const cx = r.reduce((s, p) => s + p[0], 0) / r.length, cy = r.reduce((s, p) => s + p[1], 0) / r.length;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    faces.push({ role, pts: [[a[0], a[1], base], [b[0], b[1], base], [cx, cy, apex]] });
  }
  return faces;
}

/** A rectangle (4 corners, ccw) with walls to eave and a pitched roof, ridge along corners 0-1. */
function gable(rect, eave, ridge) {
  const [a, b, c, d] = ccw(rect);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m1 = mid(b, c), m0 = mid(d, a);
  return [
    ...prism([a, b, c, d], 0, eave).filter((f) => f.role !== "roof"),
    { role: "roof", pts: [[a[0], a[1], eave], [b[0], b[1], eave], [m1[0], m1[1], ridge], [m0[0], m0[1], ridge]] },
    { role: "roof", pts: [[c[0], c[1], eave], [d[0], d[1], eave], [m0[0], m0[1], ridge], [m1[0], m1[1], ridge]] },
    { role: "wall", pts: [[b[0], b[1], eave], [c[0], c[1], eave], [m1[0], m1[1], ridge]] },
    { role: "wall", pts: [[d[0], d[1], eave], [a[0], a[1], eave], [m0[0], m0[1], ridge]] }
  ];
}

const square = (cu, cv, half) => [[cu - half, cv - half], [cu + half, cv - half], [cu + half, cv + half], [cu - half, cv + half]];
const box = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/**
 * Hand-built shapes, in metres along the landmark's own axes: u along its length (toward the
 * front), v across it, z up. Each gets { length, beam, ring } (the footprint in u, v) and
 * returns faces. orient says how the front is found: "bump" (the end where the outline sticks
 * out furthest, e.g. a tower) or "bow" (the narrower end, e.g. a ship's bow).
 */
export const MODELS = {
  // Old North Church (Christ Church, 1723): a gabled brick nave, the square brick tower on the
  // Salem Street end, three white belfry tiers and the spire, 53 m to the tip as the map data
  // gives it. Proportions from the building's footprint (20.7 x 15.1 m nave, 6.9 m tower).
  "old-north-church": { orient: "bump", build: () => [
    ...gable([[-10.35, -7.55], [10.35, -7.55], [10.35, 7.55], [-10.35, 7.55]], 11, 17),
    // Rounded chancel at the back.
    ...prism(Array.from({ length: 9 }, (_, i) => {
      const t = Math.PI / 2 + (i / 8) * Math.PI;
      return [-10.35 + 3.6 * Math.cos(t), 4.2 * Math.sin(t)];
    }), 0, 9),
    ...prism(square(12.1, 0, 3.45), 0, 27),
    ...prism(square(12.1, 0, 3.1), 27, 32.5, "trim"),
    ...prism(square(12.1, 0, 2.6), 32.5, 37, "trim"),
    ...prism(square(12.1, 0, 2.1), 37, 40.5, "trim"),
    ...pyramid(square(12.1, 0, 1.6), 40.5, 53)
  ] },

  // The World Trade Center's Twin Towers (1972, 1973), as they stood until 2001. Placed by the
  // landmark's own point and angle (orient "fixed"): the point is midway between the towers, u runs
  // along the old street grid toward Church Street, v toward Vesey Street. Centres and sides from
  // the memorial pools, which sit inside the old footprints. 63.4 m square, 417 m (North, with the
  // 1978 antenna to 526 m) and 415 m (South, its rooftop observation deck). The lighter bands are
  // the mechanical floors (41-42, 75-76) and the lobby arcade at the foot.
  "wtc-twin-towers": { orient: "fixed", angle: -29.4, build: () => {
    const tower = (cu, cv, roof) => {
      const bands = [[0, 9, "trim"], [9, 150, "wall"], [150, 155, "trim"], [155, 282, "wall"], [282, 287, "trim"], [287, roof, "wall"]];
      return bands.flatMap(([b, t, role], i) => prism(square(cu, cv, 31.7), b, t, role).filter((f) => f.role !== "roof" || i === bands.length - 1));
    };
    return [
      ...tower(-33.9, 51.9, 417),
      ...prism(square(-33.9, 51.9, 3), 417, 470, "trim"),
      ...pyramid(square(-33.9, 51.9, 1.4), 470, 526),
      ...tower(33.7, -51.8, 415),
      ...prism(square(33.7, -51.8, 13), 415, 419, "trim")
    ];
  } },

  // USS Constitution (1797) at Pier 1, Charlestown Navy Yard: her hull on the outline the map
  // data gives, three masts (main to 62 m above the water), three yards on each with the sails
  // furled along them as she usually sat at the pier, and the bowsprit and jib boom.
  "uss-constitution": { orient: "bow", build: ({ length: L, ring }) => {
    const deck = 6;
    const faces = [...prism(ring, 0, deck)];
    const masts = [
      { u: 0.24 * L, top: 55, yards: [[0.42, 22], [0.62, 17], [0.78, 11]] },
      { u: -0.02 * L, top: 62, yards: [[0.40, 26], [0.61, 20], [0.77, 13]] },
      { u: -0.27 * L, top: 49, yards: [[0.44, 17], [0.63, 13], [0.79, 9]] }
    ];
    for (const m of masts) {
      const lower = deck + (m.top - deck) * 0.55;
      faces.push(...prism(square(m.u, 0, 0.55), deck, lower), ...prism(square(m.u, 0, 0.38), lower, m.top));
      for (const [at, span] of m.yards) {
        const z = deck + (m.top - deck) * at;
        // The yard with its furled sail: a pale bundle across the ship.
        faces.push(...prism(box(m.u - 0.7, m.u + 0.7, -span / 2, span / 2), z - 0.8, z + 0.4, "trim"));
      }
    }
    // Bowsprit and jib boom, out past the bow.
    faces.push(...prism(box(L / 2 - 2, L / 2 + 16, -0.35, 0.35), deck + 1, deck + 1.8));
    return faces;
  } }
};

/** Principal axis of a set of [x, y] points: centre and angle (degrees from east). */
function principalAxis(pts) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  return { cx, cy, angle: (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI };
}

/** Model faces placed on the ground: centre lat/lon, axis angle in degrees from east. */
function placeModel(faces, angle) {
  const c = Math.cos((angle * Math.PI) / 180), s = Math.sin((angle * Math.PI) / 180);
  return faces.map((f) => ({ ...f, pts: f.pts.map(([u, v, z]) => [u * c - v * s, u * s + v * c, z]) }));
}

/** Centre and long-axis angle of the largest ring among a landmark's buildings (local metres). */
function footprintAxis(rings) {
  // ccw() also drops the repeated closing point, which would otherwise pull the centre toward it.
  const ring = ccw(rings.reduce((best, r) => (Math.abs(area2(r)) > Math.abs(area2(best)) ? r : best)));
  let len = 0, angle = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    if (l > len) { len = l; angle = (Math.atan2(dy, dx) * 180) / Math.PI; }
  }
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { cx, cy, angle };
}

function normal(pts) {
  // Newell's method.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[(i + 1) % pts.length];
    nx += (y0 - y1) * (z0 + z1); ny += (z0 - z1) * (x0 + x1); nz += (x0 - x1) * (y0 + y1);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** Faces of one landmark in local metres (x east, y north), or null for a pin. */
export function landmarkFaces(lm) {
  if (!lm.buildings?.length) return null;
  const f = frameAt(lm.lat, lm.lon);
  const rings = lm.buildings.map((b) => b.rings[0].map(f.toXY));
  if (lm.model && MODELS[lm.model]) {
    const model = MODELS[lm.model];
    let cx, cy, front;
    if (model.orient === "fixed") {
      // Built around the landmark's own point, at a set angle (a model with no footprint today).
      cx = 0; cy = 0; front = lm.angle ?? model.angle ?? 0;
    } else if (model.orient === "bow") {
      // Along the outline's principal axis; the bow is the end that is narrower near its tip.
      const ring = ccw(rings[0]);
      ({ cx, cy, angle: front } = principalAxis(ring));
      const ux = Math.cos((front * Math.PI) / 180), uy = Math.sin((front * Math.PI) / 180);
      const uv = ring.map(([x, y]) => [(x - cx) * ux + (y - cy) * uy, -(x - cx) * uy + (y - cy) * ux]);
      const lo = Math.min(...uv.map((p) => p[0])), hi = Math.max(...uv.map((p) => p[0]));
      const widthNear = (end) => {
        const near = uv.filter(([u]) => Math.abs(u - end) < 0.15 * (hi - lo)).map(([, v]) => v);
        return Math.max(...near) - Math.min(...near);
      };
      if (widthNear(lo) < widthNear(hi)) front += 180;
    } else {
      // The model's u axis follows the main block's long side. Its front (the tower) goes on the
      // end where the whole outline sticks out furthest: the tower's bump, not the rounded apse.
      const main = rings.reduce((best, r) => (r.length < best.length ? r : best));
      let angle;
      ({ cx, cy, angle } = footprintAxis([main]));
      const ux = Math.cos((angle * Math.PI) / 180), uy = Math.sin((angle * Math.PI) / 180);
      const along = rings.flat().map(([x, y]) => (x - cx) * ux + (y - cy) * uy);
      front = Math.max(...along) >= -Math.min(...along) ? angle : angle + 180;
    }
    if (lm.flip) front += 180;
    // The footprint in the model's own axes, for models built on it (a ship's hull).
    const ux = Math.cos((front * Math.PI) / 180), uy = Math.sin((front * Math.PI) / 180);
    const ring = ccw(rings[0]).map(([x, y]) => [(x - cx) * ux + (y - cy) * uy, -(x - cx) * uy + (y - cy) * ux]);
    const us = ring.map((p) => p[0]), vs = ring.map((p) => p[1]);
    const ctx = { ring, length: Math.max(...us) - Math.min(...us), beam: Math.max(...vs) - Math.min(...vs) };
    return placeModel(model.build(ctx), front).map((face) => ({ ...face, pts: face.pts.map(([x, y, z]) => [x + cx, y + cy, z]) }));
  }
  return lm.buildings.flatMap((b, i) => prism(rings[i], b.base ?? 0, b.h ?? DEFAULT_HEIGHT));
}

/**
 * GeoJSON for the landmarks at this lean: faces (role wall | trim | roof, shade 0..1, key for
 * drawing order), ground outlines for the glow, and pins.
 */
export function landmarkFeatures(landmarks, { lean = 0.5 } = {}) {
  const features = [];
  const view = [0, -lean, 1];
  const light = (() => { const l = [-0.45, -0.6, 0.66], n = Math.hypot(...l); return l.map((v) => v / n); })();
  let key = 0;
  for (const lm of landmarks) {
    if (lm.hidden) continue;
    // Tone: "gold" for points of interest, "haven" (blue) for the players' safe havens.
    const props = { landmark: lm.id, name: lm.name, glow: lm.glow !== false, tone: lm.tone === "haven" ? "haven" : "gold" };
    const faces = landmarkFaces(lm);
    // The name, in the landmark's colour: below a pin, on a building.
    features.push({ type: "Feature", properties: { ...props, part: "label", pin: !faces }, geometry: { type: "Point", coordinates: [lm.lon, lm.lat] } });
    if (!faces) {
      features.push({ type: "Feature", properties: { ...props, part: "pin" }, geometry: { type: "Point", coordinates: [lm.lon, lm.lat] } });
      continue;
    }
    const f = frameAt(lm.lat, lm.lon);
    const project = ([x, y, z]) => f.toLonLat([x, y + z * lean]);
    const drawn = faces
      .map((face) => ({ face, n: normal(face.pts), near: face.pts.reduce((s, [, y, z]) => s - lean * y + z, 0) / face.pts.length }))
      .filter(({ n }) => n[0] * view[0] + n[1] * view[1] + n[2] * view[2] > 1e-6)
      .sort((a, b) => a.near - b.near);
    for (const { face, n } of drawn) {
      const shade = Math.max(0, Math.min(1, 0.35 + 0.65 * (n[0] * light[0] + n[1] * light[1] + n[2] * light[2])));
      const ring = face.pts.map(project);
      ring.push(ring[0]);
      features.push({ type: "Feature", properties: { ...props, part: face.role, shade: Math.round(shade * 100) / 100, key: key++ }, geometry: { type: "Polygon", coordinates: [ring] } });
    }
    for (const b of lm.buildings) {
      features.push({ type: "Feature", properties: { ...props, part: "ground" }, geometry: { type: "Polygon", coordinates: [b.rings[0]] } });
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * Landmark faces as shapes for leanFeatures' extra: [{ south, features }]. Drawn in the same
 * back-to-front order as the buildings, so a building in front (south) of a landmark covers its
 * base, and one behind it is covered.
 */
export function landmarkItems(landmarks, { lean = 0.5 } = {}) {
  const fc = landmarkFeatures(landmarks, { lean });
  const byId = new Map();
  for (const f of fc.features) {
    if (!["wall", "trim", "roof"].includes(f.properties.part)) continue;
    const list = byId.get(f.properties.landmark) ?? [];
    list.push({ ...f, properties: { ...f.properties, gold: true } });
    byId.set(f.properties.landmark, list);
  }
  return [...byId.entries()].map(([id, features]) => {
    const lm = landmarks.find((l) => l.id === id);
    const south = Math.min(...lm.buildings.flatMap((b) => b.rings[0].map((p) => p[1])));
    return { south, features };
  });
}

/**
 * The buildings stored around each landmark (lm.neighbours), drawn with it in one back-to-front
 * order and see-through (near: true), so the landmark never paints over the street in front.
 */
export function landmarkNeighbours(landmarks) {
  const seen = new Set(landmarks.flatMap((lm) => (lm.buildings ?? []).map((b) => b.id)));
  const out = [];
  const southOf = (rings) => Math.min(...rings.map((r) => Math.min(...r.map((p) => p[1]))));
  for (const lm of landmarks) {
    if (lm.hidden || !lm.buildings?.length) continue;
    const lmSouth = southOf(lm.buildings.map((b) => b.rings[0]));
    for (const b of lm.neighbours ?? []) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      // Only buildings drawn after the landmark (in front of it) are see-through; the rest look as usual.
      out.push({ ...b, h: b.h ?? 9, near: southOf(b.rings) < lmSouth });
    }
  }
  return out;
}

/** Fields that come from the map data (the seed) rather than from the GM. */
const SHAPE = ["buildings", "neighbours", "model", "lat", "lon"];

/**
 * The GM's saved landmarks, kept up to date with the module's seed: a seeded landmark takes its
 * shape (buildings, neighbours, model, position) from the current seed unless the GM changed
 * its shape (shapeEdited), and keeps everything the GM set (name, page, scene, image, tone,
 * glow, hidden...). Seed landmarks the GM has not seen yet are added; ones removed stay removed.
 */
export function mergeLandmarks(saved, seed = [], removed = []) {
  if (!saved) return seed;
  const seedById = new Map(seed.map((s) => [s.id, s]));
  const out = saved.map((lm) => {
    const fresh = seedById.get(lm.id);
    if (!fresh || lm.shapeEdited) return lm;
    const merged = { ...lm };
    for (const key of SHAPE) {
      if (fresh[key] === undefined) delete merged[key];
      else merged[key] = fresh[key];
    }
    return merged;
  });
  const have = new Set(saved.map((l) => l.id));
  const gone = new Set(removed);
  for (const s of seed) if (!have.has(s.id) && !gone.has(s.id)) out.push(s);
  return out;
}

/** Building ids drawn with the landmarks (theirs and their neighbours'), to leave out of the ordinary layers. */
export const landmarkBuildingIds = (landmarks) => landmarks.flatMap((lm) => (lm.hidden ? [] : [
  ...(lm.buildings ?? []).map((b) => b.id),
  ...(lm.buildings?.length ? (lm.neighbours ?? []).map((b) => b.id) : [])
]));

const inside = ([x, y], ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/** The landmark under a [lon, lat] point: on any drawn face or footprint, or within pinMetres of a pin. */
export function landmarkAt(features, point, pinMetres = 30) {
  let best = null, bestKey = -1;
  for (const f of features.features) {
    const { landmark, part, key = 0 } = f.properties;
    // A pin or a name label: near enough counts (hovering a landmark's name shows its card too).
    if (part === "pin" || part === "label") {
      const k = Math.cos((point[1] * Math.PI) / 180);
      const d = Math.hypot((f.geometry.coordinates[0] - point[0]) * k, f.geometry.coordinates[1] - point[1]) * M_PER_DEG_LAT;
      if (d <= pinMetres && !best) best = landmark;
    } else if (inside(point, f.geometry.coordinates[0]) && key >= bestKey) {
      best = landmark; bestKey = key;
    }
  }
  return best;
}

/** The card's text from a journal page's HTML: first image, first bold line, first paragraph after it. */
export function pageSummary(html = "") {
  const img = html.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? null;
  const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const subtitle = text(html.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1] ?? "");
  const paragraphs = [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((m) => text(m[1])).filter((p) => p && p !== subtitle && !p.startsWith(subtitle || "\u0000"));
  const body = paragraphs.find((p) => p.length > 60) ?? "";
  const excerpt = body.length > 280 ? `${body.slice(0, body.lastIndexOf(" ", 270))}…` : body;
  return { img, subtitle, excerpt };
}
