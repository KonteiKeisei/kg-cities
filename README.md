# KG Cities

Real US cities as Foundry VTT scenes. Pick a city and the module downloads just that city's map, packs it into one file in your Foundry data, and makes a gridless scene at real scale (100 px = 250 ft, measured in feet and miles), drawn from OpenStreetMap: streets and names, parks and water, and leaning 3D buildings in a night or day look. Zoomed far out, the city fades into the city at night from orbit.

Set in **1986** by default: towers built since are gone, the transit runs as it did then, and each city has 15 to 50 landmarks written as of that year, with custom models for the World Trade Center and the Empire State Building.

- **Requires:** Foundry VTT v13.
- **Cities:** Boston, New York, Washington, Philadelphia, Baltimore, Atlanta, St. Louis, Detroit, Chicago, San Francisco, Los Angeles, Las Vegas, Austin, Miami.
- **Works with:** **KG Transit** for the cities' rail networks, airports and flights between the cities; [Calendaria](https://github.com/Sayshal/calendaria) for the time of day (day and night looks).

## Install

In Foundry's **Add-on Modules > Install Module**, paste this manifest URL:

```
https://github.com/KonteiKeisei/kg-cities/releases/latest/download/module.json
```

Or unzip a release into your Foundry `Data/modules` folder. Then enable **KG Cities** in your world.

See the [wiki](https://github.com/KonteiKeisei/kg-cities/wiki) for a full guide. **Coming:** modern cities (after the 1980s) and international cities.

## Making a city

1. In the **Scenes** sidebar, click **Generate city** (GM).
2. Pick the city, the era and how much the scene covers: the **city core**, or the **whole metro** area (about 30 miles across; large scenes can be slow).
3. **Generate scene.** The first time, the city's map is downloaded (one to a few minutes) and saved in `Data/kg-cities/<city>/`; later scenes of the same city reuse it. **Refresh data only** downloads a city again and updates its scenes without making a new one.

## On the map

- **Landmarks** glow gold, their real buildings lit (or a pin for parks, bridges and places since demolished). Hover one for its card (art, description, address, distance from your token); click to read its journal page. Landmarks gone or not yet built in the scene's year are left off.
- **Safe havens** (the players' places) are blue, **airports** violet (with KG Transit).
- **Search** (Ctrl+F, or the magnifier in the token controls): landmarks, addresses ("193 Salem St"), streets and places, nearest first. Picking one pans there and makes it blink.
- **Edit points of interest** (GM, the landmark tool in the notes controls): click a label, landmark or building to edit it in a panel beside the sidebar: name, journal page, image, summary, linked scene, glow, hidden from players, move, remove. Click a plain building or empty map for a quick menu (point of interest, safe haven, label, pin). Landmarks and label edits are kept per city, so a campaign can travel between cities.

## The 1980s

Each city's 1986: towers built since are hidden (from their construction dates in OpenStreetMap), rail lines and stations end where they ended then, and the Las Vegas Strip is the Strip of the Sands, the Dunes and the Desert Inn, the later resorts cleared to bare ground. New York has the World Trade Center as it stood; Boston has the elevated Central Artery and the period's place names.

## Settings

| Setting | What it does |
|---|---|
| Map look | Follow the time of day (the world clock), always night, or always day. |
| Day starts at / Night starts at | The hours the look changes, when following the time of day. |
| Building tilt | How far buildings lean, in degrees (0 is a flat map). |
| Sharp map on high-DPI screens | Full resolution on screens scaled 150% or more. |
| Shops and restaurants | Today's businesses in a past era: by type only, hidden, or by name. |
| Map tile server | Optional: your own server of OpenMapTiles-schema vector tiles (a TileJSON address). Empty uses OpenFreeMap. |

## For other modules

`game.modules.get("kg-cities").api`:

- `cityOf(scene)`: a city scene's `{ city, era, year, bounds, ... }`, or null.
- `projector(scene)`: lat/lon to scene pixels for any city scene.
- `transit(cityId, era)`: a city's rapid transit for an era (track, lines, stations).
- `addLandmarks(fn)`: add landmarks to city maps (`fn(cityFlag)` returns landmark-like entries; KG Transit's airports use it).
- `generateCity(cityId, { era, year, area, at, view })`: make a city scene without the dialog.
- `sceneCovering(cityId, { lat, lon, era })`: the smallest scene of a city whose map covers a point.

## What it downloads

Only when a city is generated or refreshed: that city's map tiles from [OpenFreeMap](https://openfreemap.org) (free, no key), or your own tile server. Everything else ships with the module. Once a city is made, it works offline.

## For developers

- `npm test` (Node 20 or later) runs the tests.
- `tools/era-preview.html` draws a city's era outside Foundry (`?city=new-york&lon=&lat=&z=`), served by `python tools/serve.py`.
- The data is built by the tools in `tools/` (landmarks, eras, transit) from OpenStreetMap through Nominatim and Overpass; see the notes at the top of each.
- `node tools/release.mjs <version>` builds a clean release in `dist/`.

## License and credits

The code is under the [MIT License](LICENSE). The map data in `data/cities` and `data/transit` is derived from OpenStreetMap, © OpenStreetMap contributors, under the [Open Database License](DATA-LICENSE.md). Map tiles © OpenFreeMap © OpenMapTiles. MapLibre GL JS, Mapbox's pbf and vector-tile libraries and the Noto Sans fonts keep their own licenses: see [CREDITS.md](CREDITS.md).
