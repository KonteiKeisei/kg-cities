# KG Cities changelog

## 0.14.0

- **Chain stores**: on the banner while editing points of interest, turn the map's drugstores into 1986 points of interest in one go. Today's CVS stay CVS; today's Walgreens and Rite Aids become **Brooks Drug** (keep some as Walgreens if you like). Each store is linked to your shop actor (found by name, or picked), and drawn on the map **with the actor's token** as a round badge in a gold rim. Running it again relinks and re-marks them and keeps their cards; Remove takes a chain off.
- **Points of interest can be drawn with a picture** instead of the gold pin.

## 0.13.4

- **Payroll lists only player characters**: a player's vehicles, companions and summons (an Eldritch Cannon) are left out. Drag any other actor in from the Actors sidebar to put them on the payroll, in a collapsible **Others** section; take them off again with the button beside their name.

## 0.13.3

- **Pay stubs and bills are readable in the chat**: Foundry's chat tables (dark striped rows, light text) were painting over them. They keep their paper look now: dark type on cream, deductions in red, totals ruled.

## 0.13.2

- **Dropdown lists are readable**: an open list showed pale text on white, readable only on the highlighted line. Lists in every KG Cities window (Payroll, the switchboard, the phones) are now light text on the dark panel, the chosen one in gold.

## 0.13.1

- **The job guide's search types forwards**: each letter redrew the window and put the cursor back at the start, so "garbage" came out "egabrag". The cursor now stays where you are typing.

## 0.13.0

- **Payroll**: characters get paid on the world clock.
  - Jobs pay by the hour, week, year, job or word, or as an allowance: weekly, biweekly, monthly, every so many days, or when the GM says.
  - Paid in cash to the wallet, or by paper check (an item, cashed from **Your pay**, or approved by the GM).
  - On the books, the 1986 federal tax (by the rate schedule), FICA and Massachusetts tax come out, plus union dues.
  - Payday rolls (a die plus a skill, against your own results), and bonuses and risks: once, every payday or by chance, taxed or as cash on the side.
  - Seasons: a hockey salary is paid October to April.
  - Pay stubs go to the chat. A time skip pays every payday it passed.
- **The 1986 job guide**: about 125 jobs at their median weekly pay from the Bureau of Labor Statistics' 1986 survey (with Boston's +10% if wanted), ready-made jobs for what the survey doesn't count, and your own saved jobs. One click starts a job from any of them.
- **Living costs**: rent or a mortgage by Boston neighborhood, utilities, a vehicle's insurance and gas, groceries by the USDA food plans, and any bills you add. A dependant pays only for their own vehicle. Charged from the wallet weekly and monthly; what can't be covered is owed. A budget shows take-home pay, bills and what's left each week.

## 0.12.3

- **The payphone's keypad is big enough to use**: the payphone is shown close up (its coin
  slot, instruction card and keypad), its keys about 38 px instead of 12. The desk phone stays
  whole, a little larger. The phone window is a little wider to fit.
- **Travel lines keep their width when you zoom**: after a reload with trips under way (and the
  game paused), the routes were drawn for the far-out zoom of the first moment and stayed huge.
  They are now drawn again whenever the zoom changes.
- **Click a party's row in the Travelling panel** to select its token and go to it on the map
  (its scene first, when it is elsewhere); its street view comes up as when you click the token.

## 0.12.2

- **The Travelling panel moves and locks**: drag it by its title anywhere on screen, lock it
  with its padlock, and it comes back where you left it (per computer). Unmoved, it sits just
  inside the map's top right, clear of the sidebar, and it always stays on screen.
- Its rows no longer overhang: a long name or vehicle shortens, and the time left and the
  Arrive now and Stop buttons stay inside the panel.
- Without KG Transit, the street view's corner is measured from Foundry's interface too.
- **Placed payphones are small**: on a city map a 24 px marker (about 60 ft) instead of a whole
  grid square (250 ft, half a block); on other scenes half a square. Ones already placed at a
  whole square shrink to match when the GM loads the world, centred where they were (tiles with
  your own art, or resized by hand, are left as they are).

## 0.12.1

