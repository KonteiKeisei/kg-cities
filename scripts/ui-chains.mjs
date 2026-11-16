// Chain stores (GM): today's chains on this city map (drugstores, banks, Radio Shack), made 1986
// points of interest in one go, each linked to its chain's actor and drawn with the actor's token
// (or a bank's or ATM's badge). Run again to relink or re-mark them; a store's card (text, art,
// other actors) is kept.

import { GROUPS, assignNames, chainsFor, defaultActor, nameMatcher, parseNames, placeStores, removeChain, splitStores, storesOf } from "./chains.mjs";
import { ATM_ICON, BANK_ICON, itemPiles } from "./bank.mjs";
import { makeRadioShack } from "./radioshack.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The picture an actor's token is drawn with. */
const tokenOf = (a) => a?.prototypeToken?.texture?.src || a?.img || "";

let AppClass = null;

/**
 * Open the window. deps: places (PlaceStore: raw is today's map data), landmarks
 * (LandmarkStore), bounds() (this scene's lat/lon box), city() (this scene's city id),
 * dollarRate() (copper a dollar, for the Radio Shack's prices).
 */
export function openChainStores(deps) {
  if (!AppClass) {
    const { ApplicationV2 } = foundry.applications.api;
    AppClass = class ChainStores extends ApplicationV2 {
      static DEFAULT_OPTIONS = { id: "kgc-chains", tag: "div", classes: ["kgc-ui", "kgc-switchboard", "kgc-chains"], window: { title: "Chain stores", icon: "fa-solid fa-shop", resizable: true }, position: { width: 720, height: "auto" } };
      constructor(d) {
        super();
        this.deps = d;
        this.tab = "drug";
        this.rows = {};
        this.useToken = true;
        this.status = "";
      }
      get chains() { return chainsFor(this.deps.city?.() ?? null); }
      /** A chain's row, made the first time it is shown: its 1986 names, each name's actor. */
      row(c) {
        if (this.rows[c.key]) return this.rows[c.key];
        const actors = [...game.actors];
        const names = c.names ?? [c.name];
        return (this.rows[c.key] = {
          on: true, names: names.join(", "), limit: c.limit ?? "",
          actors: Object.fromEntries(names.map((n) => [n, defaultActor(actors, { actor: c.actor && n === c.name ? c.actor : nameMatcher(n) })?.uuid ?? ""])),
          // Some of today's Walgreens may stay Walgreens (your table's Boston).
          ...(c.keep ? { keep: 0, keepName: c.keep.name, keepActor: defaultActor(actors, { actor: c.keep.actor })?.uuid ?? "" } : {})
        });
      }
      namesOf(c) { return parseNames(this.row(c).names, c.names ?? [c.name]); }
      async _renderHTML() { return ""; }
      _replaceHTML(html, content) {
        if (!content.kgcBound) {
          content.kgcBound = true;
          content.addEventListener("change", (e) => this.#change(e));
          content.addEventListener("click", (e) => this.#click(e));
        }
        this.#draw(content);
      }
      /** How many of a chain's stores would be placed. */
      #count(c, raw, box) {
        const n = storesOf(raw, c, box).length, r = this.row(c);
        return r.limit !== "" && r.limit != null ? Math.min(n, Math.max(0, Math.round(Number(r.limit) || 0))) : n;
      }
      #draw(content = this.element?.querySelector(".window-content")) {
        if (!content) return;
        const raw = this.deps.places.raw ?? [], box = this.deps.bounds();
        const list = this.deps.landmarks.list;
        const actors = [...game.actors].sort((a, b) => a.name.localeCompare(b.name));
        const actorSelect = (attrs, uuid) => {
          const a = uuid ? fromUuidSync(uuid) : null;
          return `<span class="who"><img src="${esc(tokenOf(a))}" alt="" ${a ? "" : "hidden"}><select ${attrs}><option value="">No actor</option>${actors.map((x) => `<option value="${x.uuid}" ${x.uuid === uuid ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></span>`;
        };
        const shown = this.chains.filter((c) => c.group === this.tab);
        const rows = shown.map((c) => {
          const r = this.row(c), all = storesOf(raw, c, box), n = all.length, have = list.filter((l) => l.chain === c.key).length;
          const atms = all.filter((p) => p.kind === "atm").length;
          const names = this.namesOf(c);
          return `<tr class="${r.on ? "" : "off"}">
            <td><label class="pr-check-line"><input type="checkbox" data-row="${c.key}" data-f="on" ${r.on ? "checked" : ""}> Today's ${esc(c.today)}</label>
              <small>${n} on this map${atms ? ` (${atms} ATM${atms === 1 ? "" : "s"} on their own)` : ""}${have ? ` · ${have} placed` : ""}</small>
              <small>Place <input class="tiny" type="number" min="0" max="${n}" step="1" data-row="${c.key}" data-f="limit" value="${esc(r.limit)}" placeholder="all"> of them</small></td>
            <td><input data-row="${c.key}" data-f="names" value="${esc(r.names)}" aria-label="1986 names, separated by commas">${c.why ? `<small>${esc(c.why)}${c.unchecked ? " <i>Not yet checked against a source.</i>" : ""}</small>` : ""}</td>
            <td>${names.map((nm) => `<div class="ch-actor">${names.length > 1 ? `<small>${esc(nm)}</small>` : ""}${actorSelect(`data-row="${c.key}" data-f="actor" data-name="${esc(nm)}"`, r.actors[nm] ?? "")}</div>`).join("")}</td>
            <td class="acts">${have ? `<button type="button" class="btn small danger" data-act="remove" data-row="${c.key}" data-tooltip="Take this chain's stores off the map"><i class="fa-solid fa-trash"></i></button>` : ""}</td></tr>
            ${c.keep ? `<tr class="keep ${r.on ? "" : "off"}"><td><small>Keep <input class="tiny" type="number" min="0" max="${n}" step="1" data-row="${c.key}" data-f="keep" value="${r.keep}"> of them as</small></td>
                <td><input data-row="${c.key}" data-f="keepName" value="${esc(r.keepName)}"></td>
                <td>${actorSelect(`data-row="${c.key}" data-f="keepActor"`, r.keepActor)}</td><td></td></tr>` : ""}`;
        }).join("");
        const total = shown.reduce((s, c) => s + (this.row(c).on ? this.#count(c, raw, box) : 0), 0);
        const tabs = `<nav class="dev-tabs" role="tablist">${GROUPS.map((g) => `<button type="button" role="tab" aria-selected="${g.key === this.tab}" class="${g.key === this.tab ? "on" : ""}" data-act="tab" data-value="${g.key}"><i class="fa-solid ${g.icon}"></i> ${g.label}</button>`).join("")}</nav>`;
        const hint = {
          drug: `Where the drugstores stood in 1986 was never published, so today's stand in. Today's CVS were CVS; today's Walgreens and Rite Aids stand in for <b>Brooks Drug</b> (many are Brooks's old stores: Rite Aid bought Brooks in 2007, Walgreens bought those in 2017). Walgreens came to Boston about 2000.`,
          bank: `Today's banks stand in for the 1986 banks they bought, so many are the same branches. Where there are several 1986 names, the branches are shared out among them across the map. An ATM inside a branch is the branch; one on its own is placed as an ATM. Players open an account, cash in and out, and rent safe deposit boxes from a bank's place card, once their character is there.`,
          electronics: `No Radio Shack is left on today's map, so today's phone stores (AT&amp;T, Verizon, T-Mobile and the like) stand in: they sit in the same neighborhood strips. Every store opens the one shop actor, so stock and prices are kept in one place.`
        }[this.tab];
        const shop = this.tab === "electronics" ? `<div class="ch-shop">${itemPiles()
          ? `<button type="button" class="btn" data-act="make-shop"><i class="fa-solid fa-satellite-dish"></i> Make the Radio Shack</button><span class="hint">An Item Piles shop with 49 things from Radio Shack's fall 1986 catalog, at its prices. It never runs out and buys nothing back. Each item says what it does, and carries a scrap value for crafting. Edit it like any Item Piles shop.</span>`
          : `<span class="hint">The shop needs the <b>Item Piles</b> module: with it, each store's card has a Shop button. Without it, the stores are placed and linked to any actor you pick.</span>`}</div>` : "";
        content.innerHTML = `<div class="ch-body">
          ${tabs}
          <p class="hint">${hint}</p>
          ${raw.length ? "" : `<p class="warn">This scene's places have not loaded. Open a city scene first.</p>`}
          ${shown.length ? `<table class="sb-table"><thead><tr><th>Today</th><th>In 1986</th><th>Actor</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="hint">No chains of this kind are set up for this city yet.</p>`}
          ${shop}
          <label class="pr-check-line"><input type="checkbox" data-f="useToken" ${this.useToken ? "checked" : ""}> Mark each store with its actor's token (without an actor: a bank's badge, or a gold pin)</label>
          <div class="ch-foot">${this.status ? `<span class="ok"><i class="fa-solid fa-check"></i> ${esc(this.status)}</span>` : ""}<span class="grow"></span>
            <button type="button" class="btn primary" data-act="place" ${total ? "" : "disabled"}><i class="fa-solid fa-location-dot"></i> Place ${total} store${total === 1 ? "" : "s"}</button></div>
          <p class="hint">Places the checked chains of this tab. Each becomes a point of interest players can see, with its actor on the card. Running this again relinks and re-marks them, and keeps what you wrote on their cards.</p></div>`;
      }
      #change(e) {
        const el = e.target, key = el.dataset.row, f = el.dataset.f;
        if (!f) return;
        const v = el.type === "checkbox" ? el.checked : el.value;
        if (key) {
          const r = this.rows[key];
          if (f === "actor") r.actors[el.dataset.name] = v;
          else r[f] = v;
          // New names find their actors by name.
          if (f === "names") {
            const all = [...game.actors];
            for (const n of parseNames(v)) if (!(n in r.actors)) r.actors[n] = defaultActor(all, { actor: nameMatcher(n) })?.uuid ?? "";
          }
        } else this[f] = v;
        this.status = "";
        this.#draw();
      }
      /** The placing plans for one chain: one per 1986 name (and per kept name), branches and ATMs apart. */
      #plans(c, raw, box) {
        const r = this.row(c), group = c.group;
        const plan = (stores, name, uuid) => {
          const a = uuid ? fromUuidSync(uuid) : null;
          const tok = this.useToken ? tokenOf(a) || null : null;
          if (group !== "bank") return [{ chain: c.key, group, stores, name, actorUuid: a?.uuid ?? null, icon: tok }];
          const atm = stores.filter((s) => s.kind === "atm"), branch = stores.filter((s) => s.kind !== "atm");
          return [
            { chain: c.key, group, stores: branch, name, actorUuid: a?.uuid ?? null, icon: tok ?? (this.useToken ? BANK_ICON : null) },
            { chain: c.key, group, stores: atm, name, actorUuid: a?.uuid ?? null, icon: tok ?? (this.useToken ? ATM_ICON : null) }
          ];
        };
        let all = storesOf(raw, c, box);
        if (r.limit !== "" && r.limit != null) all = splitStores(all, r.limit).kept;
        const names = this.namesOf(c);
        if (c.keep && Number(r.keep) > 0) {
          const { kept, rest } = splitStores(all, r.keep);
          return [...plan(rest, names[0], r.actors[names[0]]), ...plan(kept, r.keepName.trim() || c.keep.name, r.keepActor)];
        }
        // A store placed before keeps its 1986 name.
        const before = new Map(this.deps.landmarks.list.filter((l) => l.chain === c.key).map((l) => [l.placeId, l.bank ?? l.name]));
        const shares = assignNames(all, names, before);
        return names.flatMap((n, i) => plan(shares[i], n, r.actors[n]));
      }
      async #click(e) {
        const el = e.target.closest("[data-act]");
        if (!el) return;
        const act = el.dataset.act;
        if (act === "tab") { this.tab = el.dataset.value; return this.#draw(); }
        if (act === "make-shop") {
          el.disabled = true;
          try {
            const shop = await makeRadioShack();
            if (shop) for (const c of this.chains.filter((x) => x.key === "radioshack")) this.row(c).actors[this.namesOf(c)[0]] = shop.uuid;
            this.status = shop ? `Made the Radio Shack (${shop.items.size} items).` : "";
          } catch (err) { ui.notifications.error(`KG Cities: ${err.message}`); }
          return this.#draw();
        }
        if (act === "remove") {
          const c = this.chains.find((x) => x.key === el.dataset.row);
          const { list, removed } = removeChain(this.deps.landmarks.list, c.key);
          if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: "Remove stores" }, content: `<p>Take the ${removed.length} stores made from today's ${esc(c.today)} off the map, cards and all?</p>` }))) return;
          await this.deps.landmarks.save(list);
          this.status = `${removed.length} removed.`;
          return this.#draw();
        }
        if (act === "place") {
          const raw = this.deps.places.raw ?? [], box = this.deps.bounds();
          const plans = this.chains.filter((c) => c.group === this.tab && this.row(c).on).flatMap((c) => this.#plans(c, raw, box)).filter((p) => p.stores.length);
          el.disabled = true;
          const { list, added, updated } = placeStores(this.deps.landmarks.list, plans, { makeId: (chain, p) => `chain:${chain}:${p.id}` });
          await this.deps.landmarks.save(list);
          this.status = `${added} placed${updated ? `, ${updated} updated` : ""}.`;
          ui.notifications.info(`KG Cities: ${this.status.replace(/\.$/, "")} chain store${added + updated === 1 ? "" : "s"}.`);
          this.#draw();
        }
      }
    };
  }
  if (!open?.rendered) open = new AppClass(deps);
  open.render({ force: true });
  open.bringToFront?.();
  return open;
}
let open = null;
