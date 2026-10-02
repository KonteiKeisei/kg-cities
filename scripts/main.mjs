import { latLonToScene, makeFrame, sceneToLatLon } from "./geo.mjs";
import { CityLayer } from "./map-layer.mjs";
import { DATA_VERSION, isUpdating, loadCities, loadCityPack, openGenerator, refreshTransit, updateCityData } from "./generator.mjs";
import { buildPlaces, compileCorrections, minZoomForRank, toGeoJSON } from "./places.mjs";
import { NIGHT_MIN_SCALE } from "./style.mjs";

const MODULE_ID = "kg-cities";
const SETTINGS = { look: "look", lean: "lean", highDpi: "highDpi", businesses: "businesses", dayStart: "dayStart", nightStart: "nightStart" };
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

Hooks.once("init", () => {
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
    name: "Leaning buildings",
    hint: "Buildings lean up-screen by their height, so the city reads in 3D while every footprint stays in place. 0 is a flat map.",
    scope: "client", config: true, type: Number, default: 0.5, range: { min: 0, max: 1, step: 0.05 }, onChange: redraw
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
    /** Fetch a city's transit lines fresh from Overpass into its data, e.g. refreshTransit("new-york"). */
    refreshTransit: (cityId) => refreshTransit(cityId),
    /** The city scene's flag, or null. */
    cityOf,
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
  layer.destroy();
  current = null;
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
  current = { scene, city: c, pack, era, places: null };
  await layer.draw({
    // The key goes into tile addresses (kgcities://key/z/x/y), so it must not contain a slash.
    key: `${c.city}-${c.stamp ?? c.version}`, files, bounds: c.bounds, metro: c.metro,
    look: currentLook(), lean: setting(SETTINGS.lean), era: era.map ?? {}, year: c.year ?? null,
    sharp: setting(SETTINGS.highDpi) && window.devicePixelRatio >= 1.5,
    // The city pack's landmarks that stood in the scene's year (the World Trade Center before 2001).
    landmarks: (pack.landmarks ?? []).filter((lm) => c.year == null || ((lm.from == null || c.year >= lm.from) && (lm.until == null || c.year < lm.until))),
    // The city's own name is not labelled on its own map.
    cityNames: [info?.name, ...(info?.aliases ?? [])].filter(Boolean)
  });
  if (current?.scene !== scene) return;
  try {
    const raw = await (await fetch(files.places, { cache: "no-cache" })).json();
    current.places = raw.map((p) => ({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, minZoom: minZoomForRank(p.rank) }));
    refreshPlaces();
  } catch (err) {
    console.warn(`${MODULE_ID} | places`, err);
  }
}

function refreshPlaces() {
  if (!current?.places) return;
  const corrections = compileCorrections(current.era.places ?? {});
  const places = buildPlaces(current.places, corrections, {}, { businesses: setting(SETTINGS.businesses) });
  layer.setPlaces(toGeoJSON(places));
}

Hooks.on("canvasReady", () => drawCity());
Hooks.on("canvasTearDown", () => { layer.destroy(); current = null; });
Hooks.on("canvasPan", () => layer.update());
Hooks.on("updateScene", (scene, changes) => {
  if (scene === canvas.scene && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) drawCity();
});
Hooks.on("updateWorldTime", () => {
  if (setting(SETTINGS.look) === LOOKS.auto) layer.setLook(currentLook());
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
