# Credits

KG Cities is © 2026 Konte, under the MIT License (LICENSE). It is built on:

| What | From | License |
|---|---|---|
| Map data (streets, buildings, places, transit, landmark footprints) | © OpenStreetMap contributors, https://www.openstreetmap.org/copyright | ODbL 1.0 (DATA-LICENSE.md) |
| Map tiles, downloaded by each GM when a city is generated | OpenFreeMap, https://openfreemap.org, in the OpenMapTiles schema, https://openmaptiles.org | Tiles: ODbL (OpenStreetMap); OpenMapTiles schema: CC-BY 4.0 |
| MapLibre GL JS (`lib/maplibre`) | https://maplibre.org | BSD 3-Clause (`lib/maplibre/LICENSE.txt`) |
| pbf, vector-tile, point-geometry (`lib/mvt`) | Mapbox, https://github.com/mapbox | BSD 3-Clause / ISC (`lib/mvt/LICENSE-*.txt`) |
| Noto Sans font glyphs (`data/fonts`) | The Noto Project Authors, https://notofonts.github.io | SIL Open Font License 1.1 (`data/fonts/OFL.txt`) |
| PMTiles format (the saved map's file format; the reader and writer here are this module's own) | Protomaps, https://github.com/protomaps/PMTiles | Specification: BSD 3-Clause |

The build tools (`tools/`, not shipped) also used, to make the data:

- **Overpass API** public servers (overpass-api.de, overpass.private.coffee, maps.mail.ru): OpenStreetMap queries for towers built since 1986, cleared sites and transit lines.
- **Nominatim** (nominatim.openstreetmap.org): finding the landmarks, at one request a second as its usage policy asks.

The Empire State Building's tiers (`scripts/models/empire-state.mjs`) are heights and setback
outlines measured from a 3D model of the building; the landmark texts were written for this module.
