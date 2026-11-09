import test from "node:test";
import assert from "node:assert/strict";
import { findPlaceLinks, placeReference, placeTarget, placeToken } from "../scripts/place-links.mjs";

test("a place link survives ids with colons and names with braces", () => {
  const ref = { kind: "landmark", city: "boston", id: "seed:GSblbNOXMBm3gGlu" };
  const token = placeToken(ref, "Boston {Common}");
  assert.equal(token, "@CityPlace[boston:seed%3AGSblbNOXMBm3gGlu]{Boston  Common }");
  const target = token.match(/\[([^\]]+)\]/)[1];
  assert.deepEqual(placeReference(target), ref);
  assert.equal(placeTarget(ref), target);
});

test("bad place targets are refused", () => {
  assert.equal(placeReference("boston"), null);
  assert.equal(placeReference("a:b:c"), null);
  assert.equal(placeReference("%E0%A4%A:x"), null);
  assert.equal(placeTarget({ kind: "realm", city: "x", id: "y" }), null);
});

test("place search ranks exact, then prefix, then word, then contains", () => {
  const e = (name) => ({ name, where: "Point of interest, Boston", ref: { kind: "landmark", city: "boston", id: name } });
  const found = findPlaceLinks("hall", [e("Old City Hall"), e("Hall of Flags"), e("Faneuil Hall"), e("Hall"), e("Marshall Inn")]);
  assert.deepEqual(found.map((f) => f.name), ["Hall", "Hall of Flags", "Faneuil Hall", "Old City Hall", "Marshall Inn"]);
});
