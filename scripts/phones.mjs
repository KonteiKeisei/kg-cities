// Phones and pagers in Foundry: the directory of numbers, who is at a place, calls and pages.
// Places have phones (a line or a payphone, on the landmark's record); people carry pagers (items
// on their actors, each with its own number, its memory of contacts and the pages it received).
// Each character also keeps an address book (the actor's own record): new pagers start from it,
// and contacts saved on a pager are written into it too, so a lost pager loses no names.
//
// Calls run on the GM in charge's client: players ask it (by socket) to dial, answer, hang up or
// send a page; it decides, rings whoever is at the place, charges payphone quarters and tells
// everyone the call's new state. Calls live only in memory: a reload of the GM's client ends them.

import { makeFrame, metres, sceneToLatLon } from "./geo.mjs";
import { groupMembers } from "./party.mjs";
import { pay, walletValue } from "./money.mjs";
import { DEVICES, OLD_MODELS, PAGER_MODELS, SERVICES, coinCopper, digits, findContact, formatNumber, freeNumber, fromOldLog, mergeBooks, pageFor, pushRecent, reach, sameNumber } from "./phone-core.mjs";

const ID = "kg-cities";
const SOCKET = `module.${ID}`;
/** How near a place a token must be to be at it (on the city map), in metres: about 300 feet. */
const NEAR_M = 90;
/** An unlisted number gives up and plays the intercept after this long, unless the GM answers. */
const INTERCEPT_MS = 8000;
/** An ended call stays on screen this long. */
const ENDED_MS = 4000;

const SOUNDS = `modules/${ID}/assets/sounds/phone`;
export const SOUND = {
  ring: `${SOUNDS}/ring.mp3`, ringback: `${SOUNDS}/ringbacktone.mp3`, dial: `${SOUNDS}/dialtone.mp3`,
  beep: `${SOUNDS}/pager-beep.mp3`, vibrate: `${SOUNDS}/vibrate.mp3`,
  key: (k) => `${SOUNDS}/dtmf/dtmf-${k === "*" ? "star" : k === "#" ? "hash" : k}.mp3`
};

const clone = (v) => foundry.utils.deepClone(v);
const cityOf = (scene) => (scene?.getFlag(ID, "city") ? scene.flags[ID] : null);
const isPrimaryGM = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;

/** Why a call ended, in the words a phone company recording would use. */
export const ENDINGS = {
  hangup: "Call ended.", noanswer: "No answer.", busy: "Busy signal.", incomplete: "Your call cannot be completed as dialed.",
  none: "The number you have reached is not in service.", coin: "Please deposit 25 cents.", gm: "No dial tone.", sent: "Page sent.",
  declined: "Call ended.", gone: "The line went dead."
};

/* ---------------------------------------- */
/*  Records                                  */
/* ---------------------------------------- */

/** A pager item's record: { model, number, contacts, recent, unread, alert }, or null. */
export const pagerOf = (item) => item?.flags?.[ID]?.pager ?? null;
/** A character's address book (the backup every new pager starts from). */
export const bookOf = (actor) => actor?.flags?.[ID]?.book ?? [];

/** The pager items on an actor. */
export const pagersOn = (actor) => (actor?.items ?? []).filter((i) => pagerOf(i));

/** The actors this user plays (their character first), groups and GM-only actors left out. */
export function myActors(user = game.user) {
  const own = game.actors.filter((a) => a.type !== "group" && a.testUserPermission(user, "OWNER") && (user.isGM ? a === user.character : a.hasPlayerOwner));
  const c = user.character;
  return c && own.includes(c) ? [c, ...own.filter((a) => a !== c)] : own;
}

/** The pager items this user carries (on the actors they play). */
export const myPagers = (user = game.user) => myActors(user).flatMap((a) => pagersOn(a));

/* ---------------------------------------- */
/*  The directory                            */
/* ---------------------------------------- */

