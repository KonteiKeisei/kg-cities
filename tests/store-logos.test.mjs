import test from "node:test";
import assert from "node:assert/strict";
import { setStoreLogo, storeLogo, withStoreLogo } from "../scripts/store-logos.mjs";

test("brand logos reach all cities and source chains while preserving cards and unrelated stores", () => {
  const cities = {
    boston: { removed: ["old-place"], list: [
      { id: "b1", chain: "walgreens", name: "Brooks Drug", known: "Custom card", actors: ["Actor.clerk"] },
      { id: "b2", chain: "riteaid", name: "Brooks Drug", icon: "old.webp" },
      { id: "b3", chain: "cvs", name: "CVS", icon: "cvs.webp" }
    ] },
    ny: { list: [{ id: "n1", chain: "riteaid", name: "Brooks Drug" }, { id: "n2", name: "Brooks Drug" }] }
  };
  const original = structuredClone(cities);
  const { landmarks, updated } = withStoreLogo(cities, "Brooks Drug", "brooks.webp");
  assert.equal(updated, 3);
  assert.deepEqual(landmarks.boston.removed, ["old-place"]);
  assert.equal(landmarks.boston.list[0].known, "Custom card");
  assert.deepEqual(landmarks.boston.list[0].actors, ["Actor.clerk"]);
  assert.equal(landmarks.boston.list[1].icon, "brooks.webp");
  assert.equal(landmarks.ny.list[0].icon, "brooks.webp");
  assert.equal(landmarks.boston.list[2].icon, "cvs.webp");
  assert.equal(landmarks.ny.list[1].icon, undefined);
  assert.deepEqual(cities, original);
});

test("bank logos also cover their ATMs and renamed locations sharing the merchant", () => {
  const cities = { boston: { removed: ["old-place"], list: [
    { chain: "bank", bank: "BayBank", name: "BayBank ATM", atm: true },
    { chain: "radioshack", name: "Downtown Electronics", chainActor: "Actor.radio" }
  ] } };
  assert.equal(withStoreLogo(cities, "BayBank", "bank.webp").landmarks.boston.list[0].icon, "bank.webp");
  assert.equal(withStoreLogo(cities, "Radio Shack", "radio.webp", "Actor.radio").landmarks.boston.list[1].icon, "radio.webp");
});

test("saving a logo persists it for future placements and updates merchant and scene tokens", async () => {
  const saved = { landmarks: { boston: { removed: ["old-place"], list: [{ chain: "radioshack", name: "Radio Shack" }] } } };
  const updates = [], tokenUpdates = [];
  globalThis.game = {
    user: { isGM: true },
    settings: { get: (_, k) => saved[k], set: async (_, k, value) => { saved[k] = value; } },
    scenes: [{ tokens: [{ id: "shop", actorId: "radio" }, { id: "other", actorId: "cvs" }],
      updateEmbeddedDocuments: async (type, data) => tokenUpdates.push({ type, data }) }]
  };
  const actor = { id: "radio", uuid: "Actor.radio", flags: { "item-piles": { data: { type: "merchant" } } }, update: async (v) => updates.push(v) };
  assert.equal(await setStoreLogo("Radio Shack", "logos\\radio.webp", actor), 1);
  assert.equal(storeLogo("radio shack"), "logos/radio.webp");
  assert.equal(saved.landmarks.boston.list[0].icon, "logos/radio.webp");
  assert.deepEqual(updates[0], { img: "logos/radio.webp", "prototypeToken.texture.src": "logos/radio.webp", "flags.item-piles.data.merchantImage": "logos/radio.webp" });
  assert.deepEqual(tokenUpdates, [{ type: "Token", data: [{ _id: "shop", "texture.src": "logos/radio.webp" }] }]);
  game.user.isGM = false;
  await assert.rejects(setStoreLogo("CVS", "cvs.webp"), /Only the GM/);
});
