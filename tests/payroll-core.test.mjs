import test from "node:test";
import assert from "node:assert/strict";
import { BOSTON, DAY, GUIDE, PRESETS, billsDue, computePay, describeRate, dueTimes, federalTax, guideJob, homeBills, inSeason, makeJob, pickBand, searchGuide, weekly, weeklyTakeHome } from "../scripts/payroll-core.mjs";

test("1986 federal tax matches the IRS's worked example", () => {
  // $25,000 of wages, one exemption, the standard deduction: $4,066.60 by the rate schedule.
  assert.equal(Math.round(federalTax(25000) * 100) / 100, 4066.6);
  assert.equal(federalTax(3000), 0);
});

test("a hockey salary is paid over the season, and taxed at a hockey player's rate", () => {
  const hk = makeJob({ type: "yearly", rate: 160000, every: 14, books: true, season: { from: 9, to: 3 } });
  const p = computePay(hk, { chance: never });
  assert.ok(Math.abs(p.gross * (7 * 52 / 12) / 2 - 160000) < 1);
  assert.ok(-p.taxes[0].amount / p.gross > 0.35, "federal over a third at $160,000");
  assert.equal(p.taxes[1].amount, -Math.round(0.0715 * 42000 / ((7 * 52 / 12) / 2) * 100) / 100, "FICA stops at $42,000");
});

test("union dues come out of the check, guide union jobs have them", () => {
  const g = guideJob(GUIDE["Blue collar"][0]);
  assert.ok(g.dues > 0);
  assert.equal(guideJob(GUIDE["Service"].find((x) => x[0] === "Bartender")).dues, 0);
  const p = computePay(makeJob({ type: "weekly", rate: 400, every: 7, dues: 26 }), { chance: never });
  assert.deepEqual(p.taxes, [{ key: "dues", label: "Union dues", amount: -6 }]);
});

test("living costs: rent by neighbourhood, a car, groceries; a dependant pays only for the car", () => {
  const own = homeBills({ housing: "rent", hood: "backbay", vehicle: "car", food: "moderate" });
  assert.deepEqual(own.monthly.map((b) => b.key), ["housing", "utilities", "insurance"]);
  assert.equal(own.monthly[0].amount, 850);
  assert.deepEqual(own.weekly.map((b) => b.key), ["food", "gas"]);
  const kid = homeBills({ dependant: true, vehicle: "car" });
  assert.deepEqual([...kid.weekly, ...kid.monthly].map((b) => b.key), ["gas", "insurance"]);
  assert.ok(own.perWeek > kid.perWeek);
  assert.deepEqual(billsDue({ on: true, next: 7 * DAY, rentNext: 30 * DAY }, 31 * DAY).weeks, [7 * DAY, 14 * DAY, 21 * DAY, 28 * DAY]);
  assert.equal(billsDue({ on: false, next: 0 }, 31 * DAY).weeks.length, 0);
  assert.equal(weeklyTakeHome([makeJob({ type: "weekly", rate: 300, every: 14 })]), 300);
});

const never = () => false, always = () => true;

test("a week's pay by every kind of job", () => {
  assert.equal(weekly(makeJob({ type: "hourly", rate: 9.5, units: 40 })), 380);
  assert.equal(weekly(makeJob({ type: "yearly", rate: 52000 })), 1000);
  assert.equal(weekly(makeJob({ type: "word", rate: 0.25, units: 1200 })), 300);
  assert.equal(weekly(makeJob({ type: "allowance", rate: 40 })), 40);
});

test("a biweekly check pays two weeks, less 1986 withholding on the books", () => {
  const p = computePay(makeJob({ type: "hourly", rate: 10, units: 40, every: 14, books: true }), { chance: never });
  assert.equal(p.gross, 800);
  assert.deepEqual(p.taxes.map((t) => t.amount), [-114.41, -57.2, -35.77]);
  assert.equal(p.net, 592.62);
  const off = computePay(makeJob({ type: "hourly", rate: 10, units: 40, every: 14 }), { chance: never });
  assert.equal(off.net, 800);
});

test("the payday roll's band scales the pay", () => {
  const job = makeJob(PRESETS.find((p) => p.title === "Newspaper stringer"));
  assert.equal(computePay(job, { roll: 3 }).gross, 0);
  assert.equal(computePay(job, { roll: 20 }).gross, 600);
  assert.equal(computePay(job, { roll: 14 }).gross, 360);
  assert.equal(pickBand(job.roll.bands, 40).text, "Page one, 25¢ a word");
});

test("bonuses: once, every payday, by chance, and cash on the side", () => {
  const job = makeJob({ type: "weekly", rate: 300, books: true, bonuses: [
    { id: "a", label: "Playoff share", amount: 100, when: "once" },
    { id: "b", label: "Side run", amount: 300, when: "every", cash: true },
    { id: "c", label: "Stiffed", amount: -100, percent: true, when: "chance", chance: 6 }
  ] });
  const lucky = computePay(job, { chance: never });
  assert.equal(lucky.gross, 400);
  assert.deepEqual(lucky.used, ["a"]);
  assert.equal(lucky.cashTotal, 300);
  assert.equal(lucky.total, Math.round((lucky.net + 300) * 100) / 100);
  const stiffed = computePay(job, { chance: always });
  assert.equal(stiffed.gross, 0);
  assert.equal(stiffed.net, 0);
  assert.equal(stiffed.total, 300);
});

test("paydays due after a time skip, and the next one", () => {
  const job = makeJob({ every: 7, next: 10 * DAY });
  const { times, next } = dueTimes(job, 30 * DAY);
  assert.deepEqual(times, [10 * DAY, 17 * DAY, 24 * DAY]);
  assert.equal(next, 31 * DAY);
  assert.deepEqual(dueTimes(makeJob({ every: 7, next: 10 * DAY, left: 2 }), 30 * DAY).times.length, 2);
  assert.deepEqual(dueTimes(makeJob({ every: 0, next: 1 }), 30 * DAY).times, []);
  const far = dueTimes(makeJob({ every: 7, next: 0 }), 1000 * DAY, 5);
  assert.equal(far.times.length, 5);
  assert.ok(far.next > 1000 * DAY && far.next <= 1007 * DAY);
});

test("a hockey season runs over the new year", () => {
  const job = makeJob({ season: { from: 9, to: 3 } });
  assert.ok(inSeason(job, 0) && inSeason(job, 10) && inSeason(job, 3));
  assert.ok(!inSeason(job, 6));
  assert.ok(inSeason(makeJob({}), 6));
});

test("the 1986 guide gives Boston hourly jobs and finds by name", () => {
  const g = guideJob(GUIDE["Blue collar"][0]);
  assert.equal(g.rate, Math.round((286 * BOSTON / 40) * 100) / 100);
  assert.equal(guideJob(GUIDE["Blue collar"][0], { boston: false }).rate, 7.15);
  assert.ok(searchGuide("mechanic").length >= 4);
  assert.match(describeRate(makeJob({ type: "word", rate: 0.25, units: 1200 })), /25¢\/word × 1,200 words a week/);
});
