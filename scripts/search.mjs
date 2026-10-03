// Map search: streets, places, landmarks and house numbers. Pure: no Foundry.
//
// Index entries: { type: "street" | "place" | "landmark" | "address", name, sub, norm,
// box: [west, south, east, north] or point: [lon, lat], street?: index into streets }.

/** Street-name words and their usual short forms, both ways. */
const ABBREVIATIONS = {
  st: "street", street: "street", ave: "avenue", av: "avenue", avenue: "avenue", rd: "road", road: "road",
  sq: "square", square: "square", pl: "place", place: "place", ct: "court", court: "court",
  blvd: "boulevard", boulevard: "boulevard", pkwy: "parkway", parkway: "parkway", hwy: "highway", highway: "highway",
  ter: "terrace", terr: "terrace", terrace: "terrace", ln: "lane", lane: "lane", dr: "drive", drive: "drive",
  cir: "circle", circle: "circle", wy: "way", way: "way", sts: "streets", mt: "mount", mount: "mount",
  n: "north", north: "north", s: "south", south: "south", e: "east", east: "east", w: "west", west: "west",
  mass: "massachusetts", massachusetts: "massachusetts", ft: "fort", fort: "fort", hosp: "hospital"
};

/** Lower case, no punctuation, abbreviations spelled out: "Mass. Ave" -> "massachusetts avenue". */
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(" ");
}

/** Street lines from the packed file (tools/extract-search.mjs). */
export function decodeStreet(s) {
  const x0 = Math.round(s.b[0] * 1e5), y0 = Math.round(s.b[1] * 1e5);
  const lines = s.l.map((enc) => {
    const v = enc.split(",").map(Number);
    const out = [];
    let x = x0, y = y0;
    for (let i = 0; i < v.length; i += 2) { x += v[i]; y += v[i + 1]; out.push([x / 1e5, y / 1e5]); }
    return out;
  });
  return { name: s.n, kind: s.k, area: s.a, town: s.t, box: s.b, lines };
}

/** House numbers of one street from the packed file: [[number, lon, lat], ...]. */
export function decodeAddresses(packed, street) {
  if (!packed) return [];
  const x0 = Math.round(street.b[0] * 1e5), y0 = Math.round(street.b[1] * 1e5);
  return packed.split("|").map((e) => {
    const [num, x, y] = e.split(":");
    return [num, (x0 + Number(x)) / 1e5, (y0 + Number(y)) / 1e5];
  });
}

/**
 * finder(streetIndex, number) -> [number, lon, lat] or null. The number on that street first;
 * failing that, any house with that number within `reach` metres of the street's line, since a
 * corner house can be filed under a tiny side street it is nearer to (193 Salem St, under Salem Ct).
 */
export function addressFinder(streets, addresses, { reach = 60 } = {}) {
  const decoded = new Map();
  const lines = (i) => {
    if (!decoded.has(i)) decoded.set(i, decodeStreet(streets[i]).lines);
    return decoded.get(i);
  };
  const has = (n, num) => normalize(n).split(" ").includes(num);
  const K = Math.cos((42.33 * Math.PI) / 180) * 111320, M = 111320;
  const near = ([lon, lat], ls) => ls.some((line) => line.some((p, i) => {
    if (i === 0) return false;
    const [ax, ay] = [line[i - 1][0] * K, line[i - 1][1] * M], [bx, by] = [p[0] * K, p[1] * M], [px, py] = [lon * K, lat * M];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy) <= reach;
  }));
  return (si, num) => {
    const own = decodeAddresses(addresses[si], streets[si]).find(([n]) => has(n, num));
    if (own) return own;
    const s = streets[si], padX = reach / K, padY = reach / M;
    const [w, so, e, n] = [s.b[0] - padX, s.b[1] - padY, s.b[2] + padX, s.b[3] + padY];
    for (let j = 0; j < streets.length; j++) {
      const b = streets[j].b;
      if (j === si || !addresses[j] || b[0] > e || b[2] < w || b[1] > n || b[3] < so) continue;
      const hit = decodeAddresses(addresses[j], streets[j]).find(([nn, lon, lat]) => has(nn, num) && near([lon, lat], lines(si)));
      if (hit) return hit;
    }
    return null;
  };
}

