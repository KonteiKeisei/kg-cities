// Writes Boston's 1986 era into data/cities/boston.json (its landmarks come from
// tools/build-landmarks.mjs and are kept), from KG Boston Map's 1986 data in the sibling folder:
//   node tools/build-boston-pack.mjs
//
// - places: label corrections, period businesses, chains that came later (data/pois/1986.json)
// - towers and zones not yet built (data/buildings/1986.json)
// - the 1986 T: Red, Orange (with the Washington Street El), Green and Blue lines
//   (data/transit/1986.json), coloured for the map and exposed for transit modules
// - the elevated Central Artery and the ground under it (data/roads/1986.json)
// - roads built since: the Big Dig's I-93 tunnel, ramps and Leverett connectors, the Ted
//   Williams Tunnel and the Pike east of the Artery, the Seaport's haul roads. The map data
//   used here keeps no names or route numbers on road lines (only on their labels), so these
//   are hidden by kind of road within the areas KG Boston Map used, plus by name for labels.

import { readFile, writeFile } from "node:fs/promises";
import { nightColor } from "../scripts/derive.mjs";

const root = new URL("../", import.meta.url);
const old = (p) => readFile(new URL(`../kg-bostonmap/data/${p}`, root), "utf8").then(JSON.parse);
const packUrl = new URL("data/cities/boston.json", root);
const pack = JSON.parse(await readFile(packUrl, "utf8").catch(() => '{ "id": "boston", "landmarks": [] }'));

const box = (west, south, east, north) => ({ type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
/** I-93 through downtown: where the Big Dig's tunnel replaced the elevated Artery. */
const ARTERY = box(-71.0640, 42.3440, -71.0460, 42.3700);
/** East of Fort Point Channel: the Ted Williams Tunnel and the Pike's extension (1995 on). */
const EAST_PIKE = box(-71.0500, 42.3300, -70.9900, 42.3800);
/** South Boston waterfront, where every highway ramp is Big Dig era. */
const SEAPORT = box(-71.0580, 42.3360, -71.0200, 42.3560);
/** Leverett Circle and the Zakim Bridge's approaches (2003). */
const LEVERETT = box(-71.0700, 42.3640, -71.0590, 42.3730);
const BIG_DIG_NAMES = ["Leverett Circle Connector", "Leverett Connector", "Leverett Connector South", "Seaport Boulevard", "Seaport Lane",
  "Haul Road", "South Boston Bypass Road", "South Station Connector", "Lincoln Street Connector", "Leonard P. Zakim Bunker Hill Memorial Bridge",
  "Ted Williams Tunnel", "Thomas P. O'Neill Jr. Tunnel"];
const cls = ["get", "class"], brunnel = ["get", "brunnel"], ramp = ["to-boolean", ["get", "ramp"]];
const hiddenRoads = ["any",
  ["in", ["coalesce", ["get", "name"], ""], ["literal", BIG_DIG_NAMES]],
  ["all", ramp, ["==", brunnel, "tunnel"]],
  ["all", ["==", cls, "motorway"], ["==", brunnel, "tunnel"], ["within", ARTERY]],
  ["all", ["==", cls, "motorway"], ["within", EAST_PIKE]],
  ["all", ramp, ["within", SEAPORT]],
  ["all", ["in", cls, ["literal", ["motorway", "trunk"]]], ["within", LEVERETT]]
];

// The T as of 1986, in the MBTA's colours.
const LINES = {
  red: { name: "Red Line", color: "#da291c" },
  orange: { name: "Orange Line", color: "#ed8b00" },
  green: { name: "Green Line", color: "#00843d" },
  blue: { name: "Blue Line", color: "#003da5" }
};
const t1986 = await old("transit/1986.json");
const transit = {
  type: "FeatureCollection",
  features: t1986.features.map((f) => {
    const line = LINES[f.properties.line];
    return { ...f, properties: { line: line.name, color: line.color, colorNight: nightColor(line.color), mode: "subway", tunnel: !!f.properties.tunnel, elevated: !!f.properties.el } };
  }),
  lines: Object.values(LINES).map((l) => ({ ref: l.name, name: l.name, color: l.color, colorNight: nightColor(l.color), mode: "subway" }))
};

const roads = await old("roads/1986.json");
const buildings = await old("buildings/1986.json");
const places = await old("pois/1986.json");

pack.eras = {
  ...(pack.eras ?? {}),
  "1980s": {
    year: 1986,
    about: "Boston before the Big Dig, from KG Boston Map's 1986 research.",
    map: {
      towers: buildings.towers,
      zones: buildings.zones ?? [],
      transit,
      extraRoads: roads.artery,
      ground: roads.ground,
      hiddenRoads
    },
    places
  }
};
await writeFile(packUrl, JSON.stringify(pack, null, 1) + "\n");
console.log(`Boston 1986: ${buildings.towers.length} towers hidden, ${transit.features.length} T track pieces, ${roads.artery.features.length} Artery pieces, ${(places.rules ?? []).length} label rules; ${pack.landmarks.length} landmarks kept.`);
