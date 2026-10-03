// MapLibre style for a city's tiles (OpenMapTiles schema, as served by OpenFreeMap).
// https://openmaptiles.org/schema/
// Two looks from one set of layers: night (Midnight Commander, the KG Boston Map look) and day
// (a pale map after the GM's reference, data/styles/day-reference.json, with blue water).
// Pure: no Foundry.

/* ---------------------------------------- */
/*  Palettes                                 */
/* ---------------------------------------- */

const SHARED = {
  /** Landmarks: glowing gold. Walls by light (shade 0..1), pale trim, bright roofs, soft halo. */
  goldWallDark: "#5c3f0e", goldWallLit: "#d9a23a", goldTrimDark: "#c9b27a", goldTrimLit: "#fff1c4",
  goldRoof: "#f2c14e", goldRoofLit: "#ffe08a", goldEdge: "#fff3c9", goldGlow: "#ffc94a",
  /** Safe havens: the same, in a cyan-leaning blue. */
  havenWallDark: "#0c2a52", havenWallLit: "#2f86d6", havenTrimDark: "#7fb3e0", havenTrimLit: "#e3f3ff",
  havenRoof: "#42b4f5", havenRoofLit: "#9fe1ff", havenEdge: "#dff4ff", havenGlow: "#4cc9ff",
  /** Search highlights. */
  flash: "#fffbe8", flashGlow: "#ffd166",
  editedLabel: "#f2a6d8", hiddenLabel: "#e0707a"
};

export const PALETTES = {
  night: {
    ...SHARED,
    water: "#212c48", land: "#101523", park: "#2c5a71", wood: "#26506a", campus: "#152036",
    commercial: "#101523", industrial: "#101523", hospital: "#152036", school: "#152036", sand: "#101523", airport: "#152036",
    // A quiet teal edge on the coast, as the day look has a pale one.
    shoreline: "#3d7f97", shorelineOpacity: 0.7,
    building: "#121a2b", buildingLine: "#1e3446",
    road: "#184a57", major: "#1f5563", highway: "#2c5a71", casing: "#101523", casingOpacity: 0,
    runway: "#3d6a7c", rail: "#2c5a71", boundary: "#2c5a71",
    label: "#e6eef2", roadLabel: "#a9c3cf", civicLabel: "#a9c3cf", minorLabel: "#7f9cab", waterLabel: "#7d93b8", halo: "#101523",
    transit: "#ffd166",
    // Taller roofs lighter (a tower's roof was lost against the streets), still deep blue.
    wallDark: "#0b1220", wallLit: "#1f3350", roofLow: "#22344f", roofMid: "#30577c", roofHigh: "#4a7fa6",
    shadow: "#03060c", shadowOpacity: 0.55
  },
  day: {
    ...SHARED,
    // The night look lifted into daylight (tools/day-lift.mjs, round 2 "Sand", chosen by the GM):
    // quiet slate ground so parks, water and transit carry the colour; streets lighter than the
    // ground and warm against it, sand that gets lighter the busier the road; teal-green parks;
    // water well below the land in lightness, with a pale shoreline edge so the coast is crisp.
    water: "#172b4f", land: "#3e4a62", park: "#3f7d72", wood: "#386f66", campus: "#46526b",
    commercial: "#3e4a62", industrial: "#3e4a62", hospital: "#46526b", school: "#46526b", sand: "#3e4a62", airport: "#46526b",
    shoreline: "#7f9cc9", shorelineOpacity: 0.75,
    building: "#4a5672", buildingLine: "#2a3346",
    road: "#a59c88", major: "#cdbf9d", highway: "#e8d3a0", casing: "#3e4a62", casingOpacity: 0,
    runway: "#5d6984", rail: "#6f7a92", boundary: "#6f7a92",
    label: "#f2f5f8", roadLabel: "#18202f", roadHalo: "#d6dce4", civicLabel: "#dfe5ec", minorLabel: "#b9c3cf", waterLabel: "#9fbbe3", halo: "#2f394d",
    transit: "#f2d27a",
    // Taller roofs lighter, so towers stand out from the blocks around them; walls a step darker.
    wallDark: "#222a3b", wallLit: "#55617d", roofLow: "#56637f", roofMid: "#66738f", roofHigh: "#8693ad",
    shadow: "#141a28", shadowOpacity: 0.42
  }
};

/* ---------------------------------------- */
/*  Zoom tiers, in Foundry canvas zoom       */
/* ---------------------------------------- */

