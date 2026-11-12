// The payroll's windows. The GM's Payroll: every character's jobs (add, edit, pay now, pause),
// a job editor (how it pays, when, a payday roll, bonuses and risks), and the 1986 job guide to
// start one from. A player's Your pay: their characters' jobs, pay stubs, and checks to cash.

import { BOSTON, DAY, FOOD, GUIDE, HOUSING, MEDIAN_1986, MIN_WAGE_MA, NEIGHBORHOODS, PAY_TYPES, PRESETS, SCHEDULES, VEHICLES, computePay, describeRate, dollars, guideJob, homeBills, makeJob, weekly, weeklyTakeHome } from "./payroll-core.mjs";
import { checksOf, dateLabel, homeOf, jobsOf, monthList, payrollActors, saveHome, saveJobs, skillChoices, stubHtml, stubsOf } from "./payroll.mjs";
import { walletValue } from "./money.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const tabs = (list, on) => `<nav class="dev-tabs" role="tablist">${list.map(([k, l, i]) => `<button type="button" role="tab" aria-selected="${k === on}" class="${k === on ? "on" : ""}" data-act="tab" data-value="${k}"><i class="fa-solid ${i}"></i> ${l}</button>`).join("")}</nav>`;
const opts = (list, value) => list.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("");
const READY = "Ready-made", YOURS = "Your jobs";

/** Keep typed values, the focus and the scroll across a redraw. */
function keep(root, draw) {
  const values = new Map([...root.querySelectorAll("[data-keep]")].map((el) => [el.dataset.keep, el.value]));
  const f = document.activeElement?.closest?.("[data-keep],[data-f]");
  const key = f && root.contains(f) ? (f.dataset.keep ? `[data-keep="${f.dataset.keep}"]` : `[data-f="${f.dataset.f}"]`) : null;
  // Where the cursor was in the box being typed in: a redraw must not send it back to the start.
  let sel = null;
  try { sel = key ? [f.selectionStart, f.selectionEnd] : null; } catch { /* not a text box */ }
  const scroll = [...root.querySelectorAll(".pr-scroll")].map((el) => el.scrollTop);
  draw();
  for (const el of root.querySelectorAll("[data-keep]")) if (values.has(el.dataset.keep) && el.type !== "checkbox") el.value = values.get(el.dataset.keep);
  if (key) {
    const el = root.querySelector(key);
    el?.focus();
    try { if (sel && sel[0] != null) el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text box */ }
  }
  root.querySelectorAll(".pr-scroll").forEach((el, i) => { el.scrollTop = scroll[i] ?? 0; });
}

/** "every 2 weeks · next Friday, October 17" or why it is not paying. */
function whenLine(job) {
  if (!job.active) return "Paused";
  if (job.left === 0) return "No paydays left";
  const s = SCHEDULES[job.every] ?? `Every ${job.every} days`;
  if (!(job.every > 0)) return s;
  const season = job.season ? `, ${monthList()[job.season.from]?.slice(0, 3)} to ${monthList()[job.season.to]?.slice(0, 3)}` : "";
  return `${s}${season}${Number.isFinite(job.next) ? ` · next ${dateLabel(job.next)}` : ""}${job.left != null ? ` · ${job.left} left` : ""}`;
}

export class PayrollUI {
  constructor({ payroll, dollarRate }) {
    this.payroll = payroll;
    this.dollarRate = dollarRate;
    this.board = null;
    this.mine = null;
  }

  refresh() {
    if (this.board?.rendered) this.board.redraw();
    if (this.mine?.rendered) this.mine.redraw();
  }

  /** The GM's Payroll, or a player's Your pay. */
  open({ actorId = null, tab = null } = {}) {
    if (!game.user.isGM) return this.openMine();
    this.board ??= new (boardClass())({ ui: this });
    if (actorId) this.board.actorId = actorId;
    if (tab) this.board.tab = tab;
    this.board.render({ force: true });
    if (this.board.rendered) this.board.bringToFront?.();
    return this.board;
  }

  openMine() {
    this.mine ??= new (mineClass())({ ui: this });
    this.mine.render({ force: true });
    return this.mine;
  }

  wallet(actor) {
    const c = actor?.system?.currency;
    return c ? dollars(walletValue(c) / (Number(this.dollarRate()) || 1000)) : "";
  }
}

/* ---------------------------------------- */
/*  The GM's Payroll                         */
/* ---------------------------------------- */

