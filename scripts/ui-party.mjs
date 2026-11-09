// Party tokens on the map, ported from KG Realms (party-ui.mjs, party-appearance.mjs,
// party-token-fit.mjs): each member's portrait round the inside of the token's ring, a glowing
// outline, the token kept findable when the city is zoomed far out, and the token HUD's button to
// split a party or merge several. Installed only without KG Realms, which draws its own.

import { familyActors, groupActor, groupMembers, isPrimaryGM, partyMeta, partyTitle, realmsParties, rosterStamp, sceneParties, tokenDoc, watchPartyNames } from "./party.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const DEFAULT_OUTLINE = "#d9a441";

/* ---------------------------------------- */
/*  Portraits                                */
/* ---------------------------------------- */

/** How far inside the token portraits may reach (the outline ring is at 0.468 of its size). */
const PORTRAIT_REACH = 0.44;
/** The gap between neighbouring portraits, as a share of a portrait's radius. */
const PORTRAIT_GAP = 0.08;

/**
 * Member portraits as big as they can be without overlapping: evenly round a ring, from the top,
 * each touching the edge of the space inside the outline and just clear of its neighbours. With
 * n of them on a ring of radius R, each of radius r: R + r = reach, and neighbours are 2R·sin(π/n)
 * apart, which must be 2r plus the gap. A party of one is one portrait filling the whole ring.
 */
export function portraitLayout(width, height, count) {
  const d = Math.min(width, height), reach = d * PORTRAIT_REACH, cx = width / 2, cy = height / 2;
  if (count <= 0) return [];
  if (count === 1) return [{ x: cx, y: cy, r: reach }];
  const s = Math.sin(Math.PI / count), r = (reach * s) / (1 + PORTRAIT_GAP + s), ring = reach - r;
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: cx + Math.cos(angle) * ring, y: cy + Math.sin(angle) * ring, r };
  });
}

/**
 * The inner radius (pixels) of a painted ring round a square image's edge, or 0 when it has none:
 * a band of one even, solid colour, at least a tenth of the radius deep, all the way round.
 */
export function framedRadius(data, size) {
  const c = size / 2;
  const ringAt = (r) => {
    const px = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, x = Math.round(c + Math.cos(a) * r), y = Math.round(c + Math.sin(a) * r);
      const j = (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4;
      px.push([data[j], data[j + 1], data[j + 2], data[j + 3]]);
    }
    const m = [0, 1, 2].map((k) => px.reduce((s, p) => s + p[k], 0) / px.length);
    const spread = Math.sqrt(px.reduce((s, p) => s + [0, 1, 2].reduce((t, k) => t + (p[k] - m[k]) ** 2, 0), 0) / px.length / 3);
    return { even: spread < 22 && px.every((p) => p[3] > 200), m };
  };
  const outer = ringAt(c * 0.9);
  if (!outer.even) return 0;
  let r = c * 0.9, inside = false;
  while (r > c * 0.5) {
    const at = ringAt(r - 2);
    if (!at.even || Math.hypot(...[0, 1, 2].map((k) => at.m[k] - outer.m[k])) > 40) { inside = true; break; }
    r -= 2;
  }
  // One colour all the way in is a plain picture, not a frame round one.
  return inside && c * 0.9 - r >= c * 0.1 ? Math.max(c * 0.55, r - 2) : 0;
}