/** Gold landmark names fade in at POI_TEXT_SCALE; other names at LABELS_SCALE. */
export const POI_TEXT_SCALE = 0.17;
export const LABELS_SCALE = 0.3;
/** Night from orbit: fades in from NIGHT_START_SCALE, complete at NIGHT_FULL_SCALE. */
export const NIGHT_START_SCALE = 0.05;
export const NIGHT_FULL_SCALE = 0.03;
export const NIGHT_MIN_SCALE = 0.01;
export const NIGHT_GROUPS = 24;
/** Buildings at least this tall (metres) get real leaning walls (scripts/lean.mjs); others lean in slices. */
export const TALL = 25;
/** Slice heights (metres) for the rest: each slice draws the buildings at least that tall. */
const SLICES = [3, 6, 9, 12, 15, 18, 21];
export const SLICE_COUNT = SLICES.length;
/** Height used where the map gives none. */
export const DEFAULT_HEIGHT = 9;
/**
 * The view's tilt from straight down, in degrees (the GM's chosen standard: 17). A building's roof
 * is drawn north of its footprint by its height times tan(tilt), its "lean".
 */
export const DEFAULT_TILT = 17;
export const leanFor = (tiltDegrees) => Math.tan((Math.max(0, Math.min(60, Number(tiltDegrees) || 0)) * Math.PI) / 180);
export const DEFAULT_LEAN = leanFor(DEFAULT_TILT);

/* ---------------------------------------- */
/*  Expressions                              */
/* ---------------------------------------- */

const REGULAR = ["Noto Sans Regular"];
const MEDIUM = ["Noto Sans Medium"];
const ITALIC = ["Noto Sans Italic"];
const NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]];
const cls = (...c) => ["in", ["get", "class"], ["literal", c]];
const sub = (...c) => ["in", ["get", "subclass"], ["literal", c]];
const tunnel = ["==", ["get", "brunnel"], "tunnel"];
const notTunnel = ["!=", ["coalesce", ["get", "brunnel"], ""], "tunnel"];
const HEIGHT = ["coalesce", ["get", "render_height"], DEFAULT_HEIGHT];
const EDITED = ["all", ["global-state", "editing"], ["get", "edited"]];
/** A line width of so many real metres at mid latitudes (512 px tiles). */
const metres = (m) => ["interpolate", ["exponential", 2], ["zoom"], 8, (m * 2 ** 8) / 57851, 22, (m * 2 ** 22) / 57851];
const exp = (stops) => ["interpolate", ["exponential", 1.6], ["zoom"], ...stops.flat()];
const north = (m) => ["interpolate", ["exponential", 2], ["zoom"], 8, ["literal", [0, (-m * 2 ** 8) / 57851]], 22, ["literal", [0, (-m * 2 ** 22) / 57851]]];
const fadeIn = (z, from = 0, span = 0.3) => ["interpolate", ["linear"], ["zoom"], z, from, z + span, 1];

/** Opacity of the night view (times peak, a number or an expression) at each zoom. */
export const nightFade = (zoomAt, peak = 1) =>
  ["interpolate", ["linear"], ["zoom"], zoomAt(NIGHT_FULL_SCALE), peak, zoomAt(NIGHT_START_SCALE), 0];

/**
 * A light's brightness at time t (seconds) in phase group g, times the ground's brightness (b):
 * a faint steady glow, and now and then a brief flare when the group's two beats line up.
 */
export function twinkle(t, g) {
  const f1 = 0.8 + ((g * 0.137) % 0.5), f2 = 1.1 + ((g * 0.211) % 0.6);
  const beat = (Math.sin(t * f1 + g * 2.3) + Math.sin(t * f2 + g * 4.1)) / 2;
  const flare = Math.max(0, (beat - 0.62) / 0.38) ** 2;
  return ["*", ["get", "b"], 0.18 + 0.8 * flare];
}

/* ---------------------------------------- */
/*  Layer groups                             */
/* ---------------------------------------- */

function shadowLayer(id, filter, P) {
  return {
    id, type: "fill", source: "shadows", minzoom: 14, filter,
    paint: { "fill-color": P.shadow, "fill-antialias": false, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.6, P.shadowOpacity] }
  };
}

