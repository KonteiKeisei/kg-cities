# KG Cities: build plan

Generate a playable, styled map scene of a US city from inside Foundry, downloading only that
city. Built from the KG Boston Map engine, generalised.

## Cities

Boston, New York, Washington DC, Philadelphia, Baltimore, Atlanta, St Louis, Detroit, Chicago,
San Francisco, Los Angeles, Las Vegas, Austin, Miami.

## How a city is made

1. **Generate city** (Scenes sidebar, GM): pick a city and an era (1980s now, Modern later),
   and how much the scene covers (city core, or the whole metro).
2. The GM's browser downloads that city's map tiles (metro, about 31 miles across, zoom 0 to 14)
   from **OpenFreeMap** (free, no key, no limits; OpenStreetMap data). Protomaps, used by
   KG Boston Map, blocks browser downloads, so it cannot be used from Foundry.
3. Tiles are packed into one PMTiles file and saved to `Data/kg-cities/<city>/`, with data
   derived from them in the browser: building heights (leaning 3D), place labels, the search
   index, the night-from-orbit image and its twinkling lights, landmark footprints.
4. A new gridless scene is created at a fixed real scale (100 px = 250 ft, as the Boston
   campaign scene), measured in feet and miles, with the city drawn on it.

Nothing city-specific ships with the module except small JSON city packs: bounds, landmarks
with flavor text, and per-era data.

## City packs (`data/cities/<id>.json`)

- `bounds`: metro box; `core`: default scene box.
- `landmarks`: name, point, kind (gold point of interest), flavor text for the hover card,
  optional custom model (Old North Church style).
- `eras["1980s"]`: year (default 1986), towers to hide (by point, with year built), roads that
  did not exist yet (by name or ref, with year opened), roads that existed then but not now,
  place name corrections, and **transit for the period**: lines (name, color, mode, opened,
  closed) and stations (name, point, lines, opened, closed). Exposed through the module API so
  a transit module can preconfigure the network by city and year.
- `eras.modern`: added later; mostly empty (the map data is already modern).

## Phases

1. **Engine and generator.** Module skeleton; Generate dialog; download, pack and save;
   derived data; scene creation; the map drawn with the Midnight Commander look, leaning
   buildings, labels, imperial units; night view and twinkle. One city end to end, then all.
2. **Interaction.** Landmarks (gold buildings, hover cards, journal pages, linked scenes),
   safe havens, the POI editor, map search. All per scene. Design: tools/mockups/ui-mockup.html.
   Shape choice is Building or Pin. Custom models (hand-built in code, like Old North Church)
   exist only for their own landmark: shown locked and greyed, "This is a custom model and
   cannot be changed."
3. **1980s eras.** For each city: towers to hide, roads, place names, period transit data.
   Landmark list and flavor text for each city.
4. **Boston migration.** Boston's 1986 data (Big Dig roads, corrections, T lines, landmarks)
   becomes the Boston pack; the campaign's edits move over; KG Boston MBTA reads stations from
   KG Cities; KG Boston Map retired.
5. **Modern era.**

## Day and night

The map style is built from a palette, so it can change look. A world setting, **Map look**:
follow the time of day (Calendaria's clock when it is installed, otherwise Foundry's world
time), always night, or always day. Night is the current Midnight Commander look (Boston as it
is now). Day is a lighter palette, designed later. Zoomed far out, night mode fades into the
city at night from orbit; day mode gets its own far view later.

## Labels and transit (every city)

- The city's own name is never labelled on its scene (no "NEW YORK" across Manhattan);
  neighbourhoods and neighbouring towns are. Same zoom tiers as Boston: below canvas zoom 0.3
  only dimmed neighbourhood and town names, landmark glows and safe havens; gold names from 0.17.
- Every city shows its rapid transit as a coloured overlay, whether or not a transit module is
  installed. The era's own lines (period-correct, coloured per line) when the city pack has
  them; until then, today's subway, light rail, tram and monorail track from the map data.

## Status

- [x] Tile archive (PMTiles v3 writer and reader), tested, readable by the reference library.
- [x] OpenFreeMap downloader; derive: tall buildings, places, today's transit, night image and lights.
- [x] Map style for the OpenMapTiles schema, night and day looks, leaning buildings, zoom tiers.
- [x] Generate dialog, saving to Data (or Forge assets), scene creation at 100 px = 250 ft.
- [x] City layer drawing from the packed file; day/night setting following the world clock.
- [ ] First run inside Foundry (untested there so far).
- [ ] Phase 2 onward.

## Units

Feet and miles everywhere: scene grid units, hover distances, search and editor readouts.
