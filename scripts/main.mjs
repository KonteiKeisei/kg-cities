import { canvasScaleForTileZoom, latLonToScene, makeFrame, sceneToLatLon } from "./geo.mjs";
import { CityLayer } from "./map-layer.mjs";
import { DATA_VERSION, generateCity, isUpdating, loadCities, loadCityPack, openGenerator, refreshTransit, updateCityData } from "./generator.mjs";
import { DEFAULT_TILT, NIGHT_MIN_SCALE, leanFor } from "./style.mjs";
import { LandmarkStore, PlaceStore, RoadData, SearchData } from "./city-stores.mjs";
import { mergeLandmarks, pageSummary } from "./landmarks.mjs";
import { HoverCard } from "./ui-card.mjs";
import { MapSearch } from "./ui-search.mjs";
import { PoiEditor } from "./ui-editor.mjs";
import { PlaceCards, VISIBILITY, asHtml, visibilityOf } from "./place-card.mjs";
import { registerPlaceLinks } from "./place-links.mjs";
import { SceneTrail, listenForOpens } from "./ui-trail.mjs";
import { PartyManager, baseParty, groupMembers, partyMeta, partyTitle, sceneParties, selectedParty } from "./party.mjs";
import { installParty } from "./ui-party.mjs";
import { TravelController } from "./travel.mjs";
import { openTravel } from "./ui-travel.mjs";
import { RoadView } from "./ui-roadview.mjs";
import { installFlashBar } from "./flash-bar.mjs";
import { metres as metresBetween } from "./geo.mjs";
import { DEVICES, Phones, directory as phoneDirectory, givePager, migrateUnsleepingPagers, newNumber, phonesHere, placePhone, speakerAt, watchNewPagers } from "./phones.mjs";
import { PhoneUI } from "./ui-phone.mjs";
import { formatNumber, sameNumber } from "./phone-core.mjs";

const MODULE_ID = "kg-cities";
const SETTINGS = { look: "look", lean: "tilt", highDpi: "highDpi", businesses: "businesses", dayStart: "dayStart", nightStart: "nightStart" };
const LOOKS = { auto: "auto", night: "night", day: "day" };

const layer = new CityLayer();
const setting = (key) => game.settings.get(MODULE_ID, key);
/** The city scene flag: { city, era, year, area, bounds, metro, files, version }, or null. */
const cityOf = (scene) => scene?.getFlag(MODULE_ID, "city") ? scene.flags[MODULE_ID] : null;
const url = (p) => (/^(https?:|blob:|data:)/.test(p) ? p : foundry.utils.getRoute(p));
let current = null; // { scene, city, pack, places }
/** Cities the GM was already asked about (update prompt) or already repaired, this session. */
const asked = new Set();
const repaired = new Set();

/* ---------------------------------------- */
/*  The city's points of interest            */
/* ---------------------------------------- */

// Landmarks and label edits are world settings holding every city, keyed by city id, so all of
// a city's scenes share them and a campaign can travel between cities.
let cityId = null;
const ofCity = (key) => (game.settings.get(MODULE_ID, key) ?? {})[cityId] ?? null;
async function setOfCity(key, value) {
  const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, key) ?? {});
  all[cityId] = value;
  await game.settings.set(MODULE_ID, key, all);
}
const searchData = new SearchData();
const roads = new RoadData();
// Parties: dnd5e group actors on the scene, split and merged from the token HUD (KG Realms' own
// when it is active). Travel (stage 3) tells the manager which parties are on the move.
const partyManager = new PartyManager();

/* ---------------------------------------- */
/*  Travel                                   */
/* ---------------------------------------- */

/** A point in words: the landmark there, else the nearest house number. */
async function describePoint(p) {
  const ll = layer.frame ? sceneToLatLon(layer.frame, p) : null;
  if (!ll) return "";
  const lm = drawnLandmarks().find((l) => metresBetween(ll, l) < 80);
  if (lm) return lm.name;
  const a = await searchData.addressAt(ll.lat, ll.lon);
  return a ? [a.text, a.area].filter(Boolean).join(", ") : "";
}

// Dragging a party token on a city scene asks how it goes, then it travels the streets.
const travel = new TravelController({
  route: (from, to, options) => routeOnScene(from, to, options),
  canTravel: (scene) => !!current && current.scene === scene && !!cityOf(scene)?.files?.roads,
  openDialog: (controller, ctx) => openTravel(controller, ctx, { describe: describePoint, city: cityId })
});
// The view out of a cab or a car, for the party inside and the GM who clicks its token.
const roadView = new RoadView(travel);
travel.onTrips = () => roadView.sync();
partyManager.busy = (id) => travel.busy(id);

