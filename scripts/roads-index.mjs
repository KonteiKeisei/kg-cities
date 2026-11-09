// The street network a city's routes are found on, made from its tiles when it is generated
// (scripts/routing.mjs reads it). Every road, path and pier at the detail zoom, joined where
// they share a point (a bridge over a road shares none, so it does not join it), cut into edges
// between junctions. Each edge keeps what routing needs: its length, who may use it (walkers,
// drivers), whether it is an interstate, one way, a ramp, a bridge or tunnel. Pure: browser or Node.

import { eachTile } from "./derive.mjs";

/** Road classes and who may use them. Rail, ferries, busways and roads under construction are left out. */
const DRIVE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]);
const WALK = new Set(["trunk", "primary", "secondary", "tertiary", "minor", "service", "path", "track", "pier"]);
/** Service roads drivers never route along. */
const NO_THROUGH = new Set(["parking_aisle", "driveway", "drive-through"]);
const M = 111320;
const Q = 1e5; // coordinates in whole 1e-5 degrees (about a metre)

export const CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "path", "track", "pier"];
/** Edge flags. */
export const F = { walk: 1, drive: 2, interstate: 4, ramp: 8, bridge: 16, tunnel: 32 };

/** Douglas-Peucker on [x, y] metres; returns the kept indices. */
function keepIndices(P, tol) {
  const keep = new Uint8Array(P.length);
  keep[0] = keep[P.length - 1] = 1;
  const stack = [[0, P.length - 1]];
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
  return keep;
}

/** How close a dead end must be to another road to join it (metres). */
const SNAP = 3;

/**
 * Join roads the tiles leave apart. The map's lines are simplified, so a side street often ends on
 * the middle of a straight main road with no point there to share, and a road cut at a tile's edge
 * can end a little short of its other half. A dead end within SNAP metres of another road joins
 * it: at that road's end when it is that close, else by splitting the road there. A motorway's
 * lanes and a road that is not a motorway never join (a street under an overpass stays under
 * it); its ramps do.
 * segs: [u, v, attr, oneway] (changed in place).
 */
function snapDeadEnds(segs, xs, ys, attrList, K) {
  const X = (n) => (xs[n] / Q) * K, Y = (n) => (ys[n] / Q) * M;
  // A motorway's own lanes; its ramps join local roads like any road.
  const motorway = (s) => attrList[s[2]].cls === 0 && !(attrList[s[2]].flags & F.ramp);
  const degree = new Map(), segAt = new Map();
  segs.forEach((s, i) => { for (const n of [s[0], s[1]]) { degree.set(n, (degree.get(n) ?? 0) + 1); segAt.set(n, i); } });
  const CELL = 25, grid = new Map();
  const add = (i) => {
    const s = segs[i], x0 = X(s[0]), y0 = Y(s[0]), x1 = X(s[1]), y1 = Y(s[1]);
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL / 2))), seen = new Set();
    for (let k = 0; k <= steps; k++) {
      const c = `${Math.floor((x0 + ((x1 - x0) * k) / steps) / CELL)},${Math.floor((y0 + ((y1 - y0) * k) / steps) / CELL)}`;
      if (seen.has(c)) continue;
      seen.add(c);
      if (!grid.has(c)) grid.set(c, []);
      grid.get(c).push(i);
    }
  };
  segs.forEach((_, i) => add(i));
  const alias = new Map();
  const root = (n) => { while (alias.has(n)) n = alias.get(n); return n; };
  for (const [n, d] of degree) {
    if (d !== 1) continue;
    const own = segs[segAt.get(n)], px = X(n), py = Y(n);
    const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
    let best = null, bd = SNAP;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const s = segs[i];
        if (s === own || s[0] === n || s[1] === n || motorway(s) !== motorway(own)) continue;
        const ax = X(s[0]), ay = Y(s[0]), bx = X(s[1]), by = Y(s[1]);
        const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
        const d = Math.hypot(px - ax - t * vx, py - ay - t * vy);
        if (d < bd) { bd = d; best = { i, t, ends: [Math.hypot(px - ax, py - ay), Math.hypot(px - bx, py - by)] }; }
      }
    }
    if (!best) continue;
    const s = segs[best.i];
    if (best.ends[0] <= SNAP || best.ends[1] <= SNAP) {
      // Two dead ends facing each other join once, not each to the other.
      const to = root(best.ends[0] <= best.ends[1] ? s[0] : s[1]);
      if (to !== root(n)) alias.set(root(n), to);
      continue;
    }
    // Split the road at the dead end: [u, n] and [n, v], the same kind and the same way round.
    segs.push([n, s[1], s[2], s[3]]);
    s[1] = n;
    add(segs.length - 1);
  }
  for (const s of segs) { s[0] = root(s[0]); s[1] = root(s[1]); }
  for (let i = segs.length - 1; i >= 0; i--) if (segs[i][0] === segs[i][1]) segs.splice(i, 1);
}

