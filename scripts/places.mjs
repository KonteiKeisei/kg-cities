import { metres } from "./geo.mjs";
export { metres };

// Place labels for a city and era. Pure: no Foundry.
//
// Three layers, each overriding the one before:
//   1. the city's place list   every named place in the map data, as of today (derive.mjs)
//   2. the era's corrections   hidden, renamed, kept and added places, modern zones and chains
//                              that arrived later (the city pack's eras.<era>.places)
//   3. GM edits                { edits: { id: { name, kind, hidden, note } }, added: { id: place } }
//
// Businesses (shops, restaurants, banks...) nobody has checked are handled by one policy:
//   "generic"  labelled by type only ("Restaurant", "Package Store"): there is a business
//              here today, but nobody knows what it was in 1986
//   "hide"     not shown
//   "show"     shown with today's name, except chains known to have arrived after 1986

/** Kinds that are civic, natural or historic: shown with their names unless a rule says otherwise. */
const CIVIC = new Set([
  "park", "nature_reserve", "garden", "playground", "pitch", "recreation_ground", "common", "village_green",
  "cemetery", "grave_yard", "school", "college", "university", "kindergarten", "library", "place_of_worship",
  "monastery", "hospital", "fire_station", "police", "post_office", "townhall", "courthouse", "prison",
  "museum", "memorial", "monument", "wayside_shrine", "heritage", "historic", "archaeological_site", "ruins",
  "attraction", "theatre", "arts_centre", "concert_hall", "stadium", "sports_centre", "ice_rink", "swimming_pool",
  "station", "ferry_terminal", "aerodrome", "peak", "island", "islet", "beach", "bay", "cape", "marina", "pier",
  "zoo", "aquarium", "lighthouse", "fort", "castle", "bridge", "building", "community_centre", "conservation",
  "wetland", "water", "river", "stream", "lake", "golf_course", "highway", "neighbourhood", "macrohood"
]);

/** Places the map labels from zoom 14 (others in their tier from 16 or 17). */
const LANDMARKS = new Set([
  "park", "garden", "nature_reserve", "cemetery", "university", "college", "hospital", "museum", "library",
  "stadium", "attraction", "monument", "memorial", "townhall", "courthouse", "theatre", "zoo", "aquarium",
  "marina", "beach", "golf_course", "station", "ferry_terminal", "lighthouse", "fort", "castle", "bridge",
  "prison", "highway", "department_store"
]);

