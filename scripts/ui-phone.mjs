// The phones' windows, one look for every device: a place's phone (a desk phone or a payphone) and
// a pager share the same parts (a lit screen, tabs, a keypad or list, a row of buttons) and differ
// only in skin and in what they can do. Also the pager dock (players carrying a pager), the call
// strip (the GM: calls waiting for an answer) and the switchboard (the GM: every number, call and
// pager in the world).

import {
  DEVICES, ENDINGS, PAGER_MODELS, SERVICES, actorsAt, bookOf, directory, formatNumber, givePager, myPagers, nameFor,
  newNumber, pagerOf, phonesHere, placePhone, restorePager, sameNumber, setPagerContacts, sound, SOUND, speakerAt
} from "./phones.mjs";
import { contact, coinCopper, digits, duplicates, findContact, mergeBooks, putContact, sortBook } from "./phone-core.mjs";
import { formatMoney, walletValue } from "./money.mjs";
import { uiBounds } from "./ui-trail.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const KEYS = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PRS"], ["8", "TUV"], ["9", "WXY"], ["*", ""], ["0", "OPER"], ["#", ""]];

/** The world clock as "9:42 PM" (Calendaria's when it drives the clock). */
function clock(worldTime = game.time.worldTime) {
  const c = game.time.calendar?.timeToComponents?.(worldTime);
  const h = c?.hour ?? new Date().getHours(), m = c?.minute ?? new Date().getMinutes();
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** When a page came: the world clock's time, or (pages from Unsleeping Pagers) the real date. */
const when = (r) => (Number.isFinite(r?.time) ? clock(r.time) : r?.at ? new Date(r.at).toLocaleDateString([], { month: "short", day: "numeric" }) : "");
const since = (t) => { const s = Math.max(0, Math.floor((Date.now() - (t ?? Date.now())) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const seg = (act, value, choices) => `<div class="seg" role="radiogroup">${choices.map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === value}" class="${k === value ? "on" : ""}" data-act="${act}" data-value="${k}">${l}</button>`).join("")}</div>`;
const tabs = (list, on) => `<nav class="dev-tabs" role="tablist">${list.map(([k, l, i]) => `<button type="button" role="tab" aria-selected="${k === on}" class="${k === on ? "on" : ""}" data-act="tab" data-value="${k}"><i class="fa-solid ${i}"></i> ${l}</button>`).join("")}</nav>`;

/** Who a call's end is, for the GM: "Faneuil Hall (555-0142)". */
function endLabel(end) {
  if (!end) return "";
  if (end.kind === "gm") return end.name || "GM";
  const actor = end.actorId ? game.actors.get(end.actorId) : null;
  const who = end.kind === "place" ? end.name : end.name ?? (end.kind === "none" ? "Not in service" : "");
  return [actor ? `${actor.name} at ${who}` : who, end.number ? formatNumber(end.number) : ""].filter(Boolean).join(" · ");
}

/** Keep typed values, the focus and the scroll across a redraw. */
function keep(root, draw) {
  const values = new Map([...root.querySelectorAll("[data-keep]")].map((el) => [el.dataset.keep, el.value]));
  const f = document.activeElement?.closest?.("[data-keep]");
  const focus = f && root.contains(f) ? { key: f.dataset.keep, start: f.selectionStart, end: f.selectionEnd } : null;
  const scroll = root.querySelector(".dev-body")?.scrollTop ?? 0;
  draw();
  for (const el of root.querySelectorAll("[data-keep]")) if (values.has(el.dataset.keep)) el.value = values.get(el.dataset.keep);
  if (focus) { const el = root.querySelector(`[data-keep="${focus.key}"]`); el?.focus(); try { el?.setSelectionRange(focus.start, focus.end); } catch { /* not text */ } }
  const body = root.querySelector(".dev-body");
  if (body) body.scrollTop = scroll;
}

export class PhoneUI {
  /** phones: the Phones service; openCard(city, id); dollarRate(). */
  constructor({ phones, openCard, dollarRate }) {
    Object.assign(this, { phones, openCard, dollarRate });
    this.windows = new Map();
    this.board = null;
  }

  install() {
    const redrawDock = () => this.dock();
    Hooks.on("ready", () => { this.dock(); this.strip(); });
    for (const h of ["updateItem", "createItem", "deleteItem", "updateUser"]) Hooks.on(h, (doc) => { if (h !== "updateUser" || doc === game.user) redrawDock(); if (h.endsWith("Item") && pagerOf(doc)) this.refresh(); });
    Hooks.on("updateActor", (a, ch) => { if (foundry.utils.hasProperty(ch, `flags.${ID}.book`) || "system" in ch) this.refresh(); });
    for (const h of ["collapseSidebar", "renderSidebar", "renderHotbar", "canvasReady"]) Hooks.on(h, () => this.#placeDock());
    window.addEventListener("resize", () => this.#placeDock());
    // Tokens moving change who is at a phone.
    for (const h of ["updateToken", "createToken", "deleteToken", "canvasReady"]) Hooks.on(h, () => this.refresh({ only: "place" }));
    // The GM's numbers and the places' phones are world settings.
    setInterval(() => { for (const app of this.windows.values()) app.tick?.(); this.board?.tick?.(); this.#tickStrip(); }, 1000);
  }

  /** Redraw every open device window (and the switchboard). */
  refresh({ only = null } = {}) {
    for (const app of this.windows.values()) if (!only || app.kind === only) app.redraw();
    this.board?.redraw();
    this.strip();
  }

  /* ---------------------------------------- */
  /*  Events from the phone service            */
  /* ---------------------------------------- */

  /** A call changed: redraw, and open the place's phone for those it rings for. */
  onCall(call, before, dropped) {
    const me = game.user.id;
    if (!dropped && call.state === "ringing" && before?.state !== "ringing" && call.to?.kind === "place" && call.ringUsers?.includes(me)) {
      this.openPlace(call.to.city, call.to.id, { ringing: true });
      ui.notifications.info(`The phone is ringing at ${call.to.name}.`);
    }
    if (!dropped && call.state === "ended" && call.from?.userId === me && before?.state !== "ended") {
      // The coin comes back down the chute unless the call used it.
      const app = this.windows.get(`place:${call.from.city}:${call.from.id}`);
      if (app) app.coin = false;
    }
    this.refresh();
  }

  /** A page arrived on a pager this user carries. */
  onPage(msg) {
    const item = game.actors.get(msg.actorId)?.items.get(msg.itemId), p = pagerOf(item);
    if (!p) return;
    const alert = p.alert ?? "beep";
    if (alert === "beep") sound(SOUND.beep);
    if (alert !== "silent") sound(SOUND.vibrate, { vol: alert === "vibrate" ? 1 : 0.5 });
    const dock = document.getElementById("kgc-pager-dock");
    dock?.classList.remove("buzz");
    void dock?.offsetWidth;
    dock?.classList.add("buzz");
    const who = nameFor(msg.entry.callback, { item }) || msg.entry.callback;
    ui.notifications.info(`${item.parent.name}'s pager: ${msg.entry.text}${who && who !== msg.entry.text ? ` (${who})` : ""}`);
    setTimeout(() => this.refresh({ only: "pager" }), 200);
  }

  /* ---------------------------------------- */
  /*  Opening                                  */
  /* ---------------------------------------- */

  /** A place's phone. Players only where their character is (they still see it ring and its number). */
  openPlace(city, id, { number = "", ringing = false } = {}) {
    const e = placePhone(city, id);
    if (!e) return ui.notifications.warn("KG Cities: that place has no phone.");
    if (!game.user.isGM && !ringing && !speakerAt(e)) return ui.notifications.warn(`You need to be at ${e.name} to use its phone.`);
    return this.#open(`place:${city}:${id}`, { kind: "place", city, id, number });
  }

  openPager(item) {
    if (!pagerOf(item)) return;
    if (!game.user.isGM && !item.isOwner) return ui.notifications.warn("That pager is not yours.");
    return this.#open(`pager:${item.uuid}`, { kind: "pager", uuid: item.uuid });
  }

  #open(key, options) {
    let app = this.windows.get(key);
    if (app?.rendered) {
      if (options.number) { app.dialed = digits(options.number); app.tab = "keypad"; }
      app.redraw();
      app.bringToFront?.();
      return app;
    }
    app = new (deviceClass())({ ui: this, key, ...options });
    this.windows.set(key, app);
    app.render({ force: true });
    return app;
  }

  /** Call a number back from wherever this user's character is: a phone there, else they are told. */
  callBack(number) {
    if (game.user.isGM) return this.switchboard({ dial: number });
    const here = phonesHere();
    if (!here.length) return ui.notifications.warn("There is no phone here. Find a payphone, or a place with a phone.");
    const e = here.find((p) => p.device === "line") ?? here[0];
    return this.openPlace(e.city, e.id, { number });
  }

  switchboard({ dial = "", tab = null } = {}) {
    if (!game.user.isGM) return;
    if (!this.board?.rendered) { this.board = new (boardClass())({ ui: this }); }
    if (dial) { this.board.dialed = digits(dial); this.board.tab = "calls"; }
    if (tab) this.board.tab = tab;
    this.board.render({ force: true });
    this.board.bringToFront?.();
  }

  /* ---------------------------------------- */
  /*  The pager dock (players with a pager)    */
  /* ---------------------------------------- */

  dock() {
    const pagers = game.user.isGM ? [] : myPagers();
    let el = document.getElementById("kgc-pager-dock");
    if (!pagers.length) { el?.remove(); return; }
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.id = "kgc-pager-dock";
      el.className = "kgc-ui kgc-panel";
      el.addEventListener("click", () => this.openPager(myPagers()[0]));
      el.addEventListener("animationend", () => el.classList.remove("buzz"));
      document.body.append(el);
    }
    const p = pagerOf(pagers[0]), unread = pagers.reduce((n, i) => n + (pagerOf(i).unread ?? 0), 0);
    el.dataset.tooltip = `${pagers[0].parent.name}'s pager, ${formatNumber(p.number)}`;
    el.setAttribute("aria-label", `Pager${unread ? `, ${unread} new` : ""}`);
    el.innerHTML = `<span class="dock-lcd">${unread ? `${unread} NEW` : esc(clock())}</span><i class="fa-solid fa-pager"></i>${unread ? `<span class="dock-badge">${unread}</span>` : ""}`;
    this.#placeDock();
  }

  #placeDock() {
    const el = document.getElementById("kgc-pager-dock");
    if (!el) return;
    const b = uiBounds();
    el.style.right = `${Math.max(8, window.innerWidth - b.right + 12)}px`;
    el.style.bottom = `${Math.max(8, window.innerHeight - b.bottom + 12)}px`;
  }

  /* ---------------------------------------- */
  /*  The call strip (GM)                      */
  /* ---------------------------------------- */

  /** Calls the GM may answer (ringing at a GM number, a service, nowhere, or a place nobody is at) and the GM's own. */
  strip() {
    if (!game.user?.isGM) return;
    const calls = [...this.phones.calls.values()].filter((c) => c.state !== "ended" && (c.gmRings || c.from?.userId === game.user.id || c.answeredBy?.userId === game.user.id || (c.state === "ringing" && c.to?.kind === "place")));
    let el = document.getElementById("kgc-call-strip");
    if (!calls.length) { el?.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "kgc-call-strip";
      el.className = "kgc-ui kgc-panel";
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const id = b.dataset.call;
        if (b.dataset.act === "answer") this.phones.answer(id);
        else if (b.dataset.act === "hangup") this.phones.hangup(id);
        else if (b.dataset.act === "intercept") this.phones.intercept(id);
        else if (b.dataset.act === "board") this.switchboard({ tab: "calls" });
      });
      document.body.append(el);
    }
    el.innerHTML = calls.map((c) => {
      const ring = c.state === "ringing", nobody = ring && c.to?.kind === "place" && !c.ringUsers?.length;
      const state = ring ? (c.gmRings ? "Ringing for you" : nobody ? "Ringing, nobody there" : "Ringing") : c.state === "paging" ? "Paging" : c.state === "connected" ? `Connected ${since(c.connectedAt)}` : "Dialing";
      const buttons = [
        ring && c.from?.userId !== game.user.id ? `<button type="button" class="btn small primary" data-act="answer" data-call="${c.id}"><i class="fa-solid fa-phone"></i> Answer</button>` : "",
        ring && c.to?.kind === "none" ? `<button type="button" class="btn small" data-act="intercept" data-call="${c.id}">Not in service</button>` : "",
        `<button type="button" class="btn small danger" data-act="hangup" data-call="${c.id}" aria-label="Hang up" data-tooltip="Hang up"><i class="fa-solid fa-phone-slash"></i></button>`
      ].join("");
      return `<div class="strip-call ${ring ? "ringing" : ""}"><i class="fa-solid ${ring ? "fa-bell" : "fa-phone-volume"}"></i>
        <button type="button" class="who" data-act="board" data-tooltip="Open the switchboard"><span><b>${esc(endLabel(c.from))}</b> <i class="fa-solid fa-arrow-right"></i> <b>${esc(endLabel(c.to))}</b></span><small data-since="${c.id}">${esc(state)}</small></button>${buttons}</div>`;
    }).join("");
  }
  #tickStrip() {
    const el = document.getElementById("kgc-call-strip");
    if (!el) return;
    for (const s of el.querySelectorAll("[data-since]")) { const c = this.phones.calls.get(s.dataset.since); if (c?.state === "connected") s.textContent = `Connected ${since(c.connectedAt)}`; }
  }
}

