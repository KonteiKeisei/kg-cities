import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addressFinder, buildIndex, decodeStreet, normalize, search } from "../scripts/search.mjs";
import { buildPlaces, compileCorrections } from "../scripts/places.mjs";

const streets = JSON.parse(readFileSync(new URL("../data/search/streets.json", import.meta.url)));
const addresses = JSON.parse(readFileSync(new URL("../data/search/addresses.json", import.meta.url)));
const osm = JSON.parse(readFileSync(new URL("../data/pois/osm.json", import.meta.url)));
const fixes = compileCorrections(JSON.parse(readFileSync(new URL("../data/pois/1986.json", import.meta.url))));
const landmarks = JSON.parse(readFileSync(new URL("../data/landmarks/seed.json", import.meta.url)));
const bounds = { north: 42.4685, south: 42.1942, west: -71.2699, east: -70.9492 };
const entries = buildIndex({ streets, places: buildPlaces(osm, fixes), landmarks, bounds });
const findAddress = addressFinder(streets, addresses);

test("abbreviations and punctuation do not matter", () => {
  assert.equal(normalize("Mass. Ave"), "massachusetts avenue");
  assert.equal(normalize("Salem St"), normalize("Salem Street"));
  assert.equal(normalize("Caffé Vittoria"), "caffe vittoria");
});

test("a street is found by its short name, once per neighbourhood it runs through", () => {
  const hits = search(entries, "salem st");
  assert.equal(hits[0].type, "street");
  assert.equal(hits[0].name, "Salem Street");
  const north = hits.find((h) => h.sub.includes("North End"));
  assert.ok(north, hits.map((h) => h.sub).join(" / "));
  const lines = decodeStreet(streets[north.street]).lines;
  assert.ok(lines.length && lines.every((l) => l.length >= 2));
});

test("landmarks and places come up by name; 1986 names, not today's", () => {
  assert.equal(search(entries, "old north")[0].name, "Old North Church");
  assert.ok(search(entries, "jordan marsh").some((h) => h.name === "Jordan Marsh"));
  assert.ok(!search(entries, "td garden").some((h) => h.name === "TD Garden"));
  assert.ok(search(entries, "boston garden").some((h) => h.name === "Boston Garden"));
});

test("an address finds the house number on that street", () => {
  // Two on the map: the North End's (filed under Salem Court, the side street it is nearer) and Malden's.
  const hits = search(entries, "193 Salem St", { findAddress }).filter((h) => h.type === "address");
  assert.ok(hits.length >= 2, JSON.stringify(hits));
  assert.ok(hits.every((h) => h.name === "193 Salem Street"));
  const northEnd = hits.find((h) => Math.abs(h.point[1] - 42.3664) < 0.002 && Math.abs(h.point[0] + 71.0548) < 0.002);
  assert.ok(northEnd, hits.map((h) => `${h.sub} ${h.point}`).join(" / "));
  assert.match(northEnd.sub, /North End/);
});

test("nothing off the map is found", async () => {
  // On the original City of Boston view, Lexington's Massachusetts Avenue is off the map.
  const { SCENE_BOUNDS } = await import("../scripts/geo.mjs");
  const city = buildIndex({ streets, bounds: SCENE_BOUNDS });
  const hits = search(city, "massachusetts avenue", { limit: 50 });
  assert.ok(hits.some((h) => /Back Bay|South End|Cambridge|Central Square/.test(h.sub)), hits.map((h) => h.sub).join(" / "));
  assert.deepEqual(hits.filter((h) => h.sub.includes("Lexington")), []);
});