/**
 * Every number: place phones { kind: "place", device, number, city, id, name, lat, lon, scene },
 * pagers { kind: "pager", number, actorId, itemId, name, model } and the GM's own numbers
 * { kind: "gm", id, number, name, note } (people and businesses not on the map).
 */
export function directory() {
  const out = [];
  const saved = game.settings.get(ID, "landmarks") ?? {};
  for (const [city, rec] of Object.entries(saved)) {
    for (const lm of rec?.list ?? []) {
      if (!lm?.phone?.number || !DEVICES[lm.phone.kind]) continue;
      out.push({ kind: "place", device: lm.phone.kind, number: lm.phone.number, city, id: lm.id, name: lm.name, lat: lm.lat, lon: lm.lon, scene: lm.scene ?? null, tone: lm.tone, visibility: lm.visibility ?? (lm.hidden ? "hidden" : "discovered") });
    }
  }
  for (const actor of game.actors) {
    for (const item of pagersOn(actor)) {
      const p = pagerOf(item);
      out.push({ kind: "pager", number: p.number ?? "", actorId: actor.id, itemId: item.id, name: actor.name, model: p.model ?? "numeric" });
    }
  }
  for (const n of game.settings.get(ID, "phoneNumbers") ?? []) if (n?.number) out.push({ kind: "gm", ...n });
  return out;
}

/** A place's phone entry, or null. */
export const placePhone = (city, id) => directory().find((e) => e.kind === "place" && e.city === city && e.id === id) ?? null;

/** Every number given out, for picking a new one. */
export const takenNumbers = () => directory().map((e) => e.number).filter(Boolean);
/** A fresh number nobody has. */
export const newNumber = () => freeNumber(takenNumbers());

/* ---------------------------------------- */
/*  Who is where                             */
/* ---------------------------------------- */

/** A token's actor and, for a party token, its members. */
const tokenActors = (t) => [t.actor, ...(t.actor?.type === "group" ? groupMembers(t.actor) : [])].filter(Boolean);

/**
 * The actors at a place: tokens (or party tokens) near it on any scene of its city, and every
 * token on the place's own scene (its interior, linked from the card).
 */
export function actorsAt(place) {
  const here = new Set();
  if (!place) return here;
  for (const scene of game.scenes) {
    const c = cityOf(scene);
    if (scene.id === place.scene) {
      for (const t of scene.tokens) for (const a of tokenActors(t)) here.add(a);
      continue;
    }
    if (c?.city !== place.city || !Number.isFinite(place.lat) || !c.bounds) continue;
    const rect = scene.dimensions?.sceneRect;
    if (!rect) continue;
    const frame = makeFrame(c.bounds, rect);
    for (const t of scene.tokens) {
      const size = scene.grid?.size ?? 100;
      const centre = { x: t.x + ((t.width ?? 1) * size) / 2, y: t.y + ((t.height ?? 1) * size) / 2 };
      if (metres(sceneToLatLon(frame, centre), place) > NEAR_M) continue;
      for (const a of tokenActors(t)) here.add(a);
    }
  }
  return here;
}

/** The actor this user would speak as at a place (their character first), or null when they are not there. */
export function speakerAt(place, user = game.user) {
  const here = actorsAt(place);
  return myActors(user).find((a) => here.has(a)) ?? null;
}

/** The players (active, not GM) with a character at a place: the ones who hear it ring. */
export function usersAt(place) {
  const here = [...actorsAt(place)];
  return game.users.filter((u) => u.active && !u.isGM && here.some((a) => a.type !== "group" && a.testUserPermission(u, "OWNER"))).map((u) => u.id);
}

/** The place phones where this user has a character now. */
export const phonesHere = (user = game.user) => directory().filter((e) => e.kind === "place" && speakerAt(e, user));

/* ---------------------------------------- */
/*  Sound                                    */
/* ---------------------------------------- */

const loops = new Map();
const volume = () => { try { return Number(game.settings.get(ID, "phoneVolume")) ?? 0.6; } catch { return 0.6; } };

