import { boxAround, formatDistance, sceneSize } from "./geo.mjs";
import { ATTRIBUTION, downloadTiles, tileSource, tilesFor } from "./download.mjs";
import { Archive, gzip, writeArchive } from "./pmtiles.mjs";
import { nightView, placeList, tallBuildings, transitLines, transitRoutes } from "./derive.mjs";
import { searchIndex } from "./search-index.mjs";

const MODULE_ID = "kg-cities";
/** Real scale of every city scene, as the Boston campaign scene: 100 px = 250 ft. */
export const FEET_PER_PIXEL = 2.5;
/**
 * Scene grid at the map's true scale (2.5 ft per pixel), so rulers measure real distances:
 * LAX runway 25R measures 12,860 ft against its official 12,923 ft.
 */
export const GRID = { size: 100, distance: 250, units: "ft" };
/** Bumped when the generated files change shape, so old cities are offered a rebuild. */
export const DATA_VERSION = 5;
export const ERAS = {
  "1980s": { label: "1980s", year: 1986, ready: true },
  modern: { label: "Modern", year: null, ready: false }
};
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Where uploads go: The Forge's storage when hosted there, else the Data folder. */
export function storageSource() {
  return globalThis.ForgeVTT?.usingTheForge ? "forgevtt" : "data";
}


/**
 * The extension the city's map file is saved with. Foundry only accepts some file types for
 * upload, and .pmtiles is not one; the bytes are the same whatever the name.
 */
function mapExtension() {
  const ok = CONST.UPLOADABLE_FILE_EXTENSIONS ?? {};
  return ["pmtiles", "bin", "glb", "pdf"].find((e) => e in ok) ?? "pdf";
}

/** The folder a city's files live in, and their paths. */
export function cityFiles(id) {
  const dir = `${MODULE_ID}/${id}`;
  return {
    dir,
    meta: `${dir}/meta.json`,
    map: `${dir}/map.${mapExtension()}`,
    buildings: `${dir}/buildings.json`,
    places: `${dir}/places.json`,
    transit: `${dir}/transit.json`,
    search: `${dir}/search.json`,
    lights: `${dir}/lights.json`,
    night: `${dir}/night.webp`
  };
}

let cityList = null;
export async function loadCities() {
  cityList ??= await (await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/data/cities/index.json`))).json();
  return cityList;
}

/** A city's pack (landmarks, eras), or a bare one while it has none yet. */
export async function loadCityPack(id) {
  // Only cities marked "pack": true in the index have one yet (no 404s in the console).
  const city = (await loadCities()).find((c) => c.id === id);
  if (!city?.pack) return { id, landmarks: [], eras: {} };
  const res = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/data/cities/${id}.json`));
  return res.ok ? res.json() : { id, landmarks: [], eras: {} };
}

