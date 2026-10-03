// Fetching a city's map tiles from OpenFreeMap (free, no key, OpenStreetMap data).
// https://openfreemap.org  Pure: browser or Node 18+.

import { tileRange, worldBounds } from "./geo.mjs";
import { gunzip, isGzip } from "./pmtiles.mjs";

export const TILEJSON = "https://tiles.openfreemap.org/planet";
export const ATTRIBUTION = "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors";
export const MAX_ZOOM = 14;

/**
 * The current tile URL template ({z}/{x}/{y}) and the data's date, from a TileJSON address:
 * OpenFreeMap's by default, or any server of OpenMapTiles-schema vector tiles (the GM's own).
 */
export async function tileSource(tilejson = TILEJSON) {
  const res = await fetch(tilejson);
  if (!res.ok) throw new Error(`The tile server is not answering (HTTP ${res.status}, ${tilejson})`);
  const tj = await res.json();
  const template = tj.tiles?.[0];
  if (!template) throw new Error(`The tile server sent no tile address (${tilejson})`);
  return { template, version: template.match(/planet\/([^/]+)\//)?.[1] ?? tj.version ?? "", maxZoom: Math.min(MAX_ZOOM, tj.maxzoom ?? MAX_ZOOM) };
}

/** Every { z, x, y } covering a lat/lon box, from zoom 0 to maxZoom. */
export function tilesFor(bounds, maxZoom = MAX_ZOOM) {
  const rect = worldBounds(bounds);
  const out = [];
  for (let z = 0; z <= maxZoom; z++) {
    const r = tileRange(z, rect);
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) out.push({ z, x, y });
  }
  return out;
}

/**
 * Download the tiles. Returns Map "z/x/y" -> MVT bytes (uncompressed); tiles the server has
 * nothing for are left out. onProgress(done, total, bytes). Stops early when signal aborts.
 */
export async function downloadTiles(template, tiles, { concurrency = 12, retries = 3, onProgress, signal } = {}) {
  const out = new Map();
  let next = 0, done = 0, bytes = 0;
  const fetchOne = async ({ z, x, y }) => {
    const url = template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { signal });
        if (res.status === 404 || res.status === 204) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let data = new Uint8Array(await res.arrayBuffer());
        // Browsers undo the transfer gzip; a tile stored gzipped arrives still compressed.
        if (isGzip(data)) data = await gunzip(data);
        return data.length ? data : null;
      } catch (err) {
        if (signal?.aborted || attempt >= retries) throw err;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  };
  const worker = async () => {
    while (next < tiles.length) {
      if (signal?.aborted) throw new Error("cancelled");
      const t = tiles[next++];
      const data = await fetchOne(t);
      if (data) { out.set(`${t.z}/${t.x}/${t.y}`, data); bytes += data.length; }
      done++;
      onProgress?.(done, tiles.length, bytes);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker));
  return out;
}
