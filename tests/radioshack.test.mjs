// The Radio Shack's stock: prices in pennies to dollars, scrap for crafting, radio data.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = { system: { id: "dnd5e" } };
const { CATALOG, catalogItems, priceInCoins, scrapValue, makeRadioShack, repairRadioShacks, stockRadioShack } = await import("../scripts/radioshack.mjs");

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

function shopWith(items = []) {
  const shop = {
    uuid: "Actor.radio", name: "Radio Shack", img: "my-logo.webp", items: structuredClone(items),
    flags: { "item-piles": { data: { type: "merchant", enabled: true } } },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split(".");
        let obj = this;
        for (const key of keys.slice(0, -1)) obj = obj[key] ??= {};
        obj[keys.at(-1)] = value;
      }
    },
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "Item");
      this.items.push(...structuredClone(data).map((i, n) => ({ ...i, _id: `new${this.items.length + n}` })));
    }
  };
  Object.defineProperty(shop.items, "size", { get() { return this.length; } });
  return shop;
}

function world(actors = []) {
  game.user = { id: "gm", isGM: true, viewedScene: "Scene.city" };
  game.users = { activeGM: { id: "gm" } };
  game.actors = actors;
  globalThis.fromUuid = async (uuid) => game.actors.find((a) => a.uuid === uuid);
  game.itempiles = { API: { async createItemPile(options) {
    const shop = shopWith();
    await shop.update(options.actorOverrides);
    // Reproduce Item Piles' _id-keyed reduction: ID-less entries overwrite each other.
    const byId = Object.fromEntries((options.items ?? []).map((item) => [item._id, item]));
    shop.items.push(...Object.values(byId));
    game.actors.push(shop);
    return { actorUuid: shop.uuid };
  } } };
}

test("creating the merchant stocks all 49 distinct items through Foundry", async () => {
  world();
  const shop = await makeRadioShack();
  assert.equal(shop.items.size, 49);
  assert.equal(new Set(shop.items.map((i) => i.name)).size, 49);
  assert.equal(new Set(shop.items.map((i) => i._id)).size, 49);
  assert.equal(game.actors.length, 1);
});

test("repair restores 48 missing entries without duplicating the merchant or replacing edits", async () => {
  const remaining = { ...catalogItems().at(-1), _id: "original", system: { quantity: 7, price: { value: 123, denomination: "gp" } } };
  const shop = shopWith([remaining]);
  world([shop]);
  assert.equal(await repairRadioShacks(), 48);
  assert.deepEqual(shop.items[0], remaining);
  assert.equal(shop.img, "my-logo.webp");
  assert.equal(shop.items.size, 49);
  assert.equal(await repairRadioShacks(), 0);
  assert.equal(await makeRadioShack(), shop);
  assert.equal(shop.items.size, 49);
  assert.equal(game.actors.length, 1);
});

test("automatic repair leaves customized inventories and other GM clients alone", async () => {
  const shop = shopWith([catalogItems().at(-1), { name: "Custom repair kit" }]);
  world([shop]);
  assert.equal(await repairRadioShacks(), 0);
  shop.items.pop();
  game.users.activeGM.id = "other";
  assert.equal(await repairRadioShacks(), 0);
  assert.equal(shop.items.size, 1);
});

test("partial insertion reports failure and a retry adds only what is still missing", async () => {
  const shop = shopWith();
  world([shop]);
  const create = shop.createEmbeddedDocuments;
  shop.createEmbeddedDocuments = async function(type, data) { await create.call(this, type, data.slice(0, 1)); };
  await assert.rejects(stockRadioShack(shop), /incomplete/);
  assert.equal(shop.flags["kg-cities"]?.radioShackStockVersion, undefined);
  shop.createEmbeddedDocuments = create;
  assert.equal(await stockRadioShack(shop), 48);
  assert.equal(shop.items.size, 49);
});
