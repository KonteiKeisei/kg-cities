# KG Cities changelog

## 0.7.4

- KG Cities is now under the PolyForm Noncommercial License 1.0.0 (LICENSE), like KG Transit:
  free to use, copy, share and change for noncommercial purposes, not to be sold or used
  commercially. OpenStreetMap-derived data stays under the ODbL; the bundled libraries and fonts
  keep their own licenses.

## 0.7.3

- A landmark's card shows once the pointer has rested on it for 400 ms. An open card still
  follows the pointer and switches straight to a neighbouring landmark.
- The Old North Church faces the right way: the nave runs back from Salem Street, the tower and
  spire on the Salem Street end, the rounded chancel behind. The model lines up on the nave's
  longest wall, not on a belfry tier's outline.
- Reading a city's map skips the browser cache, so Chromium no longer logs
  ERR_CACHE_OPERATION_NOT_SUPPORTED for parts of map.pmtiles.

## 0.7.2

- Leaving POI edit mode with the banner's **Done** button (or Esc) turns the sidebar's edit
  toggle off too, so one click turns editing back on.

## 0.7.1: ready to share

- **Map tile server** setting: download cities from your own server of OpenMapTiles-schema
  vector tiles instead of OpenFreeMap.
- License files: the code under MIT (LICENSE), the OpenStreetMap-derived data under the Open
  Database License (DATA-LICENSE.md), credits for the libraries and fonts (CREDITS.md, and the
  Noto fonts' license in data/fonts/OFL.txt). A README.
- Stands alone: the tools and tests no longer read the retired Boston modules.

## 0.7.0: airports (with KG Transit)

- Other modules can add landmarks to a city's map: `api.addLandmarks(fn)`. KG Transit adds the
  city's airports of 1986: terminals in violet (apart from gold and the safe havens' blue), the
  airfield's edge dashed, the name in violet from far out, and a card saying "Airport". A
  module's landmark takes the place of the city's own of the same name (Logan as an airport, not
  a gold pin). Clicking an airport (the GM) books a flight in KG Transit.
- The metro areas of San Francisco, Miami, Washington and Los Angeles reach their airports now
  (San Jose, Fort Lauderdale, Dulles, Long Beach). A city whose saved map no longer covers its
  metro area is downloaded again the next time it is generated or refreshed.
- For travel modules: `api.generateCity(cityId, { era, year, area: "core" | "metro" | "auto", at,
  view })` makes a city scene without the dialog (area "auto": the core when it covers `at`, else
  the metro; `view: false` leaves the GM where they are), and `api.sceneCovering(cityId, { lat,
  lon, era })` finds the smallest scene of a city whose map covers a point.

## 0.6.0: 1986 down to the station

- Lines end where they ended in 1986. Extensions built since are cut at the old terminus, with
  their stations: Washington's Red Line stops at Silver Spring and the Blue at Addison Road and
  King Street, with no Yellow north of Gallery Place; BART ends at Concord, Daly City and Fremont,
  the N at Embarcadero, the J at 30th Street; MARTA at Brookhaven, Lindbergh, East Point,
  Avondale and Ashby; Baltimore's Metro between Charles Center and Reisterstown Plaza; Miami's
  Metrorail at Okeechobee and the Metromover's downtown loop alone; New York without the 63rd
  Street line, the Second Avenue Subway, the 7 to Hudson Yards, the Archer Avenue line or the
  Newark Light Rail to Broad Street. Stations opened since on track that ran (NoMa, Morgan,
  Oakton, Tri-Rail) are left off. San Francisco no longer shows the Castro shuttle.
- The Strip's lost casinos stand again, in gold: the Sands' round tower, the Dunes, the Desert
  Inn, the Stardust, the Riviera, the Tropicana, the Aladdin and its theatre, the Frontier, the
  Hacienda, the Silver Slipper and the Landmark's mushroom tower.
- The Strip cleared properly: the Sphere is gone with its whole block and drive; the Sands'
  grounds (the Venetian and Palazzo), the Desert Inn's frontage (Wynn), the Mirage and Treasure
  Island block, and the open ground from Harmon Avenue to the Hacienda (Monte Carlo, New
  York-New York, CityCenter, Excalibur, Luxor) are bare, traced by hand where the map data's
  outline of a resort missed most of it.
- Streets across cleared sites (Sands Avenue) are drawn again over the bare ground.

## 0.5.0: the 1980s for every city

- Transit as it ran in 1986, line by line: Los Angeles, St. Louis, Las Vegas, Austin and
  Detroit had no rail transit yet and show none; Washington has no Green or Silver Line,
  Chicago no Orange Line, San Francisco no T Third or BART to Dublin, Miami no airport line,
  Baltimore no light rail, New York no AirTrains or Hudson-Bergen light rail. api.transit()
  hands transit modules the same period network. (Extensions built later on lines that did
  run, like BART to the airport, still show.)
- Towers built since 1986 are hidden in every city, found by their construction dates in
  OpenStreetMap.