/** Play a sound once, or looped under a key until stopped. */
export async function sound(src, { loop = null, vol = 1 } = {}) {
  if (!src || volume() <= 0) return null;
  if (loop) stopSound(loop);
  const s = await foundry.audio.AudioHelper.play({ src, volume: volume() * vol, loop: !!loop, autoplay: true }, false).catch(() => null);
  if (loop && s) {
    if (loops.has(loop)) s.stop(); // a newer one started meanwhile
    else loops.set(loop, s);
  }
  return s;
}
export function stopSound(key) {
  const s = loops.get(key);
  loops.delete(key);
  try { s?.stop(); } catch { /* already stopped */ }
}

/* ---------------------------------------- */
/*  Calls                                    */
/* ---------------------------------------- */

/**
 * The phone service. Every client keeps the calls it was told about (`calls`, by id); the GM in
 * charge's client decides. deps: dollarRate(), onChange(call) (redraw), onPage(info) (a page
 * arrived for this user), cityName(id).
 */
export class Phones {
  constructor(deps) {
    this.deps = deps;
    this.calls = new Map();
    this.timers = new Map();
  }

  install() {
    game.socket.on(SOCKET, (msg) => {
      if (msg?.action !== "phone") return;
      if (msg.op === "state") return this.#state(msg.call);
      if (msg.op === "paged") return this.#paged(msg);
      if (msg.op === "notice") { if (msg.userId === game.user.id) ui.notifications.info(msg.text); return; }
      if (isPrimaryGM()) this.#decide(msg).catch((err) => console.error(`${ID} | phone`, err));
    });
  }

