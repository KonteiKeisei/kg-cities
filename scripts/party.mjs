// Party tokens, ported from KG Realms (party-groups.mjs, party-manager.mjs): a party is a dnd5e
// group actor on the scene; splitting one makes a second group (and its token) from some of its
// members, and merging puts them back. While a party is split, each group is named for who is in
// it ("Leonard and Pierre"); back together, it takes its own title again.
//
// Kept compatible with KG Realms: its party records (flags["kg-realms"].party) are read as our own,
// and when KG Realms is active it manages parties itself (installParty does nothing then), so a world
// never has two kinds of party. On their own, KG Cities' records live in flags["kg-cities"].party.

const ID = "kg-cities";
const REALMS = "kg-realms";
const locks = new Map();
const clone = (v) => foundry.utils.deepClone(v);
const meta = (family, baseName, number, generated = false) => ({ family, baseName, number, generated });

/** A name to list someone by: their first name, or the whole name when it starts with a title ("Det. Hanlon"). */
export function shortName(name) {
  const full = String(name ?? "").trim(), first = full.split(/\s+/)[0] ?? "";
  return !first || /\.$/.test(first) || first.length <= 2 ? full : first;
}

/** "Leonard", "Leonard and Pierre", "Leonard, Pierre and Dot", "Leonard, Pierre and 2 others". */
export function listNames(names) {
  const n = names.map(shortName).filter(Boolean);
  if (n.length <= 1) return n[0] ?? "Party";
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  if (n.length === 3) return `${n[0]}, ${n[1]} and ${n[2]}`;
  return `${n[0]}, ${n[1]} and ${n.length - 2} others`;
}

/** A vehicle actor: dnd5e's vehicle type, or one the GM marked as a vehicle (KG Cities' travel window). */
export const isVehicle = (a) => a?.type === "vehicle" || !!a?.flags?.[ID]?.vehicle?.vehicle;

/**
 * A group's name: its own title when it is the whole party (one live group), else who is in it.
 * Only people name it: a party's vehicles ride along unnamed.
 */
export const partyName = (title, members, count) => (count > 1 ? listNames(members.filter((a) => !isVehicle(a)).map((a) => a.name)) : title);

/** KG Realms is running and manages parties itself. */
export const realmsParties = () => !!game.modules.get(REALMS)?.active;
/** The one GM who makes shared changes: Foundry's active GM. */
export const isPrimaryGM = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;

/** A party's record: { family, baseName, number, generated, retired? }, ours or KG Realms'. */
export const partyMeta = (actor) => actor?.flags?.[ID]?.party ?? actor?.flags?.[REALMS]?.party ?? null;
const metaScope = () => (realmsParties() ? REALMS : ID);

/** A token (or its document) whose actor is a party: a group actor not retired by a merge. */
export const groupActor = (token) => {
  const a = token?.actor ?? token?.document?.actor;
  return a?.type === "group" && !partyMeta(a)?.retired;
};
export const tokenDoc = (token) => token?.document ?? token;

/** A group's members (actors, not groups), each once. */
export function groupMembers(actor) {
  const rows = actor?.system?.members;
  if (actor?.type !== "group" || !Array.isArray(rows)) return [];
  return [...new Map(rows.map((row) => {
    let a = row?.actor ?? row;
    if (typeof a === "string") a = game.actors?.get(a.replace(/^Actor\./, ""));
    return a?.id && a.type !== "group" ? [a.id, a] : null;
  }).filter(Boolean)).values()];
}

/** A group's member rows as stored ({ actor: id, ... }), for moving between groups unchanged. */
export function memberRows(actor) {
  const raw = actor?.toObject?.().system?.members ?? actor?._source?.system?.members;
  if (Array.isArray(raw)) return raw.map((row) => (typeof row === "string" ? { actor: row } : { ...row, actor: typeof row.actor === "string" ? row.actor : row.actor?.id }));
  return groupMembers(actor).map((a) => ({ actor: a.id }));
}

/** The party tokens on a scene, one per party, in party order. */
export function sceneParties(scene) {
  const seen = new Set();
  return Array.from(scene?.tokens ?? []).filter((t) => {
    if (!groupActor(t) || seen.has(t.actor.id)) return false;
    seen.add(t.actor.id);
    return true;
  }).sort((a, b) => (partyMeta(a.actor)?.number ?? 1) - (partyMeta(b.actor)?.number ?? 1));
}

/** Every live group of a party's family: the original and those split from it. */
export function familyActors(actor) {
  const family = partyMeta(actor)?.family ?? actor.id;
  return Array.from(game.actors ?? []).filter((a) => a.type === "group" && !partyMeta(a)?.retired && (a.id === family || partyMeta(a)?.family === family));
}

