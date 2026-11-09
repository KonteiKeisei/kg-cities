// The way back (GM only), ported from KG Realms' scene bar: entering a place's scene from its
// card leaves a note on that scene of where it came from, and on any scene with such a note a bar
// shows the trail from the city down to here. A crumb takes everyone back (activates it) and
// centres the map on the place; shift-click looks back alone. Under the bar, the place's linked
// actor and journal: Actor shows it to the players on this scene, the eye opens its sheet for the
// GM; the people button shows the journal to the players on this scene, Journal opens it for the GM.

import { openJournal } from "./place-card.mjs";

const MODULE_ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const EYE = `<i class="fa-solid fa-eye"></i>`, PEOPLE = `<i class="fa-solid fa-users"></i>`;
/** Players looking at this scene now. */
const playersHere = () => game.users.filter((u) => u.active && !u.isGM && u.viewedScene === canvas.scene?.id).map((u) => u.id);
const SOCKET = `module.${MODULE_ID}`;

/**
 * Open an actor on this client: its sheet when this user may see it, else its art (a player
 * without permission still sees who it is).
 */
async function openActorHere(uuid) {
  const actor = await fromUuid(uuid).catch(() => null);
  if (!actor) return;
  if (actor.testUserPermission(game.user, "LIMITED")) return actor.sheet?.render(true);
  if (actor.img) return new foundry.applications.apps.ImagePopout({ src: actor.img, uuid: actor.uuid, window: { title: actor.name } }).render(true);
}

/** Players open an actor the GM opened for everyone on their scene. Call once, at ready. */
export function listenForOpens() {
  game.socket.on(SOCKET, (msg) => {
    if (msg?.action === "openActor" && msg.users?.includes(game.user.id)) openActorHere(msg.uuid);
  });
}

const initials = (name) => String(name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
/** Where a scene goes back to: { scene, city, landmark, name } or null. */
export const returnOf = (scene) => scene?.getFlag?.(MODULE_ID, "returnTo") ?? null;

/**
 * The open map between Foundry's interface, measured from its own elements (as KG Realms and
 * Calendaria dock): the top is the bottom of the scene navigation, the left the right of the scene
 * controls, the right the left of the sidebar, the bottom the top of the hotbar. An element that
 * is hidden, missing (a UI module replaced it) or out of place counts for nothing.
 */
export function uiBounds() {
  const W = window.innerWidth, H = window.innerHeight;
  const rect = (...ids) => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) return b;
    }
    return null;
  };
  const nav = rect("scene-navigation", "navigation"), controls = rect("scene-controls", "controls"), sidebar = rect("sidebar"), hotbar = rect("hotbar");
  let right = sidebar && sidebar.left > W * 0.5 ? sidebar.left : W;
  let left = controls && controls.right < W * 0.3 ? controls.right : 0;
  // Foundry 13's middle column is exactly the map between the left and right columns.
  const middle = rect("ui-middle");
  if (middle && middle.right > W * 0.5) right = Math.min(right, middle.right);
  if (middle && middle.left < W * 0.3) left = Math.max(left, middle.left);
  const top = nav && nav.bottom < H * 0.3 ? nav.bottom : 0;
  const bottom = hotbar && hotbar.top > H * 0.5 ? Math.min(H, hotbar.top) : H;
  return { left, right, top, bottom };
}

const WATCH_IDS = ["scene-navigation", "navigation", "scene-controls", "controls", "sidebar", "hotbar"];
const WATCH_HOOKS = ["collapseSidebar", "renderSidebar", "renderSceneNavigation", "renderSceneControls", "renderHotbar", "canvasReady"];