// Phones at places, pagers on people: calls are put through by the GM in charge's client.
const phones = new Phones({
  dollarRate: () => travel.dollarRate(),
  onChange: (call, before, dropped) => phoneUI.onCall(call, before, dropped),
  onPage: (msg) => phoneUI.onPage(msg)
});
const phoneUI = new PhoneUI({
  phones, dollarRate: () => travel.dollarRate(),
  openCard: (city, id) => cards.open({ kind: "landmark", city, id }, { warnMissing: true })
});
/** Use a phone where this user's character is: the one there, or the first of several. */
function phoneHere() {
  if (game.user.isGM) return phoneUI.switchboard();
  const here = phonesHere();
  if (!here.length) return ui.notifications.warn("There is no phone here. Find a payphone, or a place with a phone.");
  const e = here.find((p) => p.device === "line") ?? here[0];
  return phoneUI.openPlace(e.city, e.id);
}
partyManager.stopTravel = (id) => travel.stop(id, { quiet: true });

/**
 * The fastest route on the city scene on screen, between two points given as scene { x, y } or
 * { lat, lon }: mode "walk" or "drive". { mode, miles, interstateMiles, minutes, line: [[lon, lat]],
 * points: [{ x, y }] } or null when no road joins them. show: draw it on the map for a moment.
 */
async function routeOnScene(from, to, { mode = "walk", show = false } = {}) {
  if (!current || !layer.frame) throw new Error("KG Cities: routes work on a city scene");
  const c = current.city;
  const graph = await roads.load(c.files?.roads ? url(c.files.roads) : null, current.era.map ?? {}, `${c.city}:${c.era}`);
  const ll = (p) => (Number.isFinite(p?.lat) ? [p.lon, p.lat] : (({ lat, lon }) => [lon, lat])(sceneToLatLon(layer.frame, p)));
  const r = graph.route(ll(from), ll(to), mode);
  if (!r) return null;
  if (show) layer.flash?.({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.line } }] });
  return {
    mode, metres: r.metres, interstateMetres: r.interstateMetres, seconds: r.seconds,
    miles: r.metres / 1609.344, interstateMiles: r.interstateMetres / 1609.344, minutes: r.seconds / 60, line: r.line,
    points: r.line.map(([lon, lat]) => latLonToScene(layer.frame, lat, lon))
  };
}
const landmarks = new LandmarkStore({ getSaved: () => ofCity("landmarks"), setSaved: (v) => setOfCity("landmarks", v) });
const places = new PlaceStore({
  getEdits: () => ofCity("placeEdits") ?? { edits: {}, added: {} },
  setEdits: (v) => setOfCity("placeEdits", v),
  getBusinessMode: () => setting(SETTINGS.businesses),
  getLandmarks: () => landmarks.list
});
const projection = {
  sceneToLatLon: (x, y) => (layer.frame ? sceneToLatLon(layer.frame, { x, y }) : null),
  latLonToScene: (lat, lon) => (layer.frame ? latLonToScene(layer.frame, lat, lon) : null)
};
let editor = null;

/* ---------------------------------------- */
/*  Landmarks from other modules             */
/* ---------------------------------------- */

// Other modules can add landmarks to a city's map (KG Transit adds its airports): api.addLandmarks
// takes a function of the city scene's flag returning landmark-like entries { id, name, lat, lon,
// summary, tone: "gold" | "haven" | "airport", buildings?, grounds? (an outline ring, drawn
// dashed), from?, until?, airport? }. They are drawn and hovered like the city's own, but not
// edited or saved. Clicking an entry with `airport` (the GM) calls Hooks "kgCities.airport".
const landmarkSources = new Set();
let addedLandmarks = [];
async function landmarksFromModules(c) {
  const lists = await Promise.all([...landmarkSources].map((fn) => Promise.resolve().then(() => fn(c)).catch((err) => {
    console.warn(`${MODULE_ID} | a module's landmarks failed`, err);
    return [];
  })));
  return lists.flat().filter((lm) => lm?.id && Number.isFinite(lm.lat) && Number.isFinite(lm.lon));
}
const landmarkOrAdded = { get: (id) => landmarks.get(id) ?? addedLandmarks.find((a) => a.id === id) ?? null };
const trail = new SceneTrail({ getLandmark: async (city, id) => (await cityLandmarks(city)).find((l) => l.id === id) ?? null });
const cards = new PlaceCards(placeCardSource());
const openCard = (lm, { edit = false } = {}) => cityId && cards.open({ kind: "landmark", city: cityId, id: lm.id }, { edit });
const card = new HoverCard({
  landmarks: landmarkOrAdded, search: searchData, isEditing: () => !!editor?.editing,
  openCard, enterScene: (lm, scene) => enterScene(cityId, lm, scene, false)
});
editor = new PoiEditor({ places, landmarks, search: searchData, card, api: projection, openCard });
const mapSearch = new MapSearch({ getLayer: () => layer, getPlaces: () => places.places, getLandmarks: () => drawnLandmarks(), data: searchData });

/* ---------------------------------------- */
/*  Place cards                              */
/* ---------------------------------------- */

