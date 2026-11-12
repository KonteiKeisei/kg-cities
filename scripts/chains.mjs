// Chain stores: today's drugstores in the city's map data, made into 1986 points of interest,
// each linked to the chain's shop actor and drawn with its token. Pure: no Foundry.
//
// Nobody has published where Boston's drugstores stood in 1986, so today's stand in for them:
// today's CVS were CVS (a Massachusetts chain since 1963), and today's Walgreens and Rite Aids
// stand in for Brooks Drug (Rhode Island's chain, all over New England in 1986). Many of them
// are Brooks's own old stores: Rite Aid bought Brooks in 2007, Walgreens bought those Rite Aids
// in 2017-18. Walgreens itself came to Boston about 2000.

import { metres } from "./geo.mjs";

/**
 * Today's chains: what their places are called in the map data, and what they were in 1986.
 * actor: how the shop actor is found by name.
 */
export const CHAINS = [
  { key: "cvs", today: "CVS", match: /^CVS\b/i, name: "CVS", actor: /\bCVS\b/i },
  { key: "walgreens", today: "Walgreens", match: /^Walgreen/i, name: "Brooks Drug", actor: /\bBrooks\b/i, keep: { name: "Walgreens", actor: /\bWalgreen/i } },
  { key: "riteaid", today: "Rite Aid", match: /^Rite ?Aid\b/i, name: "Brooks Drug", actor: /\bBrooks\b/i }
];
/** Two entries of one chain this close are one store (a shop and its pharmacy counter mapped apart). */
export const SAME_STORE_M = 60;

const inBox = (p, b) => !b || (p.lat <= b.north && p.lat >= b.south && p.lon >= b.west && p.lon <= b.east);

/** One chain's stores in the map data, inside the box, each once. */
export function storesOf(places, chain, bounds = null) {
  const out = [];
  for (const p of places) {
    if (!chain.match.test(p.name ?? "") || !inBox(p, bounds)) continue;
    if (out.some((q) => metres(q, p) < SAME_STORE_M)) continue;
    out.push(p);
  }
  return out;
}

/**
 * Split a chain's stores: `n` of them kept as they are today (Walgreens staying Walgreens), spread
 * evenly from north to south, the rest becoming the 1986 chain. The same stores every time.
 */
export function splitStores(stores, n) {
  const sorted = [...stores].sort((a, b) => b.lat - a.lat || String(a.id).localeCompare(String(b.id)));
  const count = Math.max(0, Math.min(sorted.length, Math.round(Number(n) || 0)));
  const keepIdx = new Set(Array.from({ length: count }, (_, i) => Math.floor(((i + 0.5) * sorted.length) / count)));
  return { kept: sorted.filter((_, i) => keepIdx.has(i)), rest: sorted.filter((_, i) => !keepIdx.has(i)) };
}

/** The actor a chain links to by default: the first whose name matches it (a shop over a character). */
export function defaultActor(actors, chain) {
  const hits = actors.filter((a) => chain.actor.test(a.name ?? ""));
  return hits.find((a) => a.type !== "character") ?? hits[0] ?? null;
}

/**
 * The landmark list with each store made a point of interest, or brought up to date when it
 * already is one: { list, added, updated }. plans: [{ chain, stores, name, actorUuid, icon }].
 * A store is the same point of interest as before when it was made from the same place, or
 * stands within SAME_STORE_M of one made for the same chain. Its card (text, art, more actors)
 * is kept; its name, actor link and marker are set.
 */
export function placeStores(list, plans, { makeId = (chain, place) => `chain:${chain}:${place.id}` } = {}) {
  const out = list.map((l) => ({ ...l }));
  let added = 0, updated = 0;
  for (const { chain, stores, name, actorUuid, icon } of plans) {
    for (const s of stores) {
      const lm = out.find((l) => l.chain === chain && (l.placeId === s.id || metres(l, s) < SAME_STORE_M));
      const actors = (old) => (actorUuid ? [actorUuid, ...(old ?? []).filter((u) => u !== actorUuid && !(lm?.chainActor && u === lm.chainActor))] : (old ?? []).filter((u) => u !== lm?.chainActor));
      if (lm) {
        Object.assign(lm, { name, icon: icon || null, actors: actors(lm.actors), chainActor: actorUuid || null });
        updated++;
      } else {
        out.push({
          id: makeId(chain, s), name, lat: s.lat, lon: s.lon, placeId: s.id, chain, chainActor: actorUuid || null,
          actors: actorUuid ? [actorUuid] : [], icon: icon || null, glow: false, tone: "gold", visibility: "discovered", hidden: false
        });
        added++;
      }
    }
  }
  return { list: out, added, updated };
}

/** The list without one chain's points of interest: { list, removed (their ids) }. */
export function removeChain(list, chain) {
  const removed = list.filter((l) => l.chain === chain).map((l) => l.id);
  return { list: list.filter((l) => l.chain !== chain), removed };
}