/** A road's attributes, or null when it is not for routing. */
function roadAttributes(p) {
  const cls = p.class;
  if (!DRIVE.has(cls) && !WALK.has(cls)) return null;
  if (p.indoor || p.access === "no") return null;
  const subclass = p.subclass ?? p.service;
  let flags = 0;
  // Paths: pedestrian streets and plazas only. Sidewalks, footways and cycleways are mapped beside
  // most streets in the big cities and would make the network several times larger; walkers use
  // the streets themselves.
  if (cls === "path" && !["pedestrian"].includes(subclass)) return null;
  // Service roads: not parking aisles, driveways or drive-throughs, which go nowhere. The rest
  // stay: an airport's terminal roads, a hospital's or a campus's drives are service roads.
  if (cls === "service" && NO_THROUGH.has(p.service)) return null;
  if (WALK.has(cls) && p.foot !== "no") flags |= F.walk;
  if (DRIVE.has(cls) && !(cls === "service" && NO_THROUGH.has(p.service))) flags |= F.drive;
  if (!flags) return null;
  if (p.network === "us-interstate") flags |= F.interstate;
  if (p.ramp) flags |= F.ramp;
  if (p.brunnel === "bridge") flags |= F.bridge;
  if (p.brunnel === "tunnel") flags |= F.tunnel;
  // One way binds drivers only: walkers go both ways.
  const oneway = flags & F.drive ? (p.oneway === 1 ? 1 : p.oneway === -1 ? -1 : 0) : 0;
  return { cls: CLASSES.indexOf(cls), flags, oneway };
}

/**
 * The network inside a lat/lon box, packed: { v: 1, origin: [lon, lat] in 1e-5 degrees,
 * nodes: [dx, dy, ...] (each from the one before), edges: [[a, b, cls, flags, oneway, metres, "dx,dy,..."]] }.
 * An edge's points run from node a to node b, between them; oneway 1 is a to b only, -1 b to a.
 */
