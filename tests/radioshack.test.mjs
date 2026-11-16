// The Radio Shack's stock: prices in pennies to dollars, scrap for crafting, radio data.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = { system: { id: "dnd5e" } };
const { CATALOG, catalogItems, priceInCoins, scrapValue } = await import("../scripts/radioshack.mjs");

const all = CATALOG.flatMap(([, list]) => list);

test("prices are written in the largest coin they are a whole number of", () => {
  assert.deepEqual(priceInCoins(799), { value: 799, denomination: "pp" });
  assert.deepEqual(priceInCoins(0.75), { value: 3, denomination: "gp" });
  assert.deepEqual(priceInCoins(0.3), { value: 3, denomination: "ep" });
  assert.deepEqual(priceInCoins(19.95), { value: 399, denomination: "sp" });
  assert.deepEqual(priceInCoins(3.49), { value: 349, denomination: "cp" });
  assert.deepEqual(priceInCoins(39.98), { value: 3998, denomination: "cp" });
});

test("scrap is 1 per $10, at least 1", () => {
  assert.equal(scrapValue(799), 80);
  assert.equal(scrapValue(4.95), 1);
  assert.equal(scrapValue(1.99), 1);
  assert.equal(scrapValue(219.95), 22);
});

test("the approved list: 49 things, each priced, described, and scrap", () => {
  assert.equal(all.length, 49);
  assert.equal(new Set(all.map((i) => i.name)).size, 49, "no name twice");
  const items = catalogItems();
  for (const it of items) {
    assert.ok(it.system.price.value > 0, it.name);
    assert.ok(it.system.description.value.length > 20, it.name);
    assert.deepEqual(Object.keys(it.flags["kg-cities"].scrap), ["kind", "value"]);
    assert.equal(it.flags["kg-cities"].scrap.kind, "electronics");
    assert.ok(it.flags["item-piles"].item.customCategory);
  }
});

test("pairs are sold singly at half price; anything on the air carries its range", () => {
  const by = (n) => all.find((i) => i.name.startsWith(n));
  assert.equal(by("Realistic TRC-500").price, 39.98);
  assert.equal(by("FM wireless intercom").price, 19.98);
  assert.equal(by("Realistic TRC-217").radio.channels, 40);
  assert.equal(by("Realistic PRO-2004").radio.transmits, false);
  assert.equal(by("Wireless FM tie-clip").radio.receives, false);
  assert.equal(by("FM wireless intercom").radio.via, "wiring");
  for (const i of all.filter((x) => x.radio)) for (const k of ["range", "cityRange", "channels", "transmits", "receives"]) assert.ok(k in i.radio, `${i.name} ${k}`);
  assert.equal(all.filter((x) => x.radio).length, 13);
});
