import test from "node:test";
import assert from "node:assert/strict";

let finishRender, saved = [], actorCreates = 0;
const content = { innerHTML: "", listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
globalThis.innerWidth = 1000;
globalThis.innerHeight = 600;
globalThis.Actor = { create() { actorCreates++; throw new Error("Banks must not create actors"); } };
globalThis.game = {
  actors: [], user: { isGM: true }, modules: new Map(),
  settings: { get: () => ({}) }
};
globalThis.ui = { notifications: { info() {}, error(message) { throw new Error(message); } } };
globalThis.fromUuidSync = (uuid) => game.actors.find((a) => a.uuid === uuid);
globalThis.foundry = {
  utils: { escapeHTML: (s) => String(s).replaceAll('"', "&quot;") },
  applications: { api: { ApplicationV2: class {
    constructor(options) { this.options = options; this.rendered = false; }
    render() {
      return new Promise((resolve) => {
        finishRender = () => {
          this.element = { querySelector: () => content };
          this._replaceHTML("", content);
          this.rendered = true;
          resolve(this);
        };
      });
    }
    bringToFront() { assert.ok(this.element, "window must exist before bringToFront"); }
  } } }
};
const { openChainStores } = await import("../scripts/ui-chains.mjs");
const raw = [
  { id: "branch", name: "Bank of America", kind: "bank", lat: 42.35, lon: -71.06 },
  { id: "atm", name: "Bank of America ATM", kind: "atm", lat: 42.36, lon: -71.07 }
];
const deps = { city: () => "boston", bounds: () => null, places: { raw },
  landmarks: { get list() { return saved; }, async save(list) { saved = list; } } };
const click = (dataset) => content.listeners.click({ target: { closest: () => ({ dataset }) } });

test("opening waits for render and repeated clicks reuse the pending window", async () => {
  let app;
  assert.doesNotThrow(() => { app = openChainStores(deps); });
  assert.equal(app.element, undefined);
  assert.equal(openChainStores(deps), app);
  assert.ok(app.options.position.height < innerHeight);
  finishRender();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(app.rendered);
});

test("banks need no actors and place working bank and ATM metadata with default badges", async () => {
  await click({ act: "tab", value: "bank" });
  assert.match(content.innerHTML, /No bank actors are needed/);
  assert.match(content.innerHTML, /Bank logos/);
  assert.doesNotMatch(content.innerHTML, /<select|data-f="actor"|data-f="useToken"/);
  assert.match(content.innerHTML, /data-act="logo"/);
  await click({ act: "place" });
  assert.equal(saved.length, 2);
  assert.ok(saved.every((p) => p.bank && !p.chainActor));
  assert.equal(saved.find((p) => p.atm).icon, "modules/kg-cities/assets/banks/atm.svg");
  assert.equal(saved.find((p) => !p.atm).icon, "modules/kg-cities/assets/banks/bank.svg");
  assert.equal(actorCreates, 0);
});

test("bank placement keeps an existing actor link without exposing a required selector", async () => {
  const linked = saved[0];
  linked.chainActor = "Actor.bank";
  linked.actors = ["Actor.bank", "Actor.clerk"];
  linked.known = "Keep this card";
  game.actors.push({ uuid: "Actor.bank", name: linked.bank, prototypeToken: { texture: { src: "custom.webp" } } });
  const app = openChainStores(deps);
  app.rows = {};
  finishRender();
  await new Promise((resolve) => setImmediate(resolve));
  await click({ act: "place" });
  const result = saved.find((p) => p.id === linked.id);
  assert.equal(result.chainActor, "Actor.bank");
  assert.deepEqual(result.actors, ["Actor.bank", "Actor.clerk"]);
  assert.equal(result.known, "Keep this card");
  assert.doesNotMatch(content.innerHTML, /<select/);
});
