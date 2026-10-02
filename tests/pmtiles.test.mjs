import { test } from "node:test";
import assert from "node:assert/strict";
import { Archive, gzip, writeArchive, zxyToTileId } from "../scripts/pmtiles.mjs";

test("tile ids follow the spec: zoom levels in order, Hilbert curve within a level", () => {
  assert.equal(zxyToTileId(0, 0, 0), 0);
  assert.deepEqual([[0, 0], [0, 1], [1, 1], [1, 0]].map(([x, y]) => zxyToTileId(1, x, y)), [1, 2, 3, 4]);
  assert.equal(zxyToTileId(2, 0, 0), 5);
  // Values from the reference implementation (pmtiles npm 4.5).
  assert.equal(zxyToTileId(14, 4959, 6060), 124767492);
  assert.equal(zxyToTileId(12, 1239, 1514), 7797968);
});

test("an archive written then read gives back every tile, sharing identical ones", async () => {
  const tiles = [];
  const sea = await gzip(new Uint8Array([9, 9, 9]));
  for (let z = 0; z <= 6; z++) {
    const n = 2 ** z;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const land = (x + y) % 3 === 0;
      tiles.push({ z, x, y, data: land ? await gzip(new Uint8Array([z, x, y])) : sea });
    }
  }
  const bytes = await writeArchive(tiles, { bounds: { north: 1, south: -1, west: -1, east: 1 }, minZoom: 0, maxZoom: 6, metadata: { city: "test" } });
  const a = new Archive(bytes);
  assert.deepEqual(await a.metadata(), { city: "test" });
  assert.deepEqual([...(await a.tile(6, 3, 0))], [6, 3, 0]);
  assert.deepEqual([...(await a.tile(5, 1, 1))], [9, 9, 9]);
  assert.equal(await a.tile(7, 0, 0), null);
  assert.equal((await a.init()).maxZoom, 6);
});

test("large archives get leaf directories and still read back", async () => {
  const tiles = [];
  for (let x = 0; x < 128; x++) for (let y = 0; y < 128; y++) tiles.push({ z: 7, x, y, data: await gzip(new Uint8Array([x, y, x ^ y])) });
  const a = new Archive(await writeArchive(tiles, { bounds: { north: 1, south: -1, west: -1, east: 1 }, minZoom: 7, maxZoom: 7 }));
  for (const [x, y] of [[0, 0], [127, 127], [64, 3], [5, 99]]) assert.deepEqual([...(await a.tile(7, x, y))], [x, y, x ^ y]);
});