- **Skipping time no longer breaks parties travelling in a city.** A skip (Calendaria's, or
  Foundry's clock) used to leave them at the end of their route without arriving (while paused),
  their route lines gone and their street views frozen. Now a new setting, **When the clock is
  skipped**, decides: they **travel on through it** (the default: a skip longer than what is left
  means they arrive, at once, paused or not, and onward stages such as boarding a train follow), or
  they **wait where they are** and carry on afterwards. Going back in time never runs them
  backwards.
- A street view whose frame fails is no longer stuck: it skips that frame and carries on, and
  selecting the party's token reopens a view that was lost.
- A travel step that never finishes (a lost server reply) no longer stops every trip for good.

## 0.12.0

- **The phones' photographs are back** (from Unsleeping Pagers): a payphone is its weathered
  payphone and a desk phone its cream push-button phone, with their own keys pressable on the
  picture (lit while pressed) and the number on the phone's card, beside the same lit screen,
  coin slot, book and buttons as before. The **dial tone** plays when you pick up, until the first
  key; keypad tones on every key.
- **Placing payphones** (GM): Switchboard, Places, **Place a payphone** (or a phone), then click
  the map. It goes there as a tile with a fresh number, and its name box opens ready to type
  ("Payphone outside O'Malley's"). Show finds it on the map; remove deletes it. **No Monk's Active
  Tiles needed**: anyone clicks a phone tile to use it (players from beside it).
- **Answering machines**: when a player calls a place you are told (a notice and a soft ring),
  and the call strip and switchboard offer **Machine** beside Answer. The caller hears the tone and
  writes a message (the quarter is spent: the machine picked up). Messages wait on that place's
  phone for you and anyone there, to read and erase; only you see who left each one. The
  switchboard counts them.
- Lists no longer cut off: in every book and directory a long name shortens and its number
  always shows.
- Tile phones can be named in the switchboard, so the books can tell them apart.

## 0.11.1

- **Payphones on Tiles**: a Tile on any scene can be a payphone or a phone (switchboard, Places:
  select the tile, then Selected tile: payphone). Tokens on it or within a square and a half are at
  it. Players open it with Use a phone here, or by clicking it through Monk's Active Tiles (Execute
  Macro with `api.phones.openTile`); clicked by the GM for a player's token, it opens on that
  player's screen. The switchboard lists tile phones with their scene, and changes or removes them.
- **More from Unsleeping Pagers** (its later versions): payphone Tiles keep their numbers as KG
  Cities payphones, and its "Unsleeping Payphone Tile" macro now opens them, so existing Monk's
  Active Tiles triggers work again; players' address books go into their characters' books and
  pagers; pagers keep their arcane tier on record; page times are read as the world clock's (the
  first move showed them as dates). Worlds already moved get only what was missed.
- **Your pager** button in the token controls for players carrying one, besides the pager at the
  bottom right of the map.
- Phones at places with long names (Massachusetts General Hospital) no longer spill past their
  window: the name is shortened instead.

## 0.11.0

Folds in Unsleeping Pagers as the city's communications. Phones belong to places; pagers belong
to people.

- **Place phones**: a place card's Links tab gives a place a phone or a payphone and its number.
  Calling it rings for the players whose characters are there (near it on the city map, or on its
  own scene): they hear the bell and Pick up or Let it ring. Calls connect, show their time, and
  either end hangs up. Busy, no answer and not in service sound as they should.
- **Payphones take a quarter**, paid from the caller's coins only when the call goes through
  (otherwise the coin is returned). 911, the operator, 411 and 611 are free.
- **Pagers are items** on characters, each with its own number, its memory of contacts and its
  received pages, all of which go with it when it changes hands. Unknown numbers show as digits
  and can be saved with a name; Call back finds a phone where the character is.
- **Address books** stay with each character and back up their pagers: numbers saved on a pager
  are copied in, and a new pager starts from it. At a phone: the address book and the phone book
  (discovered places with a listed line).
- **One interface for every device**: desk phone, payphone and pager share the same lit screen,
  tabs, keypad and buttons, in their own skins. Keyboard dialling works.
- **Switchboard** (GM, token controls): live calls, every place phone and who is there, every
  pager (number, page it, give one), and the GM's own numbers for people not on the map. A call
  strip shows calls waiting for the GM: 911, the operator, the GM's numbers, unlisted numbers.
- **From Unsleeping Pagers**, once, the first time a GM logs in (that module need not be
  installed; disable it first): its pager items become pagers of the same model with the actor's
  pager number (a second pager on an actor gets a new one), each player's page log goes onto
  their character's pager, and senders with a number go into that pager's memory and the
  character's address book. The old data is left in place and nothing is moved twice.
- Settings: how long phones ring; phone and pager volume (per computer).
- API: `game.modules.get("kg-cities").api.phones`. Device kinds are open to a carried phone (an
  early cell phone) later.

## 0.10.0

Works with KG Transit 4.9.1 (the train window and the street view follow the same selection and open in one spot).