/** Portrait textures, shared and counted; two load at a time. */
class PortraitCache {
  constructor() { this.entries = new Map(); this.pending = []; this.loading = 0; }
  acquire(src) {
    let entry = this.entries.get(src);
    if (!entry) {
      entry = { refs: 0 };
      this.entries.set(src, entry);
      entry.promise = new Promise((resolve, reject) => { this.pending.push({ src, entry, resolve, reject }); this.pump(); });
    }
    entry.refs++;
    return entry.promise.then((texture) => ({ src, texture })).catch((err) => { this.release(src); throw err; });
  }
  pump() {
    while (this.loading < 2 && this.pending.length) {
      const job = this.pending.shift();
      this.loading++;
      this.load(job.src).then((texture) => { job.entry.texture = texture; job.resolve(texture); if (!job.entry.refs) this.dispose(job.src, job.entry); },
        (err) => { job.entry.failed = true; job.reject(err); }).finally(() => { this.loading--; this.pump(); });
    }
  }
  async load(src) {
    const res = await fetch(foundry.utils.getRoute(src));
    if (!res.ok) throw new Error("the portrait could not be loaded");
    const bitmap = await createImageBitmap(await res.blob());
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const side = Math.min(bitmap.width, bitmap.height), g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 128, 128);
      // Token art with its own painted ring would sit as a second ring inside ours: only what is inside it.
      const inner = framedRadius(g.getImageData(0, 0, 128, 128).data, 128);
      if (inner) {
        const s = side * (inner / 64);
        g.clearRect(0, 0, 128, 128);
        g.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, 128, 128);
      }
      return PIXI.Texture.from(c);
    } finally { bitmap.close(); }
  }
  release(src) {
    const e = this.entries.get(src);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    if (!e.refs && (e.texture || e.failed)) this.dispose(src, e);
  }
  dispose(src, e) {
    if (this.entries.get(src) !== e) return;
    this.entries.delete(src);
    e.texture?.destroy(true);
  }
}

const outlineColour = () => {
  let v = DEFAULT_OUTLINE;
  try { v = String(game.settings.get(ID, "partyOutline") ?? DEFAULT_OUTLINE); } catch { /* not registered yet */ }
  return parseInt((/^#[0-9a-f]{6}$/i.test(v) ? v : DEFAULT_OUTLINE).slice(1), 16);
};

/** A ring and a glow of layered strokes (no blur filter), and a ring round each portrait. */
function drawOutline(track, glow, strokes, { width, height, radius, line, colour }) {
  track.clear().lineStyle({ width: line, color: colour, alpha: 0.95, alignment: 0.5 }).drawCircle(width / 2, height / 2, radius);
  glow.clear();
  for (const [size, alpha] of [[7, 0.06], [3.5, 0.12], [1.5, 0.22]]) glow.lineStyle({ width: line * size, color: colour, alpha, alignment: 0.5 }).drawCircle(width / 2, height / 2, radius);
  for (const { g, p } of strokes) g.clear().lineStyle({ width: line, color: colour, alpha: 0.95, alignment: 0.5 }).drawCircle(p.x, p.y, p.r);
}

class PartyPortraits {
  constructor() { this.cache = new PortraitCache(); }
  clear(token) {
    token.kgcPartyKey = null;
    token.kgcPartyEpoch = (token.kgcPartyEpoch ?? 0) + 1;
    token.kgcPartyPortraits?.destroy({ children: true });
    token.kgcPartyPortraits = null;
    for (const p of token.kgcPartyImages ?? []) if (p) this.cache.release(p.src);
    token.kgcPartyImages = [];
  }
  install() {
    for (const event of ["drawToken", "refreshToken"]) Hooks.on(event, (t) => this.draw(t));
    Hooks.on("destroyToken", (t) => this.clear(t));
    Hooks.on("canvasPan", () => this.fitStrokes());
    Hooks.on("canvasTearDown", () => { for (const t of canvas.tokens?.placeables ?? []) this.clear(t); });
    Hooks.on("updateActor", (actor) => {
      for (const t of canvas.tokens?.placeables ?? []) if (t.actor?.id === actor.id || groupMembers(t.actor).some((a) => a.id === actor.id)) this.draw(t);
    });
  }
  async draw(token) {
    if (!groupActor(token) || token.destroyed) { if (token.kgcPartyPortraits) this.clear(token); return; }
    const members = groupMembers(token.actor), w = token.w ?? token.document.width * canvas.grid.size, h = token.h ?? token.document.height * canvas.grid.size;
    const key = JSON.stringify([members.map((a) => [a.id, a.img]), w, h]);
    if (token.kgcPartyKey === key) return;
    token.kgcPartyKey = key;
    const epoch = token.kgcPartyEpoch = (token.kgcPartyEpoch ?? 0) + 1;
    const images = await Promise.all(members.map((a) => this.cache.acquire(a.img).catch(() => null)));
    if (token.destroyed || token.kgcPartyEpoch !== epoch) { for (const p of images) if (p) this.cache.release(p.src); return; }
    for (const p of token.kgcPartyImages ?? []) if (p) this.cache.release(p.src);
    token.kgcPartyImages = images;
    token.kgcPartyPortraits?.destroy({ children: true });
    const root = token.kgcPartyPortraits = new PIXI.Container();
    root.eventMode = "none";
    token.addChild(root);
    const layout = portraitLayout(w, h, members.length), d = Math.min(w, h);
    const glow = new PIXI.Graphics();
    glow.blendMode = PIXI.BLEND_MODES.ADD;
    const track = new PIXI.Graphics();
    root.addChild(glow, track);
    const strokes = [];
    layout.forEach((p, i) => {
      if (!images[i]) {
        const label = new PIXI.Text((members[i].name ?? "?").slice(0, 1), { fontSize: p.r, fontFamily: "Signika, Arial", fill: 0xe8d6b5 });
        label.anchor.set(0.5);
        label.position.set(p.x, p.y);
        root.addChild(label);
      } else {
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawCircle(p.x, p.y, p.r).endFill();
        const sprite = new PIXI.Sprite(images[i].texture);
        sprite.anchor.set(0.5);
        sprite.position.set(p.x, p.y);
        sprite.width = sprite.height = p.r * 2;
        sprite.mask = mask;
        root.addChild(sprite, mask);
      }
      const g = new PIXI.Graphics();
      root.addChild(g);
      strokes.push({ g, p });
    });
    // Lines a steady width on screen at any zoom (redrawn on zoom: fitStrokes).
    token.kgcPartyStrokes = () => {
      if (root.destroyed) return;
      const zoom = (canvas.stage?.scale?.x || 1) * (token.kgcFitFactor || 1), line = Math.min(d * 0.03, Math.max(d * 0.004, 1.4 / zoom));
      drawOutline(track, glow, strokes, { width: w, height: h, radius: d * 0.468, line, colour: outlineColour() });
    };
    token.kgcPartyStrokes();
    token.kgcFitNow?.();
  }
  /** On zoom: the rings' lines kept a steady width on screen. */
  fitStrokes() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; for (const t of canvas.tokens?.placeables ?? []) t.kgcPartyStrokes?.(); });
  }
}