/* ---------------------------------------- */
/*  A device window                          */
/* ---------------------------------------- */

let DeviceClass = null;
function deviceClass() {
  if (DeviceClass) return DeviceClass;
  const { ApplicationV2 } = foundry.applications.api;
  DeviceClass = class DeviceApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = { tag: "div", classes: ["kgc-ui", "kgc-device-window"], window: { icon: "fa-solid fa-phone", resizable: false }, position: { width: 330, height: "auto" } };

    constructor(options) {
      super({ id: `kgc-dev-${foundry.utils.randomID()}` });
      Object.assign(this, { ui: options.ui, key: options.key, kind: options.kind, city: options.city, placeId: options.id, uuid: options.uuid });
      this.dialed = digits(options.number ?? "");
      this.tab = options.kind === "pager" ? "pages" : "keypad";
      this.coin = false;
      this.editing = null;
      this.message = "";
    }

    get phones() { return this.ui.phones; }
    get item() { return this.uuid ? fromUuidSync(this.uuid, { strict: false }) : null; }
    get title() {
      if (this.kind === "pager") return this.item ? `${this.item.parent?.name ?? ""}: ${this.item.name}` : "Pager";
      const e = placePhone(this.city, this.placeId);
      return e ? `${e.name}: ${DEVICES[e.device].label}` : "Phone";
    }

    redraw() { if (this.rendered) keep(this.element, () => this.#draw()); }
    tick() {
      const el = this.element?.querySelector("[data-timer]");
      if (el) el.textContent = since(Number(el.dataset.timer));
      const c = this.element?.querySelector("[data-clock]");
      if (c) c.textContent = clock();
    }

    async _renderHTML() { return ""; }
    _replaceHTML(html, content) {
      if (!content.kgcBound) {
        content.kgcBound = true;
        content.addEventListener("click", (e) => this.#click(e));
        content.addEventListener("keydown", (e) => this.#key(e));
        content.addEventListener("submit", (e) => e.preventDefault());
        content.tabIndex = -1;
      }
      this.#draw(content);
    }

    #draw(content = this.element?.querySelector(".window-content")) {
      if (!content) return;
      const t = this.element?.querySelector(".window-title");
      if (t) t.textContent = this.title;
      content.innerHTML = this.kind === "pager" ? this.#pager() : this.#place();
    }

    _onClose(options) {
      super._onClose?.(options);
      this.ui.windows.delete(this.key);
      // Walking away from a ringing phone lets it ring; hanging up the receiver ends your call.
      const call = this.kind === "place" ? this.phones.onPlace(this.city, this.placeId) : null;
      if (call && call.state !== "ended") {
        if (call.from?.userId === game.user.id || call.answeredBy?.userId === game.user.id) this.phones.hangup(call.id);
        else this.phones.silence(call.id);
      }
    }

    /* -------- A place's phone -------- */

    /** What the phone is doing for this user: idle, dialing, ringing, paging, connected, incoming, inuse, ended. */
    #mode(e) {
      const call = this.phones.onPlace(this.city, this.placeId), me = game.user.id, gm = game.user.isGM;
      if (!call) return { mode: "idle" };
      const out = call.from?.kind === "place" && call.from.city === this.city && call.from.id === this.placeId;
      const mineOut = out && call.from.userId === me, answered = call.answeredBy?.userId === me;
      if (call.state === "ended") return { call, mode: mineOut || answered || call.ringUsers?.includes(me) || gm ? "ended" : "idle" };
      if (mineOut) return { call, mode: call.state };
      if (!out && call.state === "ringing" && call.from?.userId !== me && (call.ringUsers?.includes(me) || gm)) return { call, mode: "incoming" };
      if (answered) return { call, mode: "connected" };
      return { call, mode: "inuse" };
    }

    #place() {
      const e = placePhone(this.city, this.placeId);
      if (!e) return `<div class="kgc-device"><p class="empty">This phone is gone.</p></div>`;
      const gm = game.user.isGM, speaker = gm ? null : speakerAt(e);
      const { call, mode } = this.#mode(e);
      const pay = e.device === "payphone" && !gm;
      const free = SERVICES[this.dialed]?.free;
      const known = (n) => (gm ? endLabel(call?.to) : nameFor(n, { actor: speaker }));
      let status = mode.toUpperCase(), main = "", sub = "", blink = false, body = "", actions = "";

      switch (mode) {
        case "idle": {
          status = speaker || gm ? (pay ? (this.coin || free ? "DIAL" : "DEPOSIT 25¢") : "DIAL TONE") : "NOT HERE";
          main = this.dialed ? formatNumber(this.dialed) : "&nbsp;";
          const c = this.dialed ? (gm ? directory().find((x) => sameNumber(x.number, this.dialed))?.name : findContact(this.#book(speaker), this.dialed)?.name) : "";
          sub = c ? esc(c) : !speaker && !gm ? "You are not at this phone." : pay && !this.coin ? "Calls are 25¢. 911 and the operator are free." : "";
          const ready = (speaker || gm) && digits(this.dialed).length && (!pay || this.coin || free);
          actions = `<button type="button" class="key-act" data-act="back" aria-label="Delete a digit" ${this.dialed ? "" : "disabled"}><i class="fa-solid fa-delete-left"></i></button>
            <button type="button" class="call go" data-act="call" ${ready ? "" : "disabled"}><i class="fa-solid fa-phone"></i> Call</button>`;
          break;
        }
        case "dialing": status = "DIALING"; main = esc(formatNumber(call.to.number)); actions = this.#hangupBtn(); break;
        case "ringing": status = "RINGING"; main = esc(formatNumber(call.to.number)); sub = esc(known(call.to.number)); actions = this.#hangupBtn(); break;
        case "paging": {
          const model = directory().find((x) => x.kind === "pager" && sameNumber(x.number, call.to.number))?.model ?? "numeric";
          status = "PAGING";
          main = esc(formatNumber(call.to.number));
          sub = model === "tone" ? "Beep. The pager will sound." : model === "alpha" ? "Operator: what is the message?" : "Enter a number to call back, then #.";
          if (model === "alpha") body = `<div class="dev-form"><textarea data-keep="pageText" maxlength="80" placeholder="Message (80 letters)"></textarea><input data-keep="pageCallback" placeholder="Number to call back (optional)" value="${esc(e.number)}"></div>`;
          if (model === "numeric") main = this.dialed ? esc(formatNumber(this.dialed)) : "<span class=\"faint\">ENTER NUMBER</span>";
          actions = `${this.#hangupBtn()}${model === "numeric" ? `<button type="button" class="key-act" data-act="use-own" data-tooltip="This phone's own number">${esc(formatNumber(e.number))}</button>` : ""}<button type="button" class="call go" data-act="send-page"><i class="fa-solid fa-paper-plane"></i> Send</button>`;
          this.paging = model;
          break;
        }
        case "connected": status = "CONNECTED"; main = `<span data-timer="${call.connectedAt}">${since(call.connectedAt)}</span>`;
          sub = esc(gm ? `${endLabel(call.from)} ↔ ${endLabel(call.to)}` : call.from?.userId === game.user.id ? known(call.to.number) || formatNumber(call.to.number) : "On the line");
          actions = this.#hangupBtn(); break;
        case "incoming": status = "RINGING"; blink = true; main = '<i class="fa-solid fa-bell"></i>'; sub = gm ? esc(`From ${endLabel(call.from)}`) : "Someone is calling.";
          actions = `<button type="button" class="call stop" data-act="let-ring">Let it ring</button><button type="button" class="call go" data-act="pickup"><i class="fa-solid fa-phone"></i> Pick up</button>`; break;
        case "inuse": {
          const who = call.answeredBy?.userId ? call.answeredBy.name : call.from?.actorId ? game.actors.get(call.from.actorId)?.name : "";
          status = "IN USE"; main = '<i class="fa-solid fa-phone-volume"></i>'; sub = esc(who ? `${who} is on the phone.` : "Someone is on the phone.");
          if (gm) actions = this.#hangupBtn("Cut the line");
          break;
        }
        case "ended": {
          status = "HUNG UP"; main = '<i class="fa-solid fa-phone-slash"></i>';
          const coinBack = call.coin && !call.paid && call.reason !== "coin" && call.from?.userId === game.user.id;
          sub = esc(`${ENDINGS[call.reason] ?? "Call ended."}${coinBack ? " Your coin is returned." : ""}`);
          break;
        }
      }
      const canKey = ["idle", "paging", "connected"].includes(mode) && (gm || speaker) && !(mode === "paging" && this.paging !== "numeric");
      if (!body) body = this.tab === "book" && mode === "idle" ? this.#bookPane(speaker, e) : this.#keypad(!canKey);
      const coin = pay ? this.#coinSlot(speaker, mode) : "";
      return `<div class="kgc-device skin-${e.device}">
        <div class="dev-top"><span class="dev-brand">${esc(e.name)}</span><span class="dev-sub">${esc(formatNumber(e.number))}</span></div>
        ${this.#screen(status, main, sub, blink)}
        ${coin}
        ${mode === "idle" ? tabs([["keypad", "Keypad", "fa-table-cells"], ["book", gm ? "Directory" : "Address book", "fa-address-book"]], this.tab) : ""}
        <div class="dev-body">${body}</div>
        ${actions ? `<div class="dev-actions">${actions}</div>` : ""}
        ${speaker ? `<p class="dev-foot"><i class="fa-solid fa-user"></i> ${esc(speaker.name)}${pay ? ` · ${esc(formatMoney(walletValue(speaker.system?.currency), this.ui.dollarRate()))}` : ""}</p>` : ""}
      </div>`;
    }

    #screen(status, main, sub, blink = false) {
      return `<div class="dev-screen ${blink ? "blink" : ""}" role="status" aria-live="polite">
        <div class="lcd-status"><span>${status}</span><span data-clock>${esc(clock())}</span></div>
        <div class="lcd-main">${main}</div><div class="lcd-sub">${sub}</div></div>`;
    }

    #hangupBtn(label = "Hang up") { return `<button type="button" class="call stop" data-act="hangup"><i class="fa-solid fa-phone-slash"></i> ${label}</button>`; }

    #keypad(disabled) {
      return `<div class="keypad">${KEYS.map(([k, l]) => `<button type="button" class="key" data-act="key" data-value="${k}" ${disabled ? "disabled" : ""}><b>${k}</b><small>${l}</small></button>`).join("")}</div>`;
    }

    #coinSlot(speaker, mode) {
      const rate = this.ui.dollarRate(), need = coinCopper(rate);
      const has = speaker?.system?.currency ? walletValue(speaker.system.currency) >= need : !!speaker;
      const locked = mode !== "idle";
      return `<div class="dev-coin"><button type="button" class="coin-slot ${this.coin ? "in" : ""}" data-act="coin" ${locked || !speaker || (!has && !this.coin) ? "disabled" : ""}
        data-tooltip="${this.coin ? "Take the quarter back" : has ? "Put in a quarter" : "No quarter to spare"}"><span class="slot"></span>${this.coin ? "25¢ IN" : "INSERT 25¢"}</button>
        <span class="hint">${has || this.coin ? "Charged when the call goes through." : `${esc(speaker?.name ?? "You")} has less than a quarter.`}</span></div>`;
    }

    /** The address book a player sees at a phone: their own, with their pagers' memories and the phone book. */
    #book(speaker) {
      if (!speaker) return [];
      return mergeBooks(bookOf(speaker), speaker.items.filter((i) => pagerOf(i)).flatMap((i) => pagerOf(i).contacts ?? []));
    }

    #bookPane(speaker, here) {
      if (game.user.isGM) {
        const rows = directory().filter((x) => x.number && !(x.kind === "place" && x.city === here.city && x.id === here.id));
        const label = { place: "Places", gm: "Your numbers", pager: "Pagers" };
        return ["place", "gm", "pager"].map((k) => {
          const list = rows.filter((x) => x.kind === k).sort((a, b) => a.name.localeCompare(b.name));
          return list.length ? `<h5>${label[k]}</h5><ul class="dev-list">${list.map((x) => `<li><button type="button" class="pick" data-act="pick" data-value="${esc(x.number)}"><span>${esc(x.name)}${x.kind === "pager" ? ` <small>(pager)</small>` : ""}</span><span class="num">${esc(formatNumber(x.number))}</span></button></li>`).join("")}</ul>` : "";
        }).join("") || `<p class="empty">No numbers yet. Give places phones on their cards.</p>`;
      }
      if (!speaker) return `<p class="empty">You are not at this phone.</p>`;
      const own = sortBook(this.#book(speaker));
      // The phone book: places the players know of, with a listed line.
      const listed = directory().filter((x) => x.kind === "place" && x.device === "line" && x.visibility === "discovered" && !findContact(own, x.number)).sort((a, b) => a.name.localeCompare(b.name));
      const row = (c) => this.editing === c.id ? this.#contactForm(c) : `<li><button type="button" class="pick" data-act="pick" data-value="${esc(c.number)}"><span>${esc(c.name || "No name")}</span><span class="num">${esc(formatNumber(c.number))}</span></button>
        ${findContact(bookOf(speaker), c.number) ? `<button type="button" class="mini" data-act="edit" data-value="${esc(c.id)}" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>` : ""}</li>`;
      return `<ul class="dev-list">${own.map(row).join("") || `<li class="empty">Nobody written down yet.</li>`}</ul>
        ${this.editing === "new" ? `<ul class="dev-list">${this.#contactForm({ id: "new", name: "", number: this.dialed ? formatNumber(this.dialed) : "" })}</ul>` : `<button type="button" class="btn small" data-act="edit" data-value="new"><i class="fa-solid fa-plus"></i> Write a number down</button>`}
        ${listed.length ? `<h5>Phone book</h5><ul class="dev-list">${listed.map((x) => `<li><button type="button" class="pick" data-act="pick" data-value="${esc(x.number)}"><span>${esc(x.name)}</span><span class="num">${esc(formatNumber(x.number))}</span></button></li>`).join("")}</ul>` : ""}
        <p class="hint">${esc(speaker.name)}'s address book. It stays with them, whatever pager they carry.</p>`;
    }

    #contactForm(c) {
      return `<li class="edit" data-contact="${esc(c.id)}"><input data-keep="cName:${esc(c.id)}" placeholder="Name" value="${esc(c.name)}"><input data-keep="cNumber:${esc(c.id)}" placeholder="Number" value="${esc(c.number)}">
        <div class="row">${c.id !== "new" ? `<button type="button" class="btn small danger" data-act="contact-remove"><i class="fa-solid fa-trash"></i></button>` : ""}<span class="grow"></span>
        <button type="button" class="btn small" data-act="contact-cancel">Cancel</button><button type="button" class="btn small primary" data-act="contact-save">Save</button></div></li>`;
    }

    /* -------- A pager -------- */

    #pager() {
      const item = this.item, p = pagerOf(item);
      if (!p) return `<div class="kgc-device skin-pager"><p class="empty">This pager is gone.</p></div>`;
      const m = PAGER_MODELS[p.model] ?? PAGER_MODELS.numeric;
      const recent = [...(p.recent ?? [])].reverse(), last = recent[0];
      // Opened: the new pages are read.
      if (p.unread && item.isOwner && !game.user.isGM) item.update({ [`flags.${ID}.pager.unread`]: 0 }).catch(() => {});
      const who = (r) => nameFor(r.callback, { item }) || (r.callback ? formatNumber(r.callback) : "");
      const main = last ? esc(last.text) : "READY";
      const sub = last ? esc([who(last) && who(last) !== last.text ? who(last) : "", when(last)].filter(Boolean).join(" · ")) : "No pages yet.";
      let body = "";
      if (this.tab === "pages") {
        body = recent.length ? `<ul class="dev-list pages">${recent.map((r) => this.editing === r.id ? this.#contactForm({ id: r.id, name: "", number: r.callback })
          : `<li><div class="page"><span class="when">${esc(when(r))}</span><span class="text">${esc(r.text)}</span>${who(r) && who(r) !== r.text ? `<span class="from">${esc(who(r))}</span>` : ""}</div>
            ${r.callback && !nameFor(r.callback, { item }) ? `<button type="button" class="mini" data-act="edit" data-value="${esc(r.id)}" data-tooltip="Save this number"><i class="fa-solid fa-user-plus"></i></button>` : ""}
            ${r.callback ? `<button type="button" class="mini" data-act="callback" data-value="${esc(r.callback)}" data-tooltip="Call back"><i class="fa-solid fa-phone"></i></button>` : ""}
            <button type="button" class="mini" data-act="page-remove" data-value="${esc(r.id)}" aria-label="Delete"><i class="fa-solid fa-xmark"></i></button></li>`).join("")}</ul>`
          : `<p class="empty">No pages yet. Your number is ${esc(formatNumber(p.number))}.</p>`;
      } else if (this.tab === "memory") {
        const list = sortBook(p.contacts ?? []);
        const book = bookOf(item.parent), missing = book.filter((c) => !findContact(p.contacts ?? [], c.number)).length;
        body = `<ul class="dev-list">${list.map((c) => this.editing === c.id ? this.#contactForm(c) : `<li><button type="button" class="pick" data-act="callback" data-value="${esc(c.number)}" data-tooltip="Call"><span>${esc(c.name || "No name")}</span><span class="num">${esc(formatNumber(c.number))}</span></button>
            <button type="button" class="mini" data-act="edit" data-value="${esc(c.id)}" aria-label="Edit"><i class="fa-solid fa-pen"></i></button></li>`).join("") || `<li class="empty">Nothing in memory.</li>`}</ul>
          ${this.editing === "new" ? `<ul class="dev-list">${this.#contactForm({ id: "new", name: "", number: "" })}</ul>` : `<button type="button" class="btn small" data-act="edit" data-value="new"><i class="fa-solid fa-plus"></i> Add a number</button>`}
          ${missing ? `<button type="button" class="btn small" data-act="restore"><i class="fa-solid fa-rotate"></i> Copy ${missing} from ${esc(item.parent.name)}'s address book</button>` : ""}
          <p class="hint">Numbers saved here are copied into ${esc(item.parent.name)}'s address book too, so a new pager starts with them.</p>`;
      } else {
        body = `<div class="dev-form"><label>Alert</label>${seg("alert", p.alert ?? "beep", [["beep", "Beep"], ["vibrate", "Vibrate"], ["silent", "Silent"]])}
          <p class="hint">${esc(m.mode)} pager, ${m.year}. ${esc(m.description)}</p>
          <button type="button" class="btn small" data-act="show" ${last ? "" : "disabled"}><i class="fa-solid fa-eye"></i> Show the screen to the table</button></div>`;
      }
      return `<div class="kgc-device skin-pager model-${esc(p.model)}">
        <div class="dev-top"><span class="dev-brand">${esc(m.name)}</span><span class="dev-sub">${esc(formatNumber(p.number))}</span></div>
        ${this.#screen(last ? (recent.length > 1 ? `PAGE 1/${recent.length}` : "PAGE") : "READY", main, sub)}
        ${tabs([["pages", "Pages", "fa-list"], ["memory", "Memory", "fa-address-book"], ["settings", "Set", "fa-sliders"]], this.tab)}
        <div class="dev-body">${body}</div></div>`;
    }

    /* -------- Input -------- */

    #key(e) {
      if (e.target.closest("input, textarea")) {
        if (e.key === "Enter" && e.target.closest("[data-contact]")) { e.preventDefault(); this.#saveContact(e.target.closest("[data-contact]")); }
        return;
      }
      if (this.kind !== "place") return;
      if (/^[0-9*#]$/.test(e.key)) { e.preventDefault(); this.#press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); this.dialed = this.dialed.slice(0, -1); this.redraw(); }
      else if (e.key === "Enter") { e.preventDefault(); this.element.querySelector('[data-act="call"]:not([disabled]), [data-act="send-page"]')?.click(); }
    }

    #press(k) {
      const e = placePhone(this.city, this.placeId), { mode } = this.#mode(e);
      if (!game.user.isGM && !speakerAt(e)) return;
      sound(SOUND.key(k), { vol: 0.5 });
      if (mode === "connected") return;
      if (mode === "paging" && k === "#") return this.#sendPage();
      if (mode !== "idle" && mode !== "paging") return;
      this.dialed = digits(this.dialed + k);
      this.redraw();
    }

    async #sendPage() {
      const { call } = this.#mode(placePhone(this.city, this.placeId));
      if (!call) return;
      const root = this.element;
      if (this.paging === "alpha") this.phones.page(call.id, { text: root.querySelector('[data-keep="pageText"]')?.value ?? "", callback: root.querySelector('[data-keep="pageCallback"]')?.value ?? "" });
      else this.phones.page(call.id, { text: this.dialed, callback: this.dialed });
      this.dialed = "";
    }

    async #saveContact(li, { remove = false } = {}) {
      const id = li.dataset.contact;
      const name = li.querySelector(`[data-keep="cName:${id}"]`)?.value ?? "", number = li.querySelector(`[data-keep="cNumber:${id}"]`)?.value ?? "";
      if (!remove && digits(number).length < 3) return ui.notifications.warn("Write a number to save.");
      const recentEntry = this.kind === "pager" && (pagerOf(this.item)?.recent ?? []).some((r) => r.id === id);
      const c = contact({ id: id === "new" || recentEntry ? null : id, name, number }, () => foundry.utils.randomID());
      this.editing = null;
      if (this.kind === "pager") {
        const item = this.item;
        let list = pagerOf(item).contacts ?? [];
        // Saving a page's number fills in an existing contact of that number rather than adding twice.
        const same = !remove && recentEntry ? findContact(list, number) : null;
        list = putContact(list, same ? { ...same, name } : c, { remove });
        await setPagerContacts(item, list);
        if (!remove) ui.notifications.info(`${c.name || formatNumber(c.number)} saved to the pager and ${item.parent.name}'s address book.`);
      } else {
        const speaker = speakerAt(placePhone(this.city, this.placeId));
        if (!speaker) return;
        await speaker.setFlag(ID, "book", putContact(bookOf(speaker), c, { remove }));
      }
      this.redraw();
    }

    async #click(e) {
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled) return;
      e.preventDefault();
      const act = b.dataset.act, v = b.dataset.value;
      const place = this.kind === "place" ? placePhone(this.city, this.placeId) : null;
      switch (act) {
        case "tab": this.tab = v; this.editing = null; return this.redraw();
        case "key": return this.#press(v);
        case "back": this.dialed = this.dialed.slice(0, -1); return this.redraw();
        case "pick": this.dialed = digits(v); this.tab = "keypad"; return this.redraw();
        case "coin": {
          if (this.coin) { this.coin = false; return this.redraw(); }
          const speaker = speakerAt(place), need = coinCopper(this.ui.dollarRate());
          if (speaker?.system?.currency && walletValue(speaker.system.currency) < need) return ui.notifications.warn(`${speaker.name} does not have a quarter.`);
          this.coin = true;
          sound(SOUND.key("0"), { vol: 0.2 });
          return this.redraw();
        }
        case "call": {
          const speaker = game.user.isGM ? null : speakerAt(place);
          if (!game.user.isGM && !speaker) return ui.notifications.warn(`You need to be at ${place.name} to use its phone.`);
          const id = this.phones.dial(this.dialed, { from: { city: this.city, id: this.placeId }, actorId: speaker?.id ?? null, coin: this.coin });
          if (!id) ui.notifications.warn("No dial tone: the GM needs to be here to connect calls.");
          this.dialed = "";
          return this.redraw();
        }
        case "hangup": { const { call } = this.#mode(place); if (call) this.phones.hangup(call.id); this.coin = false; return; }
        case "pickup": { const { call } = this.#mode(place); if (call) this.phones.answer(call.id, { actorId: speakerAt(place)?.id ?? null }); return; }
        case "let-ring": { const { call } = this.#mode(place); if (call) this.phones.silence(call.id); return this.close(); }
        case "use-own": this.dialed = digits(place.number); return this.redraw();
        case "send-page": return this.#sendPage();
        case "edit": this.editing = v; return this.redraw();
        case "contact-cancel": this.editing = null; return this.redraw();
        case "contact-save": return this.#saveContact(b.closest("[data-contact]"));
        case "contact-remove": return this.#saveContact(b.closest("[data-contact]"), { remove: true });
        case "callback": return this.ui.callBack(v);
        case "restore": { const n = await restorePager(this.item); ui.notifications.info(`${n} number${n === 1 ? "" : "s"} copied into the pager.`); return this.redraw(); }
        case "page-remove": {
          const item = this.item;
          await item.update({ [`flags.${ID}.pager.recent`]: (pagerOf(item).recent ?? []).filter((r) => r.id !== v) });
          return this.redraw();
        }
        case "alert": await this.item.update({ [`flags.${ID}.pager.alert`]: v }); if (v !== "silent") sound(v === "beep" ? SOUND.beep : SOUND.vibrate); return this.redraw();
        case "show": {
          const item = this.item, p = pagerOf(item), last = p.recent?.at(-1);
          if (!last) return;
          return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: item.parent }), content: `<div class="kgc-chat-pager"><div class="lcd-status"><span>${esc(formatNumber(p.number))}</span><span>${esc(when(last))}</span></div><div class="lcd-main">${esc(last.text)}</div></div><p><i>${esc(item.parent.name)} shows their pager.</i></p>` });
        }
      }
    }
  };
  return DeviceClass;
}

