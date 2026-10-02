// Prints the layers and property values of one OpenFreeMap tile, to check the schema.
//   node tools/inspect-tile.mjs 14 4959 6060

import { VectorTile } from "../lib/mvt/vector-tile.js";
import { PbfReader } from "../lib/mvt/pbf.js";

const [z, x, y] = process.argv.slice(2).map(Number);
const tj = await (await fetch("https://tiles.openfreemap.org/planet")).json();
const url = tj.tiles[0].replace("{z}", z).replace("{x}", x).replace("{y}", y);
const vt = new VectorTile(new PbfReader(new Uint8Array(await (await fetch(url)).arrayBuffer())));
for (const [name, layer] of Object.entries(vt.layers)) {
  const keys = new Map();
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    for (const [k, v] of Object.entries(f.properties)) {
      if (!keys.has(k)) keys.set(k, new Set());
      if (keys.get(k).size < 12) keys.get(k).add(v);
    }
    if (i === 0) keys.set("(first id)", new Set([f.id]));
  }
  console.log(`${name} (${layer.length}): ${[...keys].map(([k, s]) => `${k}=${[...s].join("|")}`).join("  ")}`);
}