/* ---------------------------------------- */
/*  Findable when zoomed out                 */
/* ---------------------------------------- */

/** How much larger to draw a token of `px` scene pixels at a zoom, to be at least `min` on screen. */
export function tokenFitFactor(px, zoom, { min = 40, max = 60 } = {}) {
  const screen = px * zoom;
  return screen > 0 && screen < min ? Math.min(max, min / screen) : 1;
}

/** A mesh's scale times a factor. Foundry sets the scale itself at times: what differs from ours is its new base. */
function fitMesh(mesh, factor, state = {}) {
  if (!mesh?.scale) return state;
  const moved = !state.applied || Math.abs(mesh.scale.x - state.applied.x) > 1e-6 || Math.abs(mesh.scale.y - state.applied.y) > 1e-6;
  const base = moved ? { x: mesh.scale.x, y: mesh.scale.y } : state.base;
  const applied = { x: base.x * factor, y: base.y * factor };
  mesh.scale.set(applied.x, applied.y);
  return { base, applied };
}

/** On a city scene zoomed far out, a party token is drawn larger round its middle; nothing saved changes. */
class PartyTokenFit {
  constructor({ isCityScene }) { this.isCityScene = isCityScene; }
  install() {
    for (const hook of ["drawToken", "refreshToken"]) Hooks.on(hook, (t) => this.fit(t));
    Hooks.on("canvasPan", () => this.queue());
    Hooks.on("canvasReady", () => this.queue());
  }
  queue() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; for (const t of canvas.tokens?.placeables ?? []) this.fit(t); });
  }
  fit(token) {
    if (!token || token.destroyed || !token.mesh || token.mesh.destroyed) return;
    token.kgcFitNow ??= () => this.fit(token);
    const zoom = canvas.stage?.scale?.x || 1, w = token.w ?? 0, h = token.h ?? 0;
    const wanted = this.isCityScene(canvas.scene) && groupActor(token) ? tokenFitFactor(Math.max(w, h), zoom) : 1;
    if (wanted === 1 && !token.kgcFitState) return;
    token.kgcFitState = fitMesh(token.mesh, wanted, token.kgcFitState ?? {});
    token.kgcFitFactor = wanted;
    for (const part of [token.kgcPartyPortraits, token.border]) {
      if (!part || part.destroyed) continue;
      part.pivot.set(w / 2, h / 2);
      part.position.set(w / 2, h / 2);
      part.scale.set(wanted);
    }
    // Clickable as drawn.
    if (token.hitArea?.width != null) {
      const pad = (wanted - 1) / 2;
      Object.assign(token.hitArea, { x: -w * pad, y: -h * pad, width: w * wanted, height: h * wanted });
    }
  }
}

