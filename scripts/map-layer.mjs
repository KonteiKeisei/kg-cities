import { createMapRoot, screenInScene } from "./canvas-util.mjs";
import { TILE_SIZE, makeFrame, sceneToLatLon, sceneToWorld } from "./geo.mjs";
import { leanFeatures } from "./lean.mjs";
import { landmarkAt, landmarkBuildingIds, landmarkFeatures, landmarkItems, landmarkNeighbours } from "./landmarks.mjs";
import { Archive } from "./pmtiles.mjs";
import { buildingsInAreas } from "./derive.mjs";
import { ATTRIBUTION } from "./download.mjs";
import { NIGHT_GROUPS, NIGHT_START_SCALE, SLICE_COUNT, buildStyle, nightFade, twinkle } from "./style.mjs";

/** Render this much extra on each side so short pans never show an empty edge. */
const MARGIN = 0.15;
const PROTOCOL = "kgcities";

/** Open city archives by key, read by the MapLibre protocol below. */
const archives = new Map();
let protocolAdded = false;
let maplibre = null;

async function loadMapLibre() {
  maplibre ??= await import("../lib/maplibre/maplibre-gl.mjs");
  if (!protocolAdded) {
    // kgcities://<key>/<z>/<x>/<y>: a tile from that city's map file.
    maplibre.addProtocol(PROTOCOL, async (params) => {
      const [key, z, x, y] = params.url.slice(PROTOCOL.length + 3).split("/");
      const bytes = await archives.get(key)?.tile(+z, +x, +y);
      return { data: bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0) };
    });
    protocolAdded = true;
  }
  return maplibre;
}

const getJson = async (url) => {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`could not load ${url} (HTTP ${res.status})`);
  return res.json();
};

/**
 * A generated city on the canvas. A hidden MapLibre map follows the Foundry camera, and every
 * frame it draws is copied into one sprite on the canvas. MapLibre does the level of detail,
 * tile caching and label placement; labels stay a constant, crisp size at any zoom.
 */
export class CityLayer {
  constructor() {
    this.root = null;
    this.frame = null;
    this.map = null;
    this.el = null;
    this.sprite = null;
    this.camera = null;
    this.generation = 0;
    this.ready = false;
    this.onError = null;
    this.onResize = () => this.update();
    this.places = null;
    this.editing = false;
    this.options = null;
  }

  /** Labels from the city's place list (scripts/places.mjs). */
  setPlaces(geojson) {
    this.places = geojson;
    this.#whenLoaded(() => this.map.getSource("places")?.setData(this.places));
  }

  /** While editing, hidden places show struck out and edited ones in pink (GM only). */
  setEditing(editing) {
    this.editing = editing;
    this.#whenLoaded(() => this.map.setGlobalStateProperty("editing", editing));
  }

