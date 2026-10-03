// The map search palette, for everyone (Ctrl+F, or the magnifier on the token controls): a
// place, landmark, street or "193 Salem St". Picking a result pans and zooms there while it
// blinks on this screen only. Design: tools/mockups/ui-mockup.html.

import { canvasScaleForTileZoom, formatDistance, latLonToScene, metres, sceneToLatLon } from "./geo.mjs";
import { search } from "./search.mjs";

/** Zoom on a single spot: about where house numbers show. */
const SPOT_TILE_ZOOM = 17.5;
const GROUPS = [["landmark", "Landmarks"], ["address", "Addresses"], ["street", "Streets"], ["place", "Places"]];
const ICONS = { landmark: "fa-landmark", haven: "fa-house-chimney", address: "fa-house", street: "fa-road", place: "fa-location-dot" };
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class MapSearch {
  /** getLayer(), getPlaces(), getLandmarks(): the drawn city; data: SearchData for the city. */
  constructor({ getLayer, getPlaces, getLandmarks, data }) {
    Object.assign(this, { getLayer, getPlaces, getLandmarks, data });
    this.el = null;
    this.entries = null;
    this.indexKey = null;
    this.results = [];
    this.active = 0;
  }

  get open() {
    return !!this.el;
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  /** The scene's lat/lon box: only what is on this map is searched. */
  #bounds(layer) {
    const r = canvas.dimensions.sceneRect;
    const nw = sceneToLatLon(layer.frame, { x: r.x, y: r.y }), se = sceneToLatLon(layer.frame, { x: r.x + r.width, y: r.y + r.height });
    return { north: nw.lat, south: se.lat, west: nw.lon, east: se.lon };
  }

  async #index(layer) {
    const places = this.getPlaces(), landmarks = this.getLandmarks();
    const key = `${canvas.scene?.id}|${places.length}|${landmarks.map((l) => `${l.id}:${l.name}`).join(",")}`;
    if (this.entries && this.indexKey === key) return this.entries;
    this.bounds = this.#bounds(layer);
    this.entries = await this.data.entries({ bounds: this.bounds, places: places.filter((p) => !p.hidden), landmarks });
    this.indexKey = key;
    return this.entries;
  }

  async show() {
    const layer = this.getLayer();
    if (!layer?.ready) return ui.notifications.warn("KG Cities: search works on a city scene.");
    this.close();
    this.el = document.createElement("div");
    this.el.className = "kgc-ui kgc-panel kgc-search loading";
    this.el.innerHTML = `
      <div class="bar"><i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" placeholder="Search a place, street or address" autocomplete="off" spellcheck="false" aria-label="Search the map">
        <span class="kbd">Esc</span></div>
      <div class="list" role="listbox"></div>
      <div class="foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> choose</span><span><span class="kbd">Enter</span> go there</span>
        <span class="hint">Try <b>193 Salem St</b></span></div>`;
    document.body.append(this.el);
    const input = this.el.querySelector("input");
    input.addEventListener("input", () => this.#run(input.value));
    input.addEventListener("keydown", (e) => this.#key(e));
    this.el.querySelector(".list").addEventListener("click", (e) => {
      const row = e.target.closest("[data-index]");
      if (row) this.#pick(Number(row.dataset.index));
    });
    input.focus();
    try {
      await this.#index(layer);
      this.findAddress = (await this.data.load(this.data.url)).findAddress;
    } catch (err) {
      ui.notifications.error(`KG Cities: search is not available for this city yet (${err.message}). Rebuild its data from the Generate dialog.`);
      return this.close();
    }
    this.el?.classList.remove("loading");
    if (this.el && input.value) this.#run(input.value);
  }

  close() {
    this.el?.remove();
    this.el = null;
  }

  #run(query) {
    if (!this.entries || !this.el) return;
    this.query = query.trim();
    const havens = new Set(this.getLandmarks().filter((l) => l.tone === "haven").map((l) => l.id));
    // Ties go to what is nearest the middle of the screen.
    const layer = this.getLayer();
    const mid = layer?.frame && canvas.stage ? sceneToLatLon(layer.frame, { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y }) : null;
    const found = search(this.entries, query, { limit: 14, findAddress: this.findAddress, near: mid ? [mid.lon, mid.lat] : null })
      .map((r) => ({ ...r, haven: r.type === "landmark" && havens.has(r.id) }));
    // In groups, in the mockup's order; Enter takes the first row shown.
    this.results = GROUPS.flatMap(([type]) => found.filter((r) => r.type === type));
    this.active = 0;
    this.#render();
  }

  /** The name with the typed text picked out. */
  #mark(name) {
    const q = this.query;
    const i = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
    return i < 0 ? esc(name) : `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}`;
  }

  #distance(r) {
    if (!r.point) return "";
    const layer = this.getLayer();
    const token = canvas.tokens?.controlled[0] ?? game.user.character?.getActiveTokens()[0];
    if (!token || !layer?.frame) return "";
    const ll = sceneToLatLon(layer.frame, token.center);
    return formatDistance(metres(ll, { lat: r.point[1], lon: r.point[0] }));
  }

  #render() {
    const list = this.el.querySelector(".list");
    if (!this.query) { list.innerHTML = ""; return; }
    if (!this.results.length) { list.innerHTML = `<div class="empty">Nothing on this map matches “${esc(this.query)}”.</div>`; return; }
    let i = 0;
    list.innerHTML = GROUPS.map(([type, title]) => {
      const rows = this.results.filter((r) => r.type === type);
      if (!rows.length) return "";
      return `<h4>${title}</h4>${rows.map((r) => {
        const index = i++;
        const tone = r.haven ? "haven" : r.type === "landmark" ? "gold" : "";
        return `<div class="row ${index === this.active ? "active" : ""}" data-index="${index}" role="option" aria-selected="${index === this.active}">
          <span class="ic ${tone}"><i class="fa-solid ${ICONS[r.haven ? "haven" : r.type]}"></i></span>
          <span class="name">${this.#mark(r.name)}</span>
          <span class="where">${esc(r.haven ? "safe haven" : r.sub)}</span>
          <span class="dist">${esc(this.#distance(r))}</span></div>`;
      }).join("")}`;
    }).join("");
    list.querySelector(".row.active")?.scrollIntoView({ block: "nearest" });
  }

  #key(e) {
    if (e.key === "Escape") { e.preventDefault(); return this.close(); }
    if (!this.results.length) return;
    if (e.key === "ArrowDown") this.active = (this.active + 1) % this.results.length;
    else if (e.key === "ArrowUp") this.active = (this.active - 1 + this.results.length) % this.results.length;
    else if (e.key === "Enter") return this.#pick(this.active);
    else return;
    e.preventDefault();
    this.#render();
  }

  /** Pan and zoom to a result and make it blink. */
  async #pick(i) {
    const r = this.results[i];
    const layer = this.getLayer();
    if (!r || !layer?.frame) return;
    const frame = layer.frame;
    let features, scenePts;
    if (r.type === "street") {
      // Only the stretches on this map; a long road shows whole.
      const lines = await this.data.streetLines(r.street, this.bounds);
      features = lines.map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }));
      scenePts = lines.flat().map(([lon, lat]) => latLonToScene(frame, lat, lon));
    } else {
      features = [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: r.point } }];
      scenePts = [latLonToScene(frame, r.point[1], r.point[0])];
    }
    if (!scenePts.length) return;
    this.close();
    layer.flash({ type: "FeatureCollection", features });
    const xs = scenePts.map((p) => p.x), ys = scenePts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const { width, height } = canvas.app.renderer.screen;
    const spot = canvasScaleForTileZoom(frame, SPOT_TILE_ZOOM);
    const fit = Math.min(width / ((x1 - x0) * 1.35 || 1), height / ((y1 - y0) * 1.35 || 1));
    canvas.animatePan({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, scale: Math.min(spot, fit, CONFIG.Canvas.maxZoom), duration: 1200 });
  }
}
