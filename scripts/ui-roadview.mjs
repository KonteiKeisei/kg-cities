// The driving view: a party in a cab or its own car sees the street go by (road-view.mjs) through
// the car's interior art, as KG Transit's riders see their train. Each player sees their own
// party's car on its own, whatever they have selected; the GM sees the view of the party token
// they have selected, and none otherwise. Arrive now and Stop are the GM's.
//
// The interior: a cab's from the module setting (a default is baked in); a party's own vehicle's
// from its prototype token (KG Cities' "Interior view" field, added to the vehicle's token
// settings), else the default car's.

import { RoadScene } from "./road-view.mjs";
import { WeatherOverlay, currentStreetWeather } from "./street-weather.mjs";
import { clockAt, MODE_COLOURS } from "./travel.mjs";
import { formatDuration } from "./travel-plan.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const DEFAULT_CAB = `modules/${ID}/assets/interiors/cab.webp`;
export const DEFAULT_CAB_SOUND = `modules/${ID}/assets/sounds/cab.ogg`;
const SOUND_FADE_MS = 2500;
/** Every way through the streets has its view: walking on the sidewalk, a cab or a car on the road. */
const ROAD_MODES = new Set(["walk", "taxi", "own"]);
/** How fast the street goes by (m/s), as the trip goes: 3 mph on foot, 35 mph by road. */
const SPEEDS = { walk: 1.34, taxi: 15.6, own: 15.6 };

/** A vehicle's interior: its token's or its prototype token's KG Cities field, else the setting's, else none. */
export function interiorOf(actor, token = null) {
  const own = token?.getFlag?.(ID, "interior") ?? actor?.prototypeToken?.flags?.[ID]?.interior;
  return own || game.settings.get(ID, "carInterior") || "";
}

/**
 * Where the street's horizon goes behind an interior picture: just above where the vehicle
 * begins, down the middle of the picture, below its longest see-through stretch (a car's
 * windscreen down to its hood, at about 0.3 of the height; a motorcycle's open sky down to its
 * headlamp, at about 0.58). A share of the height, or null when it cannot be read.
 */
export function horizonOf(img) {
  try {
    const h = 400, c = document.createElement("canvas");
    c.width = 1; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, img.naturalWidth / 2, 0, 1, img.naturalHeight, 0, 0, 1, h);
    const a = g.getImageData(0, 0, 1, h).data;
    let best = [0, 0], start = null;
    for (let y = 0; y <= h; y++) {
      const clear = y < h && a[y * 4 + 3] < 128;
      if (clear && start === null) start = y;
      if (!clear && start !== null) { if (y - start > best[0]) best = [y - start, y]; start = null; }
    }
    return best[0] > h * 0.05 ? Math.max(0.15, Math.min(0.75, best[1] / h - 0.03)) : null;
  } catch { return null; }
}

/** A vehicle's driving sound: its token's or prototype token's field, else the default car's ("" for none). */
export function soundOf(actor, token = null) {
  const own = token?.getFlag?.(ID, "sound") ?? actor?.prototypeToken?.flags?.[ID]?.sound;
  return own || game.settings.get(ID, "carSound") || "";
}

export class RoadView {
  /** controller: the TravelController (trips, now(), arriveNow(), stop()). */
  constructor(controller) {
    this.controller = controller;
    this.root = null;
    this.key = null;
    this.gmPick = null;
    this.scene = new RoadScene();
    this.weather = new WeatherOverlay();
    this.distance = 0;
    this.expanded = false;
  }