/** between: layers drawn over the low buildings and under the tall ones. */
function leanLayers(P, lean, buildingFilter, between = []) {
  const slices = lean > 0 ? SLICES.map((h, i) => {
    const next = SLICES[i + 1] ?? TALL;
    return {
      id: `lean-slice-${i}`, type: "fill", source: "osm", "source-layer": "building", minzoom: 14,
      filter: ["all", buildingFilter, ["!", ["to-boolean", ["coalesce", ["get", "hide_3d"], false]]], [">=", HEIGHT, h], ["<", HEIGHT, TALL]],
      paint: {
        // A building's highest slice is its roof.
        "fill-color": ["case", ["<", HEIGHT, next], P.roofLow, P.wallDark],
        "fill-translate": north(h * lean), "fill-translate-anchor": "map"
      }
    };
  }) : [];
  const shade = (dark, lit) => ["interpolate", ["linear"], ["get", "shade"], 0, dark, 1, lit];
  const plain = ["case", ["==", ["get", "part"], "wall"],
    shade(P.wallDark, P.wallLit),
    ["interpolate", ["linear"], ["get", "h"], 10, P.roofLow, 60, P.roofMid, 200, P.roofHigh]];
  const tone = (pre) => ["match", ["get", "part"],
    "wall", shade(P[`${pre}WallDark`], P[`${pre}WallLit`]),
    "trim", shade(P[`${pre}TrimDark`], P[`${pre}TrimLit`]),
    shade(P[`${pre}Roof`], P[`${pre}RoofLit`])];
  const haven = ["==", ["get", "tone"], "haven"];
  const gold = ["case", haven, tone("haven"), tone("gold")];
  const edge = ["case", haven, P.havenEdge, P.goldEdge];
  const isGold = ["to-boolean", ["get", "gold"]];
  return [
    ...slices,
    ...between,
    {
      // Tall buildings, landmarks and the buildings beside them: real walls and roofs in one
      // back-to-front order (scripts/lean.mjs). See-through, so the buildings and streets behind
      // and below show as soft shapes, the taller the more; and without outlines: MapLibre draws a
      // fill layer's outlines in a pass after all its fills, ignoring the sort key, so every
      // building's edges showed through the ones in front (the "wireframe"). Faces are told apart
      // by their shading. Landmarks are near-solid.
      id: "lean", type: "fill", source: "lean", minzoom: 14,
      layout: { "fill-sort-key": ["get", "key"] },
      paint: {
        "fill-color": ["case", isGold, gold, plain],
        "fill-outline-color": "rgba(0, 0, 0, 0)",
        // One level for every tower: a skyscraper fading more than its neighbours lost its shape.
        "fill-opacity": ["case", isGold, 0.97, ["to-boolean", ["get", "near"]], 0.58, 0.84]
      }
    },
    {
      id: "lean-landmarks-overview", type: "fill", source: "lean", maxzoom: 14, filter: isGold,
      layout: { "fill-sort-key": ["get", "key"] },
      paint: { "fill-color": gold, "fill-outline-color": edge, "fill-opacity": 0.97 }
    }
  ];
}

const GLOW = (P) => ["case", ["==", ["get", "tone"], "haven"], P.havenGlow, P.goldGlow];
const part = (...parts) => ["in", ["get", "part"], ["literal", parts]];

function landmarkGroundLayers(P) {
  return [
    {
      id: "landmark-glow", type: "line", source: "landmarks", filter: ["all", part("ground"), ["get", "glow"]],
      layout: { "line-join": "round" },
      paint: { "line-color": GLOW(P), "line-opacity": 0.55, "line-width": exp([[13, 6], [16, 16], [19, 40]]), "line-blur": exp([[13, 5], [16, 14], [19, 34]]) }
    },
    { id: "landmark-ground", type: "fill", source: "landmarks", filter: part("ground"), paint: { "fill-color": GLOW(P), "fill-opacity": 0.22 } }
  ];
}

function landmarkPinLayers(P) {
  return [
    {
      id: "landmark-pin-glow", type: "circle", source: "landmarks", filter: ["all", part("pin"), ["get", "glow"]],
      paint: { "circle-color": GLOW(P), "circle-opacity": 0.5, "circle-radius": exp([[11, 10], [15, 18], [19, 30]]), "circle-blur": 1 }
    },
    {
      id: "landmark-pins", type: "circle", source: "landmarks", filter: part("pin"),
      paint: {
        "circle-color": ["case", ["==", ["get", "tone"], "haven"], P.havenRoofLit, P.goldRoofLit],
        "circle-radius": exp([[11, 3.5], [15, 6], [19, 9]]),
        "circle-stroke-color": ["case", ["==", ["get", "tone"], "haven"], P.havenWallDark, P.goldWallDark], "circle-stroke-width": 1.5
      }
    }
  ];
}

