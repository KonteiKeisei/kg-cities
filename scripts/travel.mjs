// Travel in a city (the GM): dragging a party token asks how the party goes (ui-travel.mjs), and
// then it goes, along the streets, as the world's clock runs. Every party on the move shares the
// one clock: trips run together, each arriving when its time is up (as KG Realms' settlement
// trips do). The GM in charge drives the clock and the tokens; everyone sees them move.
// Shift-drag, or any move a module makes, is left alone.

import { pointAlong, formatDuration } from "./travel-plan.mjs";
import { familyActors, groupActor, groupMembers, isPrimaryGM } from "./party.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
/** How often the tokens step along their routes (ms), and how many steps between clock writes. */
const STEP_MS = 1000;
const CLOCK_EVERY = 5;
/** On a train's clock: seconds the world may run ahead of real time before it counts as a fast-forward. */
const JUMP_SLACK = 12;
export const MODE_COLOURS = { walk: "#9fd3a8", train: "#7fb6ff", taxi: "#ffd84a", own: "#f0b48a" };
const MODE_ICONS = { walk: "fa-person-walking", taxi: "fa-taxi", own: "fa-car-side" };
const MODE_WORDS = { walk: "Walking", taxi: "By cab", own: "Driving" };
/** Game seconds a real second, while trips run: real time, as train rides run, unless the GM speeds it up. */
export const RATES = { 1: "Real time", 10: "10 seconds a second", 30: "30 seconds a second", 60: "1 minute a second", 120: "2 minutes a second", 300: "5 minutes a second", 600: "10 minutes a second" };