  install() {
    const register = (key, data) => game.settings.register(ID, key, data);
    register("cabInterior", {
      name: "Cab interior", hint: "The inside of a cab, seen while a party rides one: a picture with transparent windows (the street shows through them). Empty uses the built-in cab.",
      scope: "world", config: true, type: String, filePicker: "image", default: DEFAULT_CAB, onChange: () => this.#rebuild()
    });
    register("carInterior", {
      name: "Car interior (default)", hint: "The inside of a party's own vehicle when its token has no interior view of its own (set it in the vehicle's prototype token settings, Appearance). Transparent windows. Empty: just the street going by.",
      scope: "world", config: true, type: String, filePicker: "image", default: "", onChange: () => this.#rebuild()
    });
    register("cabSound", {
      name: "Cab sound", hint: "Loops while a party rides a cab, fading in and out. A cab's sound is built in; choose your own here.",
      scope: "world", config: true, type: String, filePicker: "audio", default: DEFAULT_CAB_SOUND, onChange: () => this.#rebuild()
    });
    register("carSound", {
      name: "Car sound (default)", hint: "Loops in a party's own vehicle when its token has no driving sound of its own (set it in the vehicle's prototype token settings, Appearance). Empty for silence.",
      scope: "world", config: true, type: String, filePicker: "audio", default: "", onChange: () => this.#rebuild()
    });
    register("roadVolume", {
      name: "Driving sound volume", scope: "client", config: true, type: Number, default: 0.8,
      range: { min: 0, max: 1, step: 0.05 }, onChange: (v) => this.sound?.sound?.fade?.(Number(v), { duration: 400 })
    });
    // The GM sees the view of the party token they have selected, and none when it is not on the
    // street (on a train, KG Transit shows its ride instead; nothing selected, no view).
    // Only the token selected last decides (as KG Transit's train window does), so the GM never
    // sees a street view and a train ride at once.
    Hooks.on("controlToken", (token, controlled) => {
      if (!game.user.isGM) return;
      if (controlled) this.lastPicked = token.document?.id ?? token.id;
      requestAnimationFrame(() => this.sync());
    });
    Hooks.on("renderPrototypeTokenConfig", (app, html) => this.#tokenField(app, html, true));
    Hooks.on("renderTokenConfig", (app, html) => this.#tokenField(app, html, false));
  }

  /** The trip this user sees: the GM's selected token's (the last selected first), a player's own party's. */
  #wanted() {
    const trips = Object.values(this.controller.trips).filter((t) => ROAD_MODES.has(t.mode));
    if (game.user.isGM) {
      if (this.closed && canvas.tokens?.controlled.some((c) => c.document?.id === this.closed)) return null;
      this.closed = null;
      const controlled = canvas.tokens?.controlled ?? [], id = (c) => c.document?.id ?? c.id;
      const last = controlled.find((c) => id(c) === this.lastPicked) ?? controlled.at(-1);
      return last ? trips.find((t) => t.token === id(last)) ?? null : null;
    }
    return trips.find((t) => t.viewers?.includes(game.user.id)) ?? null;
  }

  /** The trips changed: show, change or close the view. */
  sync() {
    const trip = this.#wanted();
    if (!trip) return this.#close();
    // The same trip (its start may have moved with a skip): kept, unless its window was lost.
    if (trip.key === this.key && this.root?.isConnected) { this.trip = trip; return; }
    this.#close();
    this.#open(trip);
  }

  #rebuild() { const t = this.trip; this.#close(); if (t) this.#open(t); }

  /** The vehicle this user rides in: the one their character is in, else the first. */
  #vehicle(trip) {
    const mine = game.user.character?.id;
    const car = trip.cars?.find((c) => c.driver === mine || c.riders?.includes(mine)) ?? trip.cars?.[0];
    return car ? game.actors.get(car.vehicle) : null;
  }

  /** The interior this user sees: the cab, the car they ride in, or none (walking, or a car with none set). */
  #interior(trip) {
    if (trip.mode === "walk") return "";
    if (trip.mode === "taxi") return game.settings.get(ID, "cabInterior") || DEFAULT_CAB;
    return interiorOf(this.#vehicle(trip));
  }

  /** The sound this user hears: the cab's, their car's, or none. */
  #soundSrc(trip) {
    if (trip.mode === "walk") return "";
    if (trip.mode === "taxi") return game.settings.get(ID, "cabSound") || "";
    return soundOf(this.#vehicle(trip));
  }