/** A city's landmarks, drawn or not: the pack's seed with the GM's saved list. */
async function cityLandmarks(city) {
  if (city === cityId && current) return landmarks.list;
  const seed = (await loadCityPack(city).catch(() => null))?.landmarks ?? [];
  const saved = (game.settings.get(MODULE_ID, "landmarks") ?? {})[city];
  return mergeLandmarks(saved?.list ?? null, seed, saved?.removed ?? []);
}

async function saveCityLandmarks(city, list, { remove = null } = {}) {
  const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "landmarks") ?? {});
  const removed = new Set(all[city]?.removed ?? []);
  if (remove) removed.add(remove);
  all[city] = { list, removed: [...removed] };
  await game.settings.set(MODULE_ID, "landmarks", all);
}

/** A scene of this city: the one on screen if it is, else the first. */
const sceneOfCity = (city) => (cityOf(canvas.scene)?.city === city ? canvas.scene : game.scenes.find((s) => cityOf(s)?.city === city) ?? null);

/** The GM goes to a place's scene (all: everyone, by activating it), leaving the way back there. */
async function enterScene(city, lm, scene, all) {
  if (!game.user.isGM || !scene) return;
  await trail.link(scene, { from: sceneOfCity(city), city, landmark: lm.id, name: lm.name });
  return all ? scene.activate() : scene.view();
}

/** Centre the map on a landmark of the city on screen, and make it blink. */
function locate(lm) {
  if (!lm || !layer.frame) return;
  const at = latLonToScene(layer.frame, lm.lat, lm.lon);
  layer.flash?.({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lm.lon, lm.lat] } }] });
  canvas.animatePan({ x: at.x, y: at.y, scale: Math.min(canvasScaleForTileZoom(layer.frame, 17.5), CONFIG.Canvas.maxZoom), duration: 900 });
}

/** Card fields kept only when set. */
const CARD_KEYS = ["img", "known", "rumours", "gmNotes", "scene", "journal"];