/** The world time a few seconds from now as "4:25 PM" (the calendar's hour and minute). */
export function clockAt(seconds) {
  const c = game.time.calendar?.timeToComponents?.(seconds);
  if (!c) return "";
  const h = c.hour ?? 0, m = String(c.minute ?? 0).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** A token's centre at a position { x, y, width, height } (grid units). */
const centreOf = (scene, p) => ({ x: p.x + ((p.width ?? 1) * scene.grid.size) / 2, y: p.y + ((p.height ?? 1) * scene.grid.size) / 2 });

export class TravelController {
  /**
   * route(from, to, { mode }) on the city scene on screen (main.mjs routeOnScene);
   * canTravel(scene): a city scene with a street network; openDialog(controller, context).
   */
  constructor({ route, canTravel, openDialog }) {
    Object.assign(this, { route, canTravel, openDialog });
    this.pending = 0; // game seconds run but not yet written to the clock
    this.steps = 0;
    this.timer = null;
    this.lines = null;
    this.panel = null;
  }

  get trips() { return game.settings.get(ID, "trips") ?? {}; }
  get rate() { return Number(game.settings.get(ID, "travelPace")) || 1; }
  /** A party is on the move. */
  busy(actorId) { return !!this.trips[actorId]; }
  /** The world time, counting what has run since the clock was last written. */
  now() { return game.time.worldTime + this.pending; }

  install() {
    const register = (key, data) => game.settings.register(ID, key, data);
    register("travelDrag", {
      name: "Ask how to travel when dragging",
      hint: "On a city scene, dragging a token asks how it goes (walk, cab, own vehicles, teleport) and then it travels the streets as the clock runs. Shift-drag always just moves it.",
      scope: "world", config: true, type: String, default: "party",
      choices: { party: "Party tokens", all: "Every token", off: "Never" }
    });
    // A new key (it was "travelRate", at a minute a second): every world starts in real time.
    register("travelPace", {
      name: "Travel speed", hint: "How fast the world's clock runs while parties travel in a city: real time, as train rides run, or faster. Arrive now and Stop are in the Travelling panel.",
      scope: "world", config: true, type: Number, default: 1, choices: RATES, onChange: () => this.#drawPanel()
    });
    register("travelSkip", {
      name: "When the clock is skipped", hint: "The GM skips time (Calendaria, or Foundry's clock) while parties are travelling in a city: they travel on through it (a skip longer than what is left means they have arrived), or they wait where they are and go on from there.",
      scope: "world", config: true, type: String, default: "move", choices: { move: "Parties travel on through it", wait: "Parties wait where they are" }
    });
    register("taxiMeters", { scope: "world", config: false, type: Object, default: {} });
    register("trips", { scope: "world", config: false, type: Object, default: {}, onChange: () => { this.#drawLines(); this.#drawPanel(); this.#run(); this.onTrips?.(); } });
    // With KG Transit: a party's way on after its train (walk from the station to where it was
    // going), by party token id: { scene, destinationId, from, to, destination, label }.
    register("onward", { scope: "world", config: false, type: Object, default: {} });
    register("dollarRate", {
      name: "Cab fares: copper per dollar",
      hint: "What a period dollar is worth in copper. 1000 makes a dollar one platinum piece, as KG Transit counts fares; with KG Transit installed, its own setting is used instead.",
      scope: "world", config: !game.modules.get("kg-transit")?.active, type: Number, default: 1000, range: { min: 10, max: 10000, step: 10 }
    });

    Hooks.on("preMoveToken", (doc, movement, operation) => this.#caught(doc, movement, operation));
    Hooks.on("canvasReady", () => { this.#drawLines(); this.#drawPanel(); this.#run(); this.onTrips?.(); });
    Hooks.on("canvasTearDown", () => { this.lines?.destroy({ children: true }); this.lines = null; });
    Hooks.on("pauseGame", () => this.#drawPanel());
    // The GM skipping time (not the trips' own running of the clock).
    Hooks.on("updateWorldTime", (worldTime, delta) => this.#clockMoved(worldTime, delta).catch((err) => console.warn(`${ID} | travel`, err)));
    // Everyone's route lines shorten as the tokens move.
    Hooks.on("updateToken", (doc) => { if (Object.values(this.trips).some((t) => t.token === doc.id)) this.#drawLines(); });
    // Off the train: a party with somewhere still to go walks on from the station.
    Hooks.on("kg-transit.rideEnd", (ride, { station } = {}) => this.#offTheTrain(ride, station).catch((err) => console.warn(`${ID} | travel`, err)));
  }

  /** KG Transit, when it is active: its API (planTrain, board, drivingClock), else null. */
  transit() {
    const t = game.modules.get("kg-transit");
    return t?.active ? t.api ?? null : null;
  }

  /** A train ride or a flight is moving the clock: trips follow it rather than running it. */
  #followingClock() {
    try { return !!this.transit()?.drivingClock?.(); } catch { return false; }
  }

  /** Copper per period dollar: KG Transit's setting when it is installed, else ours. */
  dollarRate() {
    try { if (game.modules.get("kg-transit")?.active) return Number(game.settings.get("kg-transit", "dollarRate")) || 1000; } catch { /* not registered */ }
    return Number(game.settings.get(ID, "dollarRate")) || 1000;
  }

  /* ---------------------------------------- */
  /*  The drag                                 */
  /* ---------------------------------------- */

  #caught(doc, movement, operation) {
    if (!game.user.isGM || movement.method !== "dragging" || operation?.kgCitiesTravel) return;
    if (game.keyboard?.isModifierActive?.("Shift")) return;
    const ask = game.settings.get(ID, "travelDrag");
    if (ask === "off" || (ask === "party" && !groupActor(doc))) return;
    const scene = doc.parent;
    if (!scene || scene !== canvas.scene || !this.canTravel(scene)) return;
    const from = centreOf(scene, movement.origin), to = centreOf(scene, movement.destination);
    if (Math.hypot(to.x - from.x, to.y - from.y) < scene.grid.size / 2) return;
    // Dropped on another of the same party's tokens: the GM is bringing them together to merge,
    // not travelling (party tokens are large at city scale, so even "next to" is far).
    if (groupActor(doc) && this.#ontoFamily(doc, scene, to)) return;
    // The token stays put until the GM chooses how it goes.
    Promise.resolve().then(() => this.openDialog(this, { token: doc, scene, from, to, destination: { x: movement.destination.x, y: movement.destination.y } }))
      .catch((err) => { console.error(`${ID} | travel`, err); ui.notifications.error(`KG Cities: ${err.message}`); });
    return false;
  }

  /** A point is on (or touching) another token of the same party family. */
  #ontoFamily(doc, scene, point) {
    const family = familyActors(doc.actor).map((a) => a.id);
    return Array.from(scene.tokens).some((t) => {
      if (t.id === doc.id || !family.includes(t.actorId)) return false;
      const c = centreOf(scene, t), reach = ((Math.max(t.width, t.height) + Math.max(doc.width, doc.height)) * scene.grid.size) / 2;
      return Math.hypot(point.x - c.x, point.y - c.y) <= reach;
    });
  }

  /* ---------------------------------------- */
  /*  Going                                    */
  /* ---------------------------------------- */

  /** Teleport: the token is there now; keep: the clock moves on by that many seconds. */
  async teleport(token, destination, keepSeconds = 0) {
    if (!game.user.isGM) return;
    await this.stop(token.actor?.id ?? token.id, { quiet: true });
    await token.update({ x: destination.x, y: destination.y }, { kgCitiesTravel: true, animate: false });
    if (keepSeconds > 0) { await game.time.advance(Math.round(keepSeconds)); this.base = null; }
    this.#arrived(token, { mode: "teleport" });
  }

  /**
   * A trip along a route: the token travels it over `seconds` of world time.
   * { token, mode, points: [{ x, y }] (centres), seconds, label, detail }.
   */
  async start({ token, mode, points, seconds, label, detail = "", then = null, people = [], cars = null }) {
    if (!isPrimaryGM()) throw new Error("Only the GM in charge (Foundry's active GM) can send parties on their way.");
    const key = token.actor?.id ?? token.id;
    const half = { x: (token.width * token.parent.grid.size) / 2, y: (token.height * token.parent.grid.size) / 2 };
    // The route as the token's own corner, so its centre runs along the streets; fewer points for the world setting.
    const path = thin(points).map((p) => ({ x: Math.round(p.x - half.x), y: Math.round(p.y - half.y) }));
    const trips = foundry.utils.deepClone(this.trips);
    // Who sees the party's view (a cab's or a car's): the players owning anyone travelling, as
    // KG Transit decides its riders' viewers. Fixed for the trip, whatever anyone has selected.
    const riders = people.length ? people : groupMembers(token.actor).map((a) => a.id);
    const viewers = game.users.filter((u) => !u.isGM && riders.some((id) => game.actors.get(id)?.testUserPermission(u, "OWNER"))).map((u) => u.id);
    trips[key] = {
      id: foundry.utils.randomID(), key, scene: token.parent.id, token: token.id, mode, label, detail, path,
      start: this.now(), seconds: Math.max(1, Math.round(seconds)), viewers, ...(cars ? { cars } : {}), ...(then ? { then } : {})
    };
    await game.settings.set(ID, "trips", trips);
  }

  /** Stop a party where it is (the clock written first). */
  async stop(key, { quiet = false } = {}) {
    if (!game.user.isGM || !this.trips[key]) return;
    await this.#commit();
    const trips = foundry.utils.deepClone(this.trips);
    const trip = trips[key];
    delete trips[key];
    await game.settings.set(ID, "trips", trips);
    if (!quiet) ui.notifications.info(`KG Cities: ${trip.label} stopped where they are.`);
  }

  /** Run the clock on to when this trip arrives: every other trip moves on by as much. */
  async arriveNow(key) {
    const trip = this.trips[key];
    // The clock is the GM in charge's to run.
    if (!trip || !isPrimaryGM()) return;
    this.pending += Math.max(0, trip.start + trip.seconds - this.now());
    await this.#tick({ step: false });
    // Our own leap: everyone moves on by it (it is not a train's to skip).
    this.base = null;
  }

  /* ---------------------------------------- */
  /*  The clock                                */
  /* ---------------------------------------- */

  /** The GM in charge runs trips while there are any; nobody else does. */
  #run() {
    const any = Object.keys(this.trips).length > 0;
    if (any && isPrimaryGM() && !this.timer) this.timer = setInterval(() => this.#tick().catch((err) => console.warn(`${ID} | travel`, err)), STEP_MS);
    else if ((!any || !isPrimaryGM()) && this.timer) { clearInterval(this.timer); this.timer = null; this.#commit(); }
  }

  async #commit() {
    const s = Math.round(this.pending);
    this.pending = 0;
    this.steps = 0;
    if (s <= 0) return;
    // Our own write of the time the trips ran: not a skip (they have already moved by it).
    this.ownWrite = game.time.worldTime + s;
    await game.time.advance(s);
  }

  /**
   * The world clock moved by something other than the trips' own running (the GM skipping time,
   * by Calendaria or Foundry): with "travel on", parties move on through it at once, paused or
   * not, and those whose time is up arrive; with "wait" (and always when time goes back), each
   * trip's start moves with the clock so the party carries on from where it was. A train or a
   * flight running the clock is #skipJumps' to handle. The GM in charge decides.
   */
  async #clockMoved(world, delta) {
    if (!isPrimaryGM() || !Object.keys(this.trips).length || !Number.isFinite(delta) || Math.abs(delta) < 1) return;
    if (this.ownWrite != null && Math.abs(world - this.ownWrite) < 1) { this.ownWrite = null; return; }
    if (this.#followingClock()) return;
    this.base = null;
    if (delta < 0 || game.settings.get(ID, "travelSkip") === "wait") {
      const trips = foundry.utils.deepClone(this.trips);
      for (const t of Object.values(trips)) t.start += Math.round(delta);
      await game.settings.set(ID, "trips", trips);
      return;
    }
    await this.#tick({ step: false, force: true });
    this.#drawLines();
    this.#drawPanel();
  }

  async #tick({ step = true, force = false } = {}) {
    // One step at a time; one that has hung for long (a lost server reply) no longer blocks the rest.
    if (this.ticking && Date.now() - (this.tickAt ?? 0) < 15000) {
      if (!force) return;
      // A skip waits for the step under way, then runs.
      for (let i = 0; i < 50 && this.ticking; i++) await new Promise((r) => setTimeout(r, 100));
    }
    if (step && game.paused) return;
    this.ticking = true;
    this.tickAt = Date.now();
    try {
      // One clock: while a train ride or a flight runs it (in real time), trips move with it and
      // add nothing of their own; otherwise they run it at the travel speed.
      if (step) {
        if (this.#followingClock()) { if (this.pending) await this.#commit(); await this.#skipJumps(); }
        else { this.base = null; this.pending += this.rate * (STEP_MS / 1000); }
      }
      const now = this.now(), trips = this.trips, arrived = [];
      const moves = new Map(); // scene -> token updates
      for (const trip of Object.values(trips)) {
        const scene = game.scenes.get(trip.scene), token = scene?.tokens.get(trip.token);
        if (!token) { arrived.push([trip, null]); continue; }
        const share = (now - trip.start) / trip.seconds;
        const at = pointAlong(trip.path, Math.min(1, share));
        if (at && (Math.round(at.x) !== token.x || Math.round(at.y) !== token.y)) {
          if (!moves.has(scene)) moves.set(scene, []);
          moves.get(scene).push({ _id: token.id, x: Math.round(at.x), y: Math.round(at.y) });
        }
        if (share >= 1) arrived.push([trip, token]);
      }
      for (const [scene, updates] of moves) await scene.updateEmbeddedDocuments("Token", updates, { kgCitiesTravel: true, animation: { duration: STEP_MS } });
      this.steps++;
      if (arrived.length || this.steps >= CLOCK_EVERY || !step) await this.#commit();
      if (arrived.length) {
        const next = foundry.utils.deepClone(trips);
        for (const [trip] of arrived) delete next[trip.key];
        await game.settings.set(ID, "trips", next);
        for (const [trip, token] of arrived) if (token) this.#arrived(token, trip);
      } else { this.#drawLines(); this.#drawPanel(); }
    } finally { this.ticking = false; }
  }

  /**
   * On a train's clock, trips go at real time only. When the GM fast-forwards a train (Skip,
   * Get off next stop, Arrive), the world clock leaps minutes ahead; parties walking or driving
   * elsewhere do not leap with it (they would all arrive at once, their views and lines gone).
   * Their start times move on by the leap instead.
   */
  async #skipJumps() {
    const world = game.time.worldTime, real = performance.now() / 1000;
    if (!this.base) { this.base = { world, real }; return; }
    const drift = (world - this.base.world) - (real - this.base.real);
    // Behind real time (a pause, or the train's clock not yet written): start counting again.
    if (drift < -JUMP_SLACK) { this.base = { world, real }; return; }
    if (drift <= JUMP_SLACK) return;
    this.base = { world, real };
    const trips = foundry.utils.deepClone(this.trips);
    for (const t of Object.values(trips)) t.start += Math.round(drift);
    await game.settings.set(ID, "trips", trips);
  }

  /** A party is there: other modules hear of it (KG Transit offers the trains at a station). */
  #arrived(token, trip) {
    if (trip.mode !== "teleport" && !trip.then?.board) ui.notifications.info(`KG Cities: ${trip.label} arrived.`);
    Hooks.callAll("kgCities.arrived", { token, scene: token.parent, mode: trip.mode, trip });
    if (trip.then?.board) this.#toTheTrain(token, trip.then.board).catch((err) => console.warn(`${ID} | travel`, err));
  }

  /**
   * At the station of a trip planned with the train: the Board window, its destination chosen
   * (the GM confirms riders and fares there), and the walk on from the far station kept for
   * when they get off.
   */
  async #toTheTrain(token, plan) {
    const onward = foundry.utils.deepClone(game.settings.get(ID, "onward") ?? {});
    onward[token.id] = { scene: token.parent.id, destinationId: plan.destinationId, from: plan.stationPoint, to: plan.to, destination: plan.destination, label: token.name };
    await game.settings.set(ID, "onward", onward);
    const opened = this.transit()?.board?.({ scene: token.parent, originId: plan.originId, partyTokenId: token.id, destinationId: plan.destinationId });
    ui.notifications.info(opened ? `KG Cities: ${token.name} reached ${plan.originName}. Board them for ${plan.destinationName}.`
      : `KG Cities: ${token.name} reached ${plan.originName}. View that scene and double-click the station to board them.`);
  }

  /** Off the train at the planned station: walk on to where the party was going. Elsewhere: the plan is dropped. */
  async #offTheTrain(ride, station) {
    if (!isPrimaryGM() || !ride?.partyTokenId) return;
    const all = game.settings.get(ID, "onward") ?? {}, plan = all[ride.partyTokenId];
    if (!plan) return;
    const rest = foundry.utils.deepClone(all);
    delete rest[ride.partyTokenId];
    await game.settings.set(ID, "onward", rest);
    const scene = game.scenes.get(plan.scene), token = scene?.tokens.get(ride.partyTokenId);
    if (!token) return;
    if (station !== plan.destinationId) return ui.notifications.info(`KG Cities: ${plan.label} got off before their stop; walk them on from here.`);
    if (scene !== canvas.scene || !this.canTravel(scene)) return ui.notifications.info(`KG Cities: ${plan.label} are off the train. View their scene to walk them on.`);
    const walk = await this.route(plan.from, plan.to, { mode: "walk" }).catch(() => null);
    if (!walk) return ui.notifications.info(`KG Cities: no way on foot from the station; ${plan.label} wait there.`);
    await this.start({ token, mode: "walk", points: walk.points, seconds: walk.seconds, label: plan.label, detail: "from the station" });
  }

  /* ---------------------------------------- */
  /*  On the map                               */
  /* ---------------------------------------- */

  /** Each trip's way still to go, a dashed line in its mode's colour (everyone sees it). */
  #drawLines() {
    if (!canvas.ready) return;
    if (!this.lines || this.lines.destroyed) {
      this.lines = new PIXI.Graphics();
      this.lines.eventMode = "none";
      canvas.interface?.addChild(this.lines);
    }
    const g = this.lines.clear(), now = this.now(), zoom = canvas.stage.scale.x || 1;
    for (const trip of Object.values(this.trips)) {
      if (trip.scene !== canvas.scene?.id) continue;
      const token = canvas.scene.tokens.get(trip.token);
      if (!token) continue;
      const half = { x: (token.width * canvas.grid.size) / 2, y: (token.height * canvas.grid.size) / 2 };
      const share = Math.min(1, (now - trip.start) / trip.seconds);
      const pts = remaining(trip.path, share).map((p) => ({ x: p.x + half.x, y: p.y + half.y }));
      dashed(g, pts, { width: 4 / zoom, colour: parseInt(MODE_COLOURS[trip.mode]?.slice(1) ?? "ffffff", 16), dash: 14 / zoom, gap: 9 / zoom });
    }
  }

  /** The trips under way (the GM): each with how far along it is, Arrive now and Stop; the clock's speed. */
  #drawPanel() {
    const trips = Object.values(this.trips);
    if (!game.user.isGM || !trips.length) { this.panel?.remove(); this.panel = null; this.panelHead = this.panelRows = null; return; }
    if (!this.panel) {
      this.panel = document.createElement("section");
      this.panel.className = "kgc-ui kgc-panel kgc-trips";
      this.panel.setAttribute("aria-label", "Parties travelling");
      this.panel.addEventListener("click", (e) => {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const run = { arrive: () => this.arriveNow(b.dataset.key), stop: () => this.stop(b.dataset.key) }[b.dataset.act];
        run?.().catch((err) => ui.notifications.error(`KG Cities: ${err.message}`));
      });
      this.panel.addEventListener("change", (e) => {
        if (e.target.name === "rate") game.settings.set(ID, "travelPace", Number(e.target.value));
      });
      this.panel.innerHTML = `<header></header><div class="trips"></div>`;
      document.body.append(this.panel);
    }
    const now = this.now();
    this.panel.style.right = `${(document.getElementById("sidebar")?.offsetWidth ?? 300) + 14}px`;
    const following = this.#followingClock();
    // The header (with the speed dropdown) is redrawn only when it changes, so an open dropdown
    // stays open while the trips below tick on.
    const head = `<b>Travelling</b>${game.paused ? '<span class="paused">Paused</span>' : ""}
      ${following ? '<span class="follow" data-tooltip="A train ride or a flight is running the clock in real time; trips move with it until it ends.">On the train\'s clock</span>'
        : `<select name="rate" aria-label="Travel speed">${Object.entries(RATES).map(([v, l]) => `<option value="${v}" ${Number(v) === this.rate ? "selected" : ""}>${l}</option>`).join("")}</select>`}`;
    const header = this.panel.querySelector("header");
    if (this.panelHead !== head) { this.panelHead = head; header.innerHTML = head; }
    // The rows are built only when the trips change; each tick just moves their bars and times,
    // so the buttons under the pointer stay the same buttons.
    const list = this.panel.querySelector(".trips");
    const rows = trips.map((t) => `<div class="trip" data-key="${esc(t.key)}" style="--mode:${MODE_COLOURS[t.mode]}">
          <div class="line"><i class="fa-solid ${MODE_ICONS[t.mode]}"></i><span class="who">${esc(t.label)}</span><span class="when"></span></div>
          <div class="bar"><i></i></div>
          <div class="line sub"><span>${esc(MODE_WORDS[t.mode])}${t.detail ? ` · ${esc(t.detail)}` : ""}</span>
            <button type="button" class="btn small" data-act="arrive" data-key="${esc(t.key)}" data-tooltip="Run the clock on to their arrival (every trip moves on too)">Arrive now</button>
            <button type="button" class="btn small ghost" data-act="stop" data-key="${esc(t.key)}" data-tooltip="Stop them where they are">Stop</button></div></div>`).join("");
    if (this.panelRows !== rows) { this.panelRows = rows; list.innerHTML = rows; }
    for (const t of trips) {
      const row = list.querySelector(`.trip[data-key="${CSS.escape(t.key)}"]`);
      if (!row) continue;
      const done = Math.max(0, Math.min(1, (now - t.start) / t.seconds)), left = Math.max(0, t.start + t.seconds - now);
      row.querySelector(".when").textContent = `${formatDuration(left)} left · ${clockAt(t.start + t.seconds)}`;
      row.querySelector(".bar i").style.width = `${(done * 100).toFixed(1)}%`;
    }
  }
}

/** A route with fewer points: no two closer than 4 scene pixels, the ends kept. */
function thin(points) {
  const out = [];
  for (const p of points) if (!out.length || Math.hypot(p.x - out.at(-1).x, p.y - out.at(-1).y) >= 4) out.push(p);
  if (out.length && points.length && out.at(-1) !== points.at(-1)) out.push(points.at(-1));
  return out;
}

/** The part of a path from a share of its length to its end. */
function remaining(path, share) {
  if (path.length < 2) return path;
  const at = pointAlong(path, share);
  let total = 0;
  const lens = [];
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); lens.push(l); total += l; }
  let want = share * total, i = 0;
  while (i < lens.length && want > lens[i]) { want -= lens[i]; i++; }
  return [at, ...path.slice(i + 1)];
}

/** A dashed polyline. */
function dashed(g, pts, { width, colour, dash, gap }) {
  g.lineStyle({ width, color: colour, alpha: 0.9, cap: "round" });
  let on = true, left = dash;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > 0) {
      const step = Math.min(left, seg), t = step / seg;
      const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (on) g.moveTo(a.x, a.y).lineTo(c.x, c.y);
      seg -= step; left -= step; a = c;
      if (left <= 0) { on = !on; left = on ? dash : gap; }
    }
  }
}
