// The travel window (the GM), opened by dragging a party token on a city scene: how the party goes
// from where it stands to where it was dropped. Walk (the default), Taxi, the party's own vehicles,
// or Teleport. Each tab has its time worked out; Cancel leaves the token where it was.
// Mockup: https://claude.ai/artifact/CJKTgtRW7AHwXMLSe5FEDk

import { DEFAULT_METER, formatDuration, formatMiles, seatVehicles, taxiPlan, vehicleSeconds, VEHICLE_SPEEDS } from "./travel-plan.mjs";
import { formatDollars, formatMoney, pay, walletValue } from "./money.mjs";
import { clockAt, MODE_COLOURS } from "./travel.mjs";
import { baseParty, familyActors, groupMembers, isVehicle, memberRows } from "./party.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const initials = (name) => String(name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const TABS = [["walk", "Walk", "fa-person-walking"], ["train", "Train", "fa-train-subway"], ["taxi", "Taxi", "fa-taxi"], ["own", "Own vehicles", "fa-car-side"], ["teleport", "Teleport", "fa-wand-sparkles"]];

export { isVehicle };

/** A vehicle's travel record: its owner, passenger seats and speeds. */
function vehicleOf(actor) {
  const f = actor.getFlag(ID, "vehicle") ?? {};
  const fromSheet = Number(actor.system?.attributes?.capacity?.creature);
  return { id: actor.id, name: actor.name, img: actor.img, owner: f.owner ?? null,
    seats: Number.isFinite(f.seats) ? f.seats : Number.isFinite(fromSheet) && fromSheet > 0 ? fromSheet : 3,
    speeds: { ...VEHICLE_SPEEDS, ...(f.speeds ?? {}) } };
}

const chip = (a, extra = "") => `<span class="chip ${extra}"><span class="av" style="${a.img ? `background-image:url('${esc(a.img)}')` : ""}">${a.img ? "" : esc(initials(a.name))}</span>${esc(a.name)}</span>`;

/**
 * Open the window. ctx: { token, scene, from, to, destination } from the drag;
 * deps: { controller, describe(point) -> Promise<string> (an address), city }.
 */
export function openTravel(controller, ctx, deps) {
  const app = new (travelClass())({ controller, ctx, deps });
  app.render({ force: true });
  return app;
}