function placeCardSource() {
  const find = async (ref) => (await cityLandmarks(ref.city)).find((l) => l.id === ref.id) ?? null;
  return {
    async get(ref) {
      const lm = await find(ref);
      if (!lm) return null;
      const haven = lm.tone === "haven", vis = visibilityOf(lm);
      const cityName = (await loadCities()).find((c) => c.id === ref.city)?.name ?? "";
      const here = ref.city === cityId && !!current;
      const address = here ? await searchData.addressAt(lm.lat, lm.lon).catch(() => null) : null;
      const scene = lm.scene ? game.scenes.get(lm.scene) : null;
      // An older landmark's text is its short summary until the GM writes What is known.
      const known = lm.known ?? asHtml(lm.summary);
      const journal = lm.journal ?? lm.page ?? null;
      const phone = lm.phone?.number && DEVICES[lm.phone.kind] ? lm.phone : null;
      const phoneEntry = phone ? placePhone(ref.city, lm.id) : null;
      return {
        rows: phone && (game.user.isGM || vis === "discovered") ? [[DEVICES[phone.kind].label, formatNumber(phone.number)]] : [],
        phone: phone ? { label: DEVICES[phone.kind].label, here: game.user.isGM || !!(phoneEntry && speakerAt(phoneEntry)) } : null,
        name: lm.name || "Landmark", type: haven ? "Safe haven" : "Point of interest", tone: haven ? "haven" : "gold", icon: haven ? "fa-house-chimney" : "fa-landmark",
        subtitle: [address?.text, address?.area, here ? "" : cityName].filter(Boolean).join(" · "),
        img: lm.img ?? "", known, gmNotes: lm.gmNotes ?? "", rumours: lm.rumours ?? "", visibility: vis,
        actors: lm.actors ?? [], journal, images: lm.images ?? [], scene: lm.scene ?? null,
        enterLabel: scene ? (cityOf(scene) ? `Go to ${scene.name}` : `Enter ${lm.name}`) : null,
        locate: here, canDelete: true,
        mapNote: "Where it is, its shape, glow and kind are set on the map: turn on Edit points of interest and click it.",
        form: { name: lm.name ?? "", img: lm.img ?? "", visibility: vis, rumours: lm.rumours ?? "", known, gmNotes: lm.gmNotes ?? "", scene: lm.scene ?? "", actors: lm.actors ?? [], journal: journal ?? "", images: lm.images ?? [], phoneKind: phone?.kind ?? "none", phoneNumber: phone ? formatNumber(phone.number) : "" }
      };
    },
    async save(ref, v) {
      if (!game.user.isGM) return;
      const list = await cityLandmarks(ref.city), lm = list.find((l) => l.id === ref.id);
      if (!lm) return;
      const out = { ...lm };
      if ("name" in v) out.name = v.name || lm.name;
      if ("visibility" in v) { out.visibility = VISIBILITY[v.visibility] ? v.visibility : "discovered"; out.hidden = out.visibility === "hidden"; }
      for (const k of CARD_KEYS) if (k in v) out[k] = v[k] || null;
      for (const k of ["actors", "images"]) if (k in v) out[k] = v[k] ?? [];
      // What is known takes over from the short summary; the journal field from the old page link.
      if ("known" in v) { out.known = v.known ?? ""; delete out.summary; }
      if ("journal" in v) delete out.page;
      for (const k of [...CARD_KEYS, "actors", "images"]) if (out[k] == null || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
      if ("known" in v) out.known ??= "";
      // The place's phone: a line or a payphone with its number, or none.
      if ("phoneKind" in v) {
        if (DEVICES[v.phoneKind]?.on === "place") {
          const number = formatNumber(v.phoneNumber) || newNumber();
          const clash = phoneDirectory().find((e) => sameNumber(e.number, number) && !(e.kind === "place" && e.city === ref.city && e.id === lm.id));
          if (clash) ui.notifications.warn(`KG Cities: ${number} is already ${clash.name}'s number. Calls to it reach whichever is listed first.`);
          out.phone = { kind: v.phoneKind, number };
        } else delete out.phone;
      }
      await saveCityLandmarks(ref.city, list.map((l) => (l.id === lm.id ? out : l)));
    },
    async remove(ref) {
      if (!game.user.isGM) return;
      const lm = await find(ref);
      if (!lm) return;
      if (ref.city === cityId && current) return editor.removeLandmark(lm);
      const list = await cityLandmarks(ref.city);
      return saveCityLandmarks(ref.city, list.filter((l) => l.id !== lm.id), { remove: lm.id });
    },
    async enter(ref, all) {
      const lm = await find(ref);
      return enterScene(ref.city, lm, lm?.scene ? game.scenes.get(lm.scene) : null, all);
    },
    async locate(ref) { if (ref.city === cityId && current) locate(await find(ref)); },
    phone: (ref) => phoneUI.openPlace(ref.city, ref.id),
    newNumber: () => newNumber(),
    async placeChoices(ref) {
      const city = ref?.city ?? cityId;
      if (!city) return [];
      const cityName = (await loadCities()).find((c) => c.id === city)?.name ?? city;
      return (await cityLandmarks(city)).filter((l) => game.user.isGM || visibilityOf(l) !== "hidden").map((l) => ({
        name: l.name, where: `${l.tone === "haven" ? "Safe haven" : "Point of interest"}, ${cityName}`, ref: { kind: "landmark", city, id: l.id }
      }));
    }
  };
}

/**
 * Journal-style points of interest to place cards, once (the GM in charge, on load): a linked
 * page's text becomes What is known, shown to players as the page was; its first picture becomes
 * the art when there is none. The journal stays linked, as the card's Journal button. Points of
 * interest the GM already wrote a card for are left alone. Returns how many changed.
 */
async function convertJournalLandmarks() {
  const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "landmarks") ?? {});
  let n = 0;
  for (const saved of Object.values(all)) {
    for (const lm of saved?.list ?? []) {
      if (!lm.page || lm.known != null) continue;
      const doc = await fromUuid(lm.page).catch(() => null);
      if (!doc) continue;
      const pages = doc.documentName === "JournalEntry" ? doc.pages.contents : [doc];
      const html = pages.map((p) => p.text?.content ?? "").join("").trim();
      const summary = String(lm.summary ?? "").trim();
      const plain = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      lm.known = `${summary && !plain(html).includes(summary) ? asHtml(summary) : ""}${html}`;
      lm.img ||= pages.find((p) => p.type === "image")?.src ?? pageSummary(html).img ?? undefined;
      if (!lm.img) delete lm.img;
      lm.journal = lm.page;
      delete lm.page;
      delete lm.summary;
      n++;
    }
  }
  if (!n) return 0;
  await game.settings.set(MODULE_ID, "landmarks", all);
  ui.notifications.info(`KG Cities: ${n} point${n === 1 ? "" : "s"} of interest now carry their journal text on their place cards. The journals stay linked.`);
  return n;
}

Hooks.once("ready", () => {
  listenForOpens();
  phones.install();
  // Unsleeping Pagers' pagers, numbers and page logs, once (installed or not).
  migrateUnsleepingPagers().then(() => phoneUI.refresh()).catch((err) => console.error(`${MODULE_ID} | Unsleeping Pagers migration`, err));
  if (game.users.activeGM?.isSelf) convertJournalLandmarks().catch((err) => console.error(`${MODULE_ID} | journal conversion`, err));
});

/** What the map draws of the landmarks: a card's text changing does not redraw the city. */
const DRAWN_KEY_SKIP = new Set(["img", "known", "rumours", "gmNotes", "scene", "journal", "page", "summary", "actors", "images", "visibility", "phone"]);
const drawnKey = () => JSON.stringify(drawnLandmarks().map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !DRAWN_KEY_SKIP.has(k)))));
let lastDrawnKey = null;

