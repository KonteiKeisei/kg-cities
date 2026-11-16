// Chain stores: today's chains in the city's map data, made into 1986 points of interest, each
// linked to the chain's actor and drawn with its token. Pure: no Foundry.
//
// Nobody has published where the stores stood in 1986, so today's stand in for them, chosen where
// one company bought the other, so many are the old stores themselves:
// - Drugstores (every city): today's CVS were CVS (a Massachusetts chain since 1963), and today's
//   Walgreens and Rite Aids stand in for Brooks Drug (Rite Aid bought Brooks in 2007, Walgreens
//   bought those Rite Aids in 2017-18). Walgreens itself came to Boston about 2000.
// - Banks (by city): today's bank stands in for the 1986 banks it swallowed. Boston's Bank of
//   America came through Fleet from Bank of Boston, BayBank (merged 1996 as BankBoston), Shawmut
//   (Fleet, 1995) and Bank of New England (Fleet, 1991); Santander came through Sovereign (2000)
//   from Fleet's own eastern Massachusetts branches; Citizens bought Boston Five (1993) and
//   Neworld Bank (1994). Boston's rows are checked against sources; other cities' are not yet.
// - Radio Shack: none is left, and today's phone stores sit where it sat: a store in every
//   neighborhood strip. The GM picks how many.

import { metres } from "./geo.mjs";

const BANKISH = ["bank", "atm"];
const PHONE_SHOPS = ["mobile_phone", "electronics", "telecommunication"];

/** The groups the window shows, in order. */
export const GROUPS = [
  { key: "drug", label: "Drugstores", icon: "fa-prescription-bottle-medical" },
  { key: "bank", label: "Banks", icon: "fa-building-columns" },
  { key: "electronics", label: "Radio Shack", icon: "fa-satellite-dish" }
];

/**
 * A bank row: today's name, what it was in 1986 (one or several, shared out store by store), and
 * why. Boston's are checked against sources; the other cities' are not yet (unchecked: true).
 */
const bank = (key, cities, today, match, names, why) => ({ key, group: "bank", cities, today, match, kinds: BANKISH, name: names[0], names, why, unchecked: !cities.includes("boston") });

/**
 * Today's chains: what their places are called in the map data, and what they were in 1986.
 * group: the tab; cities: only on these cities' maps (all when absent); kinds: only places of
 * these map kinds; names: several 1986 names shared out in turn; actor: how the actor is found by
 * name; limit: place at most this many (spread out), by default.
 */