export async function roadNetwork(getTile, bounds, onProgress) {
  const K = Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180) * M;
  const ids = new Map(), xs = [], ys = [];
  const node = (x, y) => {
    const k = x * 4e7 + y;
    let id = ids.get(k);
    if (id === undefined) { id = xs.length; ids.set(k, id); xs.push(x); ys.push(y); }
    return id;
  };
  // Each segment once: the tile holding its middle keeps it (tiles overlap at their edges).
  const segs = []; // [u, v, attrKey]
  const attrs = new Map(), attrList = [];
  const seen = new Set();
  await eachTile(getTile, bounds, (vt, { toLonLat }) => {
    const layer = vt.layers.transportation;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 2) continue;
      const a = roadAttributes(f.properties);
      if (!a) continue;
      const key = `${a.cls}|${a.flags}`;
      if (!attrs.has(key)) { attrs.set(key, attrList.length); attrList.push(a); }
      const ak = attrs.get(key);
      for (const part of f.loadGeometry()) {
        for (let j = 0; j < part.length - 1; j++) {
          const p = part[j], q = part[j + 1];
          const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
          if (mx < 0 || my < 0 || mx >= layer.extent || my >= layer.extent) continue;
          const [lon0, lat0] = toLonLat(p, layer), [lon1, lat1] = toLonLat(q, layer);
          const u = node(Math.round(lon0 * Q), Math.round(lat0 * Q)), v = node(Math.round(lon1 * Q), Math.round(lat1 * Q));
          if (u === v) continue;
          const sk = u < v ? u * 1e8 + v : v * 1e8 + u;
          if (seen.has(sk)) continue;
          seen.add(sk);
          // Kept in the direction one way allows (a.oneway -1: the line runs against the traffic).
          segs.push(a.oneway === -1 ? [v, u, ak, 1] : [u, v, ak, a.oneway]);
        }
      }
    }
  }, (f) => onProgress?.(f * 0.8));
  snapDeadEnds(segs, xs, ys, attrList, K);

  // Junctions: where more or fewer than two segments meet, or where a road's kind or its one
  // way changes. Between junctions, the segments chain into one edge.
  const adj = Array.from({ length: xs.length }, () => []);
  segs.forEach((s, i) => { adj[s[0]].push(i); adj[s[1]].push(i); });
  const kindAt = (n) => new Set(adj[n].map((i) => `${segs[i][2]}|${segs[i][3]}`)).size;
  // A one-way chain also breaks where its pieces stop running nose to tail.
  const junction = (n) => adj[n].length !== 2 || kindAt(n) > 1 || (!!segs[adj[n][0]][3] && adj[n].filter((i) => segs[i][1] === n).length !== 1);
  const used = new Uint8Array(segs.length);
  const xy = (n) => [(xs[n] / Q) * K, (ys[n] / Q) * M];
  const edges = [];
  const walkFrom = (start, first) => {
    const path = [start];
    let at = start, si = first;
    for (;;) {
      used[si] = 1;
      const s = segs[si], next = s[0] === at ? s[1] : s[0];
      path.push(next);
      at = next;
      if (junction(at) || at === start) break;
      si = adj[at].find((i) => !used[i]);
      if (si === undefined) break;
    }
    const s0 = segs[first];
    // One way: the edge runs the way traffic goes.
    if (s0[3] && s0[0] !== start) path.reverse();
    const P = path.map(xy);
    let metres = 0;
    for (let i = 1; i < P.length; i++) metres += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const keep = keepIndices(P, 2);
    const mids = [];
    let px = xs[path[0]], py = ys[path[0]];
    for (let i = 1; i < path.length - 1; i++) if (keep[i]) { const n = path[i]; mids.push(xs[n] - px, ys[n] - py); px = xs[n]; py = ys[n]; }
    const a = attrList[s0[2]];
    edges.push([path[0], path.at(-1), a.cls, a.flags, s0[3] ? 1 : 0, Math.round(metres * 10) / 10, mids.join(",")]);
  };
  for (let n = 0; n < xs.length; n++) if (junction(n)) for (const si of adj[n]) if (!used[si]) walkFrom(n, si);
  // Loops with no junction on them (a roundabout on its own).
  for (let si = 0; si < segs.length; si++) if (!used[si]) walkFrom(segs[si][0], si);
  onProgress?.(0.95);

  // Only the nodes edges end at, renumbered and stored as steps from the one before.
  const ends = new Map();
  const id = (n) => { let k = ends.get(n); if (k === undefined) { k = ends.size; ends.set(n, k); } return k; };
  for (const e of edges) { e[0] = id(e[0]); e[1] = id(e[1]); }
  const order = [...ends.keys()];
  // A plain loop: a whole metro has too many points to spread into Math.min.
  let ox = Infinity, oy = Infinity;
  for (const n of order) { if (xs[n] < ox) ox = xs[n]; if (ys[n] < oy) oy = ys[n]; }
  const nodes = [];
  let px = ox, py = oy;
  for (const n of order) { nodes.push(xs[n] - px, ys[n] - py); px = xs[n]; py = ys[n]; }
  onProgress?.(1);
  return { v: 1, origin: [ox, oy], nodes, edges };
}
