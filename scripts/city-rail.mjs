const TRANSIT = "kg-transit";
const pending = new WeakMap();
const FUTURE_SUBWAY = {
  interior: "modules/kg-cities/assets/interiors/future-subway-car.webp",
  sound: "modules/kg-cities/assets/FutureSubwayAudioLoop.ogg"
};
const STANDARD_SUBWAY_SOUND = "modules/kg-transit/assets/sounds/subway-loop.ogg";

/** Adapt the city's bundled rail and curated stop order to a KG Transit city pack. */
export function railPack(city, era, routes, rail) {
  const stations = new Map();
  const lines = [];
  const aliases = routes.stationAliases ?? {};
  for (const route of routes.routes) {
    if (!routes[era]?.includes(route.ref)) continue;
    const service = rail.lines.find((line) => line.ref === route.ref);
    if (!service) continue;
    const stops = [];
    const segments = [];
    let previousUnderground = false;
    for (const name of route.stops) {
      const stop = rail.stations.find((station) => station.name === name && station.lines.includes(route.ref));
      if (!stop) continue;
      const id = aliases[name] ?? name;
      const underground = route.underground?.includes(name) ?? false;
      if (!stations.has(id)) {
        stations.set(id, { id, name: id, lat: stop.lat, lon: stop.lon, platform: underground ? "underground" : "above" });
      }
      if (stops.length) segments.push(underground && previousUnderground ? "tunnel-concrete" : route.scenery ?? "city");
      stops.push(id);
      previousUnderground = underground;
    }
    if (stops.length < 2) continue;
    const kind = service.mode === "train" ? "express" : "light";
    lines.push({ id: route.ref, name: route.name, color: service.color ?? "#00b5e2", kind, stops, segments });
  }
  return {
    id: city.id, name: city.name, core: city.core, metro: city.metro,
    network: { name: `${city.name} Rail`, badge: "R" },
    stations: [...stations.values()], lines
  };
}

/** Use KG Transit's installed theme and art, and preserve networks the GM has already set up. */
export function setupCityRail(scene, city, info, loadRail) {
  const transit = game.modules.get(TRANSIT);
  if (!city?.future || !transit?.active || !transit.api?.applyCityPreset) return;
  if (game.users.activeGM?.id !== game.user.id) return;
  if (!pending.has(scene)) {
    const network = scene.getFlag(TRANSIT, "network");
    let task;
    if (network === undefined && game.settings.get(TRANSIT, "cityAuto")) {
      task = installNetwork(scene, city, info, loadRail, transit.api);
    } else if (info.era === "future" && network?.preset?.era === "future" && network.preset.city === city.id) {
      task = updateFutureSubway(scene, network.cars?.subway);
    }
    if (!task) return;
    task = task.finally(() => pending.delete(scene));
    pending.set(scene, task);
  }
  return pending.get(scene);
}

async function updateFutureSubway(scene, car = {}) {
  const path = `flags.${TRANSIT}.network.cars.subway`;
  const changes = {};
  if (!car.interior) changes[`${path}.interior`] = FUTURE_SUBWAY.interior;
  if (!car.sound || car.sound === STANDARD_SUBWAY_SOUND) changes[`${path}.sound`] = FUTURE_SUBWAY.sound;
  if (Object.keys(changes).length) await scene.update(changes);
}

async function installNetwork(scene, city, info, loadRail, api) {
  const url = foundry.utils.getRoute(`modules/kg-cities/data/transit/${city.id}-rides.json`);
  const [rail, response, { cityNetwork, sceneProjection }, { traceTracks }] = await Promise.all([
    loadRail(),
    fetch(url),
    import("../../kg-transit/scripts/cities.mjs"),
    import("../../kg-transit/scripts/tracks.mjs")
  ]);
  if (!rail?.lines?.length) throw new Error(`No rail data is available for ${city.name}.`);
  if (!response.ok) throw new Error(`Could not load rail routes for ${city.name} (HTTP ${response.status}).`);
  const routes = await response.json();
  const pack = railPack(city, info.era, routes, rail);
  const rect = scene.dimensions.sceneRect;
  const { net } = cityNetwork(pack, info, rect);
  if (!net.lines.length) return;
  net.theme = info.era === "future" ? "future" : "modern";
  if (info.era === "future") {
    net.preset.year = "Future";
    net.cars.subway = { ...net.cars.subway, ...FUTURE_SUBWAY };
  }
  const { project, pxPerMetre } = sceneProjection(pack, info, rect);
  traceTracks(net, rail, project, rect, pxPerMetre);
  net.preset.tracks = 1;
  if (scene.getFlag(TRANSIT, "network") === undefined) await api.applyCityPreset(scene, { net });
}