export const CHAINS = [
  { key: "cvs", group: "drug", today: "CVS", match: /^CVS\b/i, name: "CVS", actor: /\bCVS\b/i },
  { key: "walgreens", group: "drug", today: "Walgreens", match: /^Walgreen/i, name: "Brooks Drug", actor: /\bBrooks\b/i, keep: { name: "Walgreens", actor: /\bWalgreen/i } },
  { key: "riteaid", group: "drug", today: "Rite Aid", match: /^Rite ?Aid\b/i, name: "Brooks Drug", actor: /\bBrooks\b/i },

  bank("bos-bofa", ["boston"], "Bank of America", /^Bank ?of ?America\b/i, ["Bank of Boston", "BayBank", "Shawmut", "Bank of New England"], "Through FleetBoston: Bank of Boston and BayBank (BankBoston, 1996), Shawmut (Fleet, 1995) and Bank of New England (Fleet, 1991)."),
  bank("bos-santander", ["boston"], "Santander", /^Santander\b|^Sovereign\b/i, ["Bank of New England", "Shawmut"], "Through Sovereign (2000): Fleet's own eastern Massachusetts branches, which Fleet had from Bank of New England (1991) and Shawmut (1995)."),
  bank("bos-citizens", ["boston"], "Citizens Bank", /^Citizens Bank\b/i, ["Boston Five", "Neworld Bank"], "Citizens bought Boston Five (1993) and Neworld Bank (1994)."),
  bank("bos-eastern", ["boston"], "Eastern Bank", /^Eastern Bank\b/i, ["Eastern Savings Bank"], "Salem Savings and Lynn's First East merged as Eastern Savings Bank in 1981; Eastern Bank from 1989."),
  bank("bos-cambridge", ["boston"], "Cambridge Savings Bank", /^Cambridge Savings\b/i, ["Cambridge Savings Bank"], "Since 1834."),
  bank("bos-eastcambridge", ["boston"], "East Cambridge Savings Bank", /^East Cambridge Savings\b/i, ["East Cambridge Savings Bank"], "Since 1854."),
  bank("bos-watertown", ["boston"], "Watertown Savings Bank", /^Watertown Savings\b/i, ["Watertown Savings Bank"], "Since 1870."),
  bank("bos-brookline", ["boston"], "Brookline Bank", /^Brookline Bank\b/i, ["Brookline Savings Bank"], "Brookline's savings bank since 1871."),
  bank("bos-rockland", ["boston"], "Rockland Trust", /^Rockland Trust\b/i, ["Rockland Trust"], "A South Shore bank since 1907; most of its city branches are newer."),

  bank("nyc-chase", ["new-york"], "Chase", /^Chase\b/i, ["Chase Manhattan", "Chemical Bank", "Manufacturers Hanover"], "Chemical bought Manufacturers Hanover (1991) and Chase Manhattan (1996), keeping the Chase name."),
  bank("nyc-citi", ["new-york"], "Citibank", /^Citi(bank)?\b/i, ["Citibank"], "Citibank since 1976."),
  bank("chi-chase", ["chicago"], "Chase", /^Chase\b/i, ["First Chicago"], "First Chicago became Bank One (1998), then Chase (2004)."),
  bank("chi-bofa", ["chicago"], "Bank of America", /^Bank ?of ?America\b/i, ["Continental Bank"], "Continental Illinois was bought by Bank of America in 1994."),
  bank("chi-bmo", ["chicago"], "BMO", /^BMO\b/i, ["Harris Bank"], "Harris Trust, BMO's since 1984, kept its name until 2011."),
  bank("det-chase", ["detroit"], "Chase", /^Chase\b/i, ["NBD"], "National Bank of Detroit became Bank One (1998), then Chase (2004)."),
  bank("det-comerica", ["detroit"], "Comerica", /^Comerica\b/i, ["Comerica", "Manufacturers National Bank"], "Comerica merged with Manufacturers National in 1992."),
  bank("phl-wells", ["philadelphia"], "Wells Fargo", /^Wells Fargo\b/i, ["Philadelphia National Bank", "First Pennsylvania Bank"], "Through CoreStates, First Union and Wachovia."),
  bank("phl-pnc", ["philadelphia"], "PNC", /^PNC\b/i, ["Provident National Bank"], "Provident National joined Pittsburgh National as PNC in 1983."),
  bank("phl-citizens", ["philadelphia"], "Citizens Bank", /^Citizens Bank\b/i, ["PSFS"], "PSFS (Meritor from 1985) went to Mellon (1992), then Citizens (2001)."),
  bank("bal-bofa", ["baltimore"], "Bank of America", /^Bank ?of ?America\b/i, ["Maryland National Bank"], "Maryland National went to NationsBank in 1993."),
  bank("bal-pnc", ["baltimore"], "PNC", /^PNC\b/i, ["Mercantile-Safe Deposit & Trust"], "PNC bought Mercantile in 2007."),
  bank("bal-mt", ["baltimore"], "M&T Bank", /^M ?& ?T\b/i, ["Provident Bank of Maryland"], "M&T bought Provident in 2009."),
  bank("dc-pnc", ["washington"], "PNC", /^PNC\b/i, ["Riggs"], "PNC bought Riggs in 2005."),
  bank("dc-bofa", ["washington"], "Bank of America", /^Bank ?of ?America\b/i, ["American Security Bank"], "Through Maryland National and NationsBank."),
  bank("dc-capone", ["washington"], "Capital One", /^Capital ?One\b/i, ["Chevy Chase Savings"], "Capital One bought Chevy Chase Bank in 2009."),
  bank("atl-truist", ["atlanta"], "Truist", /^Truist\b|^SunTrust\b/i, ["Trust Company Bank"], "Trust Company became SunTrust (1985), then Truist (2019)."),
  bank("atl-bofa", ["atlanta"], "Bank of America", /^Bank ?of ?America\b/i, ["C&S"], "Citizens and Southern, through NationsBank."),
  bank("atl-wells", ["atlanta"], "Wells Fargo", /^Wells Fargo\b/i, ["First Atlanta"], "Through Wachovia."),
  bank("stl-bofa", ["st-louis"], "Bank of America", /^Bank ?of ?America\b/i, ["Boatmen's"], "Boatmen's went to NationsBank in 1997."),
  bank("stl-usbank", ["st-louis"], "U.S. Bank", /^U\.? ?S\.? Bank\b/i, ["Mercantile Bank"], "Mercantile went to Firstar in 1999, now U.S. Bank."),
  bank("lv-bofa", ["las-vegas"], "Bank of America", /^Bank ?of ?America\b/i, ["Valley Bank of Nevada"], "Bank of America bought Valley Bank in 1992."),
  bank("lv-wells", ["las-vegas"], "Wells Fargo", /^Wells Fargo\b/i, ["First Interstate"], "Wells Fargo bought First Interstate in 1996."),
  bank("la-bofa", ["los-angeles"], "Bank of America", /^Bank ?of ?America\b/i, ["Bank of America", "Security Pacific"], "Bank of America bought Security Pacific in 1992."),
  bank("la-wells", ["los-angeles"], "Wells Fargo", /^Wells Fargo\b/i, ["Wells Fargo", "First Interstate"], "Wells Fargo bought First Interstate in 1996."),
  bank("la-chase", ["los-angeles"], "Chase", /^Chase\b/i, ["Home Savings of America", "Great Western"], "Both went to Washington Mutual, which Chase bought in 2008."),
  bank("sf-bofa", ["san-francisco"], "Bank of America", /^Bank ?of ?America\b/i, ["Bank of America"], "Bank of America's home city."),
  bank("sf-wells", ["san-francisco"], "Wells Fargo", /^Wells Fargo\b/i, ["Wells Fargo"], "Wells Fargo bought Crocker in 1986."),
  bank("sf-chase", ["san-francisco"], "Chase", /^Chase\b/i, ["Home Savings of America", "Great Western"], "Both went to Washington Mutual, which Chase bought in 2008."),
  bank("aus-chase", ["austin"], "Chase", /^Chase\b/i, ["Texas Commerce Bank", "MBank"], "Texas Commerce went to Chemical (1987); MBank to Bank One. Both are Chase now."),
  bank("aus-bofa", ["austin"], "Bank of America", /^Bank ?of ?America\b/i, ["RepublicBank", "InterFirst"], "They merged in 1987, failed in 1988 and went to NCNB, now Bank of America."),
  bank("aus-frost", ["austin"], "Frost Bank", /^Frost\b/i, ["Frost Bank"], "A San Antonio bank since 1868."),
  bank("mia-bofa", ["miami"], "Bank of America", /^Bank ?of ?America\b/i, ["Barnett Bank"], "Barnett went to NationsBank in 1998."),
  bank("mia-truist", ["miami"], "Truist", /^Truist\b|^SunTrust\b/i, ["Sun Bank"], "Sun Bank became SunTrust, then Truist."),
  bank("mia-wells", ["miami"], "Wells Fargo", /^Wells Fargo\b/i, ["Southeast Bank"], "Southeast failed in 1991 and went to First Union, now Wells Fargo."),

  {
    key: "radioshack", group: "electronics", today: "phone stores", match: /^(Radio ?Shack|AT ?& ?T|T-?Mobile|Verizon|Sprint|Cricket|Metro by T-Mobile|Boost|U\.?S\.? Cellular)\b/i,
    kinds: PHONE_SHOPS, name: "Radio Shack", actor: /\bRadio ?Shack\b/i, limit: 12,
    why: "No Radio Shack is left; today's phone stores sit where it sat, in every neighborhood strip."
  }
];
/** Two entries of one chain this close are one store (a shop and its pharmacy counter mapped apart, an ATM in its branch). */
export const SAME_STORE_M = 60;