/**
 * The party: the group actor the setting names, else dnd5e's primary party, else null. Its title
 * is the party's own name; split groups of it are named for their members.
 */
export function baseParty() {
  let id = "";
  try { id = game.settings.get(ID, "partyActor") ?? ""; } catch { /* not registered yet */ }
  const set = id ? game.actors.get(id) : null;
  if (set?.type === "group") return set;
  try { const primary = game.settings.get("dnd5e", "primaryParty")?.actor; if (primary?.type === "group") return primary; } catch { /* not dnd5e */ }
  return null;
}

/** A party's own title: kept in its record once it is split, so renaming its groups never loses it. */
export function partyTitle(actor) {
  const family = partyMeta(actor)?.family ?? actor?.id;
  const root = (family && game.actors.get(family)) ?? actor;
  return partyMeta(root)?.baseName ?? partyMeta(actor)?.baseName ?? root?.name ?? "Party";
}

/**
 * Name a party's groups and their tokens: each for who is in it while the party is split, the
 * party's title when one group holds everyone. The GM in charge only; nothing changes when the
 * names are already right.
 */
export async function nameFamily(actor) {
  if (!isPrimaryGM() || actor?.type !== "group") return;
  const actors = familyActors(actor), title = partyTitle(actor);
  const updates = actors.map((a) => ({ _id: a.id, name: partyName(title, groupMembers(a), actors.length) }))
    .filter((u) => game.actors.get(u._id)?.name !== u.name);
  if (!updates.length) return;
  await Actor.updateDocuments(updates.map((u) => ({ ...u, "prototypeToken.name": u.name })), { kgCitiesParty: true });
  const names = new Map(updates.map((u) => [u._id, u.name]));
  for (const s of game.scenes) {
    const tokens = Array.from(s.tokens ?? []).filter((t) => names.has(t.actorId) && t.name !== names.get(t.actorId));
    if (tokens.length) await s.updateEmbeddedDocuments("Token", tokens.map((t) => ({ _id: t.id, name: names.get(t.actorId) })), { kgCitiesParty: true });
  }
}

/**
 * Keep names right as people change (the GM in charge): a group whose members were changed on its
 * sheet is named again with its family; a party the GM renames while it is together takes that
 * name as its title. Call once, at ready.
 */
export function watchPartyNames() {
  Hooks.on("updateActor", (actor, changes, options) => {
    if (actor.type !== "group" || options?.kgCitiesParty || !isPrimaryGM() || realmsParties()) return;
    if (foundry.utils.hasProperty(changes, "system.members")) return nameFamily(actor);
    if ("name" in changes && familyActors(actor).length === 1 && partyMeta(actor)) {
      return actor.update({ [`flags.${ID}.party.baseName`]: changes.name }, { kgCitiesParty: true });
    }
  });
}

/** A fingerprint of a family's rosters: a split or merge window refuses to save if it changed meanwhile. */
export const rosterStamp = (actors) => JSON.stringify(actors.map((a) => [a.id, memberRows(a), partyMeta(a)]));

/**
 * The party to act on: the one given, else the selected party token, else the scene's only one.
 * Throws when several parties are here and none is selected; null when there is none.
 */
export function selectedParty(scene, explicit = null) {
  const parties = sceneParties(scene);
  if (explicit) return parties.find((t) => t.actor.id === explicit || t.id === explicit) ?? null;
  const selected = canvas?.scene?.id === scene?.id ? (canvas.tokens?.controlled ?? []).filter(groupActor) : [];
  if (selected.length === 1) return parties.find((t) => t.id === tokenDoc(selected[0]).id) ?? null;
  if (parties.length === 1) return parties[0];
  if (parties.length > 1) throw new Error("Select one party token first.");
  return null;
}

/** Splitting and merging parties (the GM in charge). */
export class PartyManager {
  /** busy(actorId): the party is travelling; stopTravel(actorId): stop it where it is; changed(scene). */
  constructor({ busy = () => false, stopTravel = null, changed = () => {} } = {}) {
    Object.assign(this, { busy, stopTravel, changed });
  }