/* ---------------------------------------- */
/*  Day and night                            */
/* ---------------------------------------- */

/** The hour of the world's clock (Calendaria's when installed: it drives game.time.calendar). */
function worldHour() {
  const c = game.time.calendar?.timeToComponents?.(game.time.worldTime);
  return c?.hour ?? 12;
}

/** "night" or "day": the setting, or the world clock when it follows the time of day. */
function currentLook() {
  const look = setting(SETTINGS.look);
  if (look !== LOOKS.auto) return look;
  const h = worldHour();
  return h >= setting(SETTINGS.dayStart) && h < setting(SETTINGS.nightStart) ? LOOKS.day : LOOKS.night;
}

/* ---------------------------------------- */
/*  Settings                                 */
/* ---------------------------------------- */

/** Which local build is running (the browser console says, at load). */
const BUILD = "2026-11-11 phones";

Hooks.once("init", () => {
  console.info(`kg-cities | ${game.modules.get(MODULE_ID)?.version} (build ${BUILD})`);
  const register = (key, data) => game.settings.register(MODULE_ID, key, data);
  const redraw = () => drawCity();
  register(SETTINGS.look, {
    name: "Map look",
    hint: "Follow the time of day (Calendaria's clock when it is installed, otherwise the world time), or keep the map always night or always day.",
    scope: "world", config: true, type: String, default: LOOKS.auto,
    choices: { [LOOKS.auto]: "Follow the time of day", [LOOKS.night]: "Always night", [LOOKS.day]: "Always day" },
    onChange: () => layer.setLook(currentLook())
  });
  register(SETTINGS.dayStart, {
    name: "Day starts at", hint: "Hour (0 to 23) the map turns to its day look, when following the time of day.",
    scope: "world", config: true, type: Number, default: 6, range: { min: 0, max: 23, step: 1 }, onChange: () => layer.setLook(currentLook())
  });
  register(SETTINGS.nightStart, {
    name: "Night starts at", hint: "Hour (0 to 23) the map turns to its night look, when following the time of day.",
    scope: "world", config: true, type: Number, default: 19, range: { min: 0, max: 23, step: 1 }, onChange: () => layer.setLook(currentLook())
  });
  register(SETTINGS.lean, {
    name: "Building tilt",
    hint: "How far the view tilts from straight down, in degrees: buildings lean up-screen by their height, so the city reads in 3D while every footprint stays in place. 0 is a flat map; 17 is the standard.",
    scope: "client", config: true, type: Number, default: DEFAULT_TILT, range: { min: 0, max: 35, step: 1 }, onChange: redraw
  });
  register(SETTINGS.highDpi, {
    name: "Sharp map on high-DPI screens", hint: "Draws the map at your screen's full resolution when its scaling is 150% or more.",
    scope: "client", config: true, type: Boolean, default: true, onChange: redraw
  });
  register(SETTINGS.businesses, {
    name: "Shops and restaurants",
    hint: "In a past era most of today's businesses were not there. Landmarks, places on the era's list and your own edits always show by name; this decides the rest.",
    scope: "world", config: true, type: String, default: "generic",
    choices: { generic: "By type only (Restaurant, Bank, Package Store)", hide: "Hidden", show: "Today's names, minus chains that arrived later" },
    onChange: () => refreshPlaces()
  });
  register("tileServer", {
    name: "Map tile server",
    hint: "Optional. The TileJSON address of a server of OpenMapTiles-schema vector tiles to download cities from, if you host your own. Empty uses OpenFreeMap (free, no key). Applies to cities generated or refreshed from now on.",
    scope: "world", config: true, type: String, default: ""
  });

  // { [city]: { list, removed } } once the GM edits a city's landmarks; until then the pack's seed.
  register("landmarks", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => {
      card.refresh();
      cards.refresh();
      // A place's phone may have been added, changed or taken out.
      phoneUI.refresh();
      // The way back shows the place's actors and journal: they may have changed.
      if (trail.el) trail.draw();
      // Only what the map draws redraws the city; a card's text, art or links do not.
      if (current && drawnKey() !== lastDrawnKey) drawCity();
      else if (current) mapSearch.entries = null;
    }
  });
  // Phones: the GM's own numbers (people and businesses not on the map), how long a phone rings,
  // and each user's volume for rings, tones and pagers.
  register("phoneNumbers", { scope: "world", config: false, type: Array, default: [], onChange: () => phoneUI.refresh() });
  register("phoneRingSeconds", {
    name: "Phones ring for", hint: "Seconds a phone rings before the caller hears no answer.",
    scope: "world", config: true, type: Number, default: 30, range: { min: 10, max: 120, step: 5 }
  });
  register("phoneVolume", {
    name: "Phone and pager volume", hint: "Rings, dial tones, keypad tones and pager alerts, on this computer. 0 is silent.",
    scope: "client", config: true, type: Number, default: 0.6, range: { min: 0, max: 1, step: 0.05 }
  });
  phoneUI.install();
  watchNewPagers();

  // { [city]: { edits: { placeId: {...} }, added: { id: {...} } } }: the GM's label edits.
  register("placeEdits", { scope: "world", config: false, type: Object, default: {}, onChange: () => refreshPlaces() });

  game.keybindings.register(MODULE_ID, "search", {
    name: "Search the map",
    hint: "Find a place, landmark, street or address on a city map.",
    editable: [{ key: "KeyF", modifiers: ["Control"] }],
    onDown: () => {
      if (!cityOf(canvas.scene)) return false;
      mapSearch.toggle();
      return true;
    }
  });

  // @CityPlace[city:id]{Name} in any text opens that place's card.
  registerPlaceLinks(cards);
  installParty({ manager: partyManager, isCityScene: (s) => !!cityOf(s) });
  travel.install();
  roadView.install();
  // Flash Token Bar 5e: the city's parties are its favourites, kept in step with splits and merges.
  installFlashBar({ isCityScene: (s) => !!cityOf(s) });

  layer.onError = (err) => {
    console.warn(`${MODULE_ID} |`, err);
    const cityId = cityOf(canvas.scene)?.city;
    // The saved map cannot be read: download the city fresh by itself (once per session).
    if (err.mapUnreadable && game.user.isGM && cityId && !repaired.has(cityId)) {
      repaired.add(cityId);
      ui.notifications.warn(`KG Cities: the saved map could not be read (${err.message}). Downloading the city fresh; its scenes update when done.`);
      updateCityData(cityId, { refresh: true });
      return;
    }
    if (game.user.isGM) ui.notifications.error(`KG Cities: ${err.message}`);
  };

  // Map scenes zoom out past Foundry's usual limit, into the night view. Foundry also rounds zoom
  // to 0.01, which would stick at small scales, so below 0.2 the requested scale is kept.
  const Canvas = foundry.canvas.Canvas;
  const constrain = Canvas.prototype._constrainView;
  Canvas.prototype._constrainView = function (view = {}) {
    const out = constrain.call(this, view);
    const wanted = view.scale;
    if (!out || !Number.isFinite(wanted) || wanted >= 0.2 || !cityOf(this.scene)) return out;
    return { ...out, scale: Math.max(NIGHT_MIN_SCALE, Math.round(wanted * 10000) / 10000) };
  };

  game.modules.get(MODULE_ID).api = {
    get layer() { return layer; },
    cities: () => loadCities(),
    generate: () => openGenerator(),
    /** Rebuild a city's data and update its scenes (no new scene); refresh: download it fresh. */
    updateData: (cityId, { refresh = false } = {}) => updateCityData(cityId, { refresh }),
    /**
     * A city's rapid transit for an era, for transit modules: { features (track, coloured, with
     * tunnel/elevated flags), lines: [{ ref, name, color, colorNight, mode }], stations? }. The
     * era's own network when its city pack has one (Boston 1986), else today's from OpenStreetMap.
     */
    async transit(cityId, era = "1980s") {
      const pack = await loadCityPack(cityId);
      const own = pack.eras?.[era]?.map?.transit;
      if (own) return own;
      const res = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/data/transit/${cityId}.json`));
      return res.ok ? res.json() : null;
    },
    /** Fetch a city's transit lines fresh from Overpass into its data, e.g. refreshTransit("new-york"). */
    refreshTransit: (cityId) => refreshTransit(cityId),
    /** The city scene's flag, or null. */
    cityOf,
    /**
     * The fastest route on the city scene on screen: route(from, to, { mode: "walk" | "drive", show }),
     * points as scene { x, y } or { lat, lon }. Walking at 3 mph, driving at 35 mph and 55 on
     * interstates, in the scene's era. See routeOnScene.
     */
    route: (from, to, options) => routeOnScene(from, to, options),
    /**
     * Parties (dnd5e group actors; KG Realms' parties count too): scene(scene) the party token
     * documents on a scene, in party order; selected(scene, explicit?) the one to act on (the
     * selected party token, else the scene's only one; throws when several and none selected);
     * members(actor) a party's member actors; meta(actor) its { family, baseName, number }.
     */
    parties: {
      scene: (scene = canvas.scene) => sceneParties(scene),
      selected: (scene = canvas.scene, explicit = null) => selectedParty(scene, explicit),
      members: (actor) => groupMembers(actor),
      meta: (actor) => partyMeta(actor),
      /** The party (the setting's group actor, else dnd5e's primary party), and its own title. */
      base: () => baseParty(),
      title: (actor) => partyTitle(actor)
    },
    /**
     * Phones and pagers: directory() every number (place phones, pagers, the GM's numbers);
     * open(city, id) a place's phone; here() the phone where the user's character is;
     * switchboard() (GM); givePager(actor, "tone" | "numeric" | "alpha"); page(number, text) (GM);
     * dial(number, { as }) (GM, from nowhere). A carried phone would be a new device kind.
     */
    phones: {
      directory: () => phoneDirectory(),
      open: (city, id) => phoneUI.openPlace(city, id),
      here: () => phoneHere(),
      switchboard: () => phoneUI.switchboard(),
      givePager: (actor, model) => givePager(actor, model),
      page: (number, text = "") => phones.pageDirect(number, { text, callback: text }),
      dial: (number, { as = "" } = {}) => phones.dial(number, { as }),
      calls: () => [...phones.calls.values()]
    },
    /** Open a landmark's place card, e.g. openPlaceCard("boston", "seed:..."); edit: the GM's form. */
    openPlaceCard: (city, id, { edit = false } = {}) => cards.open({ kind: "landmark", city, id }, { edit, warnMissing: true }),
    /**
     * Add landmarks to city maps from another module: fn(cityFlag) returns (or resolves to) a list
     * of landmark-like entries (see "Landmarks from other modules" above). Returns a function that
     * removes them again. The current scene is redrawn with them.
     */
    addLandmarks(fn) {
      landmarkSources.add(fn);
      if (current) drawCity();
      return () => { landmarkSources.delete(fn); if (current) drawCity(); };
    },
    /**
     * A city scene of this city and era whose map covers the point, preferring the smallest (the
     * core over the metro), or null.
     */
    sceneCovering(cityId, { lat, lon, era = "1980s" } = {}) {
      const fits = game.scenes.filter((s) => {
        const c = cityOf(s);
        return c?.city === cityId && (c.era ?? "1980s") === era && c.bounds
          && lat <= c.bounds.north && lat >= c.bounds.south && lon >= c.bounds.west && lon <= c.bounds.east;
      });
      const span = (s) => (cityOf(s).bounds.north - cityOf(s).bounds.south) * (cityOf(s).bounds.east - cityOf(s).bounds.west);
      return fits.sort((a, b) => span(a) - span(b))[0] ?? null;
    },
    /**
     * Make a city scene without the dialog: { era, year, area: "core" | "metro", name, view }.
     * area "auto" picks the core when it covers the point { lat, lon } given, else the metro.
     * Returns the scene, or null when it failed (the GM is told why).
     */
    async generateCity(cityId, { era = "1980s", year = 1986, area = "core", at = null, name, view = true } = {}) {
      const city = (await loadCities()).find((c) => c.id === cityId);
      if (!city) throw new Error(`KG Cities has no city "${cityId}"`);
      if (area === "auto") {
        const [lon, lat] = city.core.center, [w, h] = city.core.miles;
        const dLat = (h * 1609.344) / 111320 / 2, dLon = (w * 1609.344) / (111320 * Math.cos((lat * Math.PI) / 180)) / 2;
        area = at && Math.abs(at.lat - lat) <= dLat * 0.95 && Math.abs(at.lon - lon) <= dLon * 0.95 ? "core" : "metro";
      }
      return generateCity(city, { era, year, area, view, name: name ?? `${city.name}, ${year}${area === "metro" ? " (metro)" : ""}` });
    },
    latLonToScene: (lat, lon) => (layer.frame ? latLonToScene(layer.frame, lat, lon) : null),
    sceneToLatLon: (x, y) => (layer.frame ? sceneToLatLon(layer.frame, { x, y }) : null),
    /** A lat/lon to scene projection for any city scene, drawn or not. */
    projector(scene) {
      const c = cityOf(scene);
      const rect = scene?.dimensions?.sceneRect;
      if (!c || !rect) return null;
      const frame = makeFrame(c.bounds, rect);
      return (lat, lon) => latLonToScene(frame, lat, lon);
    }
  };
});

/* ---------------------------------------- */
/*  Drawing                                  */
/* ---------------------------------------- */

async function drawCity() {
  teardown();
  const scene = canvas.scene;
  const c = cityOf(scene);
  if (!canvas.ready || !c) return;
  // Older data: offer the rebuild once per city per session (declined or failed, the map is
  // drawn as it is and the GM is not asked again until reload).
  if (c.version !== DATA_VERSION && game.user.isGM && !asked.has(c.city) && !isUpdating(c.city)) {
    asked.add(c.city);
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Update city data" },
      content: `<p>This city's data was made by an older version of KG Cities. Rebuild it now? The saved map is reused when it can be read, otherwise the city is downloaded fresh. Nothing on the scene changes.</p>`
    });
    if (canvas.scene !== scene) return;
    if (ok && await updateCityData(c.city)) return; // the scene update redraws it
  }
  const pack = await loadCityPack(c.city);
  const info = (await loadCities()).find((x) => x.id === c.city);
  const era = pack.eras?.[c.era] ?? {};
  const files = Object.fromEntries(Object.entries(c.files).map(([k, v]) => [k, url(v)]));
  current = { scene, city: c, pack, era };
  cityId = c.city;
  landmarks.seed = pack.landmarks ?? [];
  addedLandmarks = await landmarksFromModules(c);
  if (searchData.url !== (files.search ?? null)) { searchData.url = files.search ?? null; searchData.data = null; }
  places.layer = layer;
  await layer.draw({
    // The key goes into tile addresses (kgcities://key/z/x/y), so it must not contain a slash.
    key: `${c.city}-${c.stamp ?? c.version}`, files, bounds: c.bounds, metro: c.metro,
    look: currentLook(), lean: leanFor(setting(SETTINGS.lean)), era: era.map ?? {}, year: c.year ?? null,
    sharp: setting(SETTINGS.highDpi) && window.devicePixelRatio >= 1.5,
    // The city's landmarks (the pack's, kept up to date, and the GM's) that stood in the scene's
    // year: the World Trade Center before 2001.
    landmarks: drawnLandmarks(),
    // The city's own name is not labelled on its own map.
    cityNames: [info?.name, ...(info?.aliases ?? [])].filter(Boolean)
  });
  if (current?.scene !== scene) return;
  try {
    await places.load(files.places, era.places ?? {});
    places.rebuild();
  } catch (err) {
    console.warn(`${MODULE_ID} | places`, err);
  }
  card.attach(layer);
  editor.attach(layer);
  if (editor.editing) layer.setEditing(true);
  lastDrawnKey = drawnKey();
  // Back from a place's scene by the trail: centre on the place.
  const focus = trail.takeFocus(scene.id);
  if (focus) locate(landmarks.get(focus));
}

