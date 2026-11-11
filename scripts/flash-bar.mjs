// Flash Token Bar 5e (module "flash-rolls-5e"), when it is active. On a city scene:
//  - its bar opens on the Group tab (once per scene visit; the GM can still click another tab);
//  - every party with a token on the scene is listed there, folded, with one picture of its people;
//  - a plain click picks just that party (shift-click adds), instead of Flash's add-to-selection.
//
// Why a bridge is needed: Flash's "show only PCs with a token" (on by default) drops a group when
// none of its MEMBERS has a token on the scene, and party members ride inside the party token.
// So while Flash builds its Group tab on a city scene, that one setting reads false, and the rows
// are then trimmed to groups that really are on the scene (a party token, or a member token).
// Flash lists groups from the active scene (game.scenes.current), so the city scene must be the
// active one, as it is in play.

import { groupMembers, isPrimaryGM, isVehicle, partyMeta } from "./party.mjs";

/** Flash's portrait tile is about 4 wide by 5 tall: the picture is drawn at that shape. */
const PIC_W = 160, PIC_H = 200, PIC_GAP = 4;
const pictures = new Map(); // member pictures, joined -> Promise<data URL | null>

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src) && !src.startsWith(location.origin)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Cells for n pictures: 1 whole; 2 side by side; 3 one tall and two stacked; 4 or more a 2 by 2. */
function cells(n) {
  const w = PIC_W, h = PIC_H, g = PIC_GAP, hw = (w - g) / 2, hh = (h - g) / 2;
  if (n <= 1) return [[0, 0, w, h]];
  if (n === 2) return [[0, 0, hw, h], [hw + g, 0, hw, h]];
  if (n === 3) return [[0, 0, hw, h], [hw + g, 0, hw, hh], [hw + g, hh + g, hw, hh]];
  return [[0, 0, hw, hh], [hw + g, 0, hw, hh], [0, hh + g, hw, hh], [hw + g, hh + g, hw, hh]];
}

/** A party's people (its vehicles left out) in one picture, cropped to their faces; null when it cannot be drawn. */
async function partyPicture(actor) {
  if (!actor || actor.type !== "group") return null;
  const all = groupMembers(actor), people = all.filter((a) => !isVehicle(a));
  const srcs = (people.length ? people : all).map((a) => a.img).filter(Boolean).slice(0, 4);
  if (!srcs.length) return null;
  const key = srcs.join("|");
  if (!pictures.has(key)) pictures.set(key, (async () => {
    const imgs = await Promise.all(srcs.map((s) => loadImage(s).catch(() => null)));
    const canvasEl = document.createElement("canvas");
    canvasEl.width = PIC_W; canvasEl.height = PIC_H;
    const ctx = canvasEl.getContext("2d");
    cells(imgs.length).forEach(([x, y, w, h], i) => {
      const img = imgs[i];
      if (!img) return;
      // Cover the cell, kept to the top where the faces are.
      const k = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / k, sh = h / k;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, x, y, w, h);
    });
    try { return canvasEl.toDataURL("image/webp", 0.85); } catch { return null; } // a picture from elsewhere taints it
  })());
  return pictures.get(key);
}

const FLASH = "flash-rolls-5e";
const MENU_ID = "flash-rolls-menu";
const TOKEN_ONLY = "show-only-pcs-with-token";
const REFRESH = "flash-token-bar.refreshMenu";
/** Changes come in bursts (a split creates a group, its token, and renames): one refresh after. */
const SETTLE_MS = 300;

