import test from "node:test";
import assert from "node:assert/strict";
import { portraitLayout, framedRadius, tokenFitFactor } from "../scripts/ui-party.mjs";
import { listNames, partyName, shortName } from "../scripts/party.mjs";

test("split groups are named for who is in them; the whole party keeps its title", () => {
  const a = (name) => ({ name });
  assert.equal(listNames(["Leonard Kowalski", "Pierre Dubois"]), "Leonard and Pierre");
  assert.equal(listNames(["Leonard", "Pierre", "Dot"]), "Leonard, Pierre and Dot");
  assert.equal(listNames(["Leonard", "Pierre", "Dot", "Ray", "Lou"]), "Leonard, Pierre and 3 others");
  assert.equal(listNames(["Pierre"]), "Pierre");
  assert.equal(shortName("Det. Hanlon"), "Det. Hanlon", "a title keeps the whole name");
  assert.equal(partyName("The Ferrante Crew", [a("Leonard"), a("Pierre")], 2), "Leonard and Pierre");
  assert.equal(partyName("The Ferrante Crew", [a("Leonard"), a("Pierre"), a("Dot")], 1), "The Ferrante Crew");
});

test("portraits are as big as fits: inside the outline, clear of each other, larger in smaller parties", () => {
  const one = portraitLayout(100, 100, 1);
  assert.equal(one.length, 1);
  assert.ok(Math.abs(one[0].x - 50) < 1e-9 && Math.abs(one[0].y - 50) < 1e-9, "one portrait is in the middle");
  assert.ok(Math.abs(one[0].r - 44) < 1e-9, "and fills the ring");
  let last = Infinity;
  for (let n = 2; n <= 8; n++) {
    const ps = portraitLayout(100, 100, n);
    const d = ps.map((p) => Math.hypot(p.x - 50, p.y - 50));
    assert.ok(d.every((v) => Math.abs(v - d[0]) < 1e-9), `${n}: all on one ring`);
    assert.ok(Math.abs(ps[0].x - 50) < 1e-9 && ps[0].y < 50, `${n}: the first is at the top`);
    assert.ok(d[0] + ps[0].r <= 44 + 1e-9, `${n}: inside the outline`);
    assert.ok(d[0] + ps[0].r >= 44 - 1e-9, `${n}: reaching it, as big as it can`);
    const gap = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    assert.ok(gap > ps[0].r * 2, `${n}: neighbours do not overlap`);
    assert.ok(gap < ps[0].r * 2.2, `${n}: and nearly touch`);
    assert.ok(ps[0].r < last, `${n}: smaller than with fewer people`);
    last = ps[0].r;
  }
  // Two people each get half the circle's reach, give or take the gap.
  assert.ok(portraitLayout(100, 100, 2)[0].r > 20);
});

test("a painted frame round token art is found, a plain picture is not", () => {
  const size = 64, c = size / 2;
  const img = (frame) => {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c), j = (y * size + x) * 4;
      const inFrame = frame && r > c * 0.7;
      // The face: a gradient; the frame: one gold.
      data.set(inFrame ? [200, 160, 60, 255] : [x * 4, y * 4, (x + y) * 2, 255], j);
    }
    return data;
  };
  assert.ok(framedRadius(img(true), size) > 0);
  assert.equal(framedRadius(img(false), size), 0);
});

test("a token far zoomed out is drawn larger, never past the cap", () => {
  assert.equal(tokenFitFactor(100, 1), 1);
  assert.equal(tokenFitFactor(100, 0.2), 2);
  assert.equal(tokenFitFactor(100, 0.0001), 60);
});
