import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlaces, compileCorrections } from "../scripts/places.mjs";

const osm = [
  { id: "9001", name: "Hunt's Photo & Video", kind: "photo", lat: 42.3487, lon: -71.0957 },
  { id: "9002", name: "9/11 Memorial", kind: "memorial", lat: 42.36, lon: -71.05 },
  { id: "9003", name: "9/11 Memorial", kind: "memorial", lat: 42.37, lon: -71.02 },
  { id: "9004", name: "Union Oyster House", kind: "restaurant", lat: 42.3613, lon: -71.0569 }
];
const none = compileCorrections({});

test("an edit made on other map data finds its place again by name", () => {
  // Shaped as KG Boston Map saved them: ids from its own data, the original name in base.
  const gm = { edits: {
    "poi:17603026266013": { name: "Rathskeller", kind: "nightclub", hidden: false, note: "", base: "Hunt's Photo & Video" },
    "poi:35185197727848": { hidden: true, base: { name: "9/11 Memorial", kind: "monument" } }
  } };
  const out = buildPlaces(osm, none, gm, { businesses: "show" });
  const rat = out.find((p) => p.id === "9001");
  assert.equal(rat.name, "Rathskeller");
  assert.equal(rat.editKey, "poi:17603026266013");
  assert.ok(out.filter((p) => p.base.name === "9/11 Memorial").every((p) => p.hidden), "every place of that name takes the edit");
  assert.equal(out.find((p) => p.id === "9004").edited, false);
});

test("an edit keyed by the place's own id wins and has no editKey", () => {
  const gm = { edits: { "9004": { name: "Ye Olde Union Oyster House", base: { name: "Union Oyster House" } } } };
  const p = buildPlaces(osm, none, gm).find((x) => x.id === "9004");
  assert.equal(p.name, "Ye Olde Union Oyster House");
  assert.equal(p.editKey, undefined);
});