  /** Switch between the night and day looks without reloading anything. */
  setLook(look) {
    if (!this.ready || this.options.look === look) return;
    this.options.look = look;
    this.map.setStyle(this.#style(), { diff: true });
    this.#whenLoaded(() => {
      this.map.setGlobalStateProperty("editing", this.editing);
      if (this.places) this.map.getSource("places")?.setData(this.places);
    });
  }

  #whenLoaded(fn) {
    const map = this.map;
    if (!map || !this.ready) return;
    if (map.isStyleLoaded()) fn();
    else map.once("idle", fn);
  }

  #pixel(scenePoint) {
    const { x, y, w, h } = this.camera;
    return [((scenePoint.x - x) / w) * this.el.clientWidth, ((scenePoint.y - y) / h) * this.el.clientHeight];
  }

  /** The place label drawn nearest a scene point, within a few screen pixels, or null. */
  placeAt(scenePoint, radius = 12) {
    if (!this.ready || !this.camera) return null;
    const [px, py] = this.#pixel(scenePoint);
    const layers = ["places-landmark", "places-civic", "places-business", "places-hidden"];
    const hits = this.map.queryRenderedFeatures([[px - radius, py - radius], [px + radius, py + radius]], { layers });
    if (!hits.length) return null;
    const p = this.map.project.bind(this.map);
    hits.sort((a, b) => {
      const pa = p(a.geometry.coordinates), pb = p(b.geometry.coordinates);
      return Math.hypot(pa.x - px, pa.y - py) - Math.hypot(pb.x - px, pb.y - py);
    });
    return hits[0].properties.id;
  }

  /** The landmark under a scene point (its faces, footprint, or near its pin or name), or null. */
  landmarkAt(scenePoint, pinPx = 16) {
    if (!this.ready || !this.landmarks) return null;
    const ll = sceneToLatLon(this.frame, scenePoint);
    const scale = canvas.stage.scale.x || 1;
    const metresPerScenePx = (40075016 * Math.cos((ll.lat * Math.PI) / 180)) / this.frame.kx;
    return landmarkAt(this.landmarks, [ll.lon, ll.lat], Math.max(12, (pinPx / scale) * metresPerScenePx));
  }

  /** The building drawn under a scene point, as you see it (roofs and walls count). { id, h, base, rings } or null. */
  buildingAt(scenePoint) {
    if (!this.ready || !this.camera) return null;
    const layers = ["lean", ...Array.from({ length: SLICE_COUNT }, (_, i) => `lean-slice-${SLICE_COUNT - 1 - i}`), "buildings"].filter((id) => this.map.getLayer(id));
    const hit = this.map.queryRenderedFeatures(this.#pixel(scenePoint), { layers }).filter((h) => !h.properties.gold)[0];
    if (!hit) return null;
    if (hit.layer.id === "lean") {
      const b = this.leanById?.get(hit.properties.bid);
      return b ? { id: b.id, h: b.h ?? null, base: b.base ?? 0, rings: b.rings } : null;
    }
    if (hit.id === undefined) return null;
    const g = hit.geometry;
    const rings = g.type === "Polygon" ? g.coordinates : g.coordinates[0];
    return { id: hit.id, h: hit.properties.render_height ?? null, base: hit.properties.render_min_height ?? 0, rings: rings.map((r) => r.map(([lon, lat]) => [+lon.toFixed(6), +lat.toFixed(6)])) };
  }

  /** Buildings within `metres` of a scene point, as drawn now: [{ id, h, base, rings }]. */
  buildingsNear(scenePoint, metres = 80) {
    if (!this.ready || !this.camera) return [];
    const ll = sceneToLatLon(this.frame, scenePoint);
    const metresPerScenePx = (40075016 * Math.cos((ll.lat * Math.PI) / 180)) / this.frame.kx;
    const radius = (metres / metresPerScenePx) * (this.el.clientWidth / this.camera.w);
    const [px, py] = this.#pixel(scenePoint);
    const hits = this.map.queryRenderedFeatures([[px - radius, py - radius], [px + radius, py + radius]], { layers: ["buildings"] });
    const area = (r) => Math.abs(r.reduce((s, [x0, y0], i) => { const [x1, y1] = r[(i + 1) % r.length]; return s + x0 * y1 - x1 * y0; }, 0));
    const byId = new Map();
    for (const hit of hits) {
      if (hit.id === undefined) continue;
      const g = hit.geometry;
      const rings = (g.type === "Polygon" ? g.coordinates : g.coordinates[0]).map((r) => r.map(([lon, lat]) => [+lon.toFixed(6), +lat.toFixed(6)]));
      const prev = byId.get(hit.id);
      if (!prev || area(rings[0]) > area(prev.rings[0])) byId.set(hit.id, { id: hit.id, h: hit.properties.render_height ?? null, base: hit.properties.render_min_height ?? 0, rings });
    }
    return [...byId.values()];
  }

  /** Blink and glow some lines or points (GeoJSON) for a few seconds, then fade. Only on this screen. */
  flash(geojson, { seconds = 3.5, fade = 1 } = {}) {
    if (!this.ready) return;
    clearInterval(this.flashTimer);
    this.#whenLoaded(() => {
      const map = this.map;
      map.getSource("flash")?.setData(geojson);
      const start = performance.now();
      this.flashTimer = setInterval(() => {
        const t = (performance.now() - start) / 1000;
        const envelope = t < seconds ? 1 : Math.max(0, 1 - (t - seconds) / fade);
        const a = envelope * (0.35 + 0.65 * (0.5 + 0.5 * Math.cos(t * 2 * Math.PI * 1.6)));
        map.setPaintProperty("flash-glow", "line-opacity", 0.85 * a);
        map.setPaintProperty("flash-line", "line-opacity", a);
        map.setPaintProperty("flash-point-glow", "circle-opacity", 0.8 * a);
        map.setPaintProperty("flash-point", "circle-stroke-opacity", a);
        if (envelope <= 0) {
          clearInterval(this.flashTimer);
          map.getSource("flash")?.setData({ type: "FeatureCollection", features: [] });
        }
      }, 50);
    });
  }

  /** A slow breathing glow on the landmarks: about 10 redraws a second, only while some glow. */
  #startPulse() {
    if (!this.landmarks?.features.some((f) => f.properties.glow)) return;
    const start = performance.now();
    this.pulse = setInterval(() => {
      if (!this.map?.isStyleLoaded()) return;
      const t = (Math.sin(((performance.now() - start) / 2600) * 2 * Math.PI) + 1) / 2;
      this.map.setPaintProperty("landmark-glow", "line-opacity", 0.3 + 0.45 * t);
      this.map.setPaintProperty("landmark-pin-glow", "circle-opacity", 0.25 + 0.45 * t);
    }, 100);
  }

  /** The night view's lights glow faintly and flare now and then; only while zoomed out to it. */
  #startTwinkle() {
    if (!this.nightLights) return;
    const start = performance.now();
    const from = this.zoomAt(NIGHT_START_SCALE);
    this.twinkle = setInterval(() => {
      if (!this.map?.isStyleLoaded() || this.options.look !== "night" || this.map.getZoom() >= from) return;
      const t = (performance.now() - start) / 1000;
      for (let g = 0; g < NIGHT_GROUPS; g++) this.map.setPaintProperty(`night-twinkle-${g}`, "circle-opacity", nightFade(this.zoomAt, twinkle(t, g)));
    }, 80);
  }

  #style() {
    const o = this.options;
    const style = buildStyle({
      tiles: `${PROTOCOL}://${o.key}/{z}/{x}/{y}`,
      glyphs: `${location.origin}${foundry.utils.getRoute("modules/kg-cities/data/fonts/{fontstack}/{range}.pbf")}`,
      look: o.look, lean: o.lean, zoomAt: this.zoomAt, era: o.era ?? {}, attribution: ATTRIBUTION, cityNames: o.cityNames ?? [],
      // The night-from-orbit view belongs to the night look.
      night: o.look === "night" && this.nightLights ? { image: o.files.night, bounds: o.metro, lights: this.nightLights } : null
    });
    style.sources.lean.data = this.leanData;
    style.sources.landmarks.data = this.landmarks;
    if (this.places) style.sources.places.data = this.places;
    return style;
  }

  /**
   * Draw a city. options: { key, files: { map, buildings, lights, night } (URLs), bounds (the
   * scene's lat/lon box), metro (the data's box), look, lean, era, landmarks }.
   */
  async draw(options) {
    this.destroy();
    const generation = this.generation;
    this.options = { ...options };
    const { bounds, files, lean = 0.5, landmarks = [], era = {} } = options;
    this.frame = makeFrame(bounds, canvas.dimensions.sceneRect);
    this.zoomAt = (scale) => Math.log2((scale * this.frame.k) / (TILE_SIZE * 2));

    let maplibregl, tall, lights;
    try {
      maplibregl = await loadMapLibre();
      if (!archives.has(options.key)) archives.set(options.key, new Archive(files.map));
      await archives.get(options.key).init().catch((err) => {
        archives.delete(options.key);
        err.mapUnreadable = true;
        throw err;
      });
      [tall, lights, this.transitToday] = await Promise.all([
        getJson(files.buildings), getJson(files.lights).catch(() => null), files.transit ? getJson(files.transit).catch(() => null) : null
      ]);
    } catch (err) {
      if (generation === this.generation) this.onError?.(err);
      return;
    }
    if (generation !== this.generation) return;

    // The era's rules for the scene's year: sites cleared of today's buildings (every building in
    // the area), streets that were closed, and buildings that stood then but are gone now.
    const year = options.year ?? null;
    const inYear = (x) => year === null || ((x.from == null || year >= x.from) && (x.until == null || year < x.until));
    const cleared = (era.hiddenAreas ?? []).filter(inYear).map((a) => a.ring);
    let clearedIds = [];
    try {
      clearedIds = await buildingsInAreas((z, x, y) => archives.get(options.key).tile(z, x, y), cleared);
    } catch (err) {
      console.warn("kg-cities | era areas", err);
    }
    if (generation !== this.generation) return;
    const closed = (era.closedStreets ?? []).filter(inYear).map((a) => [a.ring]);
    const closedRoads = closed.length ? ["within", { type: "MultiPolygon", coordinates: closed }] : null;
    const hiddenRoads = era.hiddenRoads && closedRoads ? ["any", era.hiddenRoads, closedRoads] : (era.hiddenRoads ?? closedRoads ?? undefined);
    const periodBuildings = (era.extraBuildings ?? []).filter(inYear).map(({ from, until, name, ...b }) => b);

    // Landmark buildings are drawn in gold, so they leave the ordinary ones; their neighbours are
    // drawn with them, in one back-to-front order.
    const hidden = new Set([...(era.hiddenBuildings ?? []), ...clearedIds, ...landmarkBuildingIds(landmarks)]);
    // The era's own coloured lines when it has them, else today's track from the map data.
    this.options.era = { ...era, hiddenBuildings: [...hidden], hiddenRoads, transit: era.transit ?? this.transitToday ?? undefined };
    const drawn = [...tall.filter((b) => !hidden.has(b.id)), ...periodBuildings, ...landmarkNeighbours(landmarks)];
    this.leanById = new Map(drawn.map((b) => [b.id, b]));
    this.leanData = leanFeatures(drawn, { lean, extra: landmarkItems(landmarks, { lean }) });
    this.landmarks = landmarkFeatures(landmarks, { lean });
    this.nightLights = lights ? {
      type: "FeatureCollection",
      features: lights.map(([lon, lat, w, g, b = 1]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { w, g, b } }))
    } : null;

    this.el = document.createElement("div");
    this.el.className = "kg-cities-render";
    document.body.append(this.el);
    this.#sizeElement();

    this.map = new maplibregl.Map({
      container: this.el,
      style: this.#style(),
      interactive: false,
      attributionControl: false,
      renderWorldCopies: false,
      pixelRatio: options.sharp ? Math.min(window.devicePixelRatio, 2) : 1,
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
      fadeDuration: 150,
      minZoom: 0,
      maxZoom: 24
    });
    this.map.on("render", () => this.#copy());
    // One warning per draw: a failing host would otherwise log every tile.
    let warned = false;
    this.map.on("error", (e) => {
      if (warned) return;
      warned = true;
      console.warn("kg-cities | map tiles failed to load (further tile errors are not logged):", e.error ?? e);
    });

    this.root = createMapRoot();
    this.sprite = new PIXI.Sprite(new PIXI.Texture(new PIXI.BaseTexture(this.map.getCanvas())));
    this.sprite.visible = false;
    this.root.addChild(this.sprite);

    window.addEventListener("resize", this.onResize);
    this.ready = true;
    if (this.places) this.setPlaces(this.places);
    this.setEditing(this.editing);
    this.#startPulse();
    this.#startTwinkle();
    this.update();
  }

  destroy() {
    this.generation++;
    this.ready = false;
    clearInterval(this.pulse);
    clearInterval(this.flashTimer);
    clearInterval(this.twinkle);
    this.pulse = this.flashTimer = this.twinkle = null;
    window.removeEventListener("resize", this.onResize);
    this.map?.remove();
    this.map = null;
    this.el?.remove();
    this.el = null;
    this.sprite?.destroy({ texture: true, baseTexture: true });
    this.sprite = null;
    this.root?.destroy({ children: true });
    this.root = null;
    this.camera = null;
  }

  /** Point MapLibre where Foundry is looking. Cheap: call on every canvasPan. */
  update() {
    if (!this.ready) return;
    const view = screenInScene();
    if (this.#sizeElement()) this.map.resize();
    const center = sceneToLatLon(this.frame, { x: view.cx, y: view.cy });
    // MapLibre zoom z draws the world 512 * 2^z CSS pixels wide.
    const zoom = Math.log2((view.scale * this.frame.k) / (TILE_SIZE * 2));
    this.map.jumpTo({ center: [center.lon, center.lat], zoom });
    // MapLibre draws square Mercator pixels; the frame may stretch the scene a hair vertically.
    const w = this.el.clientWidth / view.scale;
    const h = (this.el.clientHeight / view.scale) * (this.frame.ky / this.frame.kx);
    this.camera = { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
  }

  /** Size the hidden map to the screen plus margin. True if it changed. */
  #sizeElement() {
    const { width, height } = canvas.app.renderer.screen;
    const w = Math.ceil(width * (1 + 2 * MARGIN));
    const h = Math.ceil(height * (1 + 2 * MARGIN));
    if (this.el.clientWidth === w && this.el.clientHeight === h) return false;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    return true;
  }

  /** Copy MapLibre's latest frame onto the canvas, placed where that frame's camera was. */
  #copy() {
    if (!this.ready || !this.camera) return;
    const src = this.map.getCanvas();
    let base = this.sprite.texture.baseTexture;
    if (base.realWidth !== src.width || base.realHeight !== src.height) {
      this.sprite.texture.destroy(true);
      this.sprite.texture = new PIXI.Texture(new PIXI.BaseTexture(src));
      base = this.sprite.texture.baseTexture;
    } else {
      base.update();
    }
    const { x, y, w, h } = this.camera;
    this.sprite.position.set(x, y);
    this.sprite.width = w;
    this.sprite.height = h;
    this.sprite.visible = true;
  }
}