/* ---------------------------------------- */
/*  The switchboard (GM)                     */
/* ---------------------------------------- */

let BoardClass = null;
function boardClass() {
  if (BoardClass) return BoardClass;
  const { ApplicationV2 } = foundry.applications.api;
  BoardClass = class Switchboard extends ApplicationV2 {
    static DEFAULT_OPTIONS = { id: "kgc-switchboard", tag: "div", classes: ["kgc-ui", "kgc-switchboard"], window: { title: "Switchboard", icon: "fa-solid fa-tower-broadcast", resizable: true }, position: { width: 640, height: 600 } };

    constructor({ ui }) {
      super();
      this.ui = ui;
      this.tab = "calls";
      this.dialed = "";
      this.paging = null;
    }
    get phones() { return this.ui.phones; }
    redraw() { if (this.rendered) keep(this.element, () => this.#draw()); }
    tick() { for (const el of this.element?.querySelectorAll("[data-timer]") ?? []) el.textContent = since(Number(el.dataset.timer)); }

    async _renderHTML() { return ""; }
    _replaceHTML(html, content) {
      if (!content.kgcBound) {
        content.kgcBound = true;
        content.addEventListener("click", (e) => this.#click(e));
        content.addEventListener("change", (e) => this.#change(e));
        content.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches('[data-keep="dial"]')) { e.preventDefault(); this.#dial(); } });
      }
      this.#draw(content);
    }
    #draw(content = this.element?.querySelector(".window-content")) {
      if (!content) return;
      const dir = directory();
      const dup = duplicates(dir);
      const panes = { calls: () => this.#calls(), places: () => this.#places(dir), pagers: () => this.#pagers(dir), numbers: () => this.#numbers() };
      content.innerHTML = `${tabs([["calls", "Calls", "fa-phone-volume"], ["places", "Places", "fa-landmark"], ["pagers", "Pagers", "fa-pager"], ["numbers", "Your numbers", "fa-address-book"]], this.tab)}
        ${dup.length ? `<p class="warn"><i class="fa-solid fa-triangle-exclamation"></i> Given out twice: ${dup.map(([n, l]) => `${esc(formatNumber(n))} (${l.map((x) => esc(x.name)).join(", ")})`).join("; ")}. Calls reach the first.</p>` : ""}
        <div class="dev-body sb-body">${panes[this.tab]()}</div>`;
    }

    #calls() {
      const calls = [...this.phones.calls.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      const rows = calls.map((c) => {
        const ring = c.state === "ringing";
        const state = c.state === "connected" ? `<span data-timer="${c.connectedAt}">${since(c.connectedAt)}</span>` : c.state === "ended" ? esc(ENDINGS[c.reason] ?? "Ended") : esc(c.state);
        const pagingMine = c.state === "paging" && c.from?.userId === game.user.id;
        return `<tr class="${ring ? "ringing" : ""}"><td>${esc(endLabel(c.from))}</td><td><i class="fa-solid fa-arrow-right"></i></td><td>${esc(endLabel(c.to))}${ring && c.to?.kind === "place" ? `<small>${c.ringUsers?.length ? `Ringing for ${c.ringUsers.map((u) => esc(game.users.get(u)?.name)).join(", ")}` : "Nobody is there"}</small>` : ""}</td><td>${state}</td>
          <td class="acts">${ring && c.from?.userId !== game.user.id ? `<button type="button" class="btn small primary" data-act="answer" data-call="${c.id}">Answer</button>` : ""}
          ${ring && c.to?.kind === "none" ? `<button type="button" class="btn small" data-act="intercept" data-call="${c.id}">Not in service</button>` : ""}
          ${pagingMine ? `<input data-keep="pageText:${c.id}" placeholder="Message or number"><button type="button" class="btn small primary" data-act="send-page" data-call="${c.id}">Send</button>` : ""}
          ${c.state !== "ended" ? `<button type="button" class="btn small danger" data-act="hangup" data-call="${c.id}">Hang up</button>` : ""}</td></tr>`;
      }).join("");
      return `<div class="sb-dial"><input data-keep="dial" placeholder="Number to call" value="${esc(formatNumber(this.dialed))}"><input data-keep="as" placeholder="Calling as (only you see it)">
          <button type="button" class="btn primary" data-act="dial"><i class="fa-solid fa-phone"></i> Call</button></div>
        <p class="hint">Ringing a place rings for the players there. 911, the operator (0), 411, your numbers and unlisted numbers ring here; answer them as whoever picks up.</p>
        ${rows ? `<table class="sb-table"><tbody>${rows}</tbody></table>` : `<p class="empty">No calls.</p>`}`;
    }

    #places(dir) {
      const list = dir.filter((x) => x.kind === "place").sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
      if (!list.length) return `<p class="empty">No place has a phone yet. Open a place's card, Edit, and give it one under Links.</p>`;
      return `<table class="sb-table"><thead><tr><th>Place</th><th>Phone</th><th>Who is there</th><th></th></tr></thead><tbody>${list.map((x) => {
        const people = [...actorsAt(x)].filter((a) => a.type !== "group" && a.hasPlayerOwner).map((a) => a.name);
        const busy = this.phones.onPlace(x.city, x.id);
        return `<tr><td>${esc(x.name)}<small>${esc(x.city)}</small></td><td>${esc(formatNumber(x.number))}<small>${esc(DEVICES[x.device].label)}${busy && busy.state !== "ended" ? ", in use" : ""}</small></td><td>${people.length ? esc(people.join(", ")) : '<span class="faint">Nobody</span>'}</td>
          <td class="acts"><button type="button" class="btn small" data-act="ring" data-value="${esc(x.number)}"><i class="fa-solid fa-bell"></i> Ring</button><button type="button" class="btn small" data-act="open-place" data-city="${esc(x.city)}" data-id="${esc(x.id)}" data-tooltip="Use its phone"><i class="fa-solid fa-phone"></i></button><button type="button" class="btn small" data-act="card" data-city="${esc(x.city)}" data-id="${esc(x.id)}" data-tooltip="Its card"><i class="fa-solid fa-landmark"></i></button></td></tr>`;
      }).join("")}</tbody></table>`;
    }

    #pagers(dir) {
      const list = dir.filter((x) => x.kind === "pager").sort((a, b) => a.name.localeCompare(b.name));
      const people = game.actors.filter((a) => a.type !== "group" && a.hasPlayerOwner).sort((a, b) => a.name.localeCompare(b.name));
      return `<div class="sb-dial"><select data-keep="giveActor">${people.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>
          <select data-keep="giveModel">${Object.entries(PAGER_MODELS).map(([k, m]) => `<option value="${k}" ${k === "numeric" ? "selected" : ""}>${esc(m.name)} (${esc(m.mode)})</option>`).join("")}</select>
          <button type="button" class="btn primary" data-act="give" ${people.length ? "" : "disabled"}><i class="fa-solid fa-pager"></i> Give a pager</button></div>
        <p class="hint">A pager is an item on its carrier, with its own number, its memory of numbers and the pages it received. Hand it over and all of that goes with it. A new pager starts with its carrier's address book.</p>
        ${list.length ? `<table class="sb-table"><thead><tr><th>Carried by</th><th>Model</th><th>Number</th><th>Last page</th><th></th></tr></thead><tbody>${list.map((x) => {
          const item = game.actors.get(x.actorId)?.items.get(x.itemId), p = pagerOf(item), last = p?.recent?.at(-1);
          return `<tr><td>${esc(x.name)}</td><td>${esc(PAGER_MODELS[x.model]?.name ?? x.model)}</td><td><input class="num" data-act-change="number" data-actor="${x.actorId}" data-item="${x.itemId}" value="${esc(formatNumber(x.number))}"></td>
            <td>${last ? `${esc(last.text)}<small>${esc(when(last))}${p.unread ? `, ${p.unread} unread` : ""}</small>` : '<span class="faint">None</span>'}</td>
            <td class="acts"><input data-keep="gmPage:${x.itemId}" placeholder="Message or number"><button type="button" class="btn small primary" data-act="page" data-value="${esc(x.number)}" data-item="${x.itemId}">Page</button><button type="button" class="btn small" data-act="open-pager" data-actor="${x.actorId}" data-item="${x.itemId}" data-tooltip="Open it"><i class="fa-solid fa-pager"></i></button></td></tr>`;
        }).join("")}</tbody></table>` : `<p class="empty">Nobody carries a pager.</p>`}`;
    }

    #numbers() {
      const list = game.settings.get(ID, "phoneNumbers") ?? [];
      return `<p class="hint">People and businesses that are not on the map: a fence, a lawyer's office, a pizza place. Calls to these ring here, and you answer as them. Put them in the players' address books by telling them, or let them find them.</p>
        <table class="sb-table"><thead><tr><th>Name</th><th>Number</th><th>Note (only you)</th><th></th></tr></thead><tbody>
        ${list.map((n) => `<tr><td><input data-act-change="gm-name" data-id="${esc(n.id)}" value="${esc(n.name)}"></td><td><input class="num" data-act-change="gm-number" data-id="${esc(n.id)}" value="${esc(formatNumber(n.number))}"></td><td><input data-act-change="gm-note" data-id="${esc(n.id)}" value="${esc(n.note ?? "")}"></td>
          <td class="acts"><button type="button" class="btn small danger" data-act="gm-remove" data-id="${esc(n.id)}" aria-label="Remove"><i class="fa-solid fa-trash"></i></button></td></tr>`).join("")}
        </tbody></table><button type="button" class="btn" data-act="gm-add"><i class="fa-solid fa-plus"></i> Add a number</button>`;
    }

    #dial() {
      const number = this.element.querySelector('[data-keep="dial"]')?.value ?? "", as = this.element.querySelector('[data-keep="as"]')?.value ?? "";
      if (!digits(number)) return;
      this.phones.dial(number, { as });
      this.element.querySelector('[data-keep="dial"]').value = "";
      this.dialed = "";
    }

    async #saveNumbers(fn) {
      const list = foundry.utils.deepClone(game.settings.get(ID, "phoneNumbers") ?? []);
      await game.settings.set(ID, "phoneNumbers", fn(list));
    }

    async #change(e) {
      const el = e.target.closest("[data-act-change]");
      if (!el) return;
      const act = el.dataset.actChange;
      if (act === "number") {
        const item = game.actors.get(el.dataset.actor)?.items.get(el.dataset.item);
        const n = formatNumber(el.value);
        if (directory().some((x) => sameNumber(x.number, n) && x.itemId !== item?.id)) ui.notifications.warn(`KG Cities: ${n} is already given out.`);
        await item?.update({ [`flags.${ID}.pager.number`]: n });
        return this.redraw();
      }
      const key = { "gm-name": "name", "gm-number": "number", "gm-note": "note" }[act];
      if (key) await this.#saveNumbers((list) => list.map((n) => (n.id === el.dataset.id ? { ...n, [key]: key === "number" ? formatNumber(el.value) : el.value.trim() } : n)));
    }

    async #click(e) {
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled) return;
      e.preventDefault();
      const act = b.dataset.act, call = b.dataset.call;
      switch (act) {
        case "tab": this.tab = b.dataset.value; return this.redraw();
        case "dial": return this.#dial();
        case "answer": return this.phones.answer(call);
        case "hangup": return this.phones.hangup(call);
        case "intercept": return this.phones.intercept(call);
        case "send-page": { const t = this.element.querySelector(`[data-keep="pageText:${call}"]`)?.value ?? ""; return this.phones.page(call, { text: t, callback: t }); }
        case "ring": this.tab = "calls"; this.phones.dial(b.dataset.value, { as: "" }); return this.redraw();
        case "open-place": return this.ui.openPlace(b.dataset.city, b.dataset.id);
        case "card": return this.ui.openCard(b.dataset.city, b.dataset.id);
        case "open-pager": return this.ui.openPager(game.actors.get(b.dataset.actor)?.items.get(b.dataset.item));
        case "page": {
          const input = this.element.querySelector(`[data-keep="gmPage:${b.dataset.item}"]`), t = input?.value ?? "";
          this.phones.pageDirect(b.dataset.value, { text: t, callback: t });
          if (input) input.value = "";
          return ui.notifications.info("Page sent.");
        }
        case "give": {
          const actor = game.actors.get(this.element.querySelector('[data-keep="giveActor"]')?.value), model = this.element.querySelector('[data-keep="giveModel"]')?.value;
          if (!actor) return;
          const item = await givePager(actor, model);
          ui.notifications.info(`${actor.name} now carries a ${item.name}, number ${formatNumber(pagerOf(item).number)}.`);
          return this.redraw();
        }
        case "gm-add": await this.#saveNumbers((list) => [...list, { id: foundry.utils.randomID(), name: "New number", number: newNumber(), note: "" }]); return this.redraw();
        case "gm-remove": await this.#saveNumbers((list) => list.filter((n) => n.id !== b.dataset.id)); return this.redraw();
      }
    }
  };
  return BoardClass;
}