/** What a business of each kind is called when its 1986 name is unknown. null: no 1986 equivalent, not shown. */
const GENERIC = {
  restaurant: "Restaurant", fast_food: "Fast Food", food_court: "Food Court", cafe: "Coffee Shop",
  bar: "Bar", pub: "Tavern", nightclub: "Nightclub", music_venue: "Club", biergarten: null,
  bank: "Bank", bureau_de_change: "Currency Exchange", pharmacy: "Drugstore", chemist: "Drugstore",
  convenience: "Variety Store", variety_store: "Variety Store", supermarket: "Supermarket", grocery: "Grocery",
  greengrocer: "Fruit & Produce", deli: "Deli", bakery: "Bakery", pastry: "Pastry Shop", butcher: "Butcher",
  seafood: "Fish Market", alcohol: "Package Store", wine: "Package Store", ice_cream: "Ice Cream",
  confectionery: "Candy Store", clothes: "Clothing Store", shoes: "Shoe Store", boutique: "Boutique",
  hairdresser: "Hair Salon", barber: "Barber Shop", beauty: "Beauty Salon", nails: "Beauty Salon",
  dry_cleaning: "Dry Cleaner", laundry: "Laundromat", tailor: "Tailor", fuel: "Gas Station",
  car_repair: "Garage", car: "Car Dealer", car_wash: "Car Wash", tyres: "Tire Shop", car_parts: "Auto Parts",
  hotel: "Hotel", motel: "Motel", guest_house: "Guest House", hostel: "Rooming House",
  dentist: "Dentist", doctors: "Doctor", clinic: "Clinic", optician: "Optician", veterinary: "Veterinarian",
  books: "Bookstore", florist: "Florist", hardware: "Hardware Store", doityourself: "Hardware Store",
  jewelry: "Jeweler", furniture: "Furniture Store", electronics: "Electronics", computer: "Computer Store",
  music: "Record Store", department_store: "Department Store", mall: "Shopping Center", retail: "Stores",
  gift: "Gift Shop", tobacco: "Tobacconist", newsagent: "Newsstand", stationery: "Stationer",
  toys: "Toy Store", sports: "Sporting Goods", bicycle: "Bike Shop", pet: "Pet Shop", photo: "Camera Shop",
  travel_agency: "Travel Agent", estate_agent: "Real Estate", insurance: "Insurance", lawyer: "Law Office",
  tattoo: "Tattoo Parlor", cinema: "Movie Theater", fitness_centre: "Gym", parking: "Parking",
  copyshop: "Copy Shop", second_hand: "Thrift Shop", antiques: "Antiques", pawnbroker: "Pawn Shop",
  art: "Gallery", frame: "Frame Shop", fabric: "Fabric Store", interior_decoration: "Decorator",
  kitchen: "Kitchen Supply", locksmith: "Locksmith", shoe_repair: "Shoe Repair", funeral_directors: "Funeral Home",
  pharmacy_counter: "Drugstore", cosmetics: "Cosmetics", perfumery: "Cosmetics", bag: "Leather Goods",
  watches: "Jeweler", musical_instrument: "Music Store", video: "Video Rental", brewery: "Brewery",
  marketplace: "Market", conference_centre: "Hall", events_venue: "Hall", bowling_alley: "Bowling Alley",
  dance: "Dance Studio", community_hall: "Hall", social_club: "Club", office: "Offices", company: "Offices",
  industrial: "Works", warehouse: "Warehouse", construction: null, cannabis: null, "e-cigarette": null,
  vape: null, mobile_phone: null, telecommunication: null, video_games: null, coworking_space: null,
  escape_game: null, charging_station: null, bicycle_rental: null, car_sharing: null, outdoor_seating: null,
  artwork: null, residential: null, social_facility: null, ticket: null, helipad: null, loading_dock: null
};

const toRegExp = (pattern) => new RegExp(pattern, "i");


/** The map zoom a place's label appears from, by its importance in the map data (rank 1 = most). */
export const minZoomForRank = (rank) => (rank <= 5 ? 14 : rank <= 15 ? 15 : rank <= 25 ? 16 : 17);

/**
 * Marks the places a landmark already names (covered: true), so the map shows one name, the
 * landmark's: a place the landmark was made from (placeId), or one with the same name within
 * 120 m of it. Returns the place id each landmark covers, to keep the link.
 */
export function coverPlaces(places, landmarks, normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const links = new Map();
  for (const p of places) p.covered = false;
  for (const lm of landmarks) {
    let p = lm.placeId ? byId.get(lm.placeId) : null;
    if (!p) {
      const name = normalize(lm.name);
      p = places.find((q) => normalize(q.name) === name && metres(q, lm) <= 120) ?? null;
    }
    if (p) { p.covered = true; links.set(lm.id, p.id); }
  }
  return links;
}

const inBox = (p, box) => p.lat <= box.north && p.lat >= box.south && p.lon >= box.west && p.lon <= box.east;
export const isBusiness = (kind) => !CIVIC.has(kind);

/** Compile the corrections file once. */
export function compileCorrections(json) {
  return {
    rules: (json.rules ?? []).map((r) => ({ ...r, re: toRegExp(r.match) })),
    brands: (json.brands ?? []).map((b) => ({ ...b, re: toRegExp(b.match) })),
    zones: json.zones ?? [],
    added: json.added ?? []
  };
}

function ruleFor(place, rules) {
  return rules.find((r) =>
    r.re.test(place.name)
    && (!r.kind || r.kind === place.kind || (r.hide && r.kind === place.kind))
    && (!r.near || metres(place, { lat: r.near[0], lon: r.near[1] }) <= (r.radius ?? 200)));
}

function tierOf(kind, kept) {
  if (kind === "neighbourhood" || kind === "macrohood") return "neighbourhood";
  if (LANDMARKS.has(kind) || kept) return "landmark";
  return isBusiness(kind) ? "business" : "civic";
}

/**
 * Every place with its 1986 label. Each result: { id, name, kind, lat, lon, tier, hidden,
 * minZoom, base: { name, kind }, why, note, edited, custom }. "base" is what the map data
 * says today; "why" says which layer decided the label.
 */