/** The city's saved meta.json, or null when it has not been generated here. */
async function existing(id) {
  try {
    const FP = foundry.applications.apps.FilePicker.implementation;
    const found = await FP.browse(storageSource(), cityFiles(id).dir);
    const url = found.files?.find((f) => f.endsWith("/meta.json"));
    if (!url) return null;
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------- */
/*  Dialog                                   */
/* ---------------------------------------- */

export async function openGenerator() {
  if (!game.user.isGM) return;
  const cities = await loadCities();
  const options = cities.map((c) => `<option value="${c.id}">${esc(c.name)}, ${c.state}</option>`).join("");
  const eras = Object.entries(ERAS).map(([k, e]) => `<option value="${k}" ${e.ready ? "" : "disabled"}>${esc(e.label)}${e.ready ? "" : " (coming later)"}</option>`).join("");
  const area = (c, which) => {
    const [w, h] = c[which].miles;
    return `${w} x ${h} mi`;
  };
  const content = `
    <div class="form-group"><label>City</label><div class="form-fields"><select name="city">${options}</select></div></div>
    <div class="form-group"><label>Era</label><div class="form-fields"><select name="era">${eras}</select><input type="number" name="year" value="1986" min="1980" max="1989" step="1" style="max-width:6em" data-tooltip="Year within the 1980s"></div>
      <p class="hint">The 1980s hide later towers, roads and businesses, and show the period's transit. Modern comes later.</p></div>
    <div class="form-group"><label>Scene covers</label><div class="form-fields"><select name="area">
      <option value="core">City core</option><option value="metro">Whole metro area</option></select></div>
      <p class="hint kgc-area"></p></div>
    <div class="form-group"><label>Scene name</label><div class="form-fields"><input type="text" name="name" placeholder="City of Boston (1986)"></div></div>
    <div class="form-group"><label>Download again</label><div class="form-fields"><input type="checkbox" name="refresh"></div>
      <p class="hint">The map data is downloaded once per city (from OpenFreeMap, OpenStreetMap data) and reused by every scene of that city. Tick to fetch it fresh. <b>Refresh data only</b> downloads it fresh and updates this city's scenes without making a new one.</p></div>
    <p class="hint">Scale: 100 px = 250 ft (the real map scale), gridless, measured in feet. The whole metro (about 30 miles across) is always downloaded so the night-from-orbit view has the surroundings.</p>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Generate city", icon: "fa-solid fa-city" },
    classes: ["kg-cities-generate"],
    content,
    rejectClose: false,
    buttons: [
      { action: "go", label: "Generate scene", icon: "fa-solid fa-city", default: true, callback: (e, b) => Object.fromEntries(new FormData(b.form)) },
      { action: "data", label: "Refresh data only", icon: "fa-solid fa-rotate", callback: (e, b) => ({ ...Object.fromEntries(new FormData(b.form)), dataOnly: true }) },
      { action: "cancel", label: "Cancel" }
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      const sync = () => {
        const c = cities.find((x) => x.id === form.elements.city.value);
        const which = form.elements.area.value;
        const box = boxAround(c[which].center, c[which].miles);
        const { width, height } = sceneSize(box, FEET_PER_PIXEL);
        dialog.element.querySelector(".kgc-area").textContent = `${area(c, which)}: a ${width.toLocaleString()} x ${height.toLocaleString()} px scene.${which === "metro" ? " Very large scenes can be slow in Foundry." : ""}`;
        form.elements.name.placeholder = `City of ${c.name} (${form.elements.era.value === "1980s" ? form.elements.year.value : "today"})`;
      };
      for (const el of form.elements) el.addEventListener("change", sync);
      sync();
    }
  });
  if (!result || result === "cancel") return;
  const city = cities.find((c) => c.id === result.city);
  // Download the city again and update its existing scenes, without making a new one.
  if (result.dataOnly) return updateCityData(city.id, { refresh: true });
  const year = Math.max(1980, Math.min(1989, Number(result.year) || 1986));
  return generateCity(city, { era: result.era, year, area: result.area, name: result.name?.trim() || `City of ${city.name} (${result.era === "1980s" ? year : "today"})`, refresh: !!result.refresh });
}

/* ---------------------------------------- */
/*  Pipeline                                 */
/* ---------------------------------------- */

function progressNote(text) {
  const n = ui.notifications.info(text, { progress: true, permanent: true });
  return {
    update: (pct, message) => (n?.update ? n.update({ pct, message }) : null),
    done: (message) => { if (n?.update) n.update({ pct: 1, message }); else ui.notifications.info(message); setTimeout(() => n?.remove?.() ?? ui.notifications.remove?.(n), 4000); }
  };
}

/** Save a file; returns the URL it is served from (a path in the Data folder, or a Forge asset URL). */
async function upload(path, bytes, type) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const parts = path.split("/");
  const file = new File([bytes], parts.pop(), { type });
  const res = await FP.upload(storageSource(), parts.join("/"), file, {}, { notify: false });
  if (!res || res.status === "error") throw new Error(`could not save ${path}${res?.message ? `: ${res.message}` : ""}`);
  return res.path ?? path;
}

async function ensureDir(dir) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  let at = "";
  for (const part of dir.split("/")) {
    at = at ? `${at}/${part}` : part;
    try { await FP.createDirectory(storageSource(), at, {}); } catch { /* already there */ }
  }
}

/**
 * Check the server kept the whole map file: hosts behind some proxies cap upload size (Cloudflare's
 * free plan at 100 MB) and keep a cut-off or error page instead, which only shows up later.
 */
async function verifySaved(url, bytes) {
  const full = /^(https?:|blob:)/.test(url) ? url : foundry.utils.getRoute(url);
  let size = null;
  try {
    const res = await fetch(full, { method: "HEAD", cache: "no-store" });
    size = Number(res.headers.get("content-length")) || null;
  } catch { /* checked below by reading the start */ }
  if (size !== null && size !== bytes.length) {
    throw new Error(`the server kept ${(size / 1e6).toFixed(1)} MB of the ${(bytes.length / 1e6).toFixed(1)} MB map file. Your host may limit upload size (Cloudflare's free plan allows 100 MB per upload).`);
  }
  const head = await fetch(full, { cache: "no-store", headers: { Range: "bytes=0-6" } }).then((r) => r.arrayBuffer()).catch(() => null);
  if (head && new TextDecoder().decode(new Uint8Array(head).subarray(0, 7)) !== "PMTiles") {
    throw new Error("the server did not keep the map file as sent. Your host may limit upload size or change files it serves.");
  }
}

/**
 * The city's transit lines in their colours, with stations. They ship with the module
 * (data/transit, made by tools/build-transit.mjs), so generating never waits on Overpass. A city
 * without a bundled file asks Overpass briefly, then falls back to the plain track in the tiles.
 */
async function cityTransit(city, metro, getTile) {
  try {
    const res = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/data/transit/${city.id}.json`));
    if (res.ok) return await res.json();
  } catch { /* not bundled */ }
  try {
    return await transitRoutes(metro, { timeoutMs: 30000 });
  } catch (err) {
    console.warn(`${MODULE_ID} | transit routes unavailable, using the map's track`, err);
    return transitLines(getTile, metro);
  }
}

/** Derive a city's data from its map archive and save it with its meta. Returns the meta. */
async function deriveAndSave(city, { archive, mapUrl, packed = null, metro, source, note }) {
  const files = cityFiles(city.id);
  const getTile = (z, x, y) => archive.tile(z, x, y);
  note.update(0.65, `${city.name}: finding tall buildings…`);
  const tall = await tallBuildings(getTile, metro, (f) => note.update(0.62 + 0.05 * f, `${city.name}: finding tall buildings… ${Math.round(f * 100)}%`));
  note.update(0.7, `${city.name}: listing places…`);
  const places = await placeList(getTile, metro, (f) => note.update(0.67 + 0.05 * f, `${city.name}: listing places… ${Math.round(f * 100)}%`));
  note.update(0.73, `${city.name}: adding transit lines…`);
  const transit = await cityTransit(city, metro, getTile);
  note.update(0.74, `${city.name}: indexing streets and addresses…`);
  const search = await searchIndex(getTile, metro);
  note.update(0.75, `${city.name}: lighting the city at night…`);
  const night = await nightView(getTile, metro, { onProgress: (f) => note.update(0.75 + 0.15 * f, `${city.name}: lighting the city at night…`) });
  const canvasEl = new OffscreenCanvas(night.width, night.height);
  canvasEl.getContext("2d").putImageData(new ImageData(night.rgba, night.width, night.height), 0, 0);
  const nightBlob = await canvasEl.convertToBlob({ type: "image/webp", quality: 0.88 });

  note.update(0.92, `${city.name}: saving to ${storageSource() === "forgevtt" ? "your Forge assets" : "the Data folder"}…`);
  await ensureDir(files.dir);
  const json = (v) => new TextEncoder().encode(JSON.stringify(v));
  const mapSaved = packed ? await upload(files.map, packed, "application/octet-stream") : mapUrl;
  if (packed) await verifySaved(mapSaved, packed);
  const urls = {
    map: mapSaved,
    buildings: await upload(files.buildings, json(tall), "application/json"),
    places: await upload(files.places, json(places), "application/json"),
    transit: await upload(files.transit, json(transit), "application/json"),
    search: await upload(files.search, json(search), "application/json"),
    lights: await upload(files.lights, json(night.lights), "application/json"),
    night: await upload(files.night, nightBlob, "image/webp")
  };
  const meta = { version: DATA_VERSION, city: city.id, metro, source, attribution: ATTRIBUTION, generated: new Date().toISOString(), files: urls };
  await upload(files.meta, json(meta), "application/json");
  return meta;
}

/** Download (unless already here), derive and save a city's data. Returns its meta. */
async function buildCityData(city, { refresh, note }) {
  let have = refresh ? null : await existing(city.id);
  // A city whose metro area has grown since it was downloaded (San Francisco out to San Jose's
  // airport) is downloaded again: the saved map stops short of it.
  const want = boxAround(city.metro.center, city.metro.miles);
  const covers = (b) => b && b.north >= want.north - 1e-4 && b.south <= want.south + 1e-4 && b.west <= want.west + 1e-4 && b.east >= want.east - 1e-4;
  if (have && !covers(have.metro)) {
    note.update(0, `${city.name}: its map area has grown, downloading it again…`);
    have = null;
  }
  if (have?.version === DATA_VERSION) return have;
  // Data from an older version: rebuild from the map already saved, without downloading. When
  // the saved map cannot be read, download the city fresh instead of failing.
  if (have?.files?.map) {
    const mapUrl = have.files.map;
    try {
      // The whole file in one download: rebuilding reads every tile, and one request per tile is slow.
      note.update(0.6, `${city.name}: reading the saved map…`);
      const full = /^(https?:|blob:)/.test(mapUrl) ? mapUrl : foundry.utils.getRoute(mapUrl);
      const res = await fetch(full, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const archive = new Archive(new Uint8Array(await res.arrayBuffer()));
      await archive.init();
      return await deriveAndSave(city, { archive, mapUrl, metro: have.metro, source: have.source, note });
    } catch (err) {
      console.warn(`${MODULE_ID} | the saved map of ${city.name} (${mapUrl}) could not be read; downloading it fresh`, err);
      note.update(0, `${city.name}: the saved map could not be read, downloading it fresh…`);
    }
  }
  const metro = boxAround(city.metro.center, city.metro.miles);
  const src = await tileSource();
  const list = tilesFor(metro, src.maxZoom);
  note.update(0, `${city.name}: downloading ${list.length} map tiles…`);
  const tiles = await downloadTiles(src.template, list, {
    onProgress: (d, n, b) => { if (d % 20 === 0 || d === n) note.update(0.6 * (d / n), `${city.name}: map tiles ${d} of ${n} (${(b / 1e6).toFixed(0)} MB)`); }
  });
  note.update(0.6, `${city.name}: packing the map…`);
  const source = `OpenFreeMap ${src.version}`;
  const packed = await writeArchive(
    await Promise.all([...tiles].map(async ([k, data]) => { const [z, x, y] = k.split("/").map(Number); return { z, x, y, data: await gzip(data) }; })),
    { bounds: metro, minZoom: 0, maxZoom: src.maxZoom, center: [...city.center, 12], metadata: { city: city.id, source, attribution: ATTRIBUTION } }
  );
  tiles.clear();
  return deriveAndSave(city, { archive: new Archive(packed), packed, metro, source, note });
}

const updating = new Map();

/**
 * Rebuild a city's data (from its saved map, or downloaded fresh with refresh, or when the saved
 * map is unreadable) and bring every scene of that city up to date. No scene is created.
 * Concurrent calls for one city share one run. True when done.
 */
export function updateCityData(cityId, { refresh = false } = {}) {
  if (!updating.has(cityId)) updating.set(cityId, runUpdate(cityId, refresh).finally(() => updating.delete(cityId)));
  return updating.get(cityId);
}

export const isUpdating = (cityId) => updating.has(cityId);

async function runUpdate(cityId, refresh) {
  const city = (await loadCities()).find((c) => c.id === cityId);
  if (!city) return false;
  const note = progressNote(`${city.name}: ${refresh ? "downloading fresh city data" : "updating city data"}…`);
  try {
    const meta = await buildCityData(city, { refresh, note });
    const stamp = Date.now();
    for (const scene of game.scenes.filter((s) => s.getFlag(MODULE_ID, "city") === cityId)) {
      await scene.update({ [`flags.${MODULE_ID}.files`]: meta.files, [`flags.${MODULE_ID}.version`]: DATA_VERSION, [`flags.${MODULE_ID}.stamp`]: stamp });
    }
    note.done(`${city.name}: city data updated.`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} |`, err);
    note.done(`${city.name}: updating failed. ${err.message}`);
    return false;
  }
}
/**
 * Fetch a city's transit lines fresh from Overpass (OpenStreetMap) and save them into its data,
 * replacing the bundled lines. For the console: game.modules.get("kg-cities").api.refreshTransit("new-york").
 * Returns the transit data, or null on failure.
 */
export async function refreshTransit(cityId, { timeoutMs = 120000 } = {}) {
  const city = (await loadCities()).find((c) => c.id === cityId);
  const meta = city && await existing(cityId);
  if (!meta) { ui.notifications.warn(`KG Cities: generate ${city?.name ?? cityId} first.`); return null; }
  const note = progressNote(`${city.name}: fetching transit lines from Overpass (can take a minute or two)…`);
  try {
    const transit = await transitRoutes(meta.metro, { timeoutMs });
    const files = cityFiles(city.id);
    meta.files.transit = await upload(files.transit, new TextEncoder().encode(JSON.stringify(transit)), "application/json");
    await upload(files.meta, new TextEncoder().encode(JSON.stringify(meta)), "application/json");
    const stamp = Date.now();
    for (const scene of game.scenes.filter((s) => s.getFlag(MODULE_ID, "city") === cityId)) {
      await scene.update({ [`flags.${MODULE_ID}.files`]: meta.files, [`flags.${MODULE_ID}.stamp`]: stamp });
    }
    note.done(`${city.name}: ${transit.lines.length} transit lines and ${transit.stations.length} stations saved.`);
    return transit;
  } catch (err) {
    console.error(`${MODULE_ID} |`, err);
    note.done(`${city.name}: transit could not be fetched. ${err.message}`);
    return null;
  }
}

/** Generate: data (downloaded once per city), then a new gridless scene at real scale. */
export async function generateCity(city, { era = "1980s", year = 1986, area = "core", name, refresh = false, view = true } = {}) {
  const note = progressNote(`${city.name}: preparing…`);
  try {
    const meta = await buildCityData(city, { refresh, note });
    const bounds = boxAround(city[area].center, city[area].miles);
    const { width, height } = sceneSize(bounds, FEET_PER_PIXEL);
    const scene = await Scene.implementation.create({
      name, width, height, padding: 0.25,
      backgroundColor: "#000000",
      grid: { type: CONST.GRID_TYPES.GRIDLESS, ...GRID },
      tokenVision: false,
      fog: { exploration: false },
      initial: { x: width / 2, y: height / 2, scale: 0.2 },
      flags: { [MODULE_ID]: { city: city.id, era, year, area, bounds, metro: meta.metro, files: meta.files, version: DATA_VERSION } }
    });
    note.done(`${city.name}: scene "${scene.name}" created (${formatDistance((width * FEET_PER_PIXEL) / 3.28084)} across).`);
    if (view) await scene.view();
    return scene;
  } catch (err) {
    console.error(`${MODULE_ID} |`, err);
    note.done(`${city.name}: generating failed. ${err.message}`);
    ui.notifications.error(`KG Cities: ${city.name} could not be generated. ${err.message}`);
    return null;
  }
}