/* ---------------------------------------- */
/*  Split and merge                          */
/* ---------------------------------------- */

class PartyInterface {
  constructor(manager) { this.manager = manager; }
  install() {
    // The token HUD's party button: split one party, or merge the selected ones.
    Hooks.on("renderTokenHUD", (app, html) => {
      const t = app.object ?? app.document?.object;
      if (!groupActor(t) || !game.user.isGM) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || root.querySelector("[data-kgc-party]")) return;
      const merging = (canvas.tokens?.controlled ?? []).filter(groupActor).length > 1;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.kgcParty = "true";
      button.className = "control-icon";
      button.dataset.tooltip = merging ? "Merge the selected parties" : "Split the party";
      button.setAttribute("aria-label", button.dataset.tooltip);
      button.innerHTML = '<i class="fa-solid fa-people-arrows"></i>';
      button.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.editSelected(t).catch((err) => ui.notifications.error(`KG Cities: ${err.message}`)); };
      (root.querySelector(".col.right") ?? root).append(button);
    });
  }
  async editSelected(token) {
    const doc = tokenDoc(token);
    const selected = [...new Map([...(canvas.tokens?.controlled ?? []).filter(groupActor).map(tokenDoc), doc].map((t) => [t.id, t])).values()];
    selected.sort((a, b) => (partyMeta(a.actor)?.number ?? 1) - (partyMeta(b.actor)?.number ?? 1));
    return this.open(selected[0], selected[1] ?? null, selected.slice(2));
  }
  async open(left, right = null, extra = []) {
    if (!isPrimaryGM()) return ui.notifications.warn("KG Cities: the GM in charge (Foundry's active GM) manages parties.");
    const scene = left.parent, actors = familyActors(left.actor), stamp = rosterStamp(actors);
    const members = [...groupMembers(left.actor), ...(right ? groupMembers(right.actor) : []), ...extra.flatMap((t) => groupMembers(t.actor))];
    const all = new Map(members.map((a) => [a.id, a]));
    const rightIds = new Set(right ? [...groupMembers(right.actor), ...extra.flatMap((t) => groupMembers(t.actor))].map((a) => a.id) : []);
    const checked = new Set();
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: right ? "Merge parties" : "Split the party", icon: "fa-solid fa-people-arrows" },
      classes: ["kgc-ui", "kgc-party-dialog"], position: { width: 720 }, rejectClose: false,
      content: `<div class="kgc-party-transfer"><p class="hint">Drag people between the two sides. Shift-click to pick several, then drag one of them to move them together. Character sheets and their items do not change; the group's pooled items stay with the original party.</p>
        <div class="sides"><section data-side="left"><h3>${esc(left.name)}</h3><div class="members"></div></section><section data-side="right"><h3>${esc(right?.name ?? "New party")}</h3><div class="members"></div></section></div>
        <p class="hint" data-summary></p></div>`,
      buttons: [
        { action: "confirm", label: right ? "Merge" : "Split", icon: "fa-solid fa-check", default: true, callback: () => [...all.keys()].filter((id) => rightIds.has(id)) },
        { action: "cancel", label: "Cancel", callback: () => null }
      ],
      render: (_e, dialog) => {
        const root = dialog.element;
        const paint = () => {
          for (const side of ["left", "right"]) {
            const rows = [...all.values()].filter((a) => rightIds.has(a.id) === (side === "right"));
            root.querySelector(`[data-side="${side}"] .members`).innerHTML = rows.map((a) => `<div class="card ${checked.has(a.id) ? "selected" : ""}" draggable="true" data-member="${esc(a.id)}" tabindex="0" role="option" aria-selected="${checked.has(a.id)}"><i class="fa-solid fa-grip-vertical grip" aria-hidden="true"></i><img src="${esc(a.img)}" alt=""><span>${esc(a.name)}</span></div>`).join("") || '<p class="hint">Drop people here</p>';
          }
          const n = all.size - rightIds.size;
          root.querySelector("[data-summary]").textContent = `${n} in ${left.name}; ${rightIds.size} in ${right?.name ?? "the new party"}.`;
          root.querySelector('[data-action="confirm"]').disabled = !right && (!n || !rightIds.size);
        };
        const move = (ids, side) => { for (const id of ids) if (all.has(id)) { side === "right" ? rightIds.add(id) : rightIds.delete(id); checked.delete(id); } paint(); };
        // A click picks that card alone; Shift- or Ctrl-click adds it or takes it out.
        const pick = (id, add) => {
          if (add) { if (checked.has(id)) checked.delete(id); else checked.add(id); } else { checked.clear(); checked.add(id); }
          paint();
          root.querySelector(`[data-member="${CSS.escape(id)}"]`)?.focus();
        };
        root.addEventListener("click", (e) => { const id = e.target.closest("[data-member]")?.dataset.member; if (id) pick(id, e.shiftKey || e.ctrlKey || e.metaKey); });
        root.addEventListener("keydown", (e) => {
          const id = e.target.closest?.("[data-member]")?.dataset.member;
          if (id && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(id, e.shiftKey || e.ctrlKey || e.metaKey); }
        });
        root.addEventListener("dragstart", (e) => { const id = e.target.closest("[data-member]")?.dataset.member; if (id) e.dataTransfer.setData("application/x-kgc-party", JSON.stringify(checked.has(id) ? [...checked] : [id])); });
        root.addEventListener("dragover", (e) => { if (e.target.closest("[data-side]")) e.preventDefault(); });
        root.addEventListener("drop", (e) => {
          const side = e.target.closest("[data-side]")?.dataset.side;
          if (!side) return;
          e.preventDefault();
          try { move(JSON.parse(e.dataTransfer.getData("application/x-kgc-party")), side); } catch { /* not ours */ }
        });
        paint();
      }
    });
    if (Array.isArray(result)) await this.manager.commit({ scene, left, right, rightIds: result, stamp, extra });
  }
}

