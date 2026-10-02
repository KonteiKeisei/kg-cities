// Runs the Generate pipeline outside Foundry for one city: download, pack, derive. Writes the
// results to a folder so they can be checked (night image via ffmpeg when installed).
//   node tools/dry-run-generate.mjs austin out-folder [metro|core]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { boxAround } from "../scripts/geo.mjs";
import { downloadTiles, tileSource, tilesFor } from "../scripts/download.mjs";
import { Archive, gzip, writeArchive } from "../scripts/pmtiles.mjs";
import { nightView, placeList, tallBuildings, transitLines } from "../scripts/derive.mjs";

const [id = "austin", outDir = "dry-run", area = "metro"] = process.argv.slice(2);
const cities = JSON.parse(await readFile(new URL("../data/cities/index.json", import.meta.url)));
const city = cities.find((c) => c.id === id);
const metro = boxAround(city.metro.center, city.metro.miles);
const core = boxAround(city.core.center, city.core.miles);
await mkdir(outDir, { recursive: true });

let t0 = performance.now();
const lap = (label) => { const t = performance.now(); console.log(`${label}: ${((t - t0) / 1000).toFixed(1)} s`); t0 = t; };
const src = await tileSource();
const list = tilesFor(area === "core" ? core : metro, src.maxZoom);
console.log(`${city.name}: ${list.length} tiles (OpenFreeMap ${src.version})`);
let last = 0;
const tiles = await downloadTiles(src.template, list, {
  onProgress: (d, n, b) => { if (d - last >= 250 || d === n) { last = d; console.log(`  ${d}/${n} tiles, ${(b / 1e6).toFixed(1)} MB`); } }
});
lap("download");

const packed = await writeArchive(
  await Promise.all([...tiles].map(async ([k, data]) => { const [z, x, y] = k.split("/").map(Number); return { z, x, y, data: await gzip(data) }; })),
  { bounds: metro, minZoom: 0, maxZoom: src.maxZoom, metadata: { city: id, source: src.version } }
);
await writeFile(join(outDir, "map.pmtiles"), packed);
lap(`pack (${(packed.length / 1e6).toFixed(1)} MB)`);

// Derive from the packed file, as Foundry will.
const archive = new Archive(packed);
const getTile = (z, x, y) => archive.tile(z, x, y);
const tall = await tallBuildings(getTile, core);
await writeFile(join(outDir, "buildings.json"), JSON.stringify(tall));
lap(`tall buildings in core: ${tall.length}`);
const places = await placeList(getTile, metro);
await writeFile(join(outDir, "places.json"), JSON.stringify(places));
lap(`places: ${places.length}`);
const transit = await transitLines(getTile, metro);
await writeFile(join(outDir, "transit.json"), JSON.stringify(transit));
lap(`transit segments: ${transit.features.length}`);
const night = await nightView(getTile, metro);
await writeFile(join(outDir, "lights.json"), JSON.stringify(night.lights));
await writeFile(join(outDir, "night.rgba"), night.rgba);
lap(`night ${night.width}x${night.height}, ${night.lights.length} lights`);
const webp = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${night.width}x${night.height}`, "-i", join(outDir, "night.rgba"), "-c:v", "libwebp", "-quality", "88", join(outDir, "night.webp")]);
console.log(webp.status === 0 ? "night.webp written" : "ffmpeg not available");
