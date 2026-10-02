// A city's data in Foundry: its place labels (with the GM's edits), its landmarks (seeded by the
// city pack, edited by the GM), and its search data. Edits are world settings keyed by city, so
// every scene of a city shares them.

import { buildPlaces, compileCorrections, coverPlaces, minZoomForRank, toGeoJSON } from "./places.mjs";
import { mergeLandmarks } from "./landmarks.mjs";
import { addressFinder, buildIndex, decodeAddresses, decodeStreet, normalize } from "./search.mjs";
import { metres } from "./geo.mjs";

const getJson = async (url) => {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`could not load ${url} (HTTP ${res.status})`);
  return res.json();
};

/* ---------------------------------------- */
/*  Place labels                             */
/* ---------------------------------------- */

export class PlaceStore {
  /**
   * getEdits(): { edits, added } for this city; setEdits(value); getBusinessMode(): the setting;
   * getLandmarks(): this city's landmarks (a place a landmark names is drawn once, as the landmark).
   */
  constructor({ getEdits, setEdits, getBusinessMode, getLandmarks }) {
    Object.assign(this, { getEdits, setEdits, getBusinessMode, getLandmarks });
    this.raw = [];
    this.corrections = compileCorrections({});
    this.places = [];
    this.byId = new Map();
    this.covers = new Map();
    this.layer = null;
  }

  async load(url, eraPlaces = {}) {
    const raw = await getJson(url);
    this.raw = raw.map((p) => ({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, minZoom: minZoomForRank(p.rank) }));
    this.corrections = compileCorrections(eraPlaces);
  }

  rebuild() {
    this.places = buildPlaces(this.raw, this.corrections, this.getEdits(), { businesses: this.getBusinessMode() });
    this.covers = coverPlaces(this.places, this.getLandmarks(), normalize);
    this.byId = new Map(this.places.map((p) => [p.id, p]));
    this.layer?.setPlaces(toGeoJSON(this.places));
  }

  /** Change the edits: mutate({ edits, added }). */
  async save(mutate) {
    const value = foundry.utils.deepClone(this.getEdits() ?? {});
    value.edits ??= {};
    value.added ??= {};
    mutate(value);
    await this.setEdits(value);
  }
}

/* ---------------------------------------- */
/*  Landmarks                                */
/* ---------------------------------------- */

export class LandmarkStore {
  /** getSaved(): { list, removed } or null for this city; setSaved(value); seed: the city pack's landmarks. */
  constructor({ getSaved, setSaved }) {
    Object.assign(this, { getSaved, setSaved });
    this.seed = [];
  }

  /** The GM's list kept up to date with the city pack's seed, or the seed until the GM first saves. */
  get list() {
    const saved = this.getSaved();
    return mergeLandmarks(saved?.list ?? null, this.seed, saved?.removed ?? []);
  }

  /** Drawn for this user: the GM sees hidden ones too. */
  get visible() {
    return game.user.isGM ? this.list.map((lm) => ({ ...lm, hidden: false })) : this.list.filter((lm) => !lm.hidden);
  }

  get(id) {
    return this.list.find((l) => l.id === id) ?? null;
  }

  /** Save the whole list; remove: an id that must not come back from the seed. */
  async save(list, { remove = null } = {}) {
    const removed = new Set(this.getSaved()?.removed ?? []);
    if (remove) removed.add(remove);
    await this.setSaved({ list, removed: [...removed] });
  }
}

/* ---------------------------------------- */
/*  Search data and addresses                */
/* ---------------------------------------- */

export class SearchData {
  constructor() {
    this.url = null;
    this.data = null;
  }

  /** Load once per city (about 5 MB); concurrent callers share the request. */
  load(url) {
    if (this.url !== url) { this.url = url; this.data = null; }
    this.data ??= getJson(url).then(({ streets, addresses }) => {
      const findAddress = addressFinder(streets, addresses);
      // House numbers on a 100 m grid, for "what is the address here?".
      const grid = new Map();
      streets.forEach((s, si) => {
        for (const [num, lon, lat] of decodeAddresses(addresses[si], s)) {
          const key = `${Math.floor(lon * 1000)},${Math.floor(lat * 1000)}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push({ num, lon, lat, street: s.n, area: s.a ?? s.t ?? null });
        }
      });
      return { streets, addresses, findAddress, grid };
    }).catch((err) => { this.data = null; throw err; });
    return this.data;
  }

  /** The nearest house number within 60 m: { text: "193 Salem Street", area } or null. */
  async addressAt(lat, lon) {
    if (!this.url) return null;
    const { grid } = await this.load(this.url);
    let best = null, bd = 60;
    const cx = Math.floor(lon * 1000), cy = Math.floor(lat * 1000);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const a of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = metres({ lat, lon }, a);
        if (d < bd) { bd = d; best = a; }
      }
    }
    return best ? { text: `${best.num} ${best.street}`, area: best.area } : null;
  }

  /** The search entries for a scene's box, with its places and landmarks. */
  async entries({ bounds, places, landmarks }) {
    const { streets } = await this.load(this.url);
    return buildIndex({ streets, places, landmarks, bounds });
  }

  async streetLines(index, bounds) {
    const { streets } = await this.load(this.url);
    return decodeStreet(streets[index]).lines
      .filter((l) => !bounds || l.some(([lon, lat]) => lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north));
  }
}