let TravelClass = null;
function travelClass() {
  if (TravelClass) return TravelClass;
  const { ApplicationV2 } = foundry.applications.api;
  TravelClass = class TravelWindow extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      tag: "div", classes: ["kgc-ui", "kgc-travel"],
      window: { title: "Travel", icon: "fa-solid fa-route", resizable: true },
      position: { width: 560, height: "auto" }
    };

    constructor(options) {
      super(options);
      Object.assign(this, { controller: options.controller, ctx: options.ctx, deps: options.deps });
      this.tab = "walk";
      this.choice = { use: {}, driver: {}, seat: {} };
      this.payFrom = "riders";
      this.keep = "walk";
      this.teleportMode = "instant";
      this.routes = null;
      this.#plan();
    }

    get title() { return `Travel: ${this.ctx.token.name}`; }

    /** Who travels: a party's people and its vehicles, or the token's own actor. */
    get party() {
      const actor = this.ctx.token.actor;
      if (actor?.type === "group") {
        const all = groupMembers(actor);
        return { group: actor, people: all.filter((a) => !isVehicle(a)), vehicles: all.filter(isVehicle) };
      }
      return { group: null, people: actor ? [actor] : [], vehicles: [] };
    }

    async #plan() {
      const { from, to } = this.ctx;
      const [walk, drive, a, b] = await Promise.all([
        this.controller.route(from, to, { mode: "walk" }).catch(() => null),
        this.controller.route(from, to, { mode: "drive" }).catch(() => null),
        this.deps.describe(from).catch(() => ""), this.deps.describe(to).catch(() => "")
      ]);
      this.routes = { walk, drive, train: await this.#planTrain(from, to) };
      this.where = { from: a || "Here", to: b || "There" };
      if (!walk && drive) this.tab = "taxi";
      if (!walk && !drive) this.tab = "teleport";
      this.keep = walk ? "walk" : drive ? "taxi" : "walk";
      if (this.rendered) this.render();
    }

    /**
     * With KG Transit and a network on this scene: the train, as KG Transit plans it, with the real
     * walks to the first station and from the last. { plan, walkTo, walkFrom, seconds } or null.
     */
    async #planTrain(from, to) {
      let plan = null;
      try { plan = this.controller.transit()?.planTrain?.(this.ctx.scene, from, to) ?? null; } catch (err) { console.warn(`${ID} | train`, err); }
      if (!plan) return null;
      const [walkTo, walkFrom] = await Promise.all([
        this.controller.route(from, plan.origin, { mode: "walk" }).catch(() => null),
        this.controller.route(plan.destination, to, { mode: "walk" }).catch(() => null)
      ]);
      if (!walkTo || !walkFrom) return null;
      return { plan, walkTo, walkFrom, seconds: walkTo.seconds + plan.seconds + walkFrom.seconds };
    }

    /** Everything each tab needs, worked out from the routes and the party. */
    #state() {
      const { people, vehicles, group } = this.party, r = this.routes;
      const meter = { ...DEFAULT_METER, ...(game.settings.get(ID, "taxiMeters")?.[this.deps.city] ?? {}) };
      const rate = this.controller.dollarRate();
      const taxi = r?.drive ? taxiPlan(r.drive, Math.max(1, people.length), meter) : null;
      const cars = vehicles.map(vehicleOf);
      const seating = seatVehicles(people.map((a) => ({ id: a.id, name: a.name, img: a.img })), cars, this.choice);
      const own = r?.drive && seating.cars.length ? vehicleSeconds(r.drive, seating.cars) : null;
      // Each rider's share of their cab, in order: the first cab's riders, then the next.
      const shares = [];
      if (taxi) { let i = 0; for (const cab of taxi.cabs) for (let k = 0; k < cab.riders; k++) shares.push({ actor: people[i++], dollars: cab.each }); }
      const short = this.payFrom === "riders" ? shares.filter((s) => s.actor && walletValue(s.actor.system?.currency) < Math.round(s.dollars * rate)).map((s) => s.actor.name)
        : this.payFrom === "party" && group && taxi && walletValue(group.system?.currency) < Math.round(taxi.fare * rate) ? [group.name] : [];
      const times = { walk: r?.walk?.seconds ?? null, train: r?.train?.seconds ?? null, taxi: taxi?.seconds ?? null, own };
      return { people, vehicles, group, meter, rate, taxi, seating, cars, own, shares, short, times };
    }

    async _renderHTML() {
      const s = this.#state(), r = this.routes, now = this.controller.now();
      const arrive = (secs) => (secs == null ? "" : `arrive ${clockAt(now + secs)}`);
      if (!r) return `<div class="tv"><p class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Finding the way…</p></div>`;
      const tabTime = { walk: r.walk ? formatDuration(r.walk.seconds) : "no way on foot", train: r.train ? formatDuration(r.train.seconds) : "no line", taxi: s.taxi ? formatDuration(s.taxi.seconds) : "no road", own: !s.vehicles.length ? "no vehicles" : s.seating.ok && s.own != null ? formatDuration(s.own) : "not enough seats", teleport: "override" };
      const disabled = { walk: !r.walk, train: !r.train, taxi: !s.taxi, own: !r.drive, teleport: false };
      // The Train tab only where KG Transit has a network on this scene.
      const shown = TABS.filter(([k]) => k !== "train" || this.controller.transit()?.planTrain);
      const tabs = `<nav class="tabs" role="tablist" aria-label="How they go" style="--n:${shown.length}">${shown.map(([k, l, i]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === this.tab}" class="${k === this.tab ? "on" : ""}" style="--mode:${MODE_COLOURS[k] ?? "#c9b6ff"}" ${disabled[k] ? "disabled" : ""}><i class="fa-solid ${i}"></i>${l}<span class="t">${esc(tabTime[k])}</span></button>`).join("")}</nav>`;
      const who = `<div class="who"><span class="lbl">Travelling</span>${s.people.map((a) => chip(a)).join("")}${s.vehicles.map((a) => chip(a, "vehicle")).join("")}</div>`;
      const panes = { walk: this.#walk(s, arrive), train: this.#train(s, arrive), taxi: this.#taxi(s, arrive), own: this.#own(s, arrive), teleport: this.#teleport(s) };
      const go = this.#go(s);
      return `<div class="tv">
        <header class="head"><div class="route">${esc(this.where.from)} <span class="arrow">→</span> ${esc(this.where.to)}</div>
          <div class="sub">${esc(clockAt(now))} · ${esc(this.ctx.token.name)}</div></header>
        ${who}${tabs}<div class="pane">${panes[this.tab]}</div></div>
        <footer class="foot"><span class="grow">${esc(go.note ?? "Cancel puts the token back.")}</span>
          <button type="button" class="btn" data-act="cancel">Cancel</button>
          <button type="button" class="btn primary" data-act="go" ${go.ok ? "" : "disabled"}>${esc(go.label)}</button></footer>`;
    }

    #walk(s, arrive) {
      const w = this.routes.walk;
      if (!w) return `<p class="empty">No way on foot from here to there (the tunnels and expressways are not for walkers). Take a cab, or drive.</p>`;
      return `<div class="big"><span class="v">${esc(formatDuration(w.seconds))}</span><span class="k">${esc(formatMiles(w.metres))} at 3 mph · ${esc(arrive(w.seconds))}</span></div>
        <p class="hint">All ${s.people.length} walk together.</p>`;
    }

    #train(s, arrive) {
      const t = this.routes.train;
      if (!t) return `<p class="empty">No line here helps: the stations are too far, or none connects these places.</p>`;
      const { plan, walkTo, walkFrom } = t, w = this.routes.walk;
      const legs = [
        `<li class="walk"><i class="fa-solid fa-person-walking"></i> Walk ${esc(formatDuration(walkTo.seconds))} to <b>${esc(plan.originName)}</b> (${esc(formatMiles(walkTo.metres))})</li>`,
        ...plan.legs.map((l) => `<li class="ride" style="--line:${esc(l.color)}"><span class="dot"></span>${esc(l.label)}</li>`),
        `<li class="ride-time"><i class="fa-solid fa-train-subway"></i> ${esc(formatDuration(plan.seconds))} on the train, to <b>${esc(plan.destinationName)}</b></li>`,
        `<li class="walk"><i class="fa-solid fa-person-walking"></i> Walk ${esc(formatDuration(walkFrom.seconds))} from there (${esc(formatMiles(walkFrom.metres))})</li>`
      ].join("");
      const vs = w ? (t.seconds < w.seconds ? `${formatDuration(w.seconds - t.seconds)} quicker than walking` : `${formatDuration(t.seconds - w.seconds)} slower than walking`) : "";
      return `<div class="big"><span class="v">${esc(formatDuration(t.seconds))}</span><span class="k">door to door · ${esc(arrive(t.seconds))}${vs ? ` · ${esc(vs)}` : ""}</span></div>
        <ol class="legs">${legs}</ol>
        <p class="hint">They walk to ${esc(plan.originName)} now. There, Board opens for you with ${esc(plan.destinationName)} chosen: confirm the riders and fares (${esc(formatMoney(plan.fare, this.controller.dollarRate()))} each), and when they get off they walk on to where you dropped them.</p>`;
    }

    #taxi(s, arrive) {
      const t = s.taxi;
      if (!t) return `<p class="empty">No road joins here and there.</p>`;
      let i = 0;
      const cabs = t.cabs.map((cab, n) => {
        const riders = s.people.slice(i, i + cab.riders);
        i += cab.riders;
        return `<div class="cab"><b>Cab ${n + 1} · ${esc(formatDollars(cab.fare))} · ${esc(formatDollars(cab.each))} each</b><div class="seats">${riders.map((a) => chip(a)).join("")}</div></div>`;
      }).join("");
      return `<div class="big"><span class="v">${esc(formatDuration(t.seconds))}</span><span class="k">${esc(formatMiles(this.routes.drive.metres))} by road, with a few minutes to hail one · ${esc(arrive(t.seconds))}</span></div>
        <div class="cabs">${cabs}</div>
        <div class="rows"><div><span>The meter</span><span><input type="number" name="drop" value="${s.meter.drop}" min="0" step="0.05" aria-label="Flag drop in dollars"> drop + <input type="number" name="perMile" value="${s.meter.perMile}" min="0" step="0.05" aria-label="Dollars a mile"> a mile</span></div>
          <div><span>In all</span><span>${esc(formatDollars(t.fare))}</span></div>
          <div><span>Paid by</span><span><select name="payFrom">${[["riders", "Each rider, their share"], ["party", "The party's purse"], ["free", "Nobody (free)"]].filter(([k]) => k !== "party" || s.group).map(([k, l]) => `<option value="${k}" ${k === this.payFrom ? "selected" : ""}>${l}</option>`).join("")}</select></span></div></div>
        ${s.short.length ? `<p class="warn"><i class="fa-solid fa-triangle-exclamation"></i> Not enough money: ${esc(s.short.join(", "))}.</p>` : ""}
        <p class="hint">A cab takes ${4} at most. Each pays their cab's share, taken from their coins. The meter is this city's; 1986 rates are a guess, change them here.</p>`;
    }

    #own(s, arrive) {
      if (!s.vehicles.length) return `<div class="drop" data-drop="vehicle"><i class="fa-solid fa-car-side"></i> This party has no vehicles. Drop a vehicle actor here to add it to the party.</div>`;
      const { seating } = s, here = new Map(s.people.map((a) => [a.id, a]));
      // Who can own a vehicle: the party's people, in this group or a group split from it, the
      // whole party's, and whoever owns one already. Not every actor in the world.
      const family = s.group ? familyActors(s.group).flatMap((g) => groupMembers(g)) : [];
      const base = baseParty();
      const pool = [...s.people, ...family, ...(base ? groupMembers(base) : []), ...s.cars.map((v) => game.actors.get(v.owner)).filter(Boolean)];
      const owners = [...new Map(pool.filter((a) => a && !isVehicle(a)).map((a) => [a.id, a])).values()].sort((a, b) => a.name.localeCompare(b.name));
      const cars = s.cars.map((v) => {
        const car = seating.cars.find((c) => c.vehicle.id === v.id), taken = this.choice.use[v.id] !== false;
        const ownerHere = v.owner && here.has(v.owner), chosen = this.choice.driver[v.id];
        const driverOptions = [[ownerHere ? "auto" : "none", ownerHere ? `${here.get(v.owner).name} (the owner)` : "Choose who drives"], ...s.people.filter((a) => a.id !== v.owner).map((a) => [a.id, a.name]), ["", "Nobody: leave it behind"]];
        const value = chosen === undefined ? (ownerHere ? "auto" : "none") : chosen;
        return `<div class="veh ${taken ? "" : "off"} ${car ? "" : "idle"}">
          <div class="vhead"><label class="take"><input type="checkbox" data-use="${v.id}" ${taken ? "checked" : ""}> <b>${esc(v.name)}</b></label>
            <span class="meta">Owner <select data-owner="${v.id}" aria-label="Owner of ${esc(v.name)}"><option value="">Nobody</option>${owners.map((a) => `<option value="${a.id}" ${a.id === v.owner ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
            · <input type="number" data-seats="${v.id}" value="${v.seats}" min="0" max="60" aria-label="Passenger seats in ${esc(v.name)}"> passengers</span></div>
          ${taken ? `<div class="vrow"><span class="lbl">Drives</span><select data-driver="${v.id}" aria-label="Who drives ${esc(v.name)}">${driverOptions.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
            <div class="seat-row">${car ? `${chip(car.driver, "drive")}${car.riders.map((a) => chip(a)).join("")}${Array.from({ length: Math.max(0, v.seats - car.riders.length) }, () => '<span class="chip empty">empty</span>').join("")}` : `<span class="warn">${v.owner && !ownerHere ? `${esc(game.actors.get(v.owner)?.name ?? "Its owner")} is not with this party: choose who drives.` : "Nobody drives it."}</span>`}</div>` : ""}</div>`;
      }).join("");
      const moves = seating.cars.length > 1 ? `<div class="rows wishes">${s.people.filter((a) => !seating.cars.some((c) => c.driver.id === a.id)).map((a) => `<div><span>${esc(a.name)} rides in</span><span><select data-seat="${a.id}"><option value="">Any seat</option>${seating.cars.map((c) => `<option value="${c.vehicle.id}" ${this.choice.seat[a.id] === c.vehicle.id ? "selected" : ""}>${esc(c.vehicle.name)}</option>`).join("")}</select></span></div>`).join("")}</div>` : "";
      const head = seating.ok && s.own != null
        ? `<div class="big"><span class="v">${esc(formatDuration(s.own))}</span><span class="k">${esc(formatMiles(this.routes.drive.metres))}: ${esc(formatMiles(this.routes.drive.metres - this.routes.drive.interstateMetres))} at 35 mph, ${esc(formatMiles(this.routes.drive.interstateMetres))} on the interstate at 55 · ${esc(arrive(s.own))}</span></div>`
        // A vehicle with nobody to drive it first: choosing a driver may seat everyone.
        : `<p class="warn"><i class="fa-solid fa-triangle-exclamation"></i> ${seating.noDriver.length ? `Choose who drives ${esc(seating.noDriver.map((v) => v.name).join(" and "))}.` : seating.left.length ? `${seating.left.length} ${seating.left.length === 1 ? "person has" : "people have"} no seat (${esc(seating.left.map((p) => p.name).join(", "))}). Split the party, or take a cab.` : "Take at least one vehicle."}</p>`;
      return `${head}${cars}${moves}<div class="drop small" data-drop="vehicle"><i class="fa-solid fa-plus"></i> Drop a vehicle actor here to add it to the party</div>
        <p class="hint">Only vehicles in this party's group are here. The party arrives when its slowest car does.</p>`;
    }

    #teleport(s) {
      const opts = [["walk", "walking"], ["train", "the train"], ["taxi", "a cab"], ["own", "its own vehicles"]].filter(([k]) => s.times[k] != null);
      return `<div class="radio">
        <label><input type="radio" name="teleport" value="instant" ${this.teleportMode === "instant" ? "checked" : ""}> <span>Instant<small>The token is there now. The clock does not move.</small></span></label>
        <label><input type="radio" name="teleport" value="keep" ${this.teleportMode === "keep" ? "checked" : ""} ${opts.length ? "" : "disabled"}> <span>Keep the travel time<small>The token is there now, and the clock moves on by ${opts.length ? `<select name="keep">${opts.map(([k, l]) => `<option value="${k}" ${k === this.keep ? "selected" : ""}>${l}, ${esc(formatDuration(s.times[k]))}</option>`).join("")}</select>` : "(no way to time it)"}</small></span></label></div>
        <p class="hint">For a cut scene: the story moved them, and the map follows.</p>`;
    }

    /** The Go button: its label, whether it can go, and a word on why not. */
    #go(s) {
      switch (this.tab) {
        case "walk": return { label: "Walk there", ok: !!this.routes.walk };
        case "train": return { label: this.routes.train ? `Walk to ${this.routes.train.plan.originName}` : "Take the train", ok: !!this.routes.train };
        case "taxi": return { label: s.taxi && s.taxi.cabs.length > 1 ? `Take ${s.taxi.cabs.length} cabs` : "Take a cab", ok: !!s.taxi && !s.short.length, note: s.short.length ? "Not enough money for the fare." : null };
        case "own": return { label: "Drive there", ok: s.seating.ok && s.own != null, note: s.seating.ok ? null : "Not everyone has a seat, or a vehicle has no driver." };
        default: return { label: "Teleport", ok: this.teleportMode === "instant" || s.times[this.keep] != null };
      }
    }

    _replaceHTML(html, content) {
      content.innerHTML = html;
      if (content.kgcBound) return;
      content.kgcBound = true;
      content.addEventListener("click", (e) => this.#click(e));
      content.addEventListener("change", (e) => this.#change(e));
      content.addEventListener("dragover", (e) => { if (e.target.closest?.("[data-drop]")) e.preventDefault(); });
      content.addEventListener("drop", (e) => this.#drop(e));
    }

    async #click(e) {
      const tab = e.target.closest("[data-tab]");
      if (tab && !tab.disabled) { this.tab = tab.dataset.tab; return this.render(); }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") return this.close();
      if (act === "go") {
        const button = e.target.closest("[data-act]");
        button.disabled = true;
        try { if (await this.#goNow()) await this.close(); } catch (err) { ui.notifications.error(`KG Cities: ${err.message}`); } finally { if (this.rendered) button.disabled = false; }
      }
    }

    async #change(e) {
      const t = e.target, d = t.dataset;
      if (t.name === "payFrom") this.payFrom = t.value;
      else if (t.name === "teleport") this.teleportMode = t.value;
      else if (t.name === "keep") this.keep = t.value;
      else if (t.name === "drop" || t.name === "perMile") {
        const all = foundry.utils.deepClone(game.settings.get(ID, "taxiMeters") ?? {});
        all[this.deps.city] = { ...DEFAULT_METER, ...(all[this.deps.city] ?? {}), [t.name]: Math.max(0, Number(t.value) || 0) };
        await game.settings.set(ID, "taxiMeters", all);
      } else if (d.use) this.choice.use[d.use] = t.checked;
      else if (d.driver) { const v = t.value; this.choice.driver[d.driver] = v === "auto" || v === "none" ? undefined : v; }
      else if (d.seat) this.choice.seat[d.seat] = t.value || undefined;
      else if (d.owner || d.seats) {
        const actor = game.actors.get(d.owner ?? d.seats);
        const f = { ...(actor.getFlag(ID, "vehicle") ?? {}) };
        if (d.owner) f.owner = t.value || null; else f.seats = Math.max(0, Math.round(Number(t.value) || 0));
        await actor.setFlag(ID, "vehicle", f);
      } else return;
      this.render();
    }

    /** A vehicle actor dropped on the vehicles tab joins the party's group. */
    async #drop(e) {
      if (!e.target.closest?.("[data-drop]")) return;
      e.preventDefault();
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      let data = null;
      try { data = TE.getDragEventData(e); } catch { /* not a document */ }
      const actor = data?.type === "Actor" ? await fromUuid(data.uuid) : null;
      const group = this.party.group;
      if (!actor || !group) return ui.notifications.warn("KG Cities: drop a vehicle actor from the Actors sidebar.");
      if (actor.pack) return ui.notifications.warn("KG Cities: import the vehicle into the world first.");
      if (!isVehicle(actor)) await actor.setFlag(ID, "vehicle", { ...(actor.getFlag(ID, "vehicle") ?? {}), vehicle: true });
      if (!groupMembers(group).some((a) => a.id === actor.id)) await group.update({ "system.members": [...memberRows(group), { actor: actor.id }] });
      this.tab = "own";
      this.render();
    }

    /** Pay, then go. True when the party is on its way. */
    async #goNow() {
      const s = this.#state(), { token, destination } = this.ctx, r = this.routes;
      if (this.tab === "teleport") {
        await this.controller.teleport(token, destination, this.teleportMode === "keep" ? s.times[this.keep] ?? 0 : 0);
        return true;
      }
      if (this.tab === "walk") {
        await this.controller.start({ token, mode: "walk", points: r.walk.points, seconds: r.walk.seconds, label: token.name, detail: formatMiles(r.walk.metres), people: s.people.map((a) => a.id) });
        return true;
      }
      if (this.tab === "train") {
        const { plan, walkTo } = r.train;
        await this.controller.start({
          token, mode: "walk", points: walkTo.points, seconds: walkTo.seconds, label: token.name, detail: `to ${plan.originName}, for the train`,
          then: { board: { originId: plan.originId, destinationId: plan.destinationId, originName: plan.originName, destinationName: plan.destinationName, stationPoint: plan.destination, to: this.ctx.to, destination: this.ctx.destination } }
        });
        return true;
      }
      if (this.tab === "taxi") {
        if (!(await this.#payFare(s))) return false;
        await this.controller.start({ token, mode: "taxi", points: r.drive.points, seconds: s.taxi.seconds, label: token.name, detail: `${s.taxi.cabs.length === 1 ? "1 cab" : `${s.taxi.cabs.length} cabs`}, ${formatDollars(s.taxi.fare)}`, people: s.people.map((a) => a.id) });
        return true;
      }
      if (!s.seating.ok) return false;
      // Who sits in which car: each player sees out of their own character's.
      const cars = s.seating.cars.map((c) => ({ vehicle: c.vehicle.id, driver: c.driver.id, riders: c.riders.map((p) => p.id) }));
      await this.controller.start({ token, mode: "own", points: r.drive.points, seconds: s.own, label: token.name, detail: s.seating.cars.map((c) => c.vehicle.name).join(", "), people: s.people.map((a) => a.id), cars });
      return true;
    }

    /** The fare, from each rider or from the party's purse, with a chat line saying who paid what. */
    async #payFare(s) {
      if (this.payFrom === "free") return true;
      const lines = [];
      if (this.payFrom === "party") {
        const copper = Math.round(s.taxi.fare * s.rate), r = pay(s.group.system.currency, copper);
        if (!r) { ui.notifications.warn(`KG Cities: ${s.group.name} cannot cover ${formatMoney(copper, s.rate)}.`); return false; }
        await s.group.update({ "system.currency": r.after });
        lines.push(`${s.group.name}: ${formatMoney(copper, s.rate)}`);
      } else {
        const plans = s.shares.filter((x) => x.actor).map((x) => ({ actor: x.actor, copper: Math.round(x.dollars * s.rate) }));
        const results = plans.map((p) => ({ ...p, r: pay(p.actor.system?.currency, p.copper) }));
        const short = results.filter((x) => !x.r);
        if (short.length) { ui.notifications.warn(`KG Cities: not enough money: ${short.map((x) => x.actor.name).join(", ")}.`); return false; }
        for (const x of results) { await x.actor.update({ "system.currency": x.r.after }); lines.push(`${x.actor.name}: ${formatMoney(x.copper, s.rate)}`); }
      }
      await ChatMessage.create({ content: `<p><b>Cab fare</b>, ${esc(formatDollars(s.taxi.fare))} in all.</p><p>${lines.map(esc).join("<br>")}</p>`, whisper: game.users.filter((u) => u.isGM).map((u) => u.id) });
      return true;
    }
  };
  return TravelClass;
}