- **Street views**, like KG Transit's train rides: a party on foot sees the street from the
  sidewalk at eye height, walking pace and a walker's sway; in a cab or its own vehicle, from the
  road at 35 mph, through the vehicle's interior when it has one (else just the street going by): a downtown street in perspective (lanes, parking,
  sidewalks, building fronts with their windows lit at night, street lamps, cross streets and
  their traffic lights, oncoming traffic), lit for the hour, bouncing a little on the springs,
  slowing to a stop on arrival. Each player sees their own party's car on their own, whatever
  they have selected (out of the car their character rides in); the GM sees the view of the
  party token they have selected (on a train, KG Transit's ride; nothing selected, no view),
  with Arrive now, Stop and Close. It opens where KG Transit's ride window does, so a party's
  view is always in one spot; full screen or a window. The Travelling panel moves to the top
  right, clear of it.
- Interiors: a cab is built in (setting "Cab interior" to use your own); a party's vehicle uses
  the "Interior view (KG Cities)" field in its prototype token's settings (Appearance), else the
  setting "Car interior (default)", empty unless you set one. The street's horizon is found from
  the picture itself (just above the hood of a car, the headlamp of a motorcycle). Bebe's Mustang
  and Trudy's motorcycle (interiors and sounds) ship in `assets/` for their tokens. Paint the windows flat grey and `tools/key-interior.py` makes
  them transparent; `tools/road-harness.html` previews one against the street.
- Driving sounds: a vehicle's prototype token also takes a "Driving sound (KG Cities)", looped
  and faded in and out while the party drives it; else the setting "Car sound (default)" (empty:
  silence). Cabs have their own sound built in (setting "Cab sound" to use your own). A client setting sets
  the volume.
- With KG Transit 4.9.1: the GM's ride window shows the ride of the selected party token too.
  Only the token selected last decides, so the GM never sees a train ride and a street view at once.
- With Flash Token Bar 5e: on a city scene its bar opens on the Group tab, listing every party
  with a token on the scene (no dragging in), folded, each with one picture of its people. A
  plain click picks just that party; shift-click adds. Kept in step as parties split and merge.
- Money is always shown in dollars (fares, totals, purses); it is still paid from the sheets'
  coins, at KG Transit's "Money: copper per dollar" rate.
- A train's Skip, Get off next stop or Arrive no longer makes other parties' street trips arrive
  at once: they carry on from where they were.
- The Travelling panel no longer redraws itself under the pointer: its speed dropdown stays open
  and its buttons answer while trips tick on.
- Landmark hover cards no longer show (or open on click) through tokens, the sidebar, the chat
  or any window in front of the map.
- Street views follow the weather (Calendaria's, read as KG Transit's rides read it): clouds grey
  the sky and dim the day; rain falls past, wets the road (lamps and headlights shine off it) and
  runs on a car's windscreen; snow drifts down and whitens the sidewalks; fog hides the far end
  of the street; thunderstorms flash. `tools/road-harness.html?wx=rain` previews a weather.

## 0.9.0

- **Travel by dragging** (the GM, on a city scene): drop a party token somewhere and a window
  asks how the party goes, with each way's time already worked out. **Walk** (the default, 3 mph
  along the streets), **Taxi** (four to a cab, the 1986 meter's fare per cab shared by its
  riders and paid by each rider, the party's purse, or nobody; the meter is set per city in the
  window), **Own vehicles** (the vehicle actors in the party's group: owners drive their own,
  everyone else fills the seats; a vehicle whose owner is elsewhere needs a driver chosen;
  greyed out while anyone lacks a seat; 35 mph, 55 on interstates; the party arrives with its
  slowest car) and **Teleport** (instant, or keeping one of the other ways' time on the clock).
  Shift-drag just moves the token. Cancel leaves it where it was. A party token dropped on
  another of the same party's tokens just moves there (bringing them together to merge, not a
  trip); splitting and merging never start travel, and stop a trip under way.
- Vehicles: drop a vehicle actor on the Own vehicles tab to add it to the party; set its owner
  and passenger seats right there.
- Trips run together on the world's clock (setting "Travel speed", real time by default), each token moving along its route with its way still to go drawn on the map. The
  GM's Travelling panel shows each trip's progress, with Arrive now (the clock runs on to its
  arrival, moving every trip on) and Stop. Other modules hear `kgCities.arrived`.