export function buildPlaces(osm, corrections, gm = {}, { businesses = "generic" } = {}) {
  const out = [];
  const edits = gm.edits ?? {};
  // An edit whose place id is not in this map data (made on other data, such as KG Boston
  // Map's, or before the city's data was refreshed) finds its place again by the name the map
  // data gave it, kept in the edit as base. Every place of that name takes it.
  const ids = new Set(osm.map((p) => p.id));
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^\w\s&]/g, "").replace(/\s+/g, " ").trim();
  const orphans = new Map();
  for (const [key, e] of Object.entries(edits)) {
    if (ids.has(key)) continue;
    const baseName = typeof e.base === "string" ? e.base : e.base?.name;
    if (baseName && !orphans.has(norm(baseName))) orphans.set(norm(baseName), key);
  }
  const editFor = (p) => {
    if (edits[p.id]) return [edits[p.id], p.id];
    const key = orphans.get(norm(p.name));
    return key ? [edits[key], key] : [null, null];
  };

  const decide = (p, { custom = false } = {}) => {
    let name = p.name, kind = p.kind, hidden = false, kept = !!custom, why = custom ? "1986 list" : "map data", note = p.note ?? "";
    let confidence = p.confidence ?? null;

    if (!custom) {
      const rule = ruleFor(p, corrections.rules);
      if (rule) {
        why = "1986 list";
        note = rule.note ?? "";
        confidence = rule.confidence ?? null;
        if (rule.hide) hidden = true;
        else {
          if (rule.name) name = rule.name;
          if (rule.kind && !rule.hide && rule.name) kind = rule.kind;
          kept = !!(rule.keep || rule.name);
        }
      } else if (isBusiness(kind) || corrections.brands.some((b) => b.re.test(name))) {
        // A chain is a business even when the map files it as civic (The UPS Store is a "post_office").
        const zone = corrections.zones.find((z) => inBox(p, z.box));
        const brand = corrections.brands.find((b) => b.re.test(name));
        if (zone) { hidden = true; why = "1986 list"; note = `${zone.name}: ${zone.note ?? ""}`.trim(); }
        else if (businesses === "hide") { hidden = true; why = "businesses hidden"; }
        else if (businesses === "show") {
          if (brand) { hidden = true; why = "1986 list"; note = `Chain arrived in Boston ${brand.since}. ${brand.note ?? ""}`.trim(); }
        } else {
          const label = GENERIC[brand?.kind ?? kind];
          if (label) { name = label; why = "generic business"; }
          else { hidden = true; why = "generic business"; }
        }
      }
    }

    const [edit, editKey] = custom ? [edits[p.id] ?? null, p.id] : editFor(p);
    if (edit) {
      if (edit.name) { name = edit.name; kept = true; }
      if (edit.kind) kind = edit.kind;
      if (edit.hidden !== undefined) hidden = !!edit.hidden;
      if (!edit.hidden && (edit.name || edit.hidden === false)) kept = true;
      if (edit.note !== undefined) note = edit.note;
      why = "GM edit";
    }

    out.push({
      id: p.id, name, kind, lat: p.lat, lon: p.lon, tier: tierOf(kind, kept), hidden,
      minZoom: p.minZoom ?? null, base: { name: p.name, kind: p.kind }, why, note, confidence,
      // editKey: where its edit is kept (another id when it was found again by name).
      edited: !!edit, custom, ...(edit && editKey !== p.id ? { editKey } : {})
    });
  };

  for (const p of osm) decide(p);
  for (const p of corrections.added) decide({ ...p, id: p.id }, { custom: true });
  for (const [id, p] of Object.entries(gm.added ?? {})) {
    decide({ ...p, id }, { custom: true });
    out[out.length - 1].why = "GM edit";
    out[out.length - 1].gmAdded = true;
  }
  return out;
}

/** GeoJSON for MapLibre: hidden places included (drawn only while the GM edits); places a landmark covers left out. */
export function toGeoJSON(places) {
  return {
    type: "FeatureCollection",
    features: places.filter((p) => !p.covered).map((p) => ({
      type: "Feature",
      id: undefined,
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, name: p.name, kind: p.kind, tier: p.tier, hidden: p.hidden, min_zoom: p.minZoom ?? 14, edited: p.edited || !!p.gmAdded }
    }))
  };
}