let BoardClass = null;
function boardClass() {
  if (BoardClass) return BoardClass;
  const { ApplicationV2 } = foundry.applications.api;
  BoardClass = class Payroll extends ApplicationV2 {
    static DEFAULT_OPTIONS = { id: "kgc-payroll", tag: "div", classes: ["kgc-ui", "kgc-switchboard", "kgc-payroll"], window: { title: "Payroll", icon: "fa-solid fa-money-check-dollar", resizable: true }, position: { width: 860, height: 660 } };

    constructor({ ui }) {
      super();
      this.ui = ui;
      this.tab = "people";
      this.actorId = null;
      this.draft = null;
      this.cat = "Blue collar";
      this.boston = true;
      this.q = "";
    }
    get payroll() { return this.ui.payroll; }
    get actor() {
      const list = payrollActors();
      return list.find((a) => a.id === this.actorId) ?? list[0] ?? null;
    }
    redraw() { if (this.rendered) keep(this.element, () => this.#draw()); }

    async _renderHTML() { return ""; }
    _replaceHTML(html, content) {
      if (!content.kgcBound) {
        content.kgcBound = true;
        content.addEventListener("click", (e) => this.#click(e));
        content.addEventListener("change", (e) => this.#change(e));
        content.addEventListener("input", (e) => this.#input(e));
      }
      this.#draw(content);
    }

    #draw(content = this.element?.querySelector(".window-content")) {
      if (!content) return;
      const body = this.tab === "guide" ? this.#guide() : this.#people();
      content.innerHTML = `${tabs([["people", "Characters", "fa-users"], ["guide", "1986 job guide", "fa-book-open"]], this.tab)}<div class="pr-body">${body}</div>`;
      this.#preview();
    }

    /* -------- Characters -------- */

    #people() {
      const list = payrollActors(), actor = this.actor;
      if (!list.length) return `<p class="empty pad">No characters yet. Player characters show here; so does anyone you give a job.</p>`;
      const side = list.map((a) => {
        const jobs = jobsOf(a).filter((j) => j.active);
        const next = jobs.map((j) => j.next).filter((t) => Number.isFinite(t)).sort((x, y) => x - y)[0];
        return `<button type="button" class="pr-who ${a === actor ? "on" : ""}" data-act="who" data-id="${a.id}"><img src="${esc(a.img)}" alt=""><span><b>${esc(a.name)}</b><small>${jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}${next ? ` · ${esc(dateLabel(next))}` : ""}` : "No job"}</small></span></button>`;
      }).join("");
      return `<div class="pr-split"><aside class="pr-side pr-scroll">${side}</aside><section class="pr-main pr-scroll">${this.draft ? this.#editor(actor) : this.#jobs(actor)}</section></div>`;
    }

    #jobs(actor) {
      const jobs = jobsOf(actor), stubs = stubsOf(actor).slice(0, 4), checks = checksOf(actor);
      const wallet = this.ui.wallet(actor);
      const cards = jobs.map((j) => {
        const p = computePay(j, { chance: () => false });
        return `<article class="pr-job ${j.active ? "" : "off"}">
          <header><div><b>${esc(j.title)}</b>${j.employer ? `<small>${esc(j.employer)}</small>` : ""}</div><span class="pr-amt">${dollars(p.gross)}<small>a payday, before rolls</small></span></header>
          <div class="pr-meta">${esc(describeRate(j))} · ${esc(whenLine(j))}</div>
          <div class="pr-tags"><span class="badge">${j.paid === "check" ? "Paper check" : "Cash"}</span><span class="badge ${j.books ? "" : "gold"}">${j.books ? "On the books" : "Off the books"}</span>${j.roll ? `<span class="badge gm"><i class="fa-solid fa-dice"></i> ${esc(j.roll.label || j.roll.formula)}</span>` : ""}${j.bonuses.map((b) => `<span class="badge">${esc(b.label)}</span>`).join("")}</div>
          <footer><button type="button" class="btn small" data-act="edit" data-id="${j.id}"><i class="fa-solid fa-pen"></i> Edit</button><button type="button" class="btn small primary" data-act="pay-now" data-id="${j.id}"><i class="fa-solid fa-money-bill-wave"></i> Pay now</button>
            <button type="button" class="btn small" data-act="toggle" data-id="${j.id}">${j.active ? '<i class="fa-solid fa-pause"></i> Pause' : '<i class="fa-solid fa-play"></i> Resume'}</button><span class="grow"></span><button type="button" class="btn small danger" data-act="remove" data-id="${j.id}" aria-label="Remove the job"><i class="fa-solid fa-trash"></i></button></footer></article>`;
      }).join("");
      return `<div class="pr-head"><h3>${esc(actor.name)}</h3>${wallet ? `<span class="pr-wallet"><i class="fa-solid fa-wallet"></i> ${wallet}</span>` : ""}<span class="grow"></span>
          <button type="button" class="btn" data-act="new"><i class="fa-solid fa-plus"></i> New job</button><button type="button" class="btn" data-act="tab" data-value="guide"><i class="fa-solid fa-book-open"></i> From the guide</button></div>
        ${cards || `<p class="empty">No job. Make one, or pick one from the 1986 guide.</p>`}
        ${this.#home(actor, jobs)}
        ${checks.length ? `<h4>Checks not cashed</h4><div class="pr-checks">${checks.map((i) => `<div class="pr-check"><img src="${esc(i.img)}" alt=""><span>${esc(i.flags[ID].check.from)}<small>${esc(dateLabel(i.flags[ID].check.time))}</small></span><b>${dollars(i.flags[ID].check.amount)}</b><button type="button" class="btn small" data-act="cash" data-uuid="${i.uuid}">Cash it</button></div>`).join("")}</div>` : ""}
        ${stubs.length ? `<h4>Last paydays</h4><div class="pr-stubs">${stubs.map((s) => stubHtml(s)).join("")}</div>` : ""}`;
    }

    /* -------- Living costs -------- */

    #home(actor, jobs) {
      const h = homeOf(actor), bills = homeBills(h), take = weeklyTakeHome(jobs);
      const left = take - bills.perWeek;
      const num = (k, v, ph, step = 1) => `<input data-h="${k}" data-type="numOrNull" type="number" min="0" step="${step}" value="${v ?? ""}" placeholder="${esc(ph)}">`;
      const list = [...bills.weekly.map((b) => [b.label, b.amount, "a week"]), ...bills.monthly.map((b) => [b.label, b.amount, "a month"])];
      return `<h4>Living costs</h4>
        <div class="pr-home">
          <label class="pr-check-line"><input type="checkbox" data-h="on" data-type="check" ${h.on ? "checked" : ""}> Charge these bills from the wallet ${h.on && Number.isFinite(h.next) ? `<span class="faint">(next ${esc(dateLabel(h.next))}${Number.isFinite(h.rentNext) ? `, rent ${esc(dateLabel(h.rentNext))}` : ""})</span>` : ""}</label>
          <label class="pr-check-line"><input type="checkbox" data-h="dependant" data-type="check" ${h.dependant ? "checked" : ""}> A dependant: someone else pays the rent, the bills and the groceries</label>
          <div class="pr-form">
            ${h.dependant ? "" : `<label>Home<select data-h="housing">${opts(Object.entries(HOUSING).filter(([k]) => k !== "family").map(([k, v]) => [k, v.label]), h.housing)}</select></label>`}
            ${h.dependant || h.housing === "none" ? "" : `<label>Neighborhood<select data-h="hood">${opts(Object.entries(NEIGHBORHOODS).map(([k, v]) => [k, `${v.name} (${dollars(v.rent).replace(".00", "")} rent)`]), h.hood)}</select></label>
              <label>${h.housing === "mortgage" ? "Mortgage" : h.housing === "owned" ? "Property tax" : "Rent"}, a month${num("housingCost", h.housingCost, String(Math.round(NEIGHBORHOODS[h.hood].rent * HOUSING[h.housing].factor)))}</label>
              <label>Heat, lights and phone, a month${num("utilities", h.utilities, String(HOUSING[h.housing].utilities))}</label>`}
            <label>Vehicle<select data-h="vehicle">${opts(Object.entries(VEHICLES).map(([k, v]) => [k, v.label]), h.vehicle)}</select></label>
            ${h.vehicle === "none" ? "" : `<label>Insurance, a year${num("insurance", h.insurance, String(VEHICLES[h.vehicle].insurance))}</label><label>Gas, a week${num("gas", h.gas, String(VEHICLES[h.vehicle].gas))}</label>`}
            ${h.dependant ? "" : `<label>Groceries<select data-h="food">${opts(Object.entries(FOOD).map(([k, v]) => [k, `${v.label}, $${v.weekly} a week each`]), h.food)}</select></label><label>Mouths to feed${`<input data-h="people" data-type="num" type="number" min="1" step="1" value="${h.people}">`}</label>`}
          </div>
          ${h.extras.length ? `<table class="sb-table pr-bonus"><tbody>${h.extras.map((x, i) => `<tr><td><input data-h="extras.${i}.label" value="${esc(x.label)}"></td><td><input data-h="extras.${i}.amount" data-type="num" type="number" min="0" step="1" value="${x.amount}"></td><td><select data-h="extras.${i}.monthly" data-type="bool">${opts([["true", "a month"], ["false", "a week"]], String(x.monthly))}</select></td><td class="acts"><button type="button" class="btn small danger" data-act="extra-remove" data-i="${i}" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join("")}</tbody></table>` : ""}
          <button type="button" class="btn small" data-act="extra-add"><i class="fa-solid fa-plus"></i> Add a bill (a loan, child support, a bookie)</button>
          <table class="pr-budget">${list.map(([l, a, per]) => `<tr><td>${esc(l)}</td><td>${dollars(a)} ${per}</td></tr>`).join("")}</table>
          <div class="pr-sum"><div><small>Takes home a week</small><b>${dollars(take)}</b></div><div><small>Bills a week</small><b>${dollars(bills.perWeek)}</b></div><div class="${left < 0 ? "neg" : ""}"><small>Left over a week</small><b>${dollars(left)}</b></div></div>
          ${h.owed > 0 ? `<p class="warn-line"><i class="fa-solid fa-triangle-exclamation"></i> Behind on the bills: <b>${dollars(h.owed)}</b> owed, paid first next time. <button type="button" class="btn small" data-act="forgive">Forgive it</button></p>` : ""}
          <p class="hint">Rents, insurance and mortgages are estimates for 1986; gas at about 85¢ a gallon; groceries by the USDA's food plans. Change any of them. Cash on the side is not counted in what they take home.</p>
        </div>`;
    }

    async #saveHomeField(el) {
      const actor = this.actor, h = homeOf(actor), type = el.dataset.type;
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (type === "num") v = Number(v) || 0;
      else if (type === "bool") v = v === "true";
      else if (type === "numOrNull") v = v === "" ? null : Math.max(0, Number(v) || 0);
      foundry.utils.setProperty(h, el.dataset.h, v);
      await saveHome(actor, h);
      if (el.dataset.h === "on" && v) this.payroll.runDue();
    }

    /* -------- The job editor -------- */

    #editor(actor) {
      const d = this.draft, t = PAY_TYPES[d.type], months = monthList().map((m, i) => [i, m]);
      const every = Object.keys(SCHEDULES).map(Number).includes(d.every) ? d.every : "custom";
      const bands = d.roll?.bands ?? [];
      return `<div class="pr-head"><h3>${d.isNew ? "New job" : "Edit job"} <small>for ${esc(actor.name)}</small></h3><span class="grow"></span>
          <button type="button" class="btn ghost" data-act="cancel">Cancel</button><button type="button" class="btn" data-act="template" data-tooltip="Keep it in the guide, under Your jobs">Save as a template</button><button type="button" class="btn primary" data-act="save"><i class="fa-solid fa-check"></i> Save</button></div>
        <div class="pr-form">
          <label>Job title<input data-f="title" value="${esc(d.title)}"></label>
          <label>Employer<input data-f="employer" value="${esc(d.employer)}" placeholder="Boston Public Works"></label>
          <label>Pays<select data-f="type">${opts(Object.entries(PAY_TYPES).map(([k, v]) => [k, v.label]), d.type)}</select></label>
          <label>Rate, dollars${d.type === "word" ? " (25¢ is 0.25)" : ""}<input data-f="rate" data-type="num" type="number" step="0.01" min="0" value="${d.rate}"></label>
          ${t.unit ? `<label>${t.unit[0].toUpperCase() + t.unit.slice(1)}<input data-f="units" data-type="num" type="number" step="1" min="0" value="${d.units}"></label>` : ""}
          <label>Payday<select data-f="every" data-type="every">${opts([...Object.entries(SCHEDULES).map(([k, v]) => [k, v]), ["custom", "Every so many days"]], every)}</select></label>
          ${every === "custom" ? `<label>Every how many days<input data-f="every" data-type="num" type="number" min="1" step="1" value="${d.every}"></label>` : ""}
          ${d.every > 0 ? `<label>First payday in, days<input data-f="_inDays" data-type="num" type="number" min="0" step="1" value="${d._inDays}"><small data-out="first"></small></label>` : ""}
          <label>Paid as<select data-f="paid">${opts([["cash", "Cash, into the wallet"], ["check", "Paper check, cashed later"]], d.paid)}</select></label>
          <label>Taxes<select data-f="books" data-type="bool">${opts([["false", "Off the books: nothing withheld"], ["true", "On the books: 1986 withholding"]], String(d.books))}</select></label>
          <label>Union dues, dollars a month<input data-f="dues" data-type="num" type="number" step="1" min="0" value="${d.dues}" placeholder="0"></label>
          <label>Paydays left<input data-f="left" data-type="numOrNull" type="number" min="0" step="1" value="${d.left ?? ""}" placeholder="No end"></label>
        </div>
        <label class="pr-check-line"><input type="checkbox" data-act-check="season" ${d.season ? "checked" : ""}> Only in season ${d.season ? `<select data-f="season.from" data-type="num">${opts(months, d.season.from)}</select> to <select data-f="season.to" data-type="num">${opts(months, d.season.to)}</select>` : '<span class="faint">(a hockey season, summer work)</span>'}</label>

        <h4>Payday roll</h4>
        <label class="pr-check-line"><input type="checkbox" data-act-check="roll" ${d.roll ? "checked" : ""}> Roll each payday for how good it is</label>
        ${d.roll ? `<div class="pr-form">
            <label>Dice<input data-f="roll.formula" value="${esc(d.roll.formula)}" placeholder="2d6"></label>
            <label>Plus skill<select data-f="roll.skill">${opts(skillChoices(), d.roll.skill)}</select></label>
            <label class="wide">What it rolls for<input data-f="roll.label" value="${esc(d.roll.label)}" placeholder="Work found this week"></label>
          </div>
          <table class="sb-table pr-bands"><thead><tr><th>Up to</th><th>Pay</th><th>What happened</th><th></th></tr></thead><tbody>
            ${bands.map((b, i) => `<tr><td><input data-f="roll.bands.${i}.upTo" data-type="num" type="number" step="1" value="${b.upTo}"></td><td><span class="pct"><input data-f="roll.bands.${i}.factor" data-type="pct" type="number" step="5" min="0" value="${Math.round(b.factor * 100)}">%</span></td><td><input data-f="roll.bands.${i}.text" value="${esc(b.text)}"></td><td class="acts"><button type="button" class="btn small danger" data-act="band-remove" data-i="${i}" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join("")}
          </tbody></table><button type="button" class="btn small" data-act="band-add"><i class="fa-solid fa-plus"></i> Add a result</button>
          <p class="hint">The first result the roll does not pass. 100% is the usual pay, 50% half, 0% nothing.</p>` : ""}

        <h4>Bonuses and risks</h4>
        ${d.bonuses.length ? `<table class="sb-table pr-bonus"><thead><tr><th>What</th><th>Amount</th><th>When</th><th>Cash on the side</th><th></th></tr></thead><tbody>
          ${d.bonuses.map((b, i) => `<tr><td><input data-f="bonuses.${i}.label" value="${esc(b.label)}"></td>
            <td><span class="pct"><input data-f="bonuses.${i}.amount" data-type="num" type="number" step="1" value="${b.amount}"><select data-f="bonuses.${i}.percent" data-type="bool">${opts([["false", "$"], ["true", "%"]], String(b.percent))}</select></span></td>
            <td><span class="pct"><select data-f="bonuses.${i}.when">${opts([["once", "Next payday"], ["every", "Every payday"], ["chance", "Chance, 1 in"]], b.when)}</select>${b.when === "chance" ? `<input class="tiny" data-f="bonuses.${i}.chance" data-type="num" type="number" min="2" step="1" value="${b.chance}">` : ""}</span></td>
            <td><input type="checkbox" data-f="bonuses.${i}.cash" data-type="check" ${b.cash ? "checked" : ""}></td>
            <td class="acts"><button type="button" class="btn small danger" data-act="bonus-remove" data-i="${i}" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join("")}</tbody></table>` : ""}
        <button type="button" class="btn small" data-act="bonus-add"><i class="fa-solid fa-plus"></i> Add a bonus or risk</button>
        <p class="hint">A minus amount takes pay away (a fine; -100% is stiffed). Cash on the side is untaxed and goes to the wallet, whatever the job pays with.</p>
        <label class="wide">Note (only you)<input data-f="note" value="${esc(d.note)}"></label>
        <div class="pr-sum"><div><small>A week</small><b data-out="week"></b></div><div><small>A payday, before rolls</small><b data-out="check"></b></div><div><small>A year</small><b data-out="year"></b></div></div>`;
    }

    /** The editor's totals, as the draft is typed. */
    #preview() {
      const d = this.draft, root = this.element;
      if (!d || !root) return;
      const job = makeJob(d), p = computePay(job, { chance: () => false });
      const set = (k, v) => { const el = root.querySelector(`[data-out="${k}"]`); if (el) el.textContent = v; };
      set("week", dollars(weekly(job)));
      set("check", `${dollars(p.net)}${job.books ? " net" : ""}`);
      set("year", dollars(weekly(job) * 52));
      set("first", Number.isFinite(d._inDays) ? dateLabel(game.time.worldTime + d._inDays * DAY) : "");
    }

    #readField(el) {
      const k = el.dataset.f, type = el.dataset.type;
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (type === "num") v = Number(v) || 0;
      else if (type === "pct") v = (Number(v) || 0) / 100;
      else if (type === "bool") v = v === "true";
      else if (type === "numOrNull") v = v === "" ? null : Math.max(0, Math.round(Number(v) || 0));
      else if (type === "every") v = v === "custom" ? (Object.keys(SCHEDULES).map(Number).includes(this.draft.every) ? 10 : this.draft.every) : Number(v);
      foundry.utils.setProperty(this.draft, k, v);
    }

    #input(e) {
      const el = e.target.closest("[data-f]");
      if (el && this.draft) { this.#readField(el); this.#preview(); }
      if (e.target.matches('[data-keep="q"]')) { this.q = e.target.value; keep(this.element, () => this.#draw()); }
    }

    #change(e) {
      const el = e.target;
      if (el.dataset.h) return this.#saveHomeField(el);
      if (el.dataset.f && this.draft) { this.#readField(el); return this.redraw(); }
      if (el.dataset.actCheck && this.draft) {
        if (el.dataset.actCheck === "season") this.draft.season = el.checked ? { from: 9, to: 3 } : null;
        if (el.dataset.actCheck === "roll") this.draft.roll = el.checked ? { formula: "2d6", skill: "", label: "", bands: [{ upTo: 4, factor: 0.5, text: "A bad week" }, { upTo: 10, factor: 1, text: "A normal week" }, { upTo: 12, factor: 1.25, text: "A good week" }] } : null;
        return this.redraw();
      }
      if (el.matches('[data-keep="boston"]')) { this.boston = el.checked; return this.redraw(); }
    }

    /** Start editing a job (a new one is not on the character until saved). */
    #edit(job, isNew = false) {
      const now = game.time.worldTime;
      this.draft = { ...foundry.utils.deepClone(makeJob(job)), isNew };
      this.draft._inDays = Number.isFinite(job.next) && !isNew ? Math.max(0, Math.ceil((job.next - now) / DAY)) : (this.draft.every || 7);
      this.draft._startDays = this.draft._inDays;
      this.tab = "people";
      this.redraw();
    }

    async #save() {
      const actor = this.actor, d = this.draft;
      if (!actor || !d) return;
      const job = makeJob(d);
      if (job.every > 0 && (d.isNew || d._inDays !== d._startDays || !Number.isFinite(job.next))) job.next = game.time.worldTime + Math.max(0, d._inDays) * DAY;
      if (!(job.every > 0)) job.next = null;
      const jobs = jobsOf(actor);
      const i = jobs.findIndex((j) => j.id === job.id);
      if (i >= 0) jobs[i] = job; else jobs.push(job);
      this.draft = null;
      await saveJobs(actor, jobs);
      this.redraw();
      // A first payday of today or earlier is paid at once.
      this.payroll.runDue();
    }

    async #saveTemplate() {
      const d = this.draft;
      if (!d) return;
      const list = foundry.utils.deepClone(game.settings.get(ID, "payTemplates") ?? []);
      const job = makeJob({ ...d, id: null, next: null });
      const i = list.findIndex((t) => t.title === job.title);
      if (i >= 0) list[i] = job; else list.push(job);
      await game.settings.set(ID, "payTemplates", list);
      ui.notifications.info(`"${job.title}" is in the job guide, under ${YOURS}.`);
    }

    /* -------- The guide -------- */

    #guide() {
      const actor = this.actor;
      const templates = game.settings.get(ID, "payTemplates") ?? [];
      const cats = [...Object.keys(GUIDE), READY, YOURS];
      const q = this.q.trim().toLowerCase();
      let rows;
      const lineRow = (g, cat) => {
        const w = g[1] * (this.boston ? BOSTON : 1);
        return `<tr><td>${esc(g[0])}${q ? `<small>${esc(cat)}</small>` : ""}</td><td class="r">${dollars(w)}</td><td class="r faint">${dollars(w / 40)}</td><td class="acts"><button type="button" class="btn small" data-act="use-line" data-cat="${esc(cat)}" data-i="${GUIDE[cat].indexOf(g)}">Use</button></td></tr>`;
      };
      const jobRow = (j, act, i, extra = "") => {
        const job = makeJob(j);
        return `<tr><td>${esc(job.title)}<small>${esc(describeRate(job))}${job.roll ? ` · ${esc(job.roll.label || job.roll.formula)}` : ""}</small></td><td class="r">${dollars(weekly(job))}</td><td class="r faint">${job.type === "hourly" ? dollars(job.rate) : ""}</td><td class="acts">${extra}<button type="button" class="btn small" data-act="${act}" data-i="${i}">Use</button></td></tr>`;
      };
      if (q) {
        rows = Object.entries(GUIDE).flatMap(([cat, list]) => list.filter((g) => g[0].toLowerCase().includes(q) || g[2].toLowerCase().includes(q)).map((g) => lineRow(g, cat)));
        rows.push(...PRESETS.map((p, i) => [p, i]).filter(([p]) => p.title.toLowerCase().includes(q)).map(([p, i]) => jobRow(p, "use-preset", i)));
        rows.push(...templates.map((p, i) => [p, i]).filter(([p]) => p.title.toLowerCase().includes(q)).map(([p, i]) => jobRow(p, "use-template", i)));
        rows = rows.join("");
      } else if (this.cat === READY) rows = PRESETS.map((p, i) => jobRow(p, "use-preset", i)).join("");
      else if (this.cat === YOURS) rows = templates.map((p, i) => jobRow(p, "use-template", i, `<button type="button" class="btn small danger" data-act="template-remove" data-i="${i}" aria-label="Remove"><i class="fa-solid fa-trash"></i></button>`)).join("");
      else rows = GUIDE[this.cat].map((g) => lineRow(g, this.cat)).join("");
      const survey = !q && GUIDE[this.cat];
      return `<div class="pr-guide pr-scroll">
        <div class="pr-head"><input data-keep="q" placeholder="Search jobs" value="${esc(this.q)}"><label class="pr-check-line"><input type="checkbox" data-keep="boston" ${this.boston ? "checked" : ""}> Boston pay (+10%)</label><span class="grow"></span>${actor ? `<span class="faint">Jobs go to <b>${esc(actor.name)}</b></span>` : ""}</div>
        ${q ? "" : `<div class="pr-cats">${cats.map((c) => `<button type="button" class="btn pill ${c === this.cat ? "on" : ""}" data-act="cat" data-value="${esc(c)}">${esc(c)}</button>`).join("")}</div>`}
        <table class="sb-table"><thead><tr><th>Job</th><th class="r">A week</th><th class="r">An hour</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="empty">${this.cat === YOURS && !q ? "Save a job as a template and it shows here." : "No job by that name. Make a new one."}</td></tr>`}</tbody></table>
        <p class="hint">${survey || q ? `Median weekly pay of full-time workers in the US, 1986 (Bureau of Labor Statistics, Monthly Labor Review, June 1987). Half earned more, half less. Boston pay adds 10%, an estimate for the Massachusetts boom. All workers: ${dollars(MEDIAN_1986)} a week. Minimum wage: $3.35 federal, ${dollars(MIN_WAGE_MA)} in Massachusetts. Tips, overtime and cash on the side are not counted.` : "Ready-made jobs are estimates for work the survey does not count, with payday rolls built in. Change anything once it is on a character."}</p></div>`;
    }

    #use(job) {
      if (!this.actor) return ui.notifications.warn("There is no character to give it to.");
      this.#edit({ ...job, id: null }, true);
    }

    async #click(e) {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      const act = el.dataset.act, actor = this.actor;
      const jobs = () => jobsOf(actor);
      switch (act) {
        case "tab": this.tab = el.dataset.value; return this.redraw();
        case "who": this.actorId = el.dataset.id; this.draft = null; return this.redraw();
        case "cat": this.cat = el.dataset.value; return this.redraw();
        case "new": return this.#edit({ title: "New job", type: "hourly", rate: MIN_WAGE_MA, units: 40 }, true);
        case "edit": { const j = jobs().find((x) => x.id === el.dataset.id); return j && this.#edit(j); }
        case "cancel": this.draft = null; return this.redraw();
        case "save": return this.#save();
        case "template": return this.#saveTemplate();
        case "pay-now": return this.payroll.payNow(actor, el.dataset.id);
        case "toggle": { const list = jobs(), j = list.find((x) => x.id === el.dataset.id); if (!j) return; j.active = !j.active; if (j.active && j.every > 0 && Number.isFinite(j.next) && j.next < game.time.worldTime) j.next = game.time.worldTime + j.every * DAY; return saveJobs(actor, list); }
        case "remove": {
          const j = jobs().find((x) => x.id === el.dataset.id);
          if (!j || !(await foundry.applications.api.DialogV2.confirm({ window: { title: "Remove a job" }, content: `<p>Take <b>${esc(j.title)}</b> off ${esc(actor.name)}? Their pay stubs and checks stay.</p>` }))) return;
          return saveJobs(actor, jobs().filter((x) => x.id !== j.id));
        }
        case "extra-add": { const h = homeOf(actor); h.extras.push({ label: "A bill", amount: 50, monthly: true }); return saveHome(actor, h); }
        case "extra-remove": { const h = homeOf(actor); h.extras.splice(Number(el.dataset.i), 1); return saveHome(actor, h); }
        case "forgive": { const h = homeOf(actor); h.owed = 0; return saveHome(actor, h); }
        case "cash": { const item = await fromUuid(el.dataset.uuid); return item && this.payroll.cash(item); }
        case "band-add": { const b = this.draft.roll.bands, last = b.at(-1); b.push({ upTo: (last?.upTo ?? 0) + 2, factor: 1, text: "" }); return this.redraw(); }
        case "band-remove": this.draft.roll.bands.splice(Number(el.dataset.i), 1); return this.redraw();
        case "bonus-add": this.draft.bonuses.push({ id: foundry.utils.randomID(), label: "Bonus", amount: 50, percent: false, when: "once", chance: 6, cash: false }); return this.redraw();
        case "bonus-remove": this.draft.bonuses.splice(Number(el.dataset.i), 1); return this.redraw();
        case "use-line": return this.#use(guideJob(GUIDE[el.dataset.cat][Number(el.dataset.i)], { boston: this.boston }));
        case "use-preset": return this.#use(PRESETS[Number(el.dataset.i)]);
        case "use-template": return this.#use((game.settings.get(ID, "payTemplates") ?? [])[Number(el.dataset.i)]);
        case "template-remove": { const list = foundry.utils.deepClone(game.settings.get(ID, "payTemplates") ?? []); list.splice(Number(el.dataset.i), 1); await game.settings.set(ID, "payTemplates", list); return this.redraw(); }
      }
    }
  };
  return BoardClass;
}

/* ---------------------------------------- */
/*  A player's Your pay                      */
/* ---------------------------------------- */

let MineClass = null;
function mineClass() {
  if (MineClass) return MineClass;
  const { ApplicationV2 } = foundry.applications.api;
  MineClass = class YourPay extends ApplicationV2 {
    static DEFAULT_OPTIONS = { id: "kgc-your-pay", tag: "div", classes: ["kgc-ui", "kgc-switchboard", "kgc-payroll"], window: { title: "Your pay", icon: "fa-solid fa-money-check-dollar", resizable: true }, position: { width: 460, height: 560 } };
    constructor({ ui }) { super(); this.ui = ui; }
    redraw() { if (this.rendered) keep(this.element, () => this.#draw()); }
    async _renderHTML() { return ""; }
    _replaceHTML(html, content) {
      if (!content.kgcBound) {
        content.kgcBound = true;
        content.addEventListener("click", async (e) => {
          const el = e.target.closest('[data-act="cash"]');
          if (!el) return;
          el.disabled = true;
          const item = await fromUuid(el.dataset.uuid);
          if (item) await this.ui.payroll.cash(item);
          this.redraw();
        });
      }
      this.#draw(content);
    }
    #draw(content = this.element?.querySelector(".window-content")) {
      if (!content) return;
      const mine = game.actors.filter((a) => a.type !== "group" && a.isOwner && (jobsOf(a).length || checksOf(a).length || stubsOf(a).length));
      content.innerHTML = `<div class="pr-body pr-scroll pad">${mine.length ? mine.map((a) => {
        const jobs = jobsOf(a).filter((j) => j.active), checks = checksOf(a), stubs = stubsOf(a).slice(0, 3), wallet = this.ui.wallet(a);
        return `<section class="pr-mine"><div class="pr-head"><h3>${esc(a.name)}</h3><span class="grow"></span>${wallet ? `<span class="pr-wallet"><i class="fa-solid fa-wallet"></i> ${wallet}</span>` : ""}</div>
          ${jobs.map((j) => `<div class="pr-job slim"><b>${esc(j.title)}</b>${j.employer ? ` <small>${esc(j.employer)}</small>` : ""}<div class="pr-meta">${esc(describeRate(j))} · ${esc(whenLine(j))}</div></div>`).join("") || `<p class="empty">No job.</p>`}
          ${(() => { const h = homeOf(a); if (!h.on) return ""; const b = homeBills(h), take = weeklyTakeHome(jobsOf(a)); return `<div class="pr-sum"><div><small>Takes home a week</small><b>${dollars(take)}</b></div><div><small>Bills a week</small><b>${dollars(b.perWeek)}</b></div><div class="${take - b.perWeek < 0 ? "neg" : ""}"><small>Left over</small><b>${dollars(take - b.perWeek)}</b></div></div>${h.owed > 0 ? `<p class="warn-line"><i class="fa-solid fa-triangle-exclamation"></i> Behind on the bills: ${dollars(h.owed)} owed.</p>` : ""}`; })()}
          ${checks.length ? `<h4>Checks to cash</h4><div class="pr-checks">${checks.map((i) => `<div class="pr-check"><img src="${esc(i.img)}" alt=""><span>${esc(i.flags[ID].check.from)}<small>${esc(dateLabel(i.flags[ID].check.time))}</small></span><b>${dollars(i.flags[ID].check.amount)}</b><button type="button" class="btn small primary" data-act="cash" data-uuid="${i.uuid}">Cash it</button></div>`).join("")}</div>` : ""}
          ${stubs.length ? `<h4>Last paydays</h4><div class="pr-stubs">${stubs.map((s) => stubHtml(s)).join("")}</div>` : ""}</section>`;
      }).join("") : `<p class="empty">None of your characters has a job yet.</p>`}</div>`;
    }
  };
  return MineClass;
}
