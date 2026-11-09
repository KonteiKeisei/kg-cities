// Routes on a city's street network (roads-index.mjs builds it): the fastest way on foot or by
// road between two points, in the scene's era (roads not built yet are closed; the era's own
// roads, Boston's elevated Central Artery, are added and joined to the rest). Pure: browser or Node.

import { CLASSES, F } from "./roads-index.mjs";

const M = 111320;
const Q = 1e5;
const MPH = 0.44704; // metres a second
/** Travel speeds in mph: walking, driving off the interstate, on it. */
export const SPEEDS = { walk: 3, road: 35, interstate: 55 };
/** How far from the road network a start or end may be (metres). */
const REACH = 400;
/** An era's added road joins the network at a point this close (metres). */
const JOIN = 60;
/** A road the era cut off rejoins the network within this many metres. */
const REJOIN = 120;

/* ---------------------------------------- */
/*  Era rules: the map style's expressions   */
/* ---------------------------------------- */

const inside = ([x, y], ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/**
 * The few MapLibre expression operators the cities' era rules use, on a road's properties and
 * its line ([lon, lat] points; "within" holds when every point is inside the polygon).
 */
export function evaluate(expr, props, line) {
  if (!Array.isArray(expr)) return expr;
  const [op, ...a] = expr;
  const ev = (e) => evaluate(e, props, line);
  switch (op) {
    case "literal": return a[0];
    case "get": return props[a[0]];
    case "has": return props[a[0]] !== undefined;
    case "coalesce": for (const e of a) { const v = ev(e); if (v != null) return v; } return null;
    case "to-boolean": return !!ev(a[0]);
    case "!": return !ev(a[0]);
    case "==": return ev(a[0]) === ev(a[1]);
    case "!=": return ev(a[0]) !== ev(a[1]);
    case "all": return a.every((e) => !!ev(e));
    case "any": return a.some((e) => !!ev(e));
    case "in": { const hay = ev(a[1]); return Array.isArray(hay) || typeof hay === "string" ? hay.includes(ev(a[0])) : false; }
    case "within": {
      const g = a[0], polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
      return !!line?.length && line.every((p) => polys.some((rings) => inside(p, rings[0]) && !rings.slice(1).some((h) => inside(p, h))));
    }
    default: throw new Error(`KG Cities routing does not know the expression "${op}"`);
  }
}

/* ---------------------------------------- */
/*  The graph                                */
/* ---------------------------------------- */

/** A binary heap of [key, value] on key. */
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, value) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(value);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = value;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lastK = k.pop(), lastV = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return top;
  }
}

export class RoadGraph {
  /**
   * packed: roadNetwork()'s output. era: { hiddenRoads?: expression, extraRoads?: GeoJSON
   * FeatureCollection of lines with properties { class, network?, brunnel?, ramp?, oneway? } }.
   */
  constructor(packed, era = {}) {
    const [ox, oy] = packed.origin;
    this.lon = []; this.lat = [];
    let x = ox, y = oy;
    for (let i = 0; i < packed.nodes.length; i += 2) {
      x += packed.nodes[i]; y += packed.nodes[i + 1];
      this.lon.push(x / Q); this.lat.push(y / Q);
    }
    this.K = Math.cos(((this.lat.reduce((s, v) => s + v, 0) / (this.lat.length || 1)) * Math.PI) / 180) * M;
    this.edges = [];
    for (const [a, b, cls, flags, oneway, metres, mids] of packed.edges) {
      const line = [[this.lon[a], this.lat[a]]];
      if (mids) {
        const d = mids.split(",").map(Number);
        let px = Math.round(this.lon[a] * Q), py = Math.round(this.lat[a] * Q);
        for (let i = 0; i < d.length; i += 2) { px += d[i]; py += d[i + 1]; line.push([px / Q, py / Q]); }
      }
      line.push([this.lon[b], this.lat[b]]);
      this.edges.push({ a, b, cls: CLASSES[cls], flags, oneway, metres, line });
    }
    const cut = new Set();
    if (era.hiddenRoads) {
      this.edges = this.edges.filter((e) => {
        const hide = evaluate(era.hiddenRoads, {
          class: e.cls, brunnel: e.flags & F.bridge ? "bridge" : e.flags & F.tunnel ? "tunnel" : undefined,
          ramp: e.flags & F.ramp ? 1 : undefined, network: e.flags & F.interstate ? "us-interstate" : undefined
        }, e.line);
        if (hide && e.flags & F.drive) { cut.add(e.a); cut.add(e.b); }
        return !hide;
      });
    }
    this.#index();
    for (const f of era.extraRoads?.features ?? []) this.#addRoad(f);
    this.#rejoin(cut);
    this.#adjacency();
  }