export function installFlashBar({ isCityScene }) {
  const active = () => !!game.modules.get(FLASH)?.active;
  const onCity = () => !!canvas?.scene && isCityScene(canvas.scene);
  let forcing = 0;
  let groupTabFor = null; // the scene the Group tab was last switched on for
  let timer = null;
  const refresh = () => {
    if (!active()) return;
    clearTimeout(timer);
    timer = setTimeout(() => Hooks.callAll(REFRESH), SETTLE_MS);
  };

  // "Show only PCs with a token" reads false while Flash builds its Group tab on a city scene.
  const get = game.settings.get;
  game.settings.get = function (namespace, key, ...rest) {
    if (forcing > 0 && namespace === FLASH && key === TOKEN_ONLY) return false;
    return get.call(this, namespace, key, ...rest);
  };

  /** Groups on this scene: a token of the group itself, or a member's own token. Retired ones never. */
  function onScene(row, scene) {
    const actor = game.actors.get(row.id);
    if (!actor || partyMeta(actor)?.retired) return false;
    if (scene.tokens.some((t) => t.actorId === row.id)) return true;
    return (row.members ?? []).some((m) => m.tokenId);
  }

  function patch(app) {
    const proto = Object.getPrototypeOf(app);
    if (proto.__kgCities) return;
    const original = proto._prepareContext;
    proto._prepareContext = async function (options) {
      if (!onCity()) return original.call(this, options);
      const scene = canvas.scene;
      if (groupTabFor !== scene.id) { groupTabFor = scene.id; this.currentTab = "group"; }
      if (this.currentTab !== "group") return original.call(this, options);
      // Groups start folded (Flash opens them all); the GM's own unfolding is kept as Flash keeps it.
      this.groupExpansionStates ??= {};
      for (const a of game.actors) if (a.type === "group" && this.groupExpansionStates[a.id] === undefined) this.groupExpansionStates[a.id] = false;
      forcing++;
      let context;
      try { context = await original.call(this, options); } finally { forcing--; }
      if (Array.isArray(context?.groups)) {
        context.groups = context.groups.filter((row) => onScene(row, scene));
        // One picture of everyone in the party (Flash stacks 2 to 4 in a column too narrow to see them).
        for (const row of context.groups) {
          const url = await partyPicture(game.actors.get(row.id)).catch(() => null);
          if (url) row.memberImages = [url];
        }
      }
      return context;
    };
    // A plain click picks just that party (or member); shift-click adds to what is picked, as Flash does.
    const click = proto._onActorClick;
    if (click) proto._onActorClick = function (event) {
      if (onCity() && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.target?.closest?.(".actor-select")) {
        const el = event.currentTarget, keep = new Set();
        if (el?.classList?.contains("actor-group")) {
          const row = (this._lastPreparedContext?.groups ?? []).find((g) => g.id === el.dataset.actorId);
          for (const m of row?.members ?? []) keep.add(m.uniqueId);
        } else if (el?.dataset?.id) keep.add(el.dataset.id);
        for (const id of [...(this.selectedActors ?? [])]) {
          if (keep.has(id)) continue;
          const isActor = game.actors.has(id), actorId = isActor ? id : canvas.scene?.tokens.get(id)?.actorId;
          if (actorId) this._toggleActorSelection(id, actorId, isActor ? null : id);
          else this.selectedActors.delete(id);
        }
        this._updateGroupSelectionUI?.();
      }
      return click.call(this, event);
    };
    proto.__kgCities = true;
  }

  // The menu exists once Flash renders it; patch its class then, and redraw with the patch.
  Hooks.on("renderApplicationV2", (app) => {
    if (app?.id !== MENU_ID || !active()) return;
    const fresh = !Object.getPrototypeOf(app).__kgCities;
    patch(app);
    if (fresh) app.render();
  });

  Hooks.on("canvasReady", () => {
    if (!active()) return;
    if (!onCity()) groupTabFor = null;
    refresh();
  });
  for (const hook of ["createToken", "deleteToken", "createActor", "deleteActor"]) Hooks.on(hook, () => onCity() && refresh());
  Hooks.on("updateActor", (actor, changes) => {
    if (actor.type !== "group" || !onCity()) return;
    const u = foundry.utils;
    if (u.hasProperty(changes, "system.members") || u.hasProperty(changes, "flags.kg-cities.party") || u.hasProperty(changes, "flags.kg-realms.party") || "name" in changes || "img" in changes) refresh();
  });

  // An earlier build marked parties as Flash favourites; that flag does nothing for groups. Clear it.
  Hooks.once("ready", async () => {
    if (!active() || !isPrimaryGM()) return;
    const updates = game.actors.filter((a) => a.type === "group" && partyMeta(a) && a.flags?.[FLASH]?.isFavorite === true)
      .map((a) => ({ _id: a.id, [`flags.${FLASH}.isFavorite`]: false }));
    if (updates.length) await Actor.updateDocuments(updates, { kgCitiesParty: true });
  });
}