- With KG Transit 4.9 (a network on the scene): a **Train** tab, the best stations to walk to and
  from, door to door ("Walk 6 min to Harvard, Red Line to Park Street 14 min, walk 4 min; 24 min,
  53 min quicker than walking"). The party walks to the station; there Board opens for the GM
  with the destination chosen (riders and fares confirmed there, as ever); off the train at that
  stop, they walk on to where they were dropped. Off early, the walk on is left to the GM.
- With KG Transit: a party set down on a station by any trip (walk, cab, own vehicles, teleport)
  gets the Board window there, that party chosen. Ending a trip near a station does not.
- Trips run in real time by default (setting "Travel speed": real time, or up to 10 minutes a
  second), the clock written every few seconds as train rides do; Arrive now and Stop are in
  the Travelling panel.
- A vehicle's owner is chosen from the party's people (its split groups and the whole party's
  too, and its current owner), not from every actor in the world. Party names count people
  only: a party's vehicles are not in its name.
- One clock: while a train ride or a flight runs the world's clock (in real time), trips move
  with it instead of running it at the travel speed; the Travelling panel says so.
- Settings: "Ask how to travel when dragging" (party tokens, every token, never), "Travel
  speed", and "Cab fares: copper per dollar" (KG Transit's own when it is installed).

- Edit points of interest moved from the Journal Notes controls to the Token controls, where KG
  Realms keeps its editor. While editing, a click on a token is the token's (select, drag), not
  a click on the map under it.

- Party tokens, from KG Realms: a party is a dnd5e group actor's token. Each member's portrait
  sits round the inside of a glowing ring (its colour is a setting), as big as fits without
  overlapping: they grow as a party splits and shrink as it merges (one member: their portrait
  fills the ring), and on a city scene zoomed
  far out the token is drawn larger so it stays findable. The token HUD's party button splits a
  party (drag people between the two sides) or merges the selected ones. While a party is split,
  each group and its token are named for who is in it ("Leonard and Pierre", "Leonard, Pierre
  and Dot"); back together, it takes the party's title again. Members changed on a group's sheet
  rename it too; renaming the whole party yourself makes that its title. A merge keeps pooled
  items and money on the old group.
- Setting "The party": the group actor that is the players' party (empty: dnd5e's primary party).
- With KG Realms active, Realms manages parties and KG Cities only reads them (no second button
  or ring). KG Realms' parties count as KG Cities' own. A party split by KG Cities alone is not
  known to KG Realms as split if Realms is turned on later: merge it and split it again there.
- `api.parties`: a scene's party tokens, the one to act on, a party's members and its record.

- A street network for routes, built when a city is generated (roads.json, about 7 MB for
  Boston's metro, 2 MB as sent): every road, alley, service road (airports, hospitals, campuses),
  pedestrian street and pier, joined where they meet, with each road's kind, interstate, one way,
  ramp, bridge and tunnel. Sidewalks, footways and cycleways are left out (walkers use the
  streets), as are parking aisles and driveways. City data goes to version 6: each city asks to
  rebuild its data once (from the saved map, no download).
- `api.route(from, to, { mode, show })`: the fastest route on the city scene on screen, on foot
  at 3 mph or by road at 35 mph (55 on interstates), in the scene's era: roads not built yet are
  closed, and the era's own roads are open. Harvard Square to Boston Common: 3.8 mi, 77 min on
  foot; 3.9 mi, 9 min by car.
- Boston 1986: the elevated Central Artery and the Dewey Square Tunnel are I-93 (interstate)
  for routes. The rules that remove the Big Dig and the Ted Williams Tunnel now remove only
  interstate roads, so Route 1A and the Sumner and Callahan tunnels (1934, 1961) are back on the
  1986 map. For routes, a road the era cuts short (the tunnels' approaches, whose ends today are
  Big Dig ramps) joins the nearest street within 120 m.

## 0.8.0

- **Place cards**, ported from KG Realms. Clicking a landmark or safe haven opens its card, a
  window that is also the GM's editor (Edit, then Save or Discard). No journal is needed: the
  card holds What is known (for players, with secret blocks the GM reveals one at a time),
  Rumours and GM notes, written in a full-size editor. Who sees it: hidden, rumoured (players get
  the name, the marker and the rumours) or discovered.
- A card links a scene (Enter activates it for everyone, View is the GM's alone), actors (open,
  or drag onto the scene), an optional journal (opens from the card for anyone allowed to read
  it) and pictures. A journal page dropped on the card's Text box is copied in as a secret block.
- Place links: Insert place link in the text editor writes `@CityPlace[city:id]{Name}`, which
  opens that place's card from any journal, chat message or card.
- The way back (GM): entering a place's scene from its card leaves a trail, shown at the top of
  that scene (Boston, 1986 › Old North Church), docked under the scene navigation as KG Realms
  docks its bar. The city crumb takes everyone back, centred on the place; shift-click looks
  back alone. Under it, the place's links: Open Actor opens the actor for everyone on the scene,
  the GM included (players without permission see its art; drag it for a token), the eye opens
  its sheet for the GM alone; the people button shows the
  journal to the players on the scene, Journal opens it for the GM alone. More actors: a +N list.
- The point-of-interest editor keeps the map side (name, kind, shape, glow, who sees it, move,
  remove); its journal page, image, summary and scene fields moved to the card (Edit the card).
  A new point of interest opens its card to write it up.
- Journal-style points of interest are converted once, when the GM loads the world: the linked
  page's text becomes What is known (shown to players, as the page was), its first picture the
  art if there is none, and the journal stays linked as the card's Journal button. Cards already
  written are left alone. Ones with only a summary show it as What is known until edited.
- Editing a card's text, art or links no longer redraws the whole city map.
- `api.openPlaceCard(cityId, landmarkId, { edit })`.

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