  /**
   * Split (left alone: rightIds go to a new party) or merge (right and extra fold into left, or
   * left into right). rightIds: the member actor ids that end up on the right.
   */
  async commit({ scene, left, right = null, rightIds, stamp, extra = [] }) {
    if (!isPrimaryGM()) throw new Error("Only the GM in charge can split or merge parties.");
    if (left.actor?.type !== "group" || (right && right.actor?.type !== "group")) throw new Error("Party tokens must use group actors.");
    const family = partyMeta(left.actor)?.family ?? left.actor.id;
    if (locks.has(family)) throw new Error("This party is already being changed.");
    const task = this.#perform({ scene, left, right, rightIds, stamp, family, extra });
    locks.set(family, task);
    try { return await task; } finally { locks.delete(family); }
  }

  async #perform({ scene, left, right, rightIds, stamp, family, extra }) {
    const scope = metaScope();
    const actors = familyActors(left.actor), root = game.actors.get(family) ?? left.actor;
    if (game.actors.get(left.actor.id) !== left.actor) throw new Error("Link this party token to its world group actor before splitting.");
    if ([...(right ? [right] : []), ...extra].some((t) => !actors.includes(t.actor))) throw new Error("Merge tokens from the same party.");
    if (rosterStamp(actors) !== stamp) throw new Error("Party membership changed. Open the split or merge window again.");
    // A party on the move stops where it is, rather than the split being refused.
    for (const a of actors) {
      if (!this.busy(a.id)) continue;
      if (!this.stopTravel) throw new Error("Stop the party's travel before changing who is in it.");
      await this.stopTravel(a.id);
    }
    if (actors.some((a) => this.busy(a.id))) throw new Error("The party's travel could not be stopped. Try again.");
    const pool = [...memberRows(left.actor), ...(right ? memberRows(right.actor) : []), ...extra.flatMap((t) => memberRows(t.actor))];
    const byId = new Map(pool.map((r) => [r.actor, r]));
    if (byId.size !== pool.length) throw new Error("Someone is in both groups. Fix the group memberships first.");
    const ids = [...new Set(rightIds)];
    if (ids.some((id) => !byId.has(id))) throw new Error("Only current members of these groups can be moved.");
    let rRows = ids.map((id) => byId.get(id)), lRows = pool.filter((row) => !ids.includes(row.actor));
    if (!right && (!lRows.length || !rRows.length)) throw new Error("Leave at least one member in each party.");
    if (!lRows.length && !rRows.length) throw new Error("A party needs at least one member.");
    // Merging everyone into the split-off party keeps the original group instead.
    let a = left.actor, b = right?.actor, leftToken = left;
    if (b === root) { [a, b] = [b, a]; [lRows, rRows] = [rRows, lRows]; leftToken = right; }
    if (!lRows.length && a === root) [lRows, rRows] = [rRows, lRows];
    const base = partyTitle(root);
    const number = Math.max(1, ...actors.map((x) => partyMeta(x)?.number ?? 1)) + 1;
    // Each group's name once saved: who is in it, or the title when it is everyone.
    const people = (rows) => rows.map((r) => game.actors.get(r.actor)).filter(Boolean);
    const snapshots = actors.map((x) => ({ _id: x.id, name: x.name, "prototypeToken.name": x.prototypeToken?.name ?? x.name, "system.members": memberRows(x), [`flags.${scope}.party`]: clone(partyMeta(x)) }));
    let createdActor, createdToken, updatesApplied = false;
    const oldNames = [], removedTokens = [];
    try {
      if (!b && rRows.length) {
        const proto = clone(a.prototypeToken?.toObject?.() ?? a.toObject().prototypeToken ?? {});
        delete proto._id;
        const newName = partyName(base, people(rRows), 2);
        createdActor = b = await Actor.create({
          name: newName, type: "group", img: a.img, folder: a.folder?.id ?? null, ownership: clone(a.ownership),
          prototypeToken: { ...proto, actorLink: true, name: newName }, system: { members: rRows },
          flags: { [scope]: { party: meta(family, base, number, true) } }
        }, { renderSheet: false });
        const data = clone(leftToken.toObject());
        delete data._id; delete data._stats; delete data.delta;
        // Beside the party it split from, kept on the scene.
        Object.assign(data, { actorId: b.id, actorLink: true, name: newName, x: leftToken.x + scene.grid.size * (leftToken.width ?? 1) + 12, y: leftToken.y });
        const d = scene.dimensions;
        data.x = Math.min(d.sceneX + d.sceneWidth - (data.width ?? 1) * scene.grid.size, Math.max(d.sceneX, data.x));
        [createdToken] = await scene.createEmbeddedDocuments("Token", [data], { kgCitiesParty: true });
        if (!createdToken) throw new Error("The new party's token could not be placed.");
      }
      if (!isPrimaryGM() || rosterStamp(actors) !== stamp) throw new Error("Party membership or the GM in charge changed before saving.");
      const survivors = actors.filter((x) => x !== a && x !== b && !extra.some((t) => t.actor.id === x.id)).concat(lRows.length ? [a] : [], rRows.length ? [b] : []);
      const count = survivors.length;
      const updates = [{ _id: a.id, "system.members": lRows, [`flags.${scope}.party`]: meta(family, base, partyMeta(a)?.number ?? 1, a !== root) }];
      if (b) updates.push({ _id: b.id, "system.members": rRows, [`flags.${scope}.party`]: partyMeta(b) ?? meta(family, base, number, b !== root) });
      for (const t of extra) updates.push({ _id: t.actor.id, "system.members": [] });
      const rowsOf = (x) => (x === a ? lRows : x === b ? rRows : memberRows(x));
      const nameOf = new Map(survivors.map((x) => [x.id, partyName(base, people(rowsOf(x)), count)]));
      for (const x of survivors) {
        let u = updates.find((u) => u._id === x.id);
        if (!u) { u = { _id: x.id }; updates.push(u); }
        u.name = nameOf.get(x.id);
        u["prototypeToken.name"] = u.name;
      }
      updatesApplied = true;
      await Actor.updateDocuments(updates, { kgCitiesParty: true });
      // Party tokens on every scene take their party's new name.
      for (const s of game.scenes) {
        const tokens = Array.from(s.tokens ?? []).filter((t) => actors.some((x) => x.id === t.actorId) || t.actorId === createdActor?.id);
        for (const token of tokens) oldNames.push({ scene: s, id: token.id, name: token.name });
        const tokenUpdates = tokens.filter((t) => nameOf.has(t.actorId)).map((t) => ({ _id: t.id, name: nameOf.get(t.actorId) }));
        if (tokenUpdates.length) await s.updateEmbeddedDocuments("Token", tokenUpdates, { kgCitiesParty: true });
      }
      const empty = [!lRows.length ? a : null, !rRows.length ? b : null, ...extra.map((t) => t.actor)].filter(Boolean);
      for (const x of empty) {
        if (x === root) throw new Error("The original party cannot be removed.");
        for (const s of game.scenes) {
          const tokens = Array.from(s.tokens ?? []).filter((t) => t.actorId === x.id);
          if (!tokens.length) continue;
          removedTokens.push(...tokens.map((t) => ({ scene: s, data: { ...t.toObject(), _id: t.id } })));
          await s.deleteEmbeddedDocuments("Token", tokens.map((t) => t.id), { kgCitiesParty: true });
        }
        // Kept as an archive: a merge never deletes pooled items or money.
        await Actor.updateDocuments([{ _id: x.id, [`flags.${scope}.party`]: { ...partyMeta(x), retired: true }, name: `${x.name} (merged into ${base})` }]);
      }
      await Promise.resolve(this.changed(scene)).catch((err) => console.warn(`${ID} | party display refresh`, err));
      for (const x of empty) {
        const data = x.toObject();
        const keeps = (data.items?.length ?? 0) > 0 || Object.values(x.system?.currency ?? {}).some((n) => Number(n) > 0) || (data.effects?.length ?? 0) > 0;
        if (partyMeta(x)?.generated && !keeps) try { await x.delete(); } catch (err) { console.warn(`${ID} | an empty merged group was kept`, err); }
        else if (keeps) ui.notifications.info(`KG Cities: pooled items or money stay on ${x.name}, in the Actors sidebar.`);
      }
      return { actor: b, token: createdToken };
    } catch (error) {
      // Put everything back as it was.
      const problems = [];
      for (const saved of removedTokens) try { if (!saved.scene.tokens.has(saved.data._id)) await saved.scene.createEmbeddedDocuments("Token", [saved.data], { keepId: true, kgCitiesParty: true }); } catch (e) { problems.push(e.message); }
      if (updatesApplied) try { await Actor.updateDocuments(snapshots); } catch (e) { problems.push(e.message); }
      if (createdToken) try { await scene.deleteEmbeddedDocuments("Token", [createdToken.id], { kgCitiesParty: true }); } catch (e) { problems.push(e.message); }
      if (createdActor) try { await createdActor.delete(); } catch (e) { problems.push(e.message); }
      for (const n of oldNames) try { if (n.scene.tokens.has(n.id)) await n.scene.updateEmbeddedDocuments("Token", [{ _id: n.id, name: n.name }], { kgCitiesParty: true }); } catch (e) { problems.push(e.message); }
      if (problems.length) throw new Error(`${error.message} Some changes could not be undone: ${problems.join("; ")}. Check the group rosters before going on.`);
      throw error;
    }
  }
}
