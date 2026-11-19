# KG Cities

Real cities as Foundry VTT scenes. Pick a city and the module downloads just that city's map, packs it into one file in your Foundry data, and makes a gridless scene at real scale (100 px = 250 ft, measured in feet and miles), drawn from OpenStreetMap: streets and names, parks and water, and leaning 3D buildings in a night or day look. Zoomed far out, the city fades into the city at night from orbit.

Set in **1986** by default. Each city has period landmarks and a transit overlay based on the routes of the time. Buildings dated after the scene year can be hidden. New York has custom models for the World Trade Center and the Empire State Building.

- **Requires:** Foundry VTT v13.
- **Cities:** Boston, New York, Washington, Philadelphia, Baltimore, Atlanta, St. Louis, Detroit, Chicago, San Francisco, Los Angeles, Las Vegas, Austin, Miami, Seattle, and Perth (Western Australia).
- **Works with:** **[KG Transit](https://github.com/KonteiKeisei/kg-transit)** for the cities' rail networks, airports and flights between the cities (a good module on its own; on a city scene it sets up the city's known transit by itself); [Calendaria](https://github.com/Sayshal/calendaria) for the time of day (day and night looks).

## Install

In Foundry's **Add-on Modules > Install Module**, paste this manifest URL:

```
https://github.com/KonteiKeisei/kg-cities/releases/latest/download/module.json
```

Or unzip a release into your Foundry `Data/modules` folder. Then enable **KG Cities** in your world.

See the [wiki](https://github.com/KonteiKeisei/kg-cities/wiki) for a full guide. Modern city scenes are planned.

**Future** is available for Seattle and Perth. It uses the current street map, business and place names, and rail corridors. With KG Transit active and **Set up city networks** enabled, the first GM to open the scene gets rideable rail with KG Transit's Future theme, including neon stations and cyber tunnels. GM POI edits still apply.

## Making a city

1. In the **Scenes** sidebar, click **Generate city** (GM).
2. Pick the city, the era and how much the scene covers: the **city core**, or the **whole metro** area (about 30 miles across; large scenes can be slow).
3. **Generate scene.** The first time, the city's map is downloaded (one to a few minutes) and saved in `Data/kg-cities/<city>/`; later scenes of the same city reuse it. **Refresh data only** downloads a city again and updates its scenes without making a new one.

## On the map

- **Landmarks** glow gold, their real buildings lit (or a pin for parks, bridges and places since demolished). Hover one for a preview (art, description, address, distance from your token); click to open its **place card**. Landmarks gone or not yet built in the scene's year are left off.
- **Place cards** need no journal. Each point of interest carries its own text: **What is known** (players, with secret blocks the GM reveals one by one), **Rumours** (all players get while it is only rumoured) and **GM notes**. Who sees it: hidden, rumoured or discovered. The GM can link a **scene** (Enter takes everyone there, View only you), **actors**, a **journal** (optional, opens from the card) and pictures, and drop a journal page on the card to copy its text in. **Insert place link** in the text editor writes `@CityPlace[...]` links that open another place's card from any journal or chat.
- **The way back** (GM): after entering a place's scene from its card, a bar at the top shows the trail (Boston, 1986 › Old North Church). Click the city to take everyone back, centred on the place; the arrow looks back alone; the people button brings every player to where you are.
- **Safe havens** (the players' places) are blue, **airports** violet (with [KG Transit](https://github.com/KonteiKeisei/kg-transit)).
- **Search** (Ctrl+F, or the magnifier in the token controls): landmarks, addresses ("193 Salem St"), streets and places, nearest first. Picking one pans there and makes it blink.
- **Edit points of interest** (GM, the landmark tool in the token controls): click a label, landmark or building to edit it in a panel beside the sidebar: name, kind, shape, glow, who sees it, move, remove, and **Edit the card** for its text and links. Click a plain building or empty map for a quick menu (point of interest, safe haven, label, pin). Landmarks and label edits are kept per city, so a campaign can travel between cities.

## Chain stores

**Chain stores** (GM), on the banner while you edit points of interest, turns the city map's drugstores, banks and Radio Shacks into 1986 points of interest in one go, a tab for each.
- **Drugstores, where they go:** today's stores stand in for 1986's, since no list of where the stores stood in 1986 survives. Today's **CVS** were CVS (a Massachusetts chain since 1963). Today's **Walgreens** and **Rite Aids** stand in for **Brooks Drug**, the New England chain of the day; many of them are Brooks's own old stores (Rite Aid bought Brooks in 2007, and Walgreens bought those stores in 2017). Walgreens itself came to Boston about 2000, but you can keep some of today's Walgreens as Walgreens if your Boston has them.
- **What each store gets:** a 1986 name, your **shop actor** on its card (found by name: an actor called "CVS", "Brooks" or "Walgreens"; pick any other), and the **actor's token as its marker** on the map, a round badge in a gold rim. A store's two entries in the map data (shop and pharmacy counter) count once.
- **Running it again** relinks and re-marks the stores, and keeps what you wrote on their cards. **Remove** takes a chain's stores off again.
- **Banks** (each city its own): today's banks stand in for the 1986 banks they bought, so many are the same branches. In Boston, today's **Bank of America** becomes **Bank of Boston**, **BayBank**, **Shawmut** and **Bank of New England** (all through Fleet), shared out across the map; **Santander** becomes Bank of New England and Shawmut (Fleet's own eastern Massachusetts branches, through Sovereign in 2000); **Citizens** becomes **Boston Five** and **Neworld Bank** (bought 1993 and 1994); the old savings banks keep their names (Eastern as **Eastern Savings Bank**, its name from 1981 to 1989). Banks with no 1986 line in the city (Chase, TD in Boston) are left as they are. Every other city has its own (Chicago's Chase is First Chicago, Atlanta's Truist is Trust Company Bank); Boston's are checked against sources, the other cities' not yet, and the window says so. Change any name, and how many to place. A branch placed before keeps its 1986 name when you run it again. An ATM inside a branch is the branch; one on its own is placed as **"<bank> ATM"**. Without an actor, a branch is drawn with a bank badge and an ATM with a machine.
- **Place** places the checked chains of the open tab only.
- **Radio Shack**: none is left, so today's phone stores (AT&T, Verizon, T-Mobile and the like) stand in, in the same neighborhood strips; you pick how many (12 by default, spread out). **Make / repair the Radio Shack** (needs [Item Piles](https://foundryvtt.com/packages/item-piles)) makes one shop actor every store opens: 49 things from Radio Shack's catalog in the stores from fall 1986 (No. 406), at its prices (Tandy computers and modems, Realistic scanners, walkie-talkies and CBs, a phone recorder, a wireless mike, alarms, tools, batteries). Things sold in pairs are sold singly at half price, so each can be handed out. Prices are written as pennies (cp), nickels (sp), dimes (ep), quarters (gp) and dollars (pp). Each item's description says what it does at the table, ranges included, and every item carries a scrap value for crafting later (`flags.kg-cities.scrap`: kind `electronics`, 1 per $10); radios also carry their range and channels (`flags.kg-cities.radio`). It never runs out and buys nothing back. Any chain store linked to an Item Piles shop gets a **Shop** button on its card. The button reuses the existing merchant and adds only missing catalog entries, preserving existing items and prices. The one-item inventory created by 0.16.0 is repaired automatically when the active GM loads the world.
- **Change logo**, below each chain's actor selector, chooses one image for all of that brand's stores across every city. It also updates the selected actor, its placed tokens, and its Item Piles merchant image. Future placements use the saved logo, including chains with no actor.

## Dollars in Item Piles

With [Item Piles](https://foundryvtt.com/packages/item-piles) on, a currency's abbreviation in Item Piles' currency settings can do sums on its amount, so coins read as dollars in shops, vaults and trades. `{#}` is the amount as it is; anything after the `#` is applied to it: at 1000 copper a dollar, gold as `${#/10}` shows 799 gold as **$79.9**, copper as `${#/1000}`, platinum as `${#}`. A sum that fails shows the plain amount. Turn it off in the settings (**Dollars in Item Piles**). It does what a hand edit of Item Piles' own file once did, but survives Item Piles updates; with an edited Item Piles still installed, the two do not clash.
## Banks

A bank's place card has a **Bank** button (an ATM's, **ATM**), for a player whose character is there; the GM can open any and pick whose account.
- **An account** is free: open one at any branch (one at a time, moved to another bank by its teller). Deposit cash from the wallet, withdraw, and pay in paychecks. An ATM takes the account of any bank, with quick $20 to $100 buttons. The statement shows the last 40 entries. The GM can change a balance without the wallet (a wire, a fee, a seizure).
- **Safe deposit boxes** (needs Item Piles, and a GM on): rent one at a branch, small, medium or large ($2, $4 or $8 a month). It is an Item Piles vault only that character can open, and only at that branch; it keeps items and money. The first month is paid when it is rented, from the account or in cash; then the rent comes with the **bills** each month (on its own day, living costs on or off), and shows in the budget. Give it up once it is empty. The vaults are in the Actors folder **KG Cities: safe deposit boxes**.

## Phones and pagers

Phones belong to places; pagers belong to people.

- **Place phones**: on a place card, Edit, Links, **Phone**: none, a phone or a payphone, with its number (New number picks an unused 555 one). The number shows on the card and the map's hover card. A phone rings for the players whose characters are there (a token or party token within about 300 feet on the city map, or anywhere on the place's own scene): they hear it, and Pick up or Let it ring. Use it from the card's **Phone** button or the **Use a phone here** tool in the token controls (players).
- **Placing payphones** (GM): Switchboard, Places, **Place a payphone** (or a phone), then click the map: it stands there as a tile with a fresh number; it is named for where it stands on a city map ("Payphone, 193 Salem Street"), or name it right there ("Payphone outside O'Malley's"). Works on any scene. Tokens on it or within a square and a half are at it, and **click it to use it**: no other module needed. (An existing tile can be made one too: select it, then Selected tile to payphone.)
- **The phones** are their photographs (the payphone, a cream push-button desk phone) with their own keys to press, beside a lit screen with the address book. The dial tone plays as you pick up.
- **Answering**: you are told whenever a player calls a place. Every call ringing for you (a place, your numbers, 911, an unlisted number) has **Pick up**, **No answer** (it rings out), **Busy**, and for a place the **Machine**, where the caller writes a message (an unlisted number: **Not in service**). Each stops the caller's ringing at once. Messages wait on that place's phone for you and anyone there.
- **Payphones** take a **quarter** (paid from the caller's coins at the dollar rate, only when the call goes through; otherwise the coin comes back). 911, the operator (0), 411 and 611 are free. Payphones are not in the phone book.
- **Pagers** are items on a character: the GM gives one from the switchboard (a Pageboy II beeps, a Bravo shows numbers, an NEC 21A shows short messages). Each pager keeps its own number, its **memory** (20 names and numbers), and its **pages**: unknown callers show as numbers until saved with a name. Handing a pager to someone else hands over all of that. It buzzes when a page comes in (beep, vibrate or silent, set on the pager).
- **Little black books and Rolodexes** are paper address books, items too: no number, no limit, written in by hand (each entry in handwriting, on blue-ruled pages or index cards). Anyone holding one can read it. The GM gives them from the switchboard's **Pagers and books** tab. A Rolodex card has room for a note ("ask for Mick").
- **What a character carries** sits in the **pocket dock** at the bottom right of the map: a pager, a black book, a Rolodex. Click one to open it, anywhere: a number heard in play is written straight in with **Add a number**. Click an entry to call it from a phone the character is at; right click it to **Edit** or cross it out. The dock steps up above the street view while a party travels; drag it by its grip to put it elsewhere and lock it there (it remembers, per computer). **Your pager and address book** in the token controls opens them too.
- **At a phone**, the list is the character's own numbers, from everything they carry, each tagged with where it is kept. **Copy to** moves a number into another of their pagers or books; a number with no listing is written in by name. Under it, the **Yellow Pages** is blank until something is looked up: players find the listed phones of places they know of, never pagers (a pager's number is personal).
- **Remembered numbers**: everything a character writes or saves is remembered too, behind the scenes, so a new pager or book starts with it and a lost one is not the end. On updating to 0.15, any number a player character remembered that nothing they carried held was written into their black book (a new one, if they had none).
- **Opening a phone for a player** (GM): every phone and pager window has the player list and **Open for them**: it opens on their screen, and for a phone, their character may use it for the next hour wherever their token is. On your screen, the list under the phone is the picked player's numbers.
- **Paging**: dial a pager's number from any phone, then key in a number to call back and press # (an alphanumeric pager's operator takes a message instead).
- **Switchboard** (GM, the tower in the token controls): every call (Answer, Not in service, Hang up), every place phone and who is there (Ring it), every pager (change its number, page it, give a new one), and **your numbers**: people and businesses not on the map, whose calls ring for you. Calls to 911, the operator and unlisted numbers ring for you too; a call strip at the top of the screen shows what is waiting.
- Calls are put through by the GM's client: with no GM logged in there is no dial tone.
- **Coming from Unsleeping Pagers**: disable it, update KG Cities, and log in as GM. Its pagers, numbers, page logs, address books and payphone Tiles move over once (it need not be installed), its payphone macro is pointed at KG Cities so Monk's Active Tiles triggers keep working, and you are told what moved. Its arcane tiers and Phone Patch are not part of KG Cities.

## Payroll and living costs

Characters get paid on the world clock, and pay their bills out of it. **Payroll** in the token controls (the GM); players get **Your pay**. The list is the player characters (a player's vehicles and companions are left out); drag any other actor in from the Actors sidebar to put them on the payroll, under **Others**.

- **Jobs** go on a character: hourly, weekly, yearly, per job, per word, or an allowance. Each pays weekly, biweekly, monthly, every so many days, or only when you press **Pay now**. Each pays in **cash** (to the wallet) or by **paper check** (an item, cashed from Your pay). It can be **on the books** (1986 federal and Massachusetts income tax and FICA come out) or off them. A job can also have union dues, an **in-season** span (a hockey salary is paid October to April), and a number of paydays left.
- **Payday rolls**: a die, plus a skill or ability if you like, read against your own results ("2 to 5: half the hours", "page one: 25¢ a word"). **Bonuses and risks**: an amount or a percent, on the next payday only, every payday, or by chance (1 in 6 he gets stiffed). They can be **cash on the side**: untaxed and to the wallet, like a garbage man's side deliveries.
- **The 1986 job guide**: about 125 jobs with their median weekly pay from the Bureau of Labor Statistics' 1986 survey, plus 10% for Boston if you like. There are also ready-made jobs the survey doesn't count (an NHL salary, cash work with no papers, a newspaper stringer by the word, an allowance), and your own saved jobs. **Use** fills in the job editor. Union jobs come with dues.
- **Pay stubs** go to the chat for the character's owners and the GM: the payday roll, gross, each deduction and net. A time skip pays every payday it passed, in order.
- **Living costs**: where the character lives (rent, a mortgage, owned, with family, or nowhere; 20 Boston neighborhoods), heat, lights and phone, a vehicle (its insurance and its gas in city driving), groceries (the USDA's four food plans, times the mouths to feed), and any bills you add. A **dependant** pays no rent, utilities or groceries. Every figure can be changed. Turn on **Charge these bills** and they come out of the wallet weekly (rent and other monthly bills every 30 days). Anything they can't cover is **owed** and paid first next time. The panel shows what they take home in a week, what their bills come to, and what's left.
- The 1986 figures: wages from the Bureau of Labor Statistics, Monthly Labor Review, June 1987. Federal tax by the 1986 rate schedule for a single person, with the $1,080 exemption. FICA was 7.15% up to $42,000. Massachusetts took 5% over its exemption. Gas was about 85¢ a gallon. **Rents, mortgages, insurance and union dues are estimates.** Groceries are the USDA food plans brought back to 1986 prices, also an estimate.

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
| Area code | Put in front of every phone and pager number KG Cities gives out (617, Boston). Dialling without it still connects. |
| Phones ring for | Seconds a phone rings before the caller hears no answer. |
| Phone and pager volume | Rings, tones and pager alerts, per computer. |
| Cashing paychecks | Players cash their checks at once, or you approve each one (a bank, ID, or not here). |

## For other modules

`game.modules.get("kg-cities").api`:

- `cityOf(scene)`: a city scene's `{ city, era, year, bounds, ... }`, or null.
- `projector(scene)`: lat/lon to scene pixels for any city scene.
- `transit(cityId, era)`: a city's rapid transit for an era (track, lines, stations).
- `addLandmarks(fn)`: add landmarks to city maps (`fn(cityFlag)` returns landmark-like entries; KG Transit's airports use it).
- `generateCity(cityId, { era, year, area, at, view })`: make a city scene without the dialog.
- `sceneCovering(cityId, { lat, lon, era })`: the smallest scene of a city whose map covers a point.
- `openPlaceCard(cityId, landmarkId, { edit })`: open a landmark's place card.
- `parties.scene(scene)`, `parties.selected(scene)`, `parties.members(actor)`, `parties.meta(actor)`: party tokens (dnd5e group actors; KG Realms' parties count too).
- `route(from, to, { mode, show })`: the fastest route on the city scene on screen, walking (3 mph) or driving (35 mph, 55 on interstates), in the scene's era. Points are scene `{ x, y }` or `{ lat, lon }`; returns miles, minutes, interstate miles and the route's points.

## What it downloads

Only when a city is generated or refreshed: that city's map tiles from [OpenFreeMap](https://openfreemap.org) (free, no key), or your own tile server. Everything else ships with the module. Once a city is made, it works offline.

## For developers

- `npm test` (Node 20 or later) runs the tests.
- `tools/era-preview.html` draws a city's era outside Foundry (`?city=new-york&lon=&lat=&z=`), served by `python tools/serve.py`.
- The data is built by the tools in `tools/` (landmarks, eras, transit) from OpenStreetMap through Nominatim and Overpass; see the notes at the top of each.
- `node tools/release.mjs <version>` builds a clean release in `dist/`.

## License and credits

KG Cities is under the [PolyForm Noncommercial License 1.0.0](LICENSE): free to use, copy, share and change for noncommercial purposes. It may not be sold, in whole, in part or as a modified version, or used commercially. The map data in `data/cities` and `data/transit` is derived from OpenStreetMap, © OpenStreetMap contributors, under the [Open Database License](DATA-LICENSE.md). Map tiles © OpenFreeMap © OpenMapTiles. MapLibre GL JS, Mapbox's pbf and vector-tile libraries and the Noto Sans fonts keep their own licenses: see [CREDITS.md](CREDITS.md).