/** In the scene's year: from (built) up to until (gone). */
const inSceneYear = (x) => {
  const year = current?.city?.year;
  return year == null || ((x.from == null || year >= x.from) && (x.until == null || year < x.until));
};
/** A module's landmark takes the place of the city's own of the same name (Logan as an airport, not a pin). */
const drawnLandmarks = () => {
  const names = new Set(addedLandmarks.map((a) => a.name?.toLowerCase()));
  return [...landmarks.visible.filter((lm) => !names.has(lm.name?.toLowerCase())), ...addedLandmarks].filter(inSceneYear);
};

function refreshPlaces() {
  if (current && places.raw.length) places.rebuild();
}

function teardown() {
  card.detach();
  editor.detach();
  mapSearch.close();
  layer.destroy();
  current = null;
}

Hooks.on("canvasReady", () => { trail.draw(); drawCity(); });
Hooks.on("canvasTearDown", () => { trail.remove(); teardown(); });
Hooks.on("canvasPan", () => layer.update());
Hooks.on("updateScene", (scene, changes) => {
  if (scene !== canvas.scene) return;
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.returnTo`) || "name" in changes || "navName" in changes) trail.draw();
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) && !foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.returnTo`)) drawCity();
});
// The GM in charge holds the calls: when no GM is left, every call is cut.
Hooks.on("userConnected", (user, connected) => {
  if (user.isGM && !connected && !game.users.activeGM) phones.dropAll();
});
Hooks.on("updateWorldTime", () => {
  if (setting(SETTINGS.look) === LOOKS.auto) layer.setLook(currentLook());
});

