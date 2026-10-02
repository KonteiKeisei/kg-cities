# KG Cities changelog

## 0.2.2

- New York, 1980s: the World Trade Center as it stood. The Twin Towers are a gold landmark with
  a custom model (the North Tower's antenna, the South Tower's roof deck, the mechanical-floor
  bands), placed on the memorial pools that sit inside the old footprints. Around them: the
  Vista Hotel (3 WTC), 4, 5 and 6 WTC, Bankers Trust at 130 Liberty Street, and 7 WTC from 1987.
  Today's buildings on those sites are cleared, Greenwich and Fulton Streets stop at the
  superblock again, and today's site names (One World Trade Center, the Oculus, the memorial)
  are hidden.
- City packs can now clear areas of today's buildings, close streets and add buildings that
  are gone, each for a span of years (the scene's year decides).
- Custom models can stand where nothing stands today (placed by point and angle).
- Transit lines bundled for all 14 cities: generating never calls Overpass.

## 0.2.1

- Transit lines ship with the module for all 14 cities (fetched once from OpenStreetMap), so
  generating never waits on the Overpass service. For the console:
  `game.modules.get("kg-cities").api.refreshTransit("new-york")` fetches a city's lines fresh.
- A saved map that cannot be read is downloaded fresh automatically; no deleting scenes.
- Generate dialog: **Refresh data only** downloads a city again and updates its existing scenes
  without making a new scene. Console: `api.updateData("boston", { refresh: true })`.
- The "Update city data" prompt is asked once per city per session, never while an update runs.
- Reading the map retries dropped requests, then falls back to one whole-file download.
- Errors name the file that failed; failing tiles log one warning instead of hundreds.

## 0.2.0

- Day look: the night map lifted into daylight. Slate ground, sand streets that get lighter the
  busier the road, teal-green parks, deep blue water with a pale shoreline edge, dark street
  names on light streets.
- Night look: a quiet teal shoreline edge.
- Piers and wharves draw as land in both looks (Santa Monica Pier, Boston's wharves).
- Transit lines in their real colours (from OpenStreetMap route records), brightened at night;
  stations collected for a transit module. Plain lines from the map when that service is down.
- Scene grid back to the true scale: 100 px = 250 ft.
- Fixes: tile addresses broke on some cities (no map drawn); transit lines had gaps at tile
  edges; "Update city data" could hang at 70% (transit service now times out after 45 s, the
  saved map loads in one request); civic place names were dark on dark in the day look.
- Hosted servers: if a partial file request returns the wrong thing, the whole map is fetched
  instead, and errors say what came back. Generate now checks the server kept the whole map
  file (some hosts cap upload size).
- Older cities offer to rebuild their data from the saved map, without downloading again.

## 0.1.0

- First version: Generate city (14 US cities), OpenFreeMap download packed into one file,
  night look, leaning buildings, place labels, night-from-orbit view, Map look setting.