  /** Metres between two [lon, lat] points (flat: city distances). */
  metres(p, q) { return Math.hypot((p[0] - q[0]) * this.K, (p[1] - q[1]) * M); }

  /** A 250 m grid of the edges, for finding the road nearest a point. */
  #index() {
    this.cell = 250;
    this.grid = new Map();
    this.edges.forEach((e, i) => this.#put(e, i));
  }
  #put(e, i) {
    const seen = new Set();
    for (let j = 0; j < e.line.length - 1; j++) {
      const [x0, y0] = [e.line[j][0] * this.K, e.line[j][1] * M], [x1, y1] = [e.line[j + 1][0] * this.K, e.line[j + 1][1] * M];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (this.cell / 2)));
      for (let k = 0; k <= steps; k++) {
        const c = `${Math.floor((x0 + ((x1 - x0) * k) / steps) / this.cell)},${Math.floor((y0 + ((y1 - y0) * k) / steps) / this.cell)}`;
        if (seen.has(c)) continue;
        seen.add(c);
        if (!this.grid.has(c)) this.grid.set(c, []);
        this.grid.get(c).push(i);
      }
    }
  }

  /** The nearest point on a usable edge: { edge, along (metres from a), at, metres } or null. */
  nearest(p, mode, reach = REACH) {
    const want = mode === "walk" ? F.walk : F.drive;
    const cx = Math.floor((p[0] * this.K) / this.cell), cy = Math.floor((p[1] * M) / this.cell);
    const r = Math.ceil(reach / this.cell);
    let best = null;
    const tried = new Set();
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      for (const i of this.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (tried.has(i)) continue;
        tried.add(i);
        const e = this.edges[i];
        if (!(e.flags & want)) continue;
        let along = 0;
        for (let j = 0; j < e.line.length - 1; j++) {
          const a = e.line[j], b = e.line[j + 1];
          const ax = a[0] * this.K, ay = a[1] * M, bx = b[0] * this.K, by = b[1] * M, px = p[0] * this.K, py = p[1] * M;
          const dx2 = bx - ax, dy2 = by - ay, L2 = dx2 * dx2 + dy2 * dy2 || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx2 + (py - ay) * dy2) / L2));
          const d = Math.hypot(px - ax - t * dx2, py - ay - t * dy2);
          const seg = Math.sqrt(L2);
          if (d <= reach && (!best || d < best.metres)) best = { edge: i, along: along + seg * t, piece: j, t, at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], metres: d };
          along += seg;
        }
      }
    }
    if (best) best.along *= this.edges[best.edge].metres / (this.#lineMetres(this.edges[best.edge].line) || 1);
    return best;
  }

  #lineMetres(line) { let m = 0; for (let i = 1; i < line.length; i++) m += this.metres(line[i - 1], line[i]); return m; }

  /** An era's road, joined at its ends to the nearest drivable road within JOIN metres. */
  #addRoad(f) {
    const lines = f.geometry?.type === "LineString" ? [f.geometry.coordinates] : f.geometry?.type === "MultiLineString" ? f.geometry.coordinates : [];
    const p = f.properties ?? {};
    let flags = F.drive;
    if (p.class !== "motorway") flags |= F.walk;
    if (p.network === "us-interstate") flags |= F.interstate;
    if (p.brunnel === "tunnel") flags |= F.tunnel;
    if (p.brunnel === "bridge") flags |= F.bridge;
    if (p.ramp) flags |= F.ramp;
    const node = (pt) => { this.lon.push(pt[0]); this.lat.push(pt[1]); return this.lon.length - 1; };
    for (const line of lines) {
      if (line.length < 2) continue;
      const a = node(line[0]), b = node(line.at(-1));
      const e = { a, b, cls: p.class ?? "primary", flags, oneway: p.oneway ? 1 : 0, metres: this.#lineMetres(line), line };
      // Each end joins the nearest node of a drivable road, or the nearest point on one.
      for (const [end, pt] of [[a, line[0]], [b, line.at(-1)]]) {
        const near = this.nearest(pt, "drive", JOIN);
        if (!near) continue;
        const ne = this.edges[near.edge];
        for (const n of [ne.a, ne.b]) {
          const d = this.metres(pt, [this.lon[n], this.lat[n]]);
          if (d <= JOIN) this.edges.push({ a: end, b: n, cls: e.cls, flags, oneway: 0, metres: d, line: [pt, [this.lon[n], this.lat[n]]] });
        }
      }
      this.edges.push(e);
      this.#put(e, this.edges.length - 1);
    }
  }

  /**
   * Where the era cut a road (Boston 1986: the Sumner and Callahan tunnels' approaches, which
   * today run on into Big Dig ramps), what is left joins the nearest local street within REJOIN
   * metres, as it did then by roads the map no longer has.
   */
  #rejoin(cut) {
    const touching = new Map();
    for (const e of this.edges) if (e.flags & F.drive) for (const n of [e.a, e.b]) { if (!touching.has(n)) touching.set(n, []); touching.get(n).push(e); }
    const local = (e) => e.flags & F.drive && e.cls !== "motorway" && e.cls !== "trunk";
    for (const n of cut) {
      const mine = touching.get(n);
      // Gone altogether, or already on a local street: nothing to join.
      if (!mine || mine.some(local)) continue;
      const near = new Set(mine.flatMap((e) => [e.a, e.b]));
      const p = [this.lon[n], this.lat[n]];
      let best = null, bd = REJOIN;
      const cx = Math.floor((p[0] * this.K) / this.cell), cy = Math.floor((p[1] * M) / this.cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const i of this.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const e = this.edges[i];
          if (!local(e)) continue;
          for (const m of [e.a, e.b]) {
            if (near.has(m)) continue;
            const d = this.metres(p, [this.lon[m], this.lat[m]]);
            if (d < bd) { bd = d; best = m; }
          }
        }
      }
      if (best == null) continue;
      const e = { a: n, b: best, cls: "minor", flags: F.drive, oneway: 0, metres: bd, line: [p, [this.lon[best], this.lat[best]]] };
      this.edges.push(e);
      this.#put(e, this.edges.length - 1);
    }
  }

  /** Outgoing edges per node, for each mode: [[edge, forward], ...]. */
  #adjacency() {
    this.out = { walk: Array.from({ length: this.lon.length }, () => []), drive: Array.from({ length: this.lon.length }, () => []) };
    this.edges.forEach((e, i) => {
      if (e.flags & F.walk) { this.out.walk[e.a].push([i, true]); this.out.walk[e.b].push([i, false]); }
      if (e.flags & F.drive) { this.out.drive[e.a].push([i, true]); if (!e.oneway) this.out.drive[e.b].push([i, false]); }
    });
  }

  /** Seconds along an edge for a mode. */
  #seconds(e, mode, metres = e.metres) {
    if (mode === "walk") return metres / (SPEEDS.walk * MPH);
    return metres / ((e.flags & F.interstate ? SPEEDS.interstate : SPEEDS.road) * MPH);
  }

  /** The part of an edge's line from its start to `along` metres, or from there to its end. */
  #cut(e, along, toEnd) {
    const total = this.#lineMetres(e.line) || 1, target = (along / (e.metres || 1)) * total;
    const out = [e.line[0]];
    let run = 0;
    for (let j = 0; j < e.line.length - 1; j++) {
      const a = e.line[j], b = e.line[j + 1], seg = this.metres(a, b);
      if (run + seg >= target) {
        const t = seg ? (target - run) / seg : 0, at = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        return toEnd ? [at, ...e.line.slice(j + 1)] : [...out, at];
      }
      run += seg;
      out.push(b);
    }
    return toEnd ? [e.line.at(-1)] : e.line.slice();
  }

  /**
   * The fastest route from one [lon, lat] to another, on foot (mode "walk") or by road ("drive"):
   * { mode, metres, interstateMetres, seconds, line: [[lon, lat], ...] } or null when either end
   * is too far from a road, or nothing joins them.
   */
  route(from, to, mode = "walk") {
    const s = this.nearest(from, mode), t = this.nearest(to, mode);
    if (!s || !t) return null;
    const out = this.out[mode];
    const n = this.lon.length, START = n, GOAL = n + 1;
    const cost = new Float64Array(n + 2).fill(Infinity), prev = new Int32Array(n + 2).fill(-1), via = new Int32Array(n + 2).fill(-1);
    const maxSpeed = (mode === "walk" ? SPEEDS.walk : SPEEDS.interstate) * MPH;
    const h = (i) => (i === GOAL ? 0 : this.metres([this.lon[i], this.lat[i]], to) / maxSpeed);
    const heap = new Heap();
    // From the start's point on its edge to the edge's ends (one way: forward only).
    const se = this.edges[s.edge], te = this.edges[t.edge];
    const oneway = (e) => mode === "drive" && e.oneway;
    const reach = (node, c, from_, edge) => { if (c < cost[node]) { cost[node] = c; prev[node] = from_; via[node] = edge; heap.push(c + h(node), node); } };
    reach(se.b, this.#seconds(se, mode, se.metres - s.along), START, s.edge);
    if (!oneway(se)) reach(se.a, this.#seconds(se, mode, s.along), START, s.edge);
    // Both on one edge, the right way round: straight there.
    if (s.edge === t.edge && (!oneway(se) || t.along >= s.along)) reach(GOAL, this.#seconds(se, mode, Math.abs(t.along - s.along)), START, s.edge);
    cost[START] = 0;
    const done = new Uint8Array(n + 2);
    while (heap.size) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === GOAL) break;
      if (u === te.a) reach(GOAL, cost[u] + this.#seconds(te, mode, t.along), u, t.edge);
      if (u === te.b && !oneway(te)) reach(GOAL, cost[u] + this.#seconds(te, mode, te.metres - t.along), u, t.edge);
      for (const [i, fwd] of out[u]) {
        const e = this.edges[i], v = fwd ? e.b : e.a;
        if (!done[v]) reach(v, cost[u] + this.#seconds(e, mode), u, i);
      }
    }
    if (!Number.isFinite(cost[GOAL])) return null;
    // Back from the goal: the edges taken, each the way it was travelled.
    const steps = [];
    for (let v = GOAL; v !== START; v = prev[v]) steps.unshift([prev[v], v, via[v]]);
    const line = [from];
    let metres = 0, interstate = 0;
    for (const [u, v, i] of steps) {
      const e = this.edges[i];
      let piece;
      if (u === START && v === GOAL) {
        const a = Math.min(s.along, t.along), b = Math.max(s.along, t.along);
        piece = this.#cut(e, b, false);
        piece = this.#cut({ ...e, line: piece, metres: b }, a, true);
        if (s.along > t.along) piece.reverse();
      } else if (u === START) piece = v === e.b ? this.#cut(e, s.along, true) : this.#cut(e, s.along, false).reverse();
      else if (v === GOAL) piece = u === e.a ? this.#cut(e, t.along, false) : this.#cut(e, t.along, true).reverse();
      else piece = u === e.a ? e.line : [...e.line].reverse();
      const m = this.#lineMetres(piece);
      metres += m;
      if (e.flags & F.interstate) interstate += m;
      line.push(...piece);
    }
    line.push(to);
    // On foot to the road at the start and from it at the end (a car is parked at the curb).
    const off = s.metres + t.metres;
    return { mode, metres: metres + off, interstateMetres: interstate, seconds: cost[GOAL] + off / (SPEEDS.walk * MPH), line };
  }
}