/** The chains for a city's map: those of every city and its own. */
export const chainsFor = (city) => CHAINS.filter((c) => !c.cities || c.cities.includes(city));

/** The chain a point of interest was made from, or null. */
export const chainOf = (lm) => (lm?.chain ? CHAINS.find((c) => c.key === lm.chain) ?? null : null);

const inBox = (p, b) => !b || (p.lat <= b.north && p.lat >= b.south && p.lon >= b.west && p.lon <= b.east);

/**
 * One chain's stores in the map data, inside the box, each once. A branch counts before an ATM,
 * so an ATM in its branch is the branch; an ATM on its own is kept (kind "atm").
 */
export function storesOf(places, chain, bounds = null) {
  const out = [];
  const list = chain.kinds ? places.filter((p) => chain.kinds.includes(p.kind)) : places;
  const ordered = [...list].sort((a, b) => (a.kind === "atm") - (b.kind === "atm"));
  for (const p of ordered) {
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

/**
 * Share a chain's stores out among several 1986 names, in turn from north to south, so each
 * name has stores all over the map. The same shares every time: [[store]] per name.
 */
export function shareStores(stores, n) {
  const count = Math.max(1, Math.round(Number(n) || 1));
  const sorted = [...stores].sort((a, b) => b.lat - a.lat || String(a.id).localeCompare(String(b.id)));
  const out = Array.from({ length: count }, () => []);
  sorted.forEach((s, i) => out[i % count].push(s));
  return out;
}

/**
 * Share stores out among 1986 names, keeping what was placed before: a store already a point of
 * interest under one of the names (before: place id to name) stays under it, so a re-run or a
 * refreshed map does not rename branches (accounts and boxes are kept by bank name). The rest
 * are shared out in turn, north to south. [[store]] per name.
 */
export function assignNames(stores, names, before = new Map()) {
  const out = names.map(() => []), fresh = [];
  for (const s of stores) {
    const i = names.indexOf(before.get(s.id));
    if (i >= 0) out[i].push(s); else fresh.push(s);
  }
  shareStores(fresh, names.length).forEach((list, i) => out[i].push(...list));
  return out;
}

/** The names a GM typed ("Bank of Boston, BayBank"): each once, in order. */
export const parseNames = (text, fallback = []) => {
  const names = [...new Set(String(text ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  return names.length ? names : fallback;
};

/** A pattern that finds an actor by a 1986 name. */
export const nameMatcher = (name) => new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

/** The actor a chain links to by default: the first whose name matches it (a shop over a character). */
export function defaultActor(actors, chain) {
  const hits = actors.filter((a) => chain.actor.test(a.name ?? ""));
  return hits.find((a) => a.type !== "character") ?? hits[0] ?? null;
}

/**
 * The landmark list with each store made a point of interest, or brought up to date when it
 * already is one: { list, added, updated }. plans: [{ chain, stores, name, actorUuid, icon,
 * group? }]. A store is the same point of interest as before when it was made from the same
 * place, or stands within SAME_STORE_M of one made for the same chain. Its card (text, art, more
 * actors) is kept; its name, actor link and marker are set. A bank's store is a branch ("bank":
 * its 1986 name), or an ATM on its own ("atm": true, named "<bank> ATM").
 */
export function placeStores(list, plans, { makeId = (chain, place) => `chain:${chain}:${place.id}` } = {}) {
  const out = list.map((l) => ({ ...l }));
  let added = 0, updated = 0;
  for (const { chain, stores, name, actorUuid, icon, group } of plans) {
    for (const s of stores) {
      const lm = out.find((l) => l.chain === chain && (l.placeId === s.id || metres(l, s) < SAME_STORE_M));
      const actors = (old) => (actorUuid ? [actorUuid, ...(old ?? []).filter((u) => u !== actorUuid && !(lm?.chainActor && u === lm.chainActor))] : (old ?? []).filter((u) => u !== lm?.chainActor));
      const atm = group === "bank" && s.kind === "atm";
      const extra = group === "bank" ? { bank: name, atm } : {};
      const label = atm ? `${name} ATM` : name;
      if (lm) {
        Object.assign(lm, { name: label, icon: icon || null, actors: actors(lm.actors), chainActor: actorUuid || null, ...extra });
        updated++;
      } else {
        out.push({
          id: makeId(chain, s), name: label, lat: s.lat, lon: s.lon, placeId: s.id, chain, chainActor: actorUuid || null,
          actors: actorUuid ? [actorUuid] : [], icon: icon || null, glow: false, tone: "gold", visibility: "discovered", hidden: false, ...extra
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
