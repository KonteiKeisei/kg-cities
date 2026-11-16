// The payroll's clock run with safe deposit boxes: their rent comes with the bills, on its own
// day, living costs on or off, and what the wallet can't cover is owed. Foundry is stood in for.
import test from "node:test";
import assert from "node:assert/strict";
import { MONTH } from "../scripts/bank-core.mjs";

const DAY = 86400;
const messages = [];
const setPath = (obj, path, v) => { const k = path.split("."); let o = obj; for (const p of k.slice(0, -1)) o = o[p] ??= {}; o[k.at(-1)] = v; };
const actors = [];
globalThis.game = {
  user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" }, filter: () => [] },
  time: { worldTime: 0 }, actors, settings: { get: () => { throw new Error("unset"); } }, i18n: { localize: (s) => s }
};
globalThis.foundry = { utils: { escapeHTML: (s) => String(s), hasProperty: () => false, randomID: () => "id" } };
globalThis.ChatMessage = { create: async (m) => messages.push(m) };

const { Payroll } = await import("../scripts/payroll.mjs");
const payroll = new Payroll({ dollarRate: () => 1000 });

function character(name, { home, gp = 0, boxNext = 10 * DAY }) {
  const a = {
    name, type: "character", hasPlayerOwner: true,
    system: { currency: { pp: 0, gp, ep: 0, sp: 0, cp: 0 } },
    flags: { "kg-cities": {
      payroll: { jobs: [], home },
      bank: { bank: "BayBank", number: "011-222333-4", balance: 0, log: [], boxes: [{ id: "b", number: "214", size: "medium", fee: 4, bank: "BayBank", branch: { name: "100 Federal Street" }, vault: "Actor.v", next: boxNext }] }
    } },
    testUserPermission: () => true,
    async update(changes) { for (const [k, v] of Object.entries(changes)) setPath(this, k, structuredClone(v)); }
  };
  actors.push(a);
  return a;
}
const run = async (t) => { game.time.worldTime = t; messages.length = 0; await payroll.runDue(); };
const box = (a) => a.flags["kg-cities"].bank.boxes[0];
const wallet = (a) => a.system.currency.gp / 10 + a.system.currency.pp; // dollars at 1000 copper

test("living costs off: the box's rent is still charged, once a month, from the wallet", async () => {
  actors.length = 0;
  const a = character("Off", { home: { on: false }, gp: 100 }); // $10
  await run(9 * DAY);
  assert.equal(messages.length, 0, "nothing due before its day");
  await run(10 * DAY);
  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /Safe deposit box 214, BayBank/);
  assert.equal(wallet(a), 6);
  assert.equal(box(a).next, 10 * DAY + MONTH);
  await run(10 * DAY + 1);
  assert.equal(messages.length, 0, "not charged twice");
});

test("living costs on: one bill with the rent and the box", async () => {
  actors.length = 0;
  const home = { on: true, housing: "rent", hood: "dorchester", housingCost: 100, utilities: 0, food: "low", people: 1, next: 50 * DAY, rentNext: 10 * DAY };
  const a = character("On", { home, gp: 2000 }); // $200
  await run(10 * DAY);
  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /Rent, /);
  assert.match(messages[0].content, /Safe deposit box 214/);
  assert.equal(wallet(a), 200 - 100 - 4);
});

test("a short wallet: everything it holds is paid, the rest is owed", async () => {
  actors.length = 0;
  const a = character("Short", { home: { on: false }, gp: 10 }); // $1
  await run(10 * DAY);
  assert.equal(wallet(a), 0);
  assert.equal(a.flags["kg-cities"].payroll.home.owed, 3);
  assert.match(messages[0].content, /Short: owed/);
});
