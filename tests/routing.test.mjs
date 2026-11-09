import test from "node:test";
import assert from "node:assert/strict";
import { RoadGraph, evaluate, SPEEDS } from "../scripts/routing.mjs";
import { CLASSES, F } from "../scripts/roads-index.mjs";

// A small town on a 0.001 degree grid (about 110 m north-south, 82 m east-west at 42 N):
//
//   n3 ---- n4         n0-n1-n2 is Main St (two way). n2 -> n4 -> n3 is one way, the way round.
//   |        |         n0-n3 is a footpath (walkers only). n1-n5-n2: an interstate loop to the south.
//   n0 - n1 - n2
//        \  /
//         n5
const Q = 1e5, lon0 = -71.1, lat0 = 42.3;
const pts = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [1.5, -1]].map(([x, y]) => [Math.round((lon0 + x * 0.001) * Q), Math.round((lat0 + y * 0.001) * Q)]);
const ox = Math.min(...pts.map((p) => p[0])), oy = Math.min(...pts.map((p) => p[1]));
const nodes = [];
let px = ox, py = oy;
for (const [x, y] of pts) { nodes.push(x - px, y - py); px = x; py = y; }
const g = new RoadGraph({ v: 1, origin: [ox, oy], nodes, edges: [] });
const metres = (a, b) => g.metres([pts[a][0] / Q, pts[a][1] / Q], [pts[b][0] / Q, pts[b][1] / Q]);
const edge = (a, b, cls, flags, oneway = 0) => [a, b, CLASSES.indexOf(cls), flags, oneway, metres(a, b), ""];
const both = F.walk | F.drive;
const packed = {
  v: 1, origin: [ox, oy], nodes,
  edges: [
    edge(0, 1, "minor", both), edge(1, 2, "minor", both),
    edge(2, 4, "minor", both, 1), edge(4, 3, "minor", both, 1),
    edge(0, 3, "path", F.walk),
    edge(1, 5, "motorway", F.drive | F.interstate), edge(5, 2, "motorway", F.drive | F.interstate)
  ]
};
const at = (i, dx = 0, dy = 0) => [pts[i][0] / Q + dx, pts[i][1] / Q + dy];

test("walkers take the footpath and go against one-way streets", () => {
  const r = new RoadGraph(packed).route(at(0), at(3), "walk");
  assert.ok(r);
  assert.ok(Math.abs(r.metres - metres(0, 3)) < 1, `walked ${r.metres} m`);
  assert.equal(r.interstateMetres, 0);
});

test("drivers keep to roads and the one way round", () => {
  const g2 = new RoadGraph(packed);
  const r = g2.route(at(0), at(3), "drive");
  assert.ok(r, "a drive exists");
  // n0 -> n1 -> n2 -> n4 -> n3: round by the one-way street, not up the footpath.
  assert.ok(r.metres > metres(0, 3) * 2, `drove ${r.metres} m`);
  // n3 to n4 is against the one way, and the footpath is for walkers: no drive.
  assert.equal(g2.route(at(3), at(4), "drive"), null);
  assert.ok(g2.route(at(3), at(4), "walk"));
});

test("time is distance over the mode's speed, interstates at 55", () => {
  const r = new RoadGraph(packed).route(at(1), at(2, 0, -0.0002), "drive");
  assert.ok(r);
  const mph = (m, s) => (m / s) / 0.44704;
  assert.ok(mph(r.metres, r.seconds) <= SPEEDS.interstate + 0.01);
  const walk = new RoadGraph(packed).route(at(0), at(2), "walk");
  assert.ok(Math.abs(mph(walk.metres, walk.seconds) - SPEEDS.walk) < 0.01);
});

test("an era closes roads its rule matches and opens its own, joined to the rest", () => {
  // 1986: the interstate is not built; a period road from near n0 to near n5 is.
  const era = {
    hiddenRoads: ["all", ["==", ["get", "class"], "motorway"], ["within", { type: "Polygon", coordinates: [[[-71.2, 42.2], [-71.0, 42.2], [-71.0, 42.4], [-71.2, 42.4], [-71.2, 42.2]]] }]],
    extraRoads: { type: "FeatureCollection", features: [{ type: "Feature", properties: { class: "motorway", network: "us-interstate" }, geometry: { type: "LineString", coordinates: [at(0, 0.0001, 0), at(5, 0, 0.0001)] } }] }
  };
  const g2 = new RoadGraph(packed, era);
  assert.ok(!g2.edges.some((e) => e.cls === "motorway" && e.line.length === 2 && e.a === 1), "the modern interstate is closed");
  const r = g2.route(at(0), at(5), "drive");
  assert.ok(r && r.interstateMetres > 0, "the period road is driven");
});

test("the era rule language covers what the cities use", () => {
  const props = { class: "motorway", brunnel: "tunnel", ramp: 1 };
  const box = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
  assert.equal(evaluate(["any", ["in", ["coalesce", ["get", "name"], ""], ["literal", ["X"]]], ["all", ["to-boolean", ["get", "ramp"]], ["==", ["get", "brunnel"], "tunnel"]]], props, []), true);
  assert.equal(evaluate(["within", box], props, [[1, 1], [2, 2]]), true);
  assert.equal(evaluate(["within", box], props, [[1, 1], [20, 2]]), false);
  assert.equal(evaluate(["in", ["get", "class"], ["literal", ["motorway", "trunk"]]], props, []), true);
  assert.throws(() => evaluate(["zoom"], props, []));
});
