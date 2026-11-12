import test from "node:test";
import assert from "node:assert/strict";
import { CHAINS, defaultActor, placeStores, removeChain, splitStores, storesOf } from "../scripts/chains.mjs";

test("some Walgreens stay Walgreens, spread out, the same ones each time", () => {
  const stores = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, lat: 42 + i / 100, lon: -71 }));
  const a = splitStores(stores, 3), b = splitStores([...stores].reverse(), 3);
  assert.equal(a.kept.length, 3);
  assert.equal(a.rest.length, 7);
  assert.deepEqual(a.kept.map((s) => s.id), b.kept.map((s) => s.id));
  assert.deepEqual(splitStores(stores, 0).kept, []);
  assert.equal(splitStores(stores, 99).rest.length, 0);
});

const cvs = CHAINS.find((c) => c.key === "cvs"), wag = CHAINS.find((c) => c.key === "walgreens");
const places = [
  { id: "p1", name: "CVS Pharmacy", lat: 42.35, lon: -71.06 },
  { id: "p2", name: "CVS", lat: 42.35001, lon: -71.06001 }, // its pharmacy counter, mapped apart
  { id: "p3", name: "CVS Pharmacy", lat: 42.20, lon: -71.00 }, // Braintree
  { id: "p4", name: "Walgreens", lat: 42.37, lon: -71.10 },
  { id: "p5", name: "CVSquare Deli", lat: 42.36, lon: -71.05 },
  { id: "p6", name: "CVS Pharmacy", lat: 43.5, lon: -71.0 } // off the map
];
const box = { north: 42.6, south: 42.1, west: -71.4, east: -70.9 };

test("today's stores of a chain, each once, on the map only", () => {
  assert.deepEqual(storesOf(places, cvs, box).map((p) => p.id), ["p1", "p3"]);
  assert.deepEqual(storesOf(places, wag, box).map((p) => p.id), ["p4"]);
});

test("the shop actor is found by name, a shop before a character", () => {
  const actors = [{ name: "Brooks McAllister", type: "character" }, { name: "Brooks Drug", type: "npc" }, { name: "CVS", type: "npc" }];
  assert.equal(defaultActor(actors, wag).name, "Brooks Drug");
  assert.equal(defaultActor(actors, cvs).name, "CVS");
  assert.equal(defaultActor([], cvs), null);
});

test("stores become points of interest once; running again updates them and keeps the card", () => {
  const plan = [{ chain: "cvs", stores: storesOf(places, cvs, box), name: "CVS", actorUuid: "Actor.cvs", icon: "tokens/cvs.webp" }];
  const first = placeStores([{ id: "x", name: "Fenway Park" }], plan);
  assert.equal(first.added, 2);
  const store = first.list.find((l) => l.placeId === "p1");
  assert.deepEqual(store.actors, ["Actor.cvs"]);
  assert.equal(store.icon, "tokens/cvs.webp");
  assert.equal(store.glow, false);
  store.known = "<p>Open till 9.</p>";
  store.actors.push("Actor.clerk");
  const again = placeStores(first.list, [{ ...plan[0], actorUuid: "Actor.cvs2", icon: "tokens/cvs2.webp" }]);
  assert.equal(again.added, 0);
  assert.equal(again.updated, 2);
  const s2 = again.list.find((l) => l.placeId === "p1");
  assert.equal(s2.known, "<p>Open till 9.</p>");
  assert.deepEqual(s2.actors, ["Actor.cvs2", "Actor.clerk"]);
  assert.equal(again.list.length, 3);
  assert.deepEqual(removeChain(again.list, "cvs").list.map((l) => l.id), ["x"]);
});
