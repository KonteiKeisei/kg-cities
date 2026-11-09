// How a party can go somewhere in a city: on foot, by cab, in its own vehicles, or teleported.
// Works out times, cab fares and who sits where from routes (routing.mjs). Pure: no Foundry.

const MPH = 0.44704; // metres a second
export const MILE = 1609.344;

/** Cabs take this many riders at most, and this long to hail (seconds). */
export const CAB_SEATS = 4;
export const HAIL_SECONDS = 180;
/**
 * The meter, in dollars: a flag drop and so much a mile. 1986 rates for each city are not
 * confirmed; these are a plausible default the GM can change per city.
 */
export const DEFAULT_METER = { drop: 1.1, perMile: 1.7 };
/** A vehicle's speeds in mph, off the interstate and on it. */
export const VEHICLE_SPEEDS = { street: 35, interstate: 55 };

/** Seconds to drive a route at given speeds: its interstate miles at one, the rest at the other. */
export function driveSeconds(route, speeds = VEHICLE_SPEEDS) {
  const inter = route.interstateMetres ?? 0, rest = Math.max(0, route.metres - inter);
  return inter / (speeds.interstate * MPH) + rest / (speeds.street * MPH);
}

/**
 * Cabs for a number of riders over a drive route: { cabs: [{ riders, fare, each }], fare (all
 * cabs), seconds (hailing plus the drive), miles }. The fare is per cab, shared by its riders.
 */
export function taxiPlan(route, riders, meter = DEFAULT_METER) {
  const miles = route.metres / MILE;
  const perCab = Math.round((meter.drop + meter.perMile * miles) * 100) / 100;
  const n = Math.max(1, Math.ceil(riders / CAB_SEATS));
  // Riders spread as evenly as the cabs allow: 5 riders are 3 and 2, not 4 and 1.
  const cabs = Array.from({ length: n }, (_, i) => {
    const r = Math.floor(riders / n) + (i < riders % n ? 1 : 0);
    return { riders: r, fare: perCab, each: Math.round((perCab / Math.max(1, r)) * 100) / 100 };
  });
  return { cabs, fare: Math.round(perCab * n * 100) / 100, seconds: HAIL_SECONDS + driveSeconds(route), miles };
}

/**
 * Who sits where in the party's own vehicles.
 *   people: [{ id, name }] the party's people, in order.
 *   vehicles: [{ id, name, seats (passengers), owner (actor id or null), speeds? }]
 *   choice: { use: { vehicleId: bool } (default true), driver: { vehicleId: personId | "" },
 *             seat: { personId: vehicleId } (wishes, kept when there is room) }
 * Returns { cars: [{ vehicle, driver, riders: [person] }], left: [person] not seated,
 *           noDriver: [vehicle] taken but with nobody to drive, ok, seats (total in cars taken) }.
 * A vehicle's owner in the party drives it unless the GM chose someone else; one whose owner is
 * not here needs a driver chosen ("" leaves it behind).
 */
export function seatVehicles(people, vehicles, choice = {}) {
  const use = choice.use ?? {}, drivers = choice.driver ?? {}, wish = choice.seat ?? {};
  const here = new Map(people.map((p) => [p.id, p]));
  const taken = vehicles.filter((v) => use[v.id] !== false);
  const cars = [], busy = new Set(), noDriver = [];
  for (const v of taken) {
    const chosen = drivers[v.id];
    let driver = null;
    if (chosen === "") continue; // left behind
    if (chosen && here.has(chosen) && !busy.has(chosen)) driver = here.get(chosen);
    else if (v.owner && here.has(v.owner) && !busy.has(v.owner)) driver = here.get(v.owner);
    if (!driver) { noDriver.push(v); continue; }
    busy.add(driver.id);
    cars.push({ vehicle: v, driver, riders: [] });
  }
  const room = (car) => car.riders.length < Math.max(0, car.vehicle.seats);
  const rest = people.filter((p) => !busy.has(p.id));
  const left = [];
  // Wishes first, then whoever is left into the first car with room.
  for (const p of rest) {
    const car = cars.find((c) => c.vehicle.id === wish[p.id] && room(c));
    if (car) { car.riders.push(p); busy.add(p.id); }
  }
  for (const p of rest) {
    if (busy.has(p.id)) continue;
    const car = cars.find(room);
    if (car) { car.riders.push(p); busy.add(p.id); } else left.push(p);
  }
  const seats = cars.reduce((n, c) => n + 1 + Math.max(0, c.vehicle.seats), 0);
  return { cars, left, noDriver, seats, ok: cars.length > 0 && !left.length && !noDriver.length };
}

/** The slowest car's time: a party spread over vehicles arrives when its last car does. */
export function vehicleSeconds(route, cars) {
  return Math.max(0, ...cars.map((c) => driveSeconds(route, { ...VEHICLE_SPEEDS, ...(c.vehicle.speeds ?? {}) })));
}

/** "1 h 8 min", "12 min", "under a minute". */
export function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 1) return "under a minute";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ` ${r} min` : ""}` : `${m} min`;
}

/** "3.4 mi" (one decimal under 10 miles). */
export const formatMiles = (metres) => { const mi = metres / MILE; return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`; };

/**
 * Where a token is along a route at a share of its time: { x, y } on the polyline points
 * ([{ x, y }]), spread by distance.
 */
export function pointAlong(points, share) {
  if (!points.length) return null;
  if (share <= 0 || points.length === 1) return points[0];
  if (share >= 1) return points.at(-1);
  const lens = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) { const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); lens.push(l); total += l; }
  let want = share * total;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i]) { const t = lens[i] ? want / lens[i] : 0, a = points[i], b = points[i + 1]; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    want -= lens[i];
  }
  return points.at(-1);
}