/** Follow Foundry's own interface while the bar shows: changes coalesced before paint, no polling. */
function observeMapUi(place) {
  let pending = null, stopped = false, watched = new Set();
  const schedule = () => {
    if (stopped || pending !== null) return;
    pending = requestAnimationFrame(() => { pending = null; bind(); place(); });
  };
  const resize = globalThis.ResizeObserver ? new ResizeObserver(schedule) : null;
  const mutations = globalThis.MutationObserver ? new MutationObserver(schedule) : null;
  const bind = () => {
    const next = new Set(WATCH_IDS.map((id) => document.getElementById(id)).filter(Boolean));
    if (next.size === watched.size && [...next].every((el) => watched.has(el))) return;
    resize?.disconnect(); mutations?.disconnect();
    for (const el of watched) el.removeEventListener("transitionend", schedule);
    watched = next;
    for (const el of watched) {
      resize?.observe(el);
      mutations?.observe(el, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
      el.addEventListener("transitionend", schedule);
    }
  };
  const hooks = WATCH_HOOKS.map((name) => [name, Hooks.on(name, schedule)]);
  window.addEventListener("resize", schedule);
  bind();
  return () => {
    stopped = true;
    if (pending !== null) cancelAnimationFrame(pending);
    resize?.disconnect(); mutations?.disconnect();
    for (const el of watched) el.removeEventListener("transitionend", schedule);
    for (const [name, id] of hooks) Hooks.off(name, id);
    window.removeEventListener("resize", schedule);
  };
}

export class SceneTrail {
  /** getLandmark(city, id): the place a scene was entered from (async), for its links. */
  constructor({ getLandmark } = {}) {
    this.getLandmark = getLandmark;
    this.el = null;
    this.stopWatch = null;
    this.focus = null; // { scene, landmark }: where to centre once that city scene is drawn
  }

  /** A place's scene now remembers the way back to the place, on the scene it was entered from. */
  async link(target, { from, city, landmark, name }) {
    if (!target || !from || target.id === from.id) return;
    const r = returnOf(target);
    if (r?.scene === from.id && r.landmark === landmark && r.name === name) return;
    await target.setFlag(MODULE_ID, "returnTo", { scene: from.id, city, landmark, name });
  }

  /** The scene above this one: { to, focus } or null. */
  parentOf(scene) {
    const r = returnOf(scene), to = r ? game.scenes.get(r.scene) : null;
    return to && to.id !== scene.id ? { to, focus: { scene: to.id, landmark: r.landmark }, name: r.name } : null;
  }

  /** From the top down to the current scene: [{ scene, label, focus }], the last being here. */
  trail(scene = canvas.scene) {
    const steps = [], seen = new Set([scene.id]);
    let at = scene, here = null;
    for (let p = this.parentOf(at); p && !seen.has(p.to.id) && steps.length < 8; p = this.parentOf(at)) {
      here ??= p.name;
      seen.add(p.to.id);
      steps.unshift({ scene: p.to, focus: p.focus, label: p.to.navName || p.to.name });
      at = p.to;
    }
    // Each scene below the top is named for the place it was entered from.
    for (let i = 1; i < steps.length; i++) steps[i].label = this.parentOf(steps[i].scene)?.name || steps[i].label;
    return [...steps, { scene, label: here || scene.navName || scene.name, focus: null }];
  }

  draw() {
    this.remove();
    // The GM decides which scene everyone is on: the way back is the GM's alone.
    if (!game.user.isGM || !canvas.scene) return;
    const steps = this.trail();
    if (steps.length < 2) return;
    const el = document.createElement("div");
    el.className = "kgc-ui kgc-trail-dock";
    el.innerHTML = `<nav class="kgc-panel kgc-trail" aria-label="The way back">${steps.map((x, i) => i === steps.length - 1
      ? `<span class="here" data-tooltip="${esc(x.scene.name)}">${esc(x.label)}</span>`
      : `<button type="button" class="crumb" data-step="${i}" data-tooltip="Take everyone back to ${esc(x.label)} (Shift: only you look)">${esc(x.label)}</button><i class="fa-solid fa-angle-right sep"></i>`).join("")}</nav>
      <div class="kgc-panel kgc-trail-links" hidden></div>`;
    el.addEventListener("click", (e) => this.#click(e, steps));
    el.addEventListener("dragstart", (e) => {
      const b = e.target.closest?.("[data-actor]");
      if (b) e.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: b.dataset.actor }));
    });
    document.body.append(el);
    this.el = el;
    this.#dock();
    this.stopWatch = observeMapUi(() => this.#dock());
    this.#links(returnOf(canvas.scene), el);
  }

  /** The place's linked actors and journal, under the bar. */
  async #links(r, el) {
    const lm = r?.city && r.landmark ? await this.getLandmark?.(r.city, r.landmark).catch(() => null) : null;
    if (this.el !== el || !lm) return;
    const actors = (lm.actors ?? []).map((u) => fromUuidSync(u, { strict: false })).filter(Boolean);
    const journal = (lm.journal ?? lm.page) ? fromUuidSync(lm.journal ?? lm.page, { strict: false }) : null;
    this.actors = actors;
    this.journal = journal;
    if (!actors.length && !journal) return;
    // In the strip the actor is named by its tooltip only, so both halves keep the same width; the
    // list of further actors names each.
    const pair = (a, i, extra = "", named = false) => `<button type="button" class="main" data-act="show-actor" data-i="${i}" data-actor="${esc(a.uuid)}" draggable="true" aria-label="Open ${esc(a.name)} for everyone on this scene" data-tooltip="<b>${esc(a.name)}</b><br>Open for everyone on this scene, you included (drag for a token)">
        <span class="av" style="${a.img ? `background-image:url('${esc(a.img)}')` : ""}">${a.img ? "" : esc(initials(a.name))}</span>${named ? `<span class="nm">${esc(a.name)}</span>` : `<span class="k">Open Actor</span>`}</button>${extra}
      <button type="button" class="ic" data-act="open-actor" data-i="${i}" data-actor="${esc(a.uuid)}" draggable="true" aria-label="Open ${esc(a.name)}'s sheet, only you" data-tooltip="Open ${esc(a.name)}'s sheet, only you">${EYE}</button>`;
    const more = actors.length > 1 ? `<button type="button" class="more" data-act="more" aria-expanded="false" aria-label="${actors.length - 1} more actors" data-tooltip="${actors.length - 1} more">+${actors.length - 1}</button>` : "";
    const links = el.querySelector(".kgc-trail-links");
    links.innerHTML = `${actors.length ? `<div class="sec actor">${pair(actors[0], 0, more)}</div>` : ""}
      ${journal ? `<div class="sec journal"><button type="button" class="ic" data-act="show-journal" aria-label="Show ${esc(journal.name)} to the players on this scene" data-tooltip="Show ${esc(journal.name)} to the players on this scene">${PEOPLE}</button>
        <button type="button" class="main" data-act="open-journal" data-tooltip="Open ${esc(journal.name)}, only you"><span class="bk"></span><span class="k">Journal</span></button></div>` : ""}
      ${actors.length > 1 ? `<div class="kgc-panel menu" hidden>${actors.slice(1).map((a, i) => `<div class="row">${pair(a, i + 1, "", true)}</div>`).join("")}</div>` : ""}`;
    links.hidden = false;
    this.#dock();
  }

  async #click(e, steps) {
    const step = e.target.closest("[data-step]");
    if (step) return this.navigate(steps[Number(step.dataset.step)], { viewOnly: e.shiftKey });
    const b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    const actor = this.actors?.[Number(b.dataset.i)];
    switch (b.dataset.act) {
      case "more": { const m = this.el.querySelector(".menu"); if (m) { m.hidden = !m.hidden; b.setAttribute("aria-expanded", !m.hidden); } return; }
      case "show-actor": {
        // Open for all: the GM and every player on this scene.
        if (!actor) return;
        const users = playersHere();
        if (users.length) game.socket.emit(SOCKET, { action: "openActor", uuid: actor.uuid, users });
        return actor.sheet?.render(true);
      }
      case "open-actor": return actor?.sheet?.render(true);
      case "show-journal": {
        const users = playersHere();
        if (!users.length) return ui.notifications.info("KG Cities: no players are on this scene.");
        const Journal = foundry.documents?.collections?.Journal ?? globalThis.Journal;
        await Journal.show(this.journal, { force: true, users });
        return ui.notifications.info(`KG Cities: ${this.journal.name} shown to the players on this scene.`);
      }
      case "open-journal": return openJournal(this.journal.uuid);
    }
  }

  remove() {
    this.stopWatch?.();
    this.stopWatch = null;
    this.el?.remove();
    this.el = null;
    document.body.style.removeProperty("--kgc-trail-bottom");
  }

  async navigate(step, { viewOnly = false } = {}) {
    if (!game.user.isGM || !step?.scene) return;
    this.focus = step.focus;
    if (viewOnly) return step.scene.view();
    const wasActive = step.scene.active;
    const result = await step.scene.activate();
    // Already active: bring back anyone looking elsewhere.
    if (wasActive) {
      const away = game.users.filter((u) => u.active && !u.isGM && u.viewedScene !== step.scene.id);
      if (away.length) step.scene.pullUsers?.(away);
    }
    return result;
  }

  /** The city scene asks, once it is drawn, whether to centre on a place: its landmark id, or null. */
  takeFocus(sceneId) {
    const f = this.focus;
    if (!f || f.scene !== sceneId || !f.landmark) return null;
    this.focus = null;
    return f.landmark;
  }

  /** Top centre of the open map, under the scene navigation (as KG Realms docks its bar). */
  #dock() {
    if (!this.el) return;
    const b = uiBounds(), top = Math.max(48, b.top + 8);
    Object.assign(this.el.style, { top: `${top}px`, left: `${(b.left + b.right) / 2}px`, maxWidth: `${Math.max(96, b.right - b.left - 24)}px` });
    document.body.style.setProperty("--kgc-trail-bottom", `${top + this.el.offsetHeight + 8}px`);
  }
}
