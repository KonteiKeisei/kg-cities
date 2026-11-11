import test from "node:test";
import assert from "node:assert/strict";
import { OLD_MODELS, coinCopper, duplicates, formatNumber, freeNumber, fromOldBook, fromOldLog, mergeBooks, pageFor, putContact, reach, sameNumber } from "../scripts/phone-core.mjs";

test("numbers format as dialled in 1986", () => {
  assert.equal(formatNumber("5550142"), "555-0142");
  assert.equal(formatNumber("617 555 0142"), "(617) 555-0142");
  assert.equal(formatNumber("16175550142"), "1 (617) 555-0142");
  assert.equal(formatNumber("911"), "911");
});

test("a local call matches a number given with its area code", () => {
  assert.ok(sameNumber("555-0142", "(617) 555-0142"));
  assert.ok(sameNumber("1 617 555 0142", "6175550142"));
  assert.ok(!sameNumber("555-0142", "555-0143"));
  assert.ok(!sameNumber("(617) 555-0142", "(212) 555-0142"));
  assert.ok(!sameNumber("", ""));
});

test("a dialled number reaches a service, a listed number, or nothing", () => {
  const dir = [{ kind: "place", number: "555-0142", name: "Faneuil Hall" }, { kind: "pager", number: "555-0199" }];
  assert.equal(reach("911", dir).kind, "service");
  assert.equal(reach("5550142", dir).name, "Faneuil Hall");
  assert.equal(reach("617-555-0199", dir).kind, "pager");
  assert.equal(reach("555-0100", dir).kind, "none");
  assert.equal(reach("5550", dir).kind, "incomplete");
});

test("free numbers avoid ones given out, and duplicates are found", () => {
  const taken = Array.from({ length: 99 }, (_, i) => `555-0${100 + i}`);
  assert.equal(freeNumber(taken, () => 0.5), "555-0199");
  assert.equal(duplicates([{ number: "555-0142" }, { number: "(617) 555-0142" }, { number: "555-0100" }]).length, 1);
});

test("each pager model shows what it can", () => {
  assert.equal(pageFor("tone", { text: "hello", callback: "5550142" }).text, "CALL BACK");
  assert.equal(pageFor("numeric", { text: "call me 555-0142" }).text, "555-0142");
  assert.equal(pageFor("numeric", { callback: "5550142" }).text, "5550142");
  assert.equal(pageFor("alpha", { text: "meet at the docks" }).text, "MEET AT THE DOCKS");
  assert.equal(pageFor("alpha", { callback: "5550142" }).text, "CALL 555-0142");
});

test("books merge by number and contacts are set by id", () => {
  const a = [{ id: "1", name: "", number: "555-0142" }];
  const merged = mergeBooks(a, [{ id: "x", name: "Ma", number: "(617) 555-0142" }, { id: "y", name: "Sal", number: "555-0100" }]);
  assert.deepEqual(merged.map((c) => c.name), ["Ma", "Sal"]);
  assert.equal(a[0].name, "", "the original book is not changed");
  assert.equal(putContact(merged, { id: "y", name: "Sally" })[1].name, "Sally");
  assert.equal(putContact(merged, { id: "y" }, { remove: true }).length, 1);
});

test("an Unsleeping Pagers log becomes pages and contacts", () => {
  let n = 0;
  const { recent, contacts } = fromOldLog([
    { fromName: "Bebe", fromNumber: "5550163", message: "555-0163", time: 2000 },
    { fromName: "GM MASTER PAGER", fromNumber: "DISPATCH", message: "CALL DISPATCH", time: 1000 },
    { fromName: "Bebe", fromNumber: "555-0163", message: "where are you", time: 3000 },
    { fromName: "Nobody", fromNumber: "", message: "", time: 4000 }
  ], () => `id${n++}`);
  assert.deepEqual(recent.map((r) => r.text), ["CALL DISPATCH", "555-0163", "where are you"]);
  assert.equal(recent[0].callback, "");
  assert.equal(recent[1].callback, "555-0163");
  assert.deepEqual(contacts.map((c) => `${c.name} ${c.number}`), ["Bebe 555-0163"]);
  assert.equal(OLD_MODELS.alphanumeric, "alpha");
});

test("later Unsleeping Pagers logs keep the world clock's time; address books become contacts", () => {
  const { recent } = fromOldLog([{ fromName: "A", fromNumber: "6175550198", message: "x", time: 900 }, { fromName: "B", fromNumber: "", message: "y", time: 300 }]);
  assert.deepEqual(recent.map((r) => [r.text, r.time]), [["y", 300], ["x", 900]]);
  assert.equal(recent[1].callback, "(617) 555-0198");
  const book = fromOldBook({ "617-555-0198": "Sal", "": "nobody", "5550100": "" });
  assert.deepEqual(book.map((c) => `${c.name} ${c.number}`), ["Sal (617) 555-0198"]);
});

test("a payphone takes a quarter", () => {
  assert.equal(coinCopper(1000), 250);
  assert.equal(coinCopper(100), 25);
});