- The Las Vegas Strip as it was: the Mirage, Excalibur, Luxor, the MGM Grand, Bellagio, the
  Venetian, Mandalay Bay, Wynn, CityCenter and the rest built since 1986 are cleared from their
  grounds; the Sands, the Dunes, the Stardust and the other casinos of the day are gold pins.
- Cleared sites are bare ground: every building of today's on them is gone (low ones too, and
  the Bellagio's lake), while shadows and landmarks that stood there (the World Trade Center)
  still draw on them. A sprawling building is cleared when most of it is inside the site, not
  only when its centre is.
- Faster hiding of later towers in cities with thousands of them.

## 0.4.0: landmarks for every city

- Every city ships with landmarks, written as of 1986, each with a two-sentence hover text:
  New York 53, Boston 50, Chicago 35, Los Angeles 35, Washington 34, San Francisco 32,
  Las Vegas 28, Philadelphia 25, Miami 19, Atlanta, Baltimore, Detroit and St. Louis 18 each,
  Austin 15. Each lights its real building in gold (every mapped part, so towers keep their
  setbacks), or is a gold pin for parks, bridges and places since demolished (Comiskey Park,
  the Sands, the Boston Garden). Landmarks gone or not yet built by the scene's year are left
  off. Built from tools/landmarks/<city>.json by tools/build-landmarks.mjs.
- Rockefeller Center is one landmark of all its buildings, from 30 Rock to Radio City.
- Landmarks missing from the map data's buildings (Grand Central, Fenway Park, the MFA) are
  drawn on their true outline at their real height.
- Boston 1986: the elevated Central Artery with the ground under
  it, no Big Dig tunnels, Ted Williams Tunnel or Seaport ramps, the 1986 T in its colours with
  the Washington Street El, 27 later towers hidden, and the period's place names. Boston's
  landmarks keep their earlier ids, so a converted campaign merges onto them.
- Label edits made on other map data find their place again by its original
  name; editing such a label moves the edit to the place's own id.
- Search: equal matches (Beacon Street in a dozen towns) are listed nearest the screen first.
- Elevated period highways get a dark edge, so they read as raised.
- api.transit(city, era): a city's rapid transit for an era, for transit modules.

## 0.3.1

- Buildings are drawn at a 17 degree tilt (was about 27): towers still read in 3D and cover less
  of the street behind them. The setting is now **Building tilt**, in degrees (0 is a flat map).

## 0.3.0: points of interest

- Hover cards on landmarks and safe havens, for everyone: art, name, summary (from the journal
  page unless set), street address and neighbourhood, and how far it is from your token. Click
  to read the page; the GM gets a linked scene to view or activate (shift-click views it).
- Map search (Ctrl+F, or the magnifier on the token controls): landmarks, addresses
  ("193 Salem St"), streets and places, grouped, with the distance from your token. Picking one
  pans there and makes it blink.
- Edit points of interest (GM, the landmark tool on the notes controls): click a label,
  landmark or building to edit it in a panel docked beside the sidebar; click a plain building
  or empty map for a quick menu (point of interest, safe haven, label, or a pin instead).
  Story (journal page, image, summary), linked scene, shape (building or pin; custom models are
  locked), glow, hidden from players, Move, remove, undo a label edit. Esc steps back.
- Landmarks and label edits are kept per city, so a campaign can travel between cities.
- New York: the Empire State Building as a gold landmark with a model of its tiers (base,
  setbacks, shaft, crown, mooring mast and antenna to 1,454 ft), made from a detailed mesh by
  tools/build-model-from-obj.mjs.
- Buildings are drawn back to front by the centre of their footprint: on a tilted street grid a
  long building across the street no longer covers a tower in front of it.

## 0.2.4

- Buildings mapped in parts (the Empire State Building, most big towers) no longer get a
  full-height box over their whole lot: the map data's outline of such a building is left flat,
  and its parts show the real setbacks, tower and mast. Cities offer a rebuild of their data
  (from the saved map, nothing downloaded).
- Towers cast shadows on the ground and streets, toward the east-north-east, in both looks.
- Every tower is equally see-through (the tallest no longer fade the most); taller roofs are
  lighter, by day and by night, so towers stand apart from the blocks around them.
- Landmark buildings replace whatever the map data has on their footprint, by shape rather
  than id (needed for landmarks made with other map data).

## 0.2.3

- Buildings: no more wireframe. MapLibre drew every building's edges after all the buildings,
  so hidden walls showed their outlines through the ones in front. Edges are gone; buildings
  stay see-through (the taller, the more), so what is behind and below shows as soft shapes.
- Bridges are named at every size of road, highways included (the George Washington Bridge is
  I-95), from further out than street names. A bridge's decks are labelled as the bridge.
- Eras can rename roads: 1980s New York has the Triborough, Queensboro, Tappan Zee Bridges and
  the Brooklyn-Battery Tunnel.
- World Trade Center: today's 7 World Trade Center is cleared (it stood inside the North
  Tower's top), and the memorial pool names are hidden.

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
