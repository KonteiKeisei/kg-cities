import test from "node:test";
import assert from "node:assert/strict";
import { MILE, driveSeconds, taxiPlan, seatVehicles, vehicleSeconds, formatDuration, pointAlong, HAIL_SECONDS } from "../scripts/travel-plan.mjs";
import { pay, walletValue, formatMoney } from "../scripts/money.mjs";

const route = (miles, interstate = 0) => ({ metres: miles * MILE, interstateMetres: interstate * MILE });

test("driving: 35 off the interstate, 55 on it", () => {
  assert.ok(Math.abs(driveSeconds(route(35)) - 3600) < 1e-6);
  assert.ok(Math.abs(driveSeconds(route(55, 55)) - 3600) < 1e-6);
  assert.ok(Math.abs(driveSeconds(route(90, 55)) - 7200) < 1e-6);
});

test("cabs: four to a cab, riders spread evenly, the fare shared per cab", () => {
  const p = taxiPlan(route(3.6), 5, { drop: 1.1, perMile: 1.7 });
  assert.deepEqual(p.cabs.map((c) => c.riders), [3, 2]);
  assert.equal(p.cabs[0].fare, 7.22);
  assert.equal(p.cabs[0].each, 2.41);
  assert.equal(p.cabs[1].each, 3.61);
  assert.equal(p.fare, 14.44);
  assert.ok(Math.abs(p.seconds - (HAIL_SECONDS + driveSeconds(route(3.6)))) < 1e-6);
  assert.equal(taxiPlan(route(1), 4).cabs.length, 1);
  assert.equal(taxiPlan(route(1), 9).cabs.length, 3);
});

const people = ["Pierre", "Jacques", "Dot", "Ray", "Lou"].map((name) => ({ id: name.toLowerCase(), name }));
const moto = { id: "moto", name: "Trudy (motorcycle)", seats: 1, owner: "pierre" };
const mustang = { id: "mustang", name: "Trudy (Mustang)", seats: 4, owner: "jacques" };

test("owners drive their own vehicles and the rest fill the seats", () => {
  const s = seatVehicles(people, [moto, mustang]);
  assert.ok(s.ok);
  assert.equal(s.seats, 7);
  const car = (id) => s.cars.find((c) => c.vehicle.id === id);
  assert.equal(car("moto").driver.id, "pierre");
  assert.equal(car("mustang").driver.id, "jacques");
  assert.equal(car("moto").riders.length + car("mustang").riders.length, 3);
});

test("a seat wish is kept when there is room", () => {
  const s = seatVehicles(people, [moto, mustang], { seat: { lou: "moto" } });
  assert.equal(s.cars.find((c) => c.vehicle.id === "moto").riders[0].id, "lou");
});

test("an owner who is not here: someone must be chosen to drive, or the vehicle stays", () => {
  const without = people.filter((p) => p.id !== "jacques");
  const asked = seatVehicles(without, [moto, mustang]);
  assert.equal(asked.ok, false);
  assert.deepEqual(asked.noDriver.map((v) => v.id), ["mustang"]);
  const driven = seatVehicles(without, [moto, mustang], { driver: { mustang: "dot" } });
  assert.ok(driven.ok);
  assert.equal(driven.cars.find((c) => c.vehicle.id === "mustang").driver.id, "dot");
  const leftBehind = seatVehicles(without, [moto, mustang], { driver: { mustang: "" } });
  assert.equal(leftBehind.ok, false, "4 people, the motorcycle alone seats 2");
  assert.equal(leftBehind.left.length, 2);
});

test("more people than seats: not ok, and who is left over is named", () => {
  const s = seatVehicles(people, [moto]);
  assert.equal(s.ok, false);
  assert.equal(s.left.length, 3);
  assert.equal(seatVehicles(people, []).ok, false);
});

test("a party over several vehicles arrives with its slowest", () => {
  const s = seatVehicles(people, [moto, { ...mustang, speeds: { street: 25 } }]);
  assert.ok(Math.abs(vehicleSeconds(route(25), s.cars) - 3600) < 1e-6);
});

test("durations and points along a route", () => {
  assert.equal(formatDuration(4080), "1 h 8 min");
  assert.equal(formatDuration(720), "12 min");
  assert.equal(formatDuration(20), "under a minute");
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assert.deepEqual(pointAlong(pts, 0.5), { x: 10, y: 0 });
  assert.deepEqual(pointAlong(pts, 0.75), { x: 10, y: 5 });
  assert.deepEqual(pointAlong(pts, 2), { x: 10, y: 10 });
});

test("paying in coins takes change", () => {
  assert.equal(walletValue({ pp: 1, gp: 2 }), 1200);
  const r = pay({ pp: 3 }, 2410);
  assert.equal(walletValue(r.after), 590);
  assert.equal(pay({ gp: 1 }, 500), null);
  assert.equal(formatMoney(2410), "$2.41");
  assert.equal(formatMoney(2410, 100), "$24.10");
});
