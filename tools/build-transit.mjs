// Fetch each city's rapid transit lines and stations from OpenStreetMap once, and save them in
// the module (data/transit/<city>.json), so generating a city never depends on Overpass.
//   node tools/build-transit.mjs            every city missing a file
//   node tools/build-transit.mjs new-york   one city (refetched)

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { boxAround } from "../scripts/geo.mjs";
import { transitRoutes, OVERPASS } from "../scripts/derive.mjs";

const root = new URL("../", import.meta.url);
const cities = JSON.parse(await readFile(new URL("data/cities/index.json", root), "utf8"));
const only = process.argv[2];
await mkdir(new URL("data/transit/", root), { recursive: true });
const endpoints = [...OVERPASS, "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

for (const city of cities) {
  if (only && city.id !== only) continue;
  const out = new URL(`data/transit/${city.id}.json`, root);
  if (!only && await access(out).then(() => true, () => false)) { console.log(`${city.id}: have it`); continue; }
  const metro = boxAround(city.metro.center, city.metro.miles);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const t0 = Date.now();
      const transit = await transitRoutes(metro, { endpoints, timeoutMs: 240000 });
      transit.source = "OpenStreetMap contributors (ODbL), via Overpass";
      transit.fetched = new Date().toISOString().slice(0, 10);
      await writeFile(out, JSON.stringify(transit));
      console.log(`${city.id}: ${transit.lines.length} lines, ${transit.stations.length} stations, ${transit.features.length} pieces (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      break;
    } catch (err) {
      console.log(`${city.id}: attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 15000 * attempt));
    }
  }
}