  /** Fade the driving sound in (it loops) for this trip. */
  async #startSound(trip) {
    const src = this.#soundSrc(trip), key = this.key;
    if (!src) return;
    try {
      const sound = await foundry.audio.AudioHelper.play({ src, volume: 0, loop: true, channel: "environment" }, false);
      if (this.key !== key || !this.root) return sound?.stop();
      this.sound = { sound };
      await sound.fade(Number(game.settings.get(ID, "roadVolume")) || 0, { duration: SOUND_FADE_MS, from: 0 });
    } catch (err) {
      console.warn(`${ID} | driving sound failed to play`, err);
    }
  }

  #stopSound() {
    const s = this.sound?.sound;
    this.sound = null;
    if (s) s.fade(0, { duration: SOUND_FADE_MS }).then(() => s.stop()).catch(() => s.stop?.());
  }

  #open(trip) {
    this.trip = trip;
    this.key = trip.key;
    this.distance = 0;
    const root = this.root = document.createElement("section");
    root.className = `kgc-ui kgc-roadview ${this.expanded ? "expanded" : ""}`;
    root.style.setProperty("--mode", MODE_COLOURS[trip.mode]);
    root.innerHTML = `<div class="stage"><canvas></canvas><img class="interior" alt=""><div class="flash"></div></div>
      <div class="hud"><div class="top"><span class="what"><i class="fa-solid ${{ walk: "fa-person-walking", taxi: "fa-taxi", own: "fa-car-side" }[trip.mode]}"></i><span class="label"></span></span><span class="clock"><b class="time"></b><span class="eta"></span></span></div>
        <div class="bar"><i></i></div></div>
      <div class="controls">${game.user.isGM ? `<button type="button" data-act="arrive" data-tooltip="Run the clock on to their arrival (every trip moves on too)"><i class="fa-solid fa-forward"></i> Arrive now</button>
        <button type="button" data-act="stop" data-tooltip="Stop them where they are"><i class="fa-solid fa-hand"></i> Stop</button>
        <button type="button" data-act="close" data-tooltip="Close this view (click their token to see it again)"><i class="fa-solid fa-xmark"></i></button>` : ""}
        <button type="button" data-act="size" aria-label="Full screen or window" data-tooltip="Full screen or window"><i class="fa-solid fa-expand"></i></button></div>`;
    // No interior (walking, or a car with none set): just the street going by.
    const interior = this.#interior(trip), img = root.querySelector(".interior");
    this.horizon = interior ? 0.27 : 0.45;
    if (interior) {
      img.addEventListener("load", () => { this.horizon = horizonOf(img) ?? this.horizon; }, { once: true });
      img.src = foundry.utils.getRoute(interior);
    } else img.remove();
    root.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "arrive") this.controller.arriveNow(this.key);
      else if (act === "stop") this.controller.stop(this.key);
      // Closed: stays closed while that token stays selected (select it again to see it).
      else if (act === "close") { this.closed = this.trip?.token ?? null; this.#close(); }
      else if (act === "size") { this.expanded = !this.expanded; root.classList.toggle("expanded", this.expanded); this.#place(); }
    });
    document.body.append(root);
    this.canvas = root.querySelector("canvas");
    this.resize = new ResizeObserver(() => this.#fit());
    this.resize.observe(root);
    this.#place();
    this.#fit();
    let last = performance.now();
    const loop = (now) => {
      if (!this.root) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // A frame that fails (odd weather, a clock leap) is skipped, not the end of the view.
      try { this.#frame(now, dt); } catch (err) {
        if (!this.warned) { this.warned = true; console.warn(`${ID} | street view frame failed`, err); }
      }
      if (this.root) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.#startSound(trip);
  }

  #close() {
    this.#stopSound();
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    this.root?.remove();
    this.root = null;
    this.key = null;
    this.trip = null;
  }

  /**
   * Where KG Transit's ride window goes (its corner: left of the sidebar, above the camera dock
   * and the bottom bar), so a party's view, train or street, always opens in one spot. Without
   * KG Transit, the same corner by the sidebar.
   */
  #place() {
    if (!this.root || this.expanded) { if (this.root) Object.assign(this.root.style, { right: "", bottom: "" }); return; }
    let spot = null;
    try { spot = game.modules.get("kg-transit")?.active ? game.modules.get("kg-transit").api?.cornerSpot?.(16, this.root.offsetWidth) : null; } catch { /* older KG Transit */ }
    spot ??= { right: (document.getElementById("sidebar")?.offsetWidth ?? 300) + 16, bottom: 16 };
    this.root.style.right = `${spot.right}px`;
    this.root.style.bottom = `${spot.bottom}px`;
  }

  #fit() {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(2, Math.round(r.width * dpr));
    this.canvas.height = Math.max(2, Math.round(r.height * dpr));
  }

  #frame(now, dt) {
    const trip = this.controller.trips[this.key];
    if (!trip) return this.#close();
    const clock = this.controller.now();
    const share = Math.max(0, Math.min(1, (clock - trip.start) / trip.seconds)) || 0;
    // Slowing for the last stretch, stopped once there; still while the game is paused.
    const speed = game.paused ? 0 : (SPEEDS[trip.mode] ?? SPEEDS.own) * Math.min(1, (1 - share) * 20);
    this.distance += speed * dt;
    const c = game.time.calendar?.timeToComponents?.(clock);
    const hour = (c?.hour ?? 12) + (c?.minute ?? 0) / 60;
    // A walk's steps keep time with its pace: still when stopped.
    this.walkTime = (this.walkTime ?? 0) + (speed > 0 ? dt : 0);
    // The weather from Calendaria, as KG Transit's rides read it, every couple of seconds.
    if (!this.weatherAt || now - this.weatherAt > 2000) { this.weatherAt = now; this.wx = currentStreetWeather(); this.weather.set(this.wx); }
    const ctx = this.canvas.getContext("2d"), w = this.canvas.width, h = this.canvas.height;
    this.scene.draw(ctx, w, h, {
      distance: this.distance, speed, hour, walking: trip.mode === "walk", weather: this.wx,
      time: trip.mode === "walk" ? this.walkTime : now / 1000,
      // No interior: the horizon sits at a natural height, not above a car's hood.
      horizon: this.horizon
    });
    // Rain or snow past the windows, drops on a car's windscreen (not on foot), lightning.
    const flash = this.weather.update(ctx, w, h, {
      dt, now, speed: speed / SPEEDS.own, vp: { x: w / 2, y: h * this.horizon },
      glass: trip.mode !== "walk" && !!this.root.querySelector(".interior")
    });
    this.root.querySelector(".flash").style.opacity = String(flash * 0.7);
    if (!this.hudAt || now - this.hudAt > 500) {
      this.hudAt = now;
      this.root.querySelector(".label").textContent = trip.label + (trip.detail ? ` · ${trip.detail}` : "");
      this.root.querySelector(".time").textContent = clockAt(clock);
      this.root.querySelector(".eta").textContent = `Arrives ${clockAt(trip.start + trip.seconds)} · ${formatDuration(Math.max(0, trip.start + trip.seconds - clock))} left`;
      this.root.querySelector(".bar i").style.width = `${(share * 100).toFixed(1)}%`;
      this.#place();
    }
  }

  /** A vehicle's token settings get an Interior view field (Appearance), saved in the token's flags. */
  #tokenField(app, html, prototype) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const doc = app.document ?? app.token ?? app.object;
    const actor = prototype ? app.actor ?? doc?.actor ?? doc?.parent : doc?.actor;
    const vehicle = actor?.type === "vehicle" || !!actor?.flags?.[ID]?.vehicle?.vehicle;
    if (!root || !vehicle || root.querySelector("[data-kgc-interior]")) return;
    const tab = root.querySelector('.tab[data-tab="appearance"]') ?? root.querySelector("form") ?? root;
    const flags = (prototype ? actor.prototypeToken?.flags?.[ID] : doc?.flags?.[ID]) ?? {};
    const field = (key, type, label, hint) => {
      const group = document.createElement("div");
      group.className = "form-group";
      group.dataset.kgcInterior = key;
      group.innerHTML = `<label>${label}</label>
        <div class="form-fields"><file-picker name="flags.${ID}.${key}" type="${type}" value="${esc(flags[key] ?? "")}"></file-picker></div>
        <p class="hint">${hint}</p>`;
      tab.append(group);
    };
    field("interior", "image", "Interior view (KG Cities)", "What the party sees driving this vehicle in a city: its inside, with transparent windows the street shows through. Empty uses the default car (module settings).");
    field("sound", "audio", "Driving sound (KG Cities)", "Loops while the party drives this vehicle, fading in and out. Empty uses the default car's sound (module settings).");
  }
}