/* ---------------------------------------- */
/*  Install                                  */
/* ---------------------------------------- */

/**
 * At init: the outline colour setting, portraits, the zoomed-out fit and the HUD's party button.
 * Nothing when KG Realms is active (it draws and manages parties itself).
 */
export function installParty({ manager, isCityScene }) {
  if (realmsParties()) return false;
  const portraits = new PartyPortraits();
  game.settings.register(ID, "partyOutline", {
    name: "Party token outline", hint: "The colour of a party token's glowing ring and of its members' portrait rings.",
    scope: "world", config: true, type: new foundry.data.fields.ColorField({ nullable: false, initial: DEFAULT_OUTLINE }), default: DEFAULT_OUTLINE,
    onChange: () => portraits.fitStrokes()
  });
  portraits.install();
  new PartyTokenFit({ isCityScene }).install();
  new PartyInterface(manager).install();
  // Which group is the party: listed once the world's actors are loaded.
  Hooks.once("ready", () => {
    const groups = game.actors.filter((a) => a.type === "group" && !partyMeta(a)?.retired).sort((a, b) => a.name.localeCompare(b.name));
    game.settings.register(ID, "partyActor", {
      name: "The party",
      hint: "The group actor that is the players' party. Its name is the party's title: while the party is split, each group is named for who is in it (\"Leonard and Pierre\"); back together, it takes the title again. Empty uses dnd5e's primary party. Groups made since the world loaded show after a reload.",
      scope: "world", config: true, type: String, default: "",
      choices: { "": "dnd5e's primary party", ...Object.fromEntries(groups.map((a) => [a.id, partyTitle(a)])) }
    });
    watchPartyNames();
  });
  return true;
}

export { sceneParties };