/** Landmark names, gold or blue with a glow. Safe havens always (fading out into the night view); gold from POI_TEXT_SCALE. */
function landmarkLabelLayers(P, zoomAt) {
  const poiZoom = zoomAt(POI_TEXT_SCALE);
  const layout = {
    "text-field": ["get", "name"], "text-font": MEDIUM, "text-max-width": 9,
    "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 14, 14, 17, 15.5, 20, 17],
    "text-offset": ["case", ["get", "pin"], ["literal", [0, 1.3]], ["literal", [0, 0]]],
    "text-allow-overlap": true
  };
  const tones = [
    { tone: "gold", glow: P.goldGlow, halo: "rgba(255, 201, 74, 0.55)", text: P.goldRoofLit, opacity: ["interpolate", ["linear"], ["zoom"], poiZoom - 0.3, 0, poiZoom, 1] },
    { tone: "haven", glow: P.havenGlow, halo: "rgba(76, 201, 255, 0.55)", text: P.havenRoofLit, opacity: ["interpolate", ["linear"], ["zoom"], zoomAt(NIGHT_FULL_SCALE), 0, zoomAt(NIGHT_START_SCALE), 1] }
  ];
  const filter = (tone) => ["all", part("label"), tone === "haven" ? ["==", ["get", "tone"], "haven"] : ["!=", ["get", "tone"], "haven"]];
  return [
    ...tones.map((t) => ({
      id: `landmark-label-glow-${t.tone}`, type: "symbol", source: "landmarks", filter: filter(t.tone),
      layout: { ...layout, "text-ignore-placement": true },
      paint: { "text-opacity": t.opacity, "text-color": t.glow, "text-halo-color": t.halo, "text-halo-width": 4, "text-halo-blur": 4 }
    })),
    ...tones.map((t) => ({
      id: `landmark-labels-${t.tone}`, type: "symbol", source: "landmarks", filter: filter(t.tone), layout,
      paint: { "text-opacity": t.opacity, "text-color": t.text, "text-halo-color": P.halo, "text-halo-width": 1.2 }
    }))
  ];
}

function flashLayers(P) {
  const line = ["==", ["geometry-type"], "LineString"], point = ["==", ["geometry-type"], "Point"];
  return [
    { id: "flash-glow", type: "line", source: "flash", filter: line, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.flashGlow, "line-opacity": 0, "line-width": exp([[10, 10], [15, 22], [19, 40]]), "line-blur": exp([[10, 6], [15, 14], [19, 26]]) } },
    { id: "flash-line", type: "line", source: "flash", filter: line, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.flash, "line-opacity": 0, "line-width": exp([[10, 2], [15, 4], [19, 8]]) } },
    { id: "flash-point-glow", type: "circle", source: "flash", filter: point, paint: { "circle-color": P.flashGlow, "circle-opacity": 0, "circle-radius": exp([[10, 16], [15, 26], [19, 40]]), "circle-blur": 1 } },
    { id: "flash-point", type: "circle", source: "flash", filter: point, paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": exp([[10, 9], [15, 14], [19, 20]]), "circle-stroke-color": P.flash, "circle-stroke-width": 2.5, "circle-stroke-opacity": 0 } }
  ];
}

/** Night from orbit: a black sky (a fill: MapLibre draws backgrounds under everything), the lit city, twinkling lights. */
function nightLayers(zoomAt) {
  return [
    { id: "night-dark", type: "fill", source: "night-sky", paint: { "fill-color": "#030202", "fill-opacity": nightFade(zoomAt), "fill-antialias": false } },
    { id: "night-image", type: "raster", source: "night", paint: { "raster-opacity": nightFade(zoomAt), "raster-fade-duration": 0, "raster-resampling": "linear" } },
    ...Array.from({ length: NIGHT_GROUPS }, (_, g) => ({
      id: `night-twinkle-${g}`, type: "circle", source: "night-lights", filter: ["==", ["get", "g"], g],
      paint: {
        "circle-color": "#ffe2b8",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, ["*", 0.7, ["get", "w"], ["get", "b"]], 12, ["*", 1.5, ["get", "w"], ["get", "b"]]],
        "circle-blur": 0.9,
        "circle-opacity": nightFade(zoomAt, ["*", ["get", "b"], 0.18])
      }
    }))
  ];
}

/**
 * era.clearedStreets for cleared sites: streets wholly inside a site, the outline pushed out by
 * metres so a street along its edge, or across it between two sites, counts too.
 */
export function clearedStreetsFilter(rings, metres = 80) {
  if (!rings.length) return undefined;
  const widened = rings.map((ring) => {
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const k = Math.cos((cy * Math.PI) / 180) * 111320;
    return [ring.map(([x, y]) => {
      const dx = (x - cx) * k, dy = (y - cy) * 111320, d = Math.hypot(dx, dy) || 1;
      return [x + (dx / d) * metres / k, y + (dy / d) * metres / 111320];
    })];
  });
  return ["within", { type: "MultiPolygon", coordinates: widened }];
}

/* ---------------------------------------- */
/*  The style                                */
/* ---------------------------------------- */

/**
 * tiles: tile URL template; glyphs: font URL template; look: "night" | "day"; lean: 0..1.
 * zoomAt(canvasScale) -> map zoom for this scene. era: { hiddenBuildings: [ids],
 * hiddenRoads: expression matching roads that did not exist yet, extraRoads: GeoJSON of roads
 * gone since, transit: GeoJSON of the period's rail lines }. night: { image, bounds, lights }.
 * cityNames: the city's own names, left unlabelled on its scene (everyone knows where they are).
 */
