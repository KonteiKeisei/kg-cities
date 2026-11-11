// The hover card on landmarks and safe havens, for everyone, and click to open the place card
// (place-card.mjs). Design: tools/mockups/ui-mockup.html.

import { pageSummary } from "./landmarks.mjs";
import { formatDistance, metres, sceneToLatLon } from "./geo.mjs";
import { VISIBILITY, asHtml, firstParagraph, plainLinks, visibilityOf } from "./place-card.mjs";
import { formatNumber } from "./phone-core.mjs";

const CLICK_PX = 6;
const CLICK_MS = 500;
// How long the pointer rests on a landmark before its card shows.
const CARD_DELAY_MS = 400;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * What the page itself last had under the pointer, from the browser's own events (not the
 * canvas's, which carry on under the sidebar, chat and windows).
 */
let domUnder = null;
document.addEventListener("pointermove", (e) => { domUnder = e.target; }, { capture: true, passive: true });
document.addEventListener("pointerleave", () => { domUnder = null; }, { passive: true });

/** Nothing of the interface (sidebar, chat, windows, bars) is in front of the map at this canvas point. */
function mapUnder(global) {
  const view = canvas.app?.view;
  if (!view) return false;
  if (domUnder && domUnder !== view) return false;
  const rect = view.getBoundingClientRect();
  return document.elementFromPoint(rect.left + global.x, rect.top + global.y) === view;
}

/** The pointer's target is a token (or part of one). */
function tokenUnder(target) {
  for (let at = target; at && at !== canvas.stage; at = at.parent) if (at.document?.documentName === "Token") return true;
  return false;
}

export class HoverCard {
  /**
   * landmarks: a LandmarkStore; search: SearchData (addresses); isEditing(): edit mode is on;
   * openCard(lm): open its place card; enterScene(lm, scene): the GM goes to its scene.
   */
  constructor({ landmarks, search, isEditing, openCard, enterScene }) {
    Object.assign(this, { landmarks, search, isEditing, openCard, enterScene });
    this.layer = null;
    this.el = null;
    this.hovered = null;
    this.summaries = new Map();
    this.addresses = new Map();
    this.click = null;
    this.frame = 0;
    this.onMove = (e) => this.#move(e);
    this.onDown = (e) => this.#down(e);
    this.onUp = (e) => this.#up(e);
  }

  attach(layer) {
    this.detach();
    this.layer = layer;
    this.summaries.clear();
    canvas.stage.on("pointermove", this.onMove);
    canvas.stage.on("pointerdown", this.onDown);
    canvas.stage.on("pointerup", this.onUp);
  }

  detach() {
    canvas?.stage?.off("pointermove", this.onMove);
    canvas?.stage?.off("pointerdown", this.onDown);
    canvas?.stage?.off("pointerup", this.onUp);
    this.hide();
    this.layer = null;
  }

  /** Page text may have changed: read it again next time. */
  refresh() {
    this.summaries.clear();
    this.hide();
  }

  hide() {
    clearTimeout(this.pending?.timer);
    this.pending = null;
    this.el?.remove();
    this.el = null;
    this.hovered = null;
  }

  /* ---------------------------------------- */
  /*  Hover                                    */
  /* ---------------------------------------- */

