import test from "node:test";
import assert from "node:assert/strict";
import { CHAINS, assignNames, chainsFor, parseNames, placeStores, shareStores, storesOf } from "../scripts/chains.mjs";
import { BOX_SIZES, MONTH, accountOf, boxBills, boxRentDue, boxRentsDue, credit, debit, makeAccount, openAccount, putInWallet, takeFromWallet, walletDollars } from "../scripts/bank-core.mjs";
import { homeBills, makeHome } from "../scripts/payroll-core.mjs";
import { walletValue } from "../scripts/money.mjs";

const bofa = CHAINS.find((c) => c.key === "bos-bofa");
const box = { north: 42.6, south: 42.1, west: -71.4, east: -70.9 };

test("each city gets its own banks, and every city the drugstores", () => {
  const boston = chainsFor("boston").map((c) => c.key), chicago = chainsFor("chicago").map((c) => c.key);
  assert.ok(boston.includes("bos-bofa") && boston.includes("cvs") && boston.includes("radioshack"));
  assert.ok(!boston.includes("chi-chase"));
  assert.ok(chicago.includes("chi-chase") && !chicago.includes("bos-bofa"));
});

test("an ATM in its branch is the branch; one on its own stays, as an ATM", () => {
  const places = [
    { id: "a1", name: "Bank of America", kind: "atm", lat: 42.35001, lon: -71.06001 }, // listed first, in the branch
    { id: "b1", name: "Bank of America", kind: "bank", lat: 42.35, lon: -71.06 },
    { id: "a2", name: "Bank of America", kind: "atm", lat: 42.40, lon: -71.10 }, // in a supermarket
    { id: "x", name: "Bank of America Pavilion", kind: "music_venue", lat: 42.34, lon: -71.04 }
  ];
  const stores = storesOf(places, bofa, box);
  assert.deepEqual(stores.map((s) => s.id), ["b1", "a2"]);
  const { list } = placeStores([], [{ chain: bofa.key, group: "bank", stores, name: "BayBank", actorUuid: null, icon: null }]);
  assert.equal(list.find((l) => l.placeId === "b1").name, "BayBank");
  assert.equal(list.find((l) => l.placeId === "b1").atm, false);
  assert.equal(list.find((l) => l.placeId === "a2").name, "BayBank ATM");
  assert.equal(list.find((l) => l.placeId === "a2").atm, true);
  assert.ok(list.every((l) => l.bank === "BayBank"));
});

test("several 1986 names share the branches out across the map, the same each time", () => {
  const stores = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, lat: 42 + i / 100, lon: -71 }));
  const a = shareStores(stores, 3), b = shareStores([...stores].reverse(), 3);
  assert.deepEqual(a.map((x) => x.length), [3, 2, 2]);
  assert.deepEqual(a.map((x) => x.map((s) => s.id)), b.map((x) => x.map((s) => s.id)));
  assert.deepEqual(parseNames(" Bank of Boston, BayBank,, BayBank ", ["x"]), ["Bank of Boston", "BayBank"]);
  assert.deepEqual(parseNames("", ["Shawmut"]), ["Shawmut"]);
});

test("a re-run keeps each placed branch's 1986 name; new ones are shared out", () => {
  const stores = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, lat: 42 + i / 100, lon: -71 }));
  const names = ["Bank of Boston", "BayBank", "Shawmut"];
  const before = new Map([["s0", "Shawmut"], ["s3", "Shawmut"]]);
  const out = assignNames([...stores, { id: "new", lat: 41, lon: -71 }], names, before);
  assert.ok(["s0", "s3"].every((id) => out[2].some((s) => s.id === id)), "placed Shawmuts stay Shawmut");
  assert.ok(!out[0].some((s) => s.id === "s0" || s.id === "s3"));
  assert.equal(out.flat().length, 5);
  assert.equal(new Set(out.flat().map((s) => s.id)).size, 5);
  // A name no longer listed lets its stores be shared out again.
  assert.equal(assignNames(stores, ["BayBank"], before)[0].length, 4);
});

test("Boston's banks are sourced; other cities' are marked unchecked", () => {
  assert.ok(CHAINS.filter((c) => c.group === "bank" && c.cities.includes("boston")).every((c) => !c.unchecked));
  assert.ok(CHAINS.filter((c) => c.group === "bank" && !c.cities.includes("boston")).every((c) => c.unchecked));
});

test("an account opens free, takes deposits and withdrawals, and refuses an overdraft", () => {
  let acc = openAccount("BayBank", { time: 100, where: "1 Main St", random: () => 0.5 });
  assert.equal(acc.balance, 0);
  assert.match(acc.number, /^0\d\d-\d{6}-\d$/);
  acc = credit(acc, 125.5, { time: 200 });
  acc = debit(acc, 25.25, { time: 300 });
  assert.equal(acc.balance, 100.25);
  assert.equal(acc.log[0].amount, -25.25);
  assert.throws(() => debit(acc, 500), /Only \$100\.25/);
  assert.throws(() => credit(acc, 0));
  assert.equal(accountOf({ flags: { "kg-cities": { bank: acc } } }).balance, 100.25);
  assert.equal(accountOf({}), null);
});

test("cash moves between the wallet and the account at the dollar rate, big sums at once", () => {
  const wallet = { pp: 10000, gp: 3, sp: 0, ep: 0, cp: 7 }; // $10,000.307 at 1000 copper a dollar
  const t = Date.now();
  const after = takeFromWallet(wallet, 10000, 1000);
  assert.ok(Date.now() - t < 50, "a $10,000 deposit is quick");
  assert.equal(walletValue(after), 307);
  assert.equal(takeFromWallet(wallet, 20000, 1000), null);
  assert.equal(walletDollars(putInWallet({}, 40, 100), 100), 40);
});

test("a box's rent is due a month after it is rented, and every month after", () => {
  const b = { id: "b", number: "214", size: "small", fee: BOX_SIZES.small.fee, bank: "BayBank", next: 1000 };
  assert.deepEqual(boxRentDue(b, 999).months, []);
  const due = boxRentDue(b, 1000 + MONTH * 2);
  assert.equal(due.months.length, 3);
  assert.equal(due.next, 1000 + MONTH * 3);
  const acc = makeAccount({ bank: "BayBank", boxes: [b, { ...b, id: "c", number: "215", next: 5e9 }] });
  const rents = boxRentsDue(acc, 1000 + MONTH);
  assert.equal(rents.lines.length, 1);
  assert.equal(rents.lines[0].amount, BOX_SIZES.small.fee * 2);
  assert.match(rents.lines[0].label, /Box|box 214, BayBank × 2 months/);
  assert.equal(rents.boxes.find((x) => x.id === "b").next, 1000 + MONTH * 2);
});

test("the budget counts a box's rent without the household keeping it", () => {
  const acc = makeAccount({ bank: "BayBank", boxes: [{ id: "b", number: "214", size: "medium", bank: "BayBank" }] });
  const plain = homeBills(makeHome({})), withBox = homeBills(makeHome({}), { monthly: boxBills(acc) });
  assert.equal(withBox.monthly.length, plain.monthly.length + 1);
  assert.ok(withBox.perWeek > plain.perWeek);
  assert.equal(makeHome({ extras: [] }).extras.length, 0);
});