export function buildStyle({ tiles, glyphs, look = "night", lean = DEFAULT_LEAN, zoomAt, era = {}, night = null, attribution = "", cityNames = [], palette = null }) {
  // palette: colours to use over the look's own (day theme candidates, GM customisation).
  const P = { ...(PALETTES[look] ?? PALETTES.night), ...(palette ?? {}) };
  const labelZoom = zoomAt(LABELS_SCALE);
  const labelsFrom = (z) => Math.max(z, labelZoom);
  // Street and bridge names as the era knew them: era.roadNames { today's name: the period's }.
  const renames = Object.entries(era.roadNames ?? {});
  const roadName = renames.length ? ["match", NAME, ...renames.flat(), NAME] : NAME;
  // A bridge deck ("George Washington Bridge Upper Level") is labelled as its bridge.
  const deckAt = (deck) => ["index-of", deck, roadName];
  const bridgeName = ["case",
    [">=", deckAt(" Upper Level"), 0], ["slice", roadName, 0, deckAt(" Upper Level")],
    [">=", deckAt(" Lower Level"), 0], ["slice", roadName, 0, deckAt(" Lower Level")],
    roadName];
  const NAMED = ["get", "name"];
  const isBridge = ["all", ["has", "name"], ["any",
    ["==", ["slice", NAMED, ["max", 0, ["-", ["length", NAMED], 6]]], "Bridge"],
    [">=", ["index-of", "Bridge Upper Level", NAMED], 0], [">=", ["index-of", "Bridge Lower Level", NAMED], 0]]];
  const isBuilding = ["!", ["in", ["id"], ["literal", era.hiddenBuildings ?? []]]];
  const roadFilter = (...classes) => (era.hiddenRoads ? ["all", cls(...classes), ["!", era.hiddenRoads]] : cls(...classes));
  const empty = { type: "FeatureCollection", features: [] };
  const roadLine = (id, classes, color, widths, extra = {}) => ({
    id, type: "line", source: "osm", "source-layer": "transportation",
    filter: ["all", roadFilter(...classes), notTunnel],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": color, "line-width": exp(widths), ...extra }
  });
  const MINOR = [[11, 0.4], [14, 1.5], [17, 8], [20, 40]];
  const MAJOR = [[8, 0.5], [12, 1.5], [15, 5], [17, 12], [20, 60]];
  const HIGHWAY = [[6, 0.6], [10, 1.5], [14, 4], [17, 14], [20, 70]];
  const casing = (widths) => widths.map(([z, w]) => [z, w + Math.max(1, w * 0.25)]);
  // Transit lines in their own colours; at night the colour brightened to read on the dark map.
  const lineColor = ["coalesce", ["get", look === "night" ? "colorNight" : "color"], ["get", "color"], P.transit];

  return {
    version: 8,
    glyphs,
    state: { editing: { default: false } },
    sources: {
      osm: { type: "vector", tiles: [tiles], minzoom: 0, maxzoom: 14, attribution },
      places: { type: "geojson", data: empty },
      lean: { type: "geojson", data: empty, maxzoom: 18, tolerance: 0.2 },
      shadows: { type: "geojson", data: empty, maxzoom: 17, tolerance: 0.4 },
      transit: { type: "geojson", data: era.transit ?? empty },
      "period-roads": { type: "geojson", data: era.extraRoads ?? empty },
      // Ground as it was: today's parks and plazas on land the period used otherwise (the
      // Greenway where the elevated Central Artery stood) are covered over with plain ground.
      "period-ground": { type: "geojson", data: era.ground ?? empty },
      // Sites rebuilt since the era (a Strip resort on an older casino's ground), as bare ground
      // over everything of today's on them. The map data's buildings cannot all be hidden by id:
      // one id can hold several buildings far apart.
      "cleared-ground": { type: "geojson", data: era.clearedGround ?? empty },
      landmarks: { type: "geojson", data: empty, maxzoom: 20, tolerance: 0.1 },
      flash: { type: "geojson", data: empty },
      ...(night ? {
        night: {
          type: "image", url: night.image,
          coordinates: [[night.bounds.west, night.bounds.north], [night.bounds.east, night.bounds.north], [night.bounds.east, night.bounds.south], [night.bounds.west, night.bounds.south]]
        },
        "night-lights": { type: "geojson", data: night.lights },
        "night-sky": { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-179, -80], [179, -80], [179, 80], [-179, 80], [-179, -80]]] } } }
      } : {})
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": P.land } },
      { id: "parks", type: "fill", source: "osm", "source-layer": "landcover", filter: cls("grass"), paint: { "fill-color": P.park } },
      { id: "park-areas", type: "fill", source: "osm", "source-layer": "park", paint: { "fill-color": P.park, "fill-opacity": 0.6 } },
      { id: "woods", type: "fill", source: "osm", "source-layer": "landcover", filter: cls("wood", "wetland", "farmland"), paint: { "fill-color": P.wood } },
      { id: "commercial", type: "fill", source: "osm", "source-layer": "landuse", filter: cls("commercial", "retail"), paint: { "fill-color": P.commercial } },
      { id: "industrial", type: "fill", source: "osm", "source-layer": "landuse", filter: cls("industrial", "railway", "quarry", "garages"), paint: { "fill-color": P.industrial } },
      { id: "campus", type: "fill", source: "osm", "source-layer": "landuse", filter: cls("military", "stadium", "theme_park", "zoo"), paint: { "fill-color": P.campus } },
      { id: "hospitals", type: "fill", source: "osm", "source-layer": "landuse", filter: cls("hospital"), paint: { "fill-color": P.hospital } },
      { id: "schools", type: "fill", source: "osm", "source-layer": "landuse", filter: cls("school", "university", "college", "kindergarten", "library"), paint: { "fill-color": P.school } },
      { id: "sand", type: "fill", source: "osm", "source-layer": "landcover", filter: cls("sand"), paint: { "fill-color": P.sand } },
      { id: "cemeteries", type: "fill", source: "osm", "source-layer": "landuse", filter: cls("cemetery"), paint: { "fill-color": P.park, "fill-opacity": 0.7 } },
      { id: "airports", type: "fill", source: "osm", "source-layer": "aeroway", filter: ["all", ["==", ["geometry-type"], "Polygon"], cls("aerodrome", "apron")], paint: { "fill-color": P.airport } },
      { id: "water", type: "fill", source: "osm", "source-layer": "water", filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": P.water } },
      {
        id: "shoreline", type: "line", source: "osm", "source-layer": "water", minzoom: 10,
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        layout: { "line-join": "round" },
        paint: { "line-color": P.shoreline, "line-opacity": P.shorelineOpacity, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 1.2, 18, 2.2] }
      },
      { id: "period-ground", type: "fill", source: "period-ground", paint: { "fill-color": P.land } },
      { id: "piers", type: "fill", source: "osm", "source-layer": "transportation", filter: ["all", ["==", ["geometry-type"], "Polygon"], cls("pier")], paint: { "fill-color": P.land } },
      { id: "pier-lines", type: "line", source: "osm", "source-layer": "transportation", filter: ["all", ["==", ["geometry-type"], "LineString"], cls("pier")], layout: { "line-cap": "butt" }, paint: { "line-color": P.land, "line-width": metres(8) } },
      { id: "waterways", type: "line", source: "osm", "source-layer": "waterway", filter: cls("river", "canal", "stream"), paint: { "line-color": P.water, "line-width": exp([[10, 0.5], [14, 2], [18, 8]]) } },
      {
        id: "buildings", type: "fill", source: "osm", "source-layer": "building", minzoom: 14, filter: isBuilding,
        paint: { "fill-color": P.building, "fill-outline-color": P.buildingLine, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1] }
      },
      { id: "boundaries", type: "line", source: "osm", "source-layer": "boundary", filter: ["all", ["<=", ["get", "admin_level"], 8], ["!=", ["get", "maritime"], 1]], paint: { "line-color": P.boundary, "line-width": 0.8, "line-dasharray": [3, 2], "line-opacity": look === "day" ? 0 : 0.6 } },
      { id: "paths", type: "line", source: "osm", "source-layer": "transportation", minzoom: 15, filter: ["all", cls("path", "track"), notTunnel], paint: { "line-color": look === "day" ? P.casing : P.road, "line-width": exp([[15, 0.5], [20, 3]]), "line-dasharray": [2, 1] } },
      { id: "rail", type: "line", source: "osm", "source-layer": "transportation", minzoom: 11, filter: ["all", cls("rail"), notTunnel, ["!", sub("subway", "light_rail", "tram", "monorail")]], paint: { "line-color": P.rail, "line-width": exp([[11, 0.6], [20, 3]]), "line-dasharray": [4, 2] } },
      { id: "taxiways", type: "line", source: "osm", "source-layer": "aeroway", minzoom: 12, filter: ["all", ["==", ["geometry-type"], "LineString"], cls("taxiway")], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.road, "line-width": metres(23) } },
      { id: "runways", type: "line", source: "osm", "source-layer": "aeroway", minzoom: 10, filter: ["all", ["==", ["geometry-type"], "LineString"], cls("runway")], paint: { "line-color": P.runway, "line-width": metres(45) } },
      {
        id: "road-tunnels", type: "line", source: "osm", "source-layer": "transportation",
        filter: ["all", roadFilter("motorway", "trunk", "primary", "secondary", "tertiary", "minor"), tunnel],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": P.highway, "line-opacity": 0.6, "line-width": exp([[8, 0.5], [12, 1.2], [15, 3], [17, 7], [20, 30]]), "line-dasharray": [2.5, 1.5] }
      },
      // Casings: only the day look outlines its pale roads.
      { ...roadLine("minor-casing", ["minor", "service"], P.casing, casing(MINOR), { "line-opacity": P.casingOpacity }), minzoom: 13 },
      { ...roadLine("major-casing", ["primary", "secondary", "tertiary"], P.casing, casing(MAJOR), { "line-opacity": P.casingOpacity }) },
      { ...roadLine("highway-casing", ["motorway", "trunk"], P.casing, casing(HIGHWAY), { "line-opacity": P.casingOpacity }) },
      { ...roadLine("minor-roads", ["minor", "service"], P.road, MINOR), minzoom: 11 },
      roadLine("major-roads", ["primary", "secondary", "tertiary"], P.major, MAJOR),
      roadLine("highways", ["motorway", "trunk"], P.highway, HIGHWAY),
      // Roads of the period that are gone now (an elevated highway since torn down).
      // An elevated highway reads as raised: a dark edge wider than its deck, then the deck.
      { id: "period-roads-edge", type: "line", source: "period-roads", layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": P.wallDark, "line-opacity": 0.85, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 12, 3, 16, 22, 20, 340] } },
      { id: "period-roads", type: "line", source: "period-roads", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.highway, "line-width": exp(HIGHWAY) } },
      // Tall buildings' shadows on the ground and streets, under every building: what sets a
      // tower apart from the ones behind it.
      ...(lean > 0 ? [shadowLayer("shadows", ["!", ["get", "over"]], P)] : []),
      ...leanLayers(P, lean, isBuilding, [
        // Between the low buildings and the tall: sites rebuilt since the era, bare (their low
        // buildings are drawn by height slices, which cannot be hidden by place), then the ground
        // and shadows of what stood on them (the World Trade Center).
        { id: "cleared-ground", type: "fill", source: "cleared-ground", paint: { "fill-color": P.land, "fill-antialias": false } },
        // The public streets across them again (Sands Avenue), not the resorts' own drives.
        ...(era.clearedStreets ? (() => {
          const kinds = [["minor", ["minor"], P.road, MINOR], ["major", ["primary", "secondary", "tertiary"], P.major, MAJOR], ["highways", ["motorway", "trunk"], P.highway, HIGHWAY]];
          return [
            ...kinds.map(([id, classes, , widths]) => roadLine(`cleared-${id}-casing`, classes, P.casing, casing(widths), { "line-opacity": P.casingOpacity })),
            ...kinds.map(([id, classes, color, widths]) => roadLine(`cleared-${id}`, classes, color, widths))
          ].map((l) => ({ ...l, filter: ["all", l.filter, era.clearedStreets] }));
        })() : []),
        ...landmarkGroundLayers(P),
        ...(lean > 0 ? [shadowLayer("shadows-over", ["get", "over"], P)] : [])
      ]),
      ...landmarkPinLayers(P),
      ...flashLayers(P),
      // The period's rapid transit, each line in its own colour, dashed underground.
      {
        id: "transit-tunnels", type: "line", source: "transit", filter: ["get", "tunnel"],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": lineColor, "line-opacity": 0.8, "line-width": exp([[9, 1], [13, 1.8], [16, 2.6], [20, 5]]), "line-dasharray": [2, 1.5] }
      },
      {
        id: "transit", type: "line", source: "transit", filter: ["!", ["get", "tunnel"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": lineColor, "line-width": exp([[9, 1.2], [13, 2.2], [16, 3.2], [20, 8]]) }
      },
      {
        id: "house-numbers", type: "symbol", source: "osm", "source-layer": "housenumber", minzoom: 17,
        layout: { "text-field": ["get", "housenumber"], "text-font": REGULAR, "text-size": 10 },
        paint: { "text-color": P.minorLabel, "text-halo-color": P.halo, "text-halo-width": 1 }
      },
      {
        id: "runway-labels", type: "symbol", source: "osm", "source-layer": "aeroway", minzoom: 15, filter: ["all", cls("runway"), ["has", "ref"]],
        layout: { "symbol-placement": "line", "text-field": ["get", "ref"], "text-font": MEDIUM, "text-size": 12, "text-letter-spacing": 0.2 },
        paint: { "text-color": P.civicLabel, "text-halo-color": P.halo, "text-halo-width": 1.2 }
      },
      {
        id: "water-labels", type: "symbol", source: "osm", "source-layer": "water_name", minzoom: labelsFrom(10),
        // Names on sites an era clears (the memorial pools at the World Trade Center).
        ...(era.hiddenLabels ? { filter: ["!", era.hiddenLabels] } : {}),
        layout: { "text-field": NAME, "text-font": ITALIC, "text-size": 12, "text-max-width": 8 },
        paint: { "text-opacity": fadeIn(labelsFrom(10)), "text-color": P.waterLabel, "text-halo-color": P.halo, "text-halo-width": 1 }
      },
      {
        id: "road-labels", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: labelsFrom(13),
        // Day: highways are drawn but not named (the reference style turns their labels off).
        filter: ["all", roadFilter(...(look === "day" ? [] : ["motorway", "trunk"]), "primary", "secondary", "tertiary", "minor"), ["has", "name"], ["!", isBridge]],
        layout: { "symbol-placement": "line", "text-field": roadName, "text-font": MEDIUM, "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 17, 13, 20, 16], "text-max-angle": 30 },
        // Street names can sit on light streets over dark ground: their own outline colour when set.
        paint: { "text-opacity": fadeIn(labelsFrom(13)), "text-color": P.roadLabel, "text-halo-color": P.roadHalo ?? P.halo, "text-halo-width": 1.4 }
      },
      {
        // Bridges by name, every class including highways (the George Washington Bridge is
        // I-95, and highways are otherwise unnamed at night). The name layer does not mark
        // bridges, so: a road named "... Bridge", or a deck ("... Bridge Upper Level") shown as
        // the bridge. Footpaths and service roads ("... Bridge Path") are left out.
        id: "bridge-labels", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: 11.5,
        filter: ["all", isBridge, ["!", ["in", ["get", "class"], ["literal", ["path", "track", "service"]]]],
          ...(era.hiddenRoads ? [["!", era.hiddenRoads]] : [])],
        layout: {
          "symbol-placement": "line", "symbol-spacing": 600, "text-field": bridgeName, "text-font": MEDIUM,
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 14, 20, 17], "text-max-angle": 25, "text-letter-spacing": 0.04
        },
        paint: { "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 12.2, 1], "text-color": P.label, "text-halo-color": P.halo, "text-halo-width": 1.6 }
      },
      // Place names come from the city's place list (scripts/places.mjs), not the tiles, so an era
      // and the GM can correct them. Hidden ones show only while the GM edits.
      {
        id: "places-hidden", type: "symbol", source: "places", minzoom: 15,
        filter: ["all", ["global-state", "editing"], ["get", "hidden"]],
        layout: { "text-field": ["concat", "✕ ", ["get", "name"]], "text-font": ITALIC, "text-size": 10, "text-max-width": 8 },
        paint: { "text-color": P.hiddenLabel, "text-halo-color": P.halo, "text-halo-width": 1 }
      },
      ...[["business", 17, 10, REGULAR, P.minorLabel], ["civic", 16, 10.5, REGULAR, P.civicLabel], ["landmark", 13, 11, REGULAR, P.label]].map(([tier, z, size, font, color]) => ({
        id: `places-${tier}`, type: "symbol", source: "places", minzoom: labelsFrom(z),
        filter: ["all", ["!", ["get", "hidden"]], ["==", ["get", "tier"], tier], ["<=", ["coalesce", ["get", "min_zoom"], 0], ["+", ["zoom"], 1]]],
        layout: { "text-field": ["get", "name"], "text-font": font, "text-size": size, "text-max-width": 8, "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 20] },
        paint: { "text-opacity": fadeIn(labelsFrom(z)), "text-color": ["case", EDITED, P.editedLabel, color], "text-halo-color": P.halo, "text-halo-width": 1.2 }
      })),
      {
        // Neighbourhoods and towns, from the tiles: dimmed while zoomed out, then full.
        id: "neighbourhoods", type: "symbol", source: "osm", "source-layer": "place", minzoom: 11,
        filter: cls("suburb", "quarter", "neighbourhood"),
        layout: { "text-field": NAME, "text-font": MEDIUM, "text-size": 12, "text-transform": "uppercase", "text-letter-spacing": 0.1, "text-max-width": 7, "symbol-sort-key": ["get", "rank"] },
        paint: { "text-opacity": fadeIn(labelZoom, 0.45, 0.4), "text-color": P.minorLabel, "text-halo-color": P.halo, "text-halo-width": 1.2 }
      },
      {
        id: "towns", type: "symbol", source: "osm", "source-layer": "place",
        filter: ["all", cls("city", "town", "village"), ["!", ["in", NAME, ["literal", cityNames]]], ["!", ["in", ["get", "name"], ["literal", cityNames]]]],
        layout: {
          "text-field": NAME, "text-font": MEDIUM, "text-max-width": 8, "symbol-sort-key": ["get", "rank"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, ["case", ["==", ["get", "class"], "city"], 16, 12], 14, ["case", ["==", ["get", "class"], "city"], 26, 17]]
        },
        paint: { "text-opacity": fadeIn(labelZoom, 0.45, 0.4), "text-color": P.label, "text-halo-color": P.halo, "text-halo-width": 1.5 }
      },
      ...(night ? nightLayers(zoomAt) : []),
      ...landmarkLabelLayers(P, zoomAt)
    ]
  };
}
