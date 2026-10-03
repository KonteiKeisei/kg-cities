// Writes data/cities/new-york.json: the World Trade Center as it stood before 2001.
//   node tools/build-new-york-pack.mjs
//
// Positions are in metres on the old street grid, measured from today's map data: the origin is
// midway between the two memorial pools (which sit inside the old tower footprints), u runs along
// the grid toward Church Street (-29.4 deg from east), v toward Vesey Street. On that frame the
// superblock's streets are: West Street u -160, Church Street u 197, Vesey Street v 182,
// Liberty Street v -116. Buildings other than the towers are placed from site plans of the time:
// approximate, good to a few metres.

import { writeFile } from "node:fs/promises";

const O = { lon: -74.013128, lat: 40.711585 };
const ANGLE = -29.4;
const K = Math.cos((O.lat * Math.PI) / 180) * 111320;
const th = (ANGLE * Math.PI) / 180;
const toLonLat = ([u, v]) => {
  const x = u * Math.cos(th) - v * Math.sin(th), y = u * Math.sin(th) + v * Math.cos(th);
  return [+(O.lon + x / K).toFixed(7), +(O.lat + y / 111320).toFixed(7)];
};
const ring = (pts) => { const r = pts.map(toLonLat); r.push(r[0]); return r; };
const rect = (u0, u1, v0, v1) => ring([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
const square = (cu, cv, half) => rect(cu - half, cu + half, cv - half, cv + half);

const towers = {
  id: "world-trade-center",
  name: "World Trade Center",
  lat: O.lat, lon: O.lon,
  model: "wtc-twin-towers", angle: ANGLE,
  from: 1972, until: 2001,
  glow: true,
  buildings: [
    { id: "wtc-1", h: 417, base: 0, rings: [square(-33.9, 51.9, 31.7)] },
    { id: "wtc-2", h: 415, base: 0, rings: [square(33.7, -51.8, 31.7)] }
  ],
  summary: "The Twin Towers: 110 storeys each, the tallest buildings in New York. The North Tower " +
    "(One World Trade Center, 1,368 ft, its television mast reaching 1,730 ft) holds Windows on the " +
    "World on the 107th floor; the South Tower (Two World Trade Center, 1,362 ft) has the Top of the " +
    "World observation deck, and on a clear day an open-air walk on the roof. Fifty thousand people " +
    "work here; the PATH trains and the E and the 1 run beneath the plaza."
};

// The Empire State Building on its lot (the map data's outline of the building, id 346338542):
// centre and angle of the lot's long side, along 34th Street toward Fifth Avenue.
const empireState = {
  id: "empire-state-building",
  name: "Empire State Building",
  lat: 40.7484437, lon: -73.9856565,
  model: "empire-state-building", angle: -29.07,
  from: 1931,
  glow: true,
  buildings: [{ id: "empire-state-lot", h: 381, base: 0, rings: [[[-73.9864987, 40.7484924], [-73.9861554, 40.7489598], [-73.9848143, 40.7483949], [-73.9851576, 40.7479275], [-73.9864987, 40.7484924]]] }],
  summary: "102 storeys of limestone and Art Deco steel at Fifth Avenue and 34th Street, 1,250 feet to " +
    "the roof and 1,454 to the tip of its television mast. The open-air deck on the 86th floor and " +
    "the glassed-in one on the 102nd draw a million visitors a year; at night the top floors are " +
    "floodlit in colours for the season."
};

const extraBuildings = [
  { id: "wtc-3", name: "Vista International Hotel (3 World Trade Center)", h: 73, from: 1981, until: 2001, rings: [rect(-145, -115, -108, 12)] },
  { id: "wtc-4", name: "4 World Trade Center", h: 36, from: 1975, until: 2001, rings: [ring([[40, -108], [190, -108], [190, -15], [145, -15], [145, -60], [40, -60]])] },
  { id: "wtc-5", name: "5 World Trade Center", h: 36, from: 1972, until: 2001, rings: [ring([[40, 175], [190, 175], [190, 75], [145, 75], [145, 128], [40, 128]])] },
  { id: "wtc-6", name: "U.S. Customs House (6 World Trade Center)", h: 30, from: 1973, until: 2001, rings: [rect(-148, -70, 112, 175)] },
  { id: "wtc-7", name: "7 World Trade Center", h: 186, from: 1987, until: 2001, rings: [ring([[-12, 193], [60, 193], [54, 248], [-12, 248]])] },
  { id: "bankers-trust", name: "Bankers Trust Plaza (130 Liberty Street)", h: 158, from: 1974, until: 2011, rings: [rect(-8, 42, -165, -125)] }
].map((b) => ({ ...b, base: 0 }));

const pack = {
  id: "new-york",
  landmarks: [towers, empireState],
  eras: {
    "1980s": {
      year: 1986,
      map: {
        // Today's buildings on the old sites: the superblock (One WTC, the memorial and museum,
        // the Oculus, the new towers), the 7 WTC block, and Liberty Park over the Bankers Trust site.
        hiddenAreas: [
          { name: "World Trade Center superblock", ring: rect(-152, 192, -110, 176) },
          { name: "7 World Trade Center block (Washington Street angles across it)", ring: rect(-45, 64, 190, 252) },
          { name: "Bankers Trust block", ring: rect(-45, 60, -205, -123) }
        ],
        // Greenwich and Fulton Streets did not run through the superblock until after 2001.
        closedStreets: [{ name: "World Trade Center superblock", ring: rect(-145, 186, -104, 170) }],
        extraBuildings,
        // Bridges and tunnels by their 1980s names (renamed 2008 to 2017).
        roadNames: {
          "Robert F. Kennedy Bridge": "Triborough Bridge",
          "Ed Koch Queensboro Bridge": "Queensboro Bridge",
          "Ed Koch Queensboro Bridge Upper Level": "Queensboro Bridge",
          "Ed Koch Queensboro Bridge Lower Level": "Queensboro Bridge",
          "Hugh L. Carey Tunnel": "Brooklyn-Battery Tunnel",
          "Governor Mario M. Cuomo Bridge": "Tappan Zee Bridge",
          "Mario M. Cuomo Bridge": "Tappan Zee Bridge"
        }
      },
      places: {
        rules: [
          { match: "One World|Westfield|The Oculus|Observatory|Silverstein|Liberty Park|9/11|September 11|Memorial|Apple World Trade Center|Perelman", hide: true, near: [O.lat, O.lon], radius: 320 }
        ]
      }
    }
  }
};

await writeFile(new URL("../data/cities/new-york.json", import.meta.url), JSON.stringify(pack, null, 2) + "\n");
console.log("data/cities/new-york.json written");