  /** Ask the GM in charge; done here when that is us. */
  #ask(msg) {
    msg = { action: "phone", userId: game.user.id, ...msg };
    if (!game.users.activeGM) return false;
    if (isPrimaryGM()) this.#decide(msg).catch((err) => console.error(`${ID} | phone`, err));
    else game.socket.emit(SOCKET, msg);
    return true;
  }

  /* -------- Asking (any client) -------- */

  /**
   * Dial from a place's phone (from: { city, id }), or as the GM from nowhere (from: null, as:
   * the name the GM calls as). Returns the call id, or null when there is no GM to connect it.
   */
  dial(digitsDialled, { from = null, actorId = null, as = "", coin = false } = {}) {
    const callId = foundry.utils.randomID();
    // Shown at once as dialling; the GM's answer replaces it.
    const end = { ...(from ? { kind: "place", ...from } : { kind: "gm", name: as }), userId: game.user.id, actorId };
    this.#state({ id: callId, state: "dialing", from: end, to: { number: formatNumber(digitsDialled) }, at: Date.now() });
    if (!this.#ask({ op: "dial", callId, digits: digits(digitsDialled), from, actorId, as, coin })) {
      this.#state({ id: callId, state: "ended", reason: "gm", from: end, to: { number: formatNumber(digitsDialled) }, at: Date.now() });
      return null;
    }
    return callId;
  }
  answer(callId, { actorId = null } = {}) { return this.#ask({ op: "answer", callId, actorId }); }
  hangup(callId) { return this.#ask({ op: "hangup", callId }); }
  /** The GM: an unlisted number plays the intercept now. */
  intercept(callId) { return this.#ask({ op: "intercept", callId }); }
  /** Send a page on a call that reached a pager: text (alphanumeric) or callback digits. */
  page(callId, { text = "", callback = "" } = {}) { return this.#ask({ op: "page", callId, text, callback }); }
  /** The GM pages a number straight from the switchboard. */
  pageDirect(number, { text = "", callback = "", from = "" } = {}) { return this.#ask({ op: "pageDirect", number, text, callback, fromName: from }); }

  /** Calls this user should see: theirs, ringing for them, the place's (for those there), or all (the GM). */
  mine() {
    return [...this.calls.values()].filter((c) => game.user.isGM || this.involves(c));
  }
  involves(c, userId = game.user.id) {
    return c.from?.userId === userId || c.ringUsers?.includes(userId) || c.answeredBy?.userId === userId;
  }
  /** The live call on a place's phone (made from it, or to it), or null. */
  onPlace(city, id) {
    const live = [...this.calls.values()].filter((c) => c.state !== "ended" || Date.now() - (c.endedAt ?? 0) < ENDED_MS);
    const at = (end) => end?.kind === "place" && end.city === city && end.id === id;
    return live.filter((c) => at(c.from) || at(c.to)).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0] ?? null;
  }

  /* -------- Hearing (any client) -------- */

  #state(call) {
    if (!call?.id) return;
    const before = this.calls.get(call.id);
    this.calls.set(call.id, call);
    clearTimeout(this.timers.get(`drop:${call.id}`));
    if (call.state === "ended") {
      call.endedAt ??= Date.now();
      this.timers.set(`drop:${call.id}`, setTimeout(() => { this.calls.delete(call.id); this.deps.onChange?.(call, before, true); }, ENDED_MS));
    }
    this.#sounds(call, before);
    this.deps.onChange?.(call, before, false);
  }

  /** Bells for those at a ringing phone, the ringback for its caller; silence after. */
  #sounds(call, before) {
    const me = game.user.id, key = (k) => `${k}:${call.id}`;
    const ringingHere = call.state === "ringing" && (call.ringUsers?.includes(me) || (game.user.isGM && call.gmRings));
    const callerWaits = call.state === "ringing" && call.from?.userId === me;
    if (ringingHere && before?.state !== "ringing") sound(SOUND.ring, { loop: key("ring") });
    if (!ringingHere) stopSound(key("ring"));
    if (callerWaits && before?.state !== "ringing") sound(SOUND.ringback, { loop: key("ringback"), vol: 0.6 });
    if (!callerWaits) stopSound(key("ringback"));
  }

  /** Let it ring, here only: the bell stops for this user. */
  silence(callId) { stopSound(`ring:${callId}`); }

  #paged(msg) {
    if (!msg.userIds?.includes(game.user.id)) return;
    this.deps.onPage?.(msg);
  }

  /* -------- Deciding (the GM in charge) -------- */

  #send(call) {
    game.socket.emit(SOCKET, { action: "phone", op: "state", call: clone(call) });
    this.#state(clone(call));
  }
  #tell(userId, text) {
    if (userId === game.user.id) return ui.notifications.info(text);
    game.socket.emit(SOCKET, { action: "phone", op: "notice", userId, text });
  }
  #end(call, reason) {
    clearTimeout(this.timers.get(`ring:${call.id}`));
    clearTimeout(this.timers.get(`intercept:${call.id}`));
    Object.assign(call, { state: "ended", reason, endedAt: Date.now() });
    this.#send(call);
  }
  #busy(entry, except) {
    const at = (end) => end?.kind === "place" && end.city === entry.city && end.id === entry.id;
    return [...this.calls.values()].some((c) => c.id !== except && c.state !== "ended" && (at(c.from) || at(c.to)));
  }
  #rate() { return Number(this.deps.dollarRate?.()) || 1000; }
  /** Take a quarter from the actor's coins; true when paid (or nothing to pay from). */
  async #coin(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor?.system?.currency) return true;
    const r = pay(actor.system.currency, coinCopper(this.#rate()));
    if (!r) return false;
    await actor.update({ "system.currency": r.after });
    return true;
  }

  async #decide(msg) {
    const user = game.users.get(msg.userId);
    if (!user) return;
    const call = msg.callId ? this.calls.get(msg.callId) : null;
    switch (msg.op) {
      case "dial": return this.#dial(msg, user);
      case "answer": {
        if (!call || call.state !== "ringing") return;
        const gm = user.isGM && !call.ringUsers?.includes(user.id);
        if (!gm && !call.ringUsers?.includes(user.id)) return;
        // The one who answers must still be there.
        const actor = msg.actorId ? game.actors.get(msg.actorId) : null;
        if (!gm && call.to.kind === "place" && !(actor && actorsAt(placePhone(call.to.city, call.to.id)).has(actor))) return this.#tell(user.id, "You are not at that phone any more.");
        if (call.coin && !(await this.#coin(call.from.actorId))) return this.#end(call, "coin");
        clearTimeout(this.timers.get(`ring:${call.id}`));
        clearTimeout(this.timers.get(`intercept:${call.id}`));
        Object.assign(call, { state: "connected", connectedAt: Date.now(), answeredBy: { userId: user.id, actorId: actor?.id ?? null, gm, name: gm ? "GM" : actor?.name ?? user.name }, paid: !!call.coin });
        return this.#send(call);
      }
      case "hangup": {
        if (!call || call.state === "ended") return;
        if (!user.isGM && !this.involves(call, user.id)) return;
        // Someone at the ringing place who walks away just lets it ring for themselves.
        if (call.state === "ringing" && call.from?.userId !== user.id && !user.isGM) return;
        return this.#end(call, "hangup");
      }
      case "intercept": if (call && user.isGM && call.state === "ringing") return this.#end(call, "none"); return;
      case "page": return this.#page(call, msg, user);
      case "pageDirect": {
        if (!user.isGM) return;
        const to = reach(msg.number, directory());
        if (to.kind !== "pager") return this.#tell(user.id, `KG Cities: ${formatNumber(msg.number)} is not a pager.`);
        return this.#deliver(to, { text: msg.text, callback: msg.callback });
      }
    }
  }

  async #dial(msg, user) {
    const from = msg.from ? placePhone(msg.from.city, msg.from.id) : null;
    const base = { id: msg.callId, at: Date.now(), from: { kind: from ? "place" : "gm", ...(from ? { city: from.city, id: from.id, name: from.name, number: from.number, device: from.device } : { name: msg.as || "Unknown caller" }), userId: user.id, actorId: msg.actorId ?? null }, to: { number: digits(msg.digits) } };
    const call = { ...base, state: "ringing", ringUsers: [] };
    if (!user.isGM && !from) return this.#end(call, "gone");
    // A player dials from a phone only when their character is there.
    if (!user.isGM) {
      const actor = game.actors.get(msg.actorId);
      if (!actor?.testUserPermission(user, "OWNER") || !actorsAt(from).has(actor)) return this.#end(call, "gone");
    }
    const to = reach(msg.digits, directory());
    call.to = { ...to, number: to.number ? formatNumber(to.number) : formatNumber(msg.digits) };
    // A payphone wants its quarter, except for the free numbers.
    call.coin = from?.device === "payphone" && !user.isGM && !(to.kind === "service" && to.free);
    if (call.coin && !msg.coin) return this.#end(call, "coin");
    if (call.coin) {
      const actor = game.actors.get(msg.actorId);
      if (actor?.system?.currency && walletValue(actor.system.currency) < coinCopper(this.#rate())) return this.#end(call, "coin");
    }
    if (to.kind === "incomplete") return this.#end(call, "incomplete");
    if (to.kind === "pager") { call.state = "paging"; return this.#send(call); }
    if (to.kind === "place") {
      if (from && to.city === from.city && to.id === from.id) return this.#end(call, "busy");
      if (this.#busy(to, call.id)) return this.#end(call, "busy");
      call.ringUsers = usersAt(to);
    }
    // Everything else rings at the GM: services, the GM's numbers, unlisted numbers (until the
    // intercept), and every place too (the GM may answer for whoever is there).
    call.gmRings = to.kind !== "place";
    this.calls.set(call.id, call);
    const ringFor = Math.max(5, Number(game.settings.get(ID, "phoneRingSeconds")) || 30) * 1000;
    this.timers.set(`ring:${call.id}`, setTimeout(() => { const c = this.calls.get(call.id); if (c?.state === "ringing") this.#end(c, "noanswer"); }, ringFor));
    if (to.kind === "none") this.timers.set(`intercept:${call.id}`, setTimeout(() => { const c = this.calls.get(call.id); if (c?.state === "ringing") this.#end(c, "none"); }, INTERCEPT_MS));
    this.#send(call);
  }

  async #page(call, msg, user) {
    if (!call || call.state !== "paging" || call.from?.userId !== user.id) return;
    if (call.coin && !(await this.#coin(call.from.actorId))) return this.#end(call, "coin");
    const to = reach(call.to.number, directory());
    if (to.kind !== "pager") return this.#end(call, "none");
    await this.#deliver(to, { text: msg.text, callback: msg.callback });
    call.paid = !!call.coin;
    return this.#end(call, "sent");
  }

  /** A page into a pager's memory, and the alert to whoever carries it. */
  async #deliver(to, { text, callback }) {
    const actor = game.actors.get(to.actorId), item = actor?.items.get(to.itemId), p = pagerOf(item);
    if (!p) return;
    const shown = pageFor(p.model, { text, callback });
    const entry = { id: foundry.utils.randomID(), at: Date.now(), time: game.time.worldTime, text: shown.text, callback: shown.callback ? formatNumber(shown.callback) : "" };
    await item.update({ [`flags.${ID}.pager.recent`]: pushRecent(p.recent ?? [], entry), [`flags.${ID}.pager.unread`]: (p.unread ?? 0) + 1 });
    const userIds = game.users.filter((u) => u.active && !u.isGM && actor.testUserPermission(u, "OWNER")).map((u) => u.id);
    const msg = { action: "phone", op: "paged", userIds, actorId: actor.id, itemId: item.id, entry };
    game.socket.emit(SOCKET, msg);
    this.#paged(msg);
  }

  /** The GM in charge changed or left: calls it held are gone. */
  dropAll() {
    for (const c of this.calls.values()) if (c.state !== "ended") this.#state({ ...c, state: "ended", reason: "gone", endedAt: Date.now() });
  }
}

/* ---------------------------------------- */
/*  Pagers and address books                 */
/* ---------------------------------------- */

/** The item type a pager is made as: dnd5e's loot (a trinket), else the system's first. */
function pagerItemType() {
  const types = game.documentTypes?.Item ?? Object.keys(CONFIG.Item.dataModels ?? {});
  return types.includes("loot") ? "loot" : types.find((t) => t !== "base") ?? "base";
}

/** Give an actor a pager of a model, with a fresh number and their address book in its memory. */
export async function givePager(actor, model = "numeric", { number = null } = {}) {
  const m = PAGER_MODELS[model] ?? PAGER_MODELS.numeric;
  const type = pagerItemType();
  const system = type === "loot" ? { description: { value: `<p><strong>${m.mode} pager</strong>, ${m.year}.</p><p>${m.description}</p>` }, quantity: 1, weight: { value: 0.5, units: "lb" }, type: { value: "trinket" } } : {};
  const pager = { model, number: number ?? newNumber(), contacts: clone(bookOf(actor)), recent: [], unread: 0, alert: "beep" };
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: m.name, type, img: `modules/${ID}/${m.img}`, system, flags: { [ID]: { pager } } }]);
  return item;
}

/** Save the pager's contacts and copy them into its carrier's address book (the backup). */
export async function setPagerContacts(item, contacts) {
  await item.update({ [`flags.${ID}.pager.contacts`]: contacts });
  const actor = item.parent;
  if (actor?.isOwner) await actor.setFlag(ID, "book", mergeBooks(bookOf(actor), contacts));
}

/** Fill a pager's memory from its carrier's address book (adding what it lacks). Returns how many were added. */
export async function restorePager(item) {
  const p = pagerOf(item), book = bookOf(item.parent);
  const merged = mergeBooks(p.contacts ?? [], book);
  const added = merged.length - (p.contacts ?? []).length;
  if (added || merged.some((c, i) => c.name !== p.contacts?.[i]?.name)) await item.update({ [`flags.${ID}.pager.contacts`]: merged });
  return added;
}

/** The name a number goes by for this actor (their pager's memory, then their address book), or "". */
export function nameFor(number, { actor = null, item = null } = {}) {
  const c = findContact(pagerOf(item)?.contacts ?? [], number) ?? findContact(bookOf(actor ?? item?.parent), number);
  return c?.name ?? "";
}

/** A new pager arrives empty on an actor with an address book: it takes the book. The GM in charge does it. */
export function watchNewPagers() {
  Hooks.on("createItem", (item) => {
    if (!isPrimaryGM() || !item.parent || !pagerOf(item)) return;
    if ((pagerOf(item).contacts ?? []).length || !bookOf(item.parent).length) return;
    item.update({ [`flags.${ID}.pager.contacts`]: clone(bookOf(item.parent)) }).catch(() => {});
  });
}

/* ---------------------------------------- */
/*  From Unsleeping Pagers                   */
/* ---------------------------------------- */

const OLD = "unsleeping-pagers";

/**
 * Unsleeping Pagers' data as ours, once (the GM in charge, on load). Its data stays on the
 * documents whether or not that module is still installed, so it is read straight from them:
 * pager items (flags.unsleeping-pagers.pagerType) become pagers of the same model, taking the
 * actor's pager number (the first; any other pager on the actor gets a new one); each player's
 * page log goes onto the pager of the character they play, its senders into that pager's memory
 * and the character's address book. Nothing old is removed; done items and users are marked, so
 * it never runs twice. Returns { pagers, pages }.
 */
export async function migrateUnsleepingPagers() {
  if (!isPrimaryGM()) return { pagers: 0, pages: 0 };
  const old = (doc) => doc?._source?.flags?.[OLD] ?? doc?.flags?.[OLD] ?? null;
  const art = (img) => (!img || String(img).includes(`modules/${OLD}/`) ? null : img);
  let pagers = 0, pages = 0;
  for (const actor of game.actors) {
    const items = actor.items.filter((i) => old(i)?.pagerType && !pagerOf(i));
    if (!items.length) continue;
    let number = formatNumber(old(actor)?.pagerNumber ?? "");
    for (const item of items) {
      const model = OLD_MODELS[old(item).pagerType] ?? "numeric";
      const pager = { model, number: digits(number).length >= 3 ? number : newNumber(), contacts: clone(bookOf(actor)), recent: [], unread: 0, alert: "beep", migrated: OLD };
      number = ""; // a second pager on the same actor gets a number of its own
      await item.update({ [`flags.${ID}.pager`]: pager, ...(art(item.img) ? {} : { img: `modules/${ID}/${PAGER_MODELS[model].img}` }) });
      pagers++;
    }
  }
  // Players' page logs onto the pager of the character they play.
  for (const user of game.users) {
    if (user.isGM || user.flags?.[ID]?.pagerLogMigrated) continue;
    const log = old(user)?.history;
    if (!Array.isArray(log) || !log.length) continue;
    const item = myPagers(user)[0];
    if (!item) continue;
    const { recent, contacts } = fromOldLog(log, () => foundry.utils.randomID());
    const p = pagerOf(item);
    const merged = [...recent, ...(p.recent ?? [])].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-30);
    await item.update({ [`flags.${ID}.pager.recent`]: merged, [`flags.${ID}.pager.contacts`]: mergeBooks(p.contacts ?? [], contacts) });
    await item.parent.setFlag(ID, "book", mergeBooks(bookOf(item.parent), contacts));
    await user.update({ [`flags.${ID}.pagerLogMigrated`]: true });
    pages += recent.length;
  }
  if (pagers || pages) {
    ui.notifications.info(`KG Cities: moved ${pagers} pager${pagers === 1 ? "" : "s"} and ${pages} page${pages === 1 ? "" : "s"} over from Unsleeping Pagers. You can disable that module.`, { permanent: true });
    if (game.modules.get(OLD)?.active) ui.notifications.warn("KG Cities: Unsleeping Pagers is still enabled. Disable it, or players see two pagers.", { permanent: true });
  }
  return { pagers, pages };
}

export { SERVICES, DEVICES, PAGER_MODELS, formatNumber, sameNumber };