/* ---------------------------------------- */
/*  Scene controls                           */
/* ---------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  // Phones work on every scene: a place's interior is often not a city map.
  if (controls.tokens) {
    controls.tokens.tools.kgCitiesPhone = game.user.isGM
      ? { name: "kgCitiesPhone", title: "Switchboard: calls, place phones, pagers and your numbers", icon: "fa-solid fa-tower-broadcast", order: 120, button: true, onChange: () => phoneUI.switchboard() }
      : { name: "kgCitiesPhone", title: "Use a phone here", icon: "fa-solid fa-phone", order: 120, button: true, onChange: () => phoneHere() };
  }
  if (!cityOf(canvas.scene)) return;
  // Search is for everyone, on the token controls players always have.
  if (controls.tokens) {
    controls.tokens.tools.kgCitiesSearch = {
      name: "kgCitiesSearch", title: "Search the map (Ctrl+F)", icon: "fa-solid fa-magnifying-glass-location",
      order: 100, button: true, onChange: () => mapSearch.toggle()
    };
  }
  // With the token tools, where KG Realms keeps its editor.
  if (controls.tokens && game.user.isGM) {
    controls.tokens.tools.kgCitiesEdit = {
      name: "kgCitiesEdit", title: "Edit points of interest (click a label, landmark or building; shift-click for a pin)",
      icon: "fa-solid fa-landmark", order: 110, toggle: true, active: editor.editing,
      onChange: (event, active) => editor.setEditing(active)
    };
  }
});

/* ---------------------------------------- */
/*  Generate button (Scenes sidebar)         */
/* ---------------------------------------- */

Hooks.on("renderSceneDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".kg-cities-generate-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "kg-cities-generate-button";
  button.innerHTML = `<i class="fa-solid fa-city"></i> Generate city`;
  button.addEventListener("click", () => openGenerator());
  const actions = root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root;
  actions.append(button);
});