const inside = (b, [lon, lat]) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
const overlaps = (b, [w, s, e, n]) => w <= b.east && e >= b.west && s <= b.north && n >= b.south;

/**
 * The search index for one scene. streets: the packed street list; places: from places.mjs
 * (hidden ones, generic business labels and places a landmark names are left out); landmarks: visible landmarks;
 * bounds: the scene's lat/lon box, so only things on this map are found.
 */
export function buildIndex({ streets = [], places = [], landmarks = [], bounds = null }) {
  const entries = [];
  streets.forEach((s, i) => {
    if (bounds && !overlaps(bounds, s.b)) return;
    const sub = [s.a, s.t].filter((v, j, a) => v && a.indexOf(v) === j).join(", ");
    entries.push({ type: "street", name: s.n, sub, norm: normalize(s.n), box: s.b, street: i });
  });
  for (const p of places) {
    if (p.hidden || p.covered || p.why === "generic business" || (bounds && !inside(bounds, [p.lon, p.lat]))) continue;
    entries.push({ type: "place", name: p.name, sub: p.kind.replace(/_/g, " "), norm: normalize(p.name), point: [p.lon, p.lat] });
  }
  for (const lm of landmarks) {
    if (lm.hidden || (bounds && !inside(bounds, [lm.lon, lm.lat]))) continue;
    entries.push({ type: "landmark", name: lm.name, sub: "landmark", norm: normalize(lm.name), point: [lm.lon, lm.lat], id: lm.id });
  }
  return entries;
}

const TYPE_RANK = { landmark: 0, place: 1, street: 2, address: 0 };

/** How well a query matches a name (both normalised): higher is better, 0 is no match. */
function score(query, name) {
  if (!query) return 0;
  if (name === query) return 100;
  if (name.startsWith(query)) return 80 - Math.min(20, name.length - query.length) / 2;
  const words = query.split(" ");
  const nameWords = name.split(" ");
  // Every query word starts some word of the name.
  if (words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 60 - nameWords.length;
  if (name.includes(query)) return 40;
  return 0;
}

/**
 * Results for a query, best first. "193 Salem St" also finds house number 193 on every Salem
 * Street on the map (findAddress from addressFinder).
 */
export function search(entries, query, { limit = 12, findAddress = null, near = null } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const results = [];
  const address = q.match(/^(\d+[a-z]?)(?: (.+))?$/);
  if (address && address[2] && findAddress) {
    const [, num, street] = address;
    for (const e of entries) {
      if (e.type !== "street" || score(street, e.norm) < 60) continue;
      // A building can carry several numbers ("193;195"): any of them matches.
      const hit = findAddress(e.street, num);
      if (hit) results.push({ type: "address", name: `${num.toUpperCase()} ${e.name}`, sub: e.sub, point: [hit[1], hit[2]], s: 120 + score(street, e.norm) });
    }
  }
  for (const e of entries) {
    const s = score(q, e.norm);
    if (s > 0) results.push({ ...e, s });
  }
  // Equal matches (Beacon Street in a dozen towns) nearest first, from near: [lon, lat].
  const far = (r) => {
    if (!near) return 0;
    const [lon, lat] = r.point ?? (r.box ? [(r.box[0] + r.box[2]) / 2, (r.box[1] + r.box[3]) / 2] : near);
    return Math.hypot((lon - near[0]) * Math.cos((near[1] * Math.PI) / 180), lat - near[1]);
  };
  for (const r of results) r.d = far(r);
  results.sort((a, b) => b.s - a.s || TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.d - b.d || a.name.localeCompare(b.name));
  // The same street name in several towns is several results; one place name in one spot is one.
  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.type}|${r.name}|${r.sub}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