  /** The pointer is over something else: a token on the map, or the interface (a window, a bar, the sidebar). */
  #blocked(event) {
    const dom = event.nativeEvent?.target ?? event.originalEvent?.target ?? null;
    if (dom && dom !== canvas.app.view) return true;
    if (!mapUnder(event.global)) return true;
    return tokenUnder(event.target);
  }

  #move(event) {
    if (this.#blocked(event)) {
      if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
      return this.hide();
    }
    if (this.frame) return;
    const global = { x: event.global.x, y: event.global.y };
    const at = event.getLocalPosition(canvas.stage);
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      // While the GM edits, the editor owns the pointer.
      if (this.isEditing() || !mapUnder(global)) return this.hide();
      const id = this.layer?.landmarkAt(at) ?? null;
      const lm = id ? this.landmarks.get(id) : null;
      if (!lm || (lm.hidden && !game.user.isGM)) return this.hide();
      // A card already open follows the pointer, or moves to the next landmark at once; a new one
      // waits until the pointer has rested on the landmark for a moment.
      if (this.el) return this.#show(lm, global);
      this.pointer = global;
      if (this.pending?.id === lm.id) return;
      clearTimeout(this.pending?.timer);
      this.pending = { id: lm.id, timer: setTimeout(() => { this.pending = null; if (mapUnder(this.pointer)) this.#show(lm, this.pointer); }, CARD_DELAY_MS) };
    });
  }

  /**
   * The card's text: What is known (without secrets for players), or only the rumours while it
   * is rumoured; older landmarks fall back to their summary, then their journal page.
   */
  #summary(lm) {
    if (this.summaries.has(lm.id)) return this.summaries.get(lm.id);
    const rumoured = !game.user.isGM && visibilityOf(lm) === "rumoured";
    const page = !lm.known && !lm.summary && lm.page ? fromUuidSync(lm.page, { strict: false }) : null;
    const fromPage = page?.text?.content ? pageSummary(page.text.content) : { img: page?.src ?? null, subtitle: "", excerpt: "" };
    const excerpt = rumoured ? firstParagraph(asHtml(lm.rumours)) : lm.known != null ? firstParagraph(lm.known) : lm.summary || fromPage.excerpt;
    const s = {
      title: lm.name || page?.name || "Landmark",
      img: rumoured ? null : lm.img || fromPage.img,
      subtitle: rumoured ? "Rumoured" : fromPage.subtitle,
      excerpt: plainLinks(excerpt)
    };
    this.summaries.set(lm.id, s);
    return s;
  }

  /** "193 Salem Street" and its neighbourhood, looked up once per landmark. */
  #address(lm) {
    if (!this.addresses.has(lm.id)) {
      this.addresses.set(lm.id, null);
      this.search.addressAt(lm.lat, lm.lon).then((a) => {
        this.addresses.set(lm.id, a);
        if (this.hovered === lm.id) { this.hovered = null; this.#show(lm, this.last); }
      }).catch(() => {});
    }
    return this.addresses.get(lm.id);
  }

  /** Straight-line distance from the user's selected token (or their character's), or null. */
  #distance(lm) {
    const token = canvas.tokens?.controlled[0] ?? game.user.character?.getActiveTokens()[0];
    if (!token || !this.layer?.frame) return null;
    const ll = sceneToLatLon(this.layer.frame, token.center);
    return formatDistance(metres(ll, lm));
  }

  #show(lm, global) {
    this.last = global;
    const s = this.#summary(lm);
    const haven = lm.tone === "haven", airport = !!lm.airport;
    if (!this.el) {
      this.el = document.createElement("div");
      document.body.append(this.el);
    }
    if (this.hovered !== lm.id) {
      this.hovered = lm.id;
      const address = this.#address(lm);
      const distance = this.#distance(lm);
      const meta = [
        address?.text ? `<span><i class="fa-solid fa-location-dot"></i>${esc(address.text)}</span>` : "",
        address?.area ? `<span><i class="fa-solid fa-map"></i>${esc(address.area)}</span>` : "",
        distance ? `<span><i class="fa-solid fa-person-walking"></i>${esc(distance)} away</span>` : "",
        lm.phone?.number && (game.user.isGM || visibilityOf(lm) === "discovered")
          ? `<span><i class="fa-solid ${lm.phone.kind === "payphone" ? "fa-coins" : "fa-phone"}"></i>${esc(formatNumber(lm.phone.number))}${lm.phone.kind === "payphone" ? " (payphone)" : ""}</span>` : ""
      ].join("");
      const badge = airport ? `<span class="badge airport"><i class="fa-solid fa-plane"></i>Airport, ${esc(lm.airport.iata)}</span>`
        : `<span class="badge ${haven ? "haven" : "gold"}"><i class="fa-solid ${haven ? "fa-house-chimney" : "fa-landmark"}"></i>${haven ? "Safe haven" : "Point of interest"}</span>`;
      this.el.className = `kgc-ui kgc-panel kgc-card ${haven ? "haven" : ""} ${airport ? "airport" : ""} ${s.img ? "" : "small"}`;
      this.el.innerHTML = `
        ${s.img ? `<div class="art" style="background-image:url('${esc(foundry.utils.getRoute(s.img))}')">${badge}</div>` : ""}
        <div class="body ${s.img ? "" : "top"}">
          ${s.img ? "" : `<div>${badge}</div>`}
          <h3>${esc(s.title)}</h3>
          ${s.subtitle && s.subtitle !== s.title ? `<p class="sub">${esc(s.subtitle)}</p>` : ""}
          ${s.excerpt ? `<p>${esc(s.excerpt)}</p>` : ""}
          ${meta ? `<div class="meta">${meta}</div>` : ""}
        </div>
        ${this.#foot(lm, s)}`;
    }
    // Beside the cursor, kept on screen.
    const rect = canvas.app.view.getBoundingClientRect();
    const w = this.el.offsetWidth || 360, h = this.el.offsetHeight || 300;
    let left = rect.left + global.x + 20, top = rect.top + global.y + 20;
    if (left + w > window.innerWidth - 8) left = rect.left + global.x - w - 20;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  #foot(lm, s) {
    // An airport: the GM books flights from it (a travel module answers the hook).
    if (lm.airport) {
      const flying = game.user.isGM && Hooks.events["kgCities.airport"]?.length;
      return flying ? `<div class="foot"><span><i class="fa-solid fa-plane-departure"></i> Click to book a flight</span></div>` : "";
    }
    const scene = game.user.isGM && lm.scene ? game.scenes.get(lm.scene) : null;
    const vis = visibilityOf(lm);
    const gm = game.user.isGM && vis !== "discovered" ? `<span class="badge gm">${esc(VISIBILITY[vis])} to players</span>` : "";
    const text = scene ? `<span><i class="fa-solid fa-film"></i> Click for the card · <b>Shift</b>-click to view <b>${esc(scene.name)}</b></span>`
      : `<span><i class="fa-solid fa-hand-pointer"></i> Click for the card</span>`;
    return `<div class="foot">${text}${gm}</div>`;
  }

  /* ---------------------------------------- */
  /*  Click                                    */
  /* ---------------------------------------- */

  #down(event) {
    if (event.button !== 0) return;
    // A click on a token (a party standing on a landmark) is the token's, not the landmark's;
    // one on the interface is the interface's.
    if (this.#blocked(event)) { this.click = null; return; }
    this.click = { x: event.global.x, y: event.global.y, t: Date.now() };
  }

  #up(event) {
    const c = this.click;
    this.click = null;
    if (!c || !this.layer || this.isEditing()) return;
    if (Math.hypot(event.global.x - c.x, event.global.y - c.y) > CLICK_PX || Date.now() - c.t > CLICK_MS) return;
    const id = this.layer.landmarkAt(event.getLocalPosition(canvas.stage));
    if (id) this.open(id, { shift: event.shiftKey });
  }

  /** Everyone: the place card. The GM's shift-click views a linked scene at once. */
  async open(id, { shift = false } = {}) {
    const lm = this.landmarks.get(id);
    if (!lm) return;
    this.hide();
    if (lm.airport) {
      if (game.user.isGM) Hooks.callAll("kgCities.airport", { airport: lm.airport, scene: canvas.scene });
      return;
    }
    const scene = game.user.isGM && lm.scene ? game.scenes.get(lm.scene) : null;
    if (scene && shift) return this.enterScene(lm, scene);
    return this.openCard(lm);
  }
}
