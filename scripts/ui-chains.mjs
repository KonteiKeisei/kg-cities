// Chain stores (GM): today's chains on this city map (drugstores, banks, Radio Shack), made 1986
// points of interest in one go, each linked to its chain's actor and drawn with the actor's token
// (or a bank's or ATM's badge). Run again to relink or re-mark them; a store's card (text, art,
// other actors) is kept.

import { GROUPS, assignNames, chainsFor, defaultActor, nameMatcher, parseNames, placeStores, removeChain, splitStores, storesOf } from "./chains.mjs";
import { ATM_ICON, BANK_ICON, itemPiles } from "./bank.mjs";
import { makeRadioShack } from "./radioshack.mjs";
import { setStoreLogo, storeLogo } from "./store-logos.mjs";

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
      static DEFAULT_OPTIONS = { id: "kgc-chains", tag: "div", classes: ["kgc-ui", "kgc-switchboard", "kgc-chains"], window: { title: "Chain stores", icon: "fa-solid fa-shop", resizable: true }, position: { width: 900, height: 700 } };
      constructor(d) {
        super({ position: { width: Math.min(900, (globalThis.innerWidth || 1024) - 32), height: Math.min(700, (globalThis.innerHeight || 800) - 48) } });
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
          actors: Object.fromEntries(names.map((n) => [n, c.group === "bank"
            ? this.deps.landmarks.list.find((l) => l.chain === c.key && l.bank === n && l.chainActor)?.chainActor ?? ""
            : defaultActor(actors, { actor: c.actor && n === c.name ? c.actor : nameMatcher(n) })?.uuid ?? ""])),
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
          return `<span class="who"><img src="${esc(tokenOf(a))}" alt="" ${a ? "" : "hidden"}><select ${attrs}><option value="">No shop linked (optional)</option>${actors.map((x) => `<option value="${x.uuid}" ${x.uuid === uuid ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></span>`;
        };
        const logoButton = (c, name, uuid) => {
          const logo = storeLogo(name) || (c.group === "bank" ? BANK_ICON : "");
          return `<button type="button" class="btn small ch-logo" data-act="logo" data-row="${c.key}" data-name="${esc(name)}" data-actor="${esc(uuid ?? "")}" data-tooltip="Change the logo for all ${esc(name)} stores, including the shared shop image">${logo ? `<img src="${esc(logo)}" alt="">` : `<i class="fa-solid fa-image"></i>`} Change logo</button>`;
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
            <td>${names.map((nm) => `<div class="ch-actor">${names.length > 1 ? `<small>${esc(nm)}</small>` : ""}${c.group === "bank" ? "" : actorSelect(`data-row="${c.key}" data-f="actor" data-name="${esc(nm)}"`, r.actors[nm] ?? "")}${logoButton(c, nm, r.actors[nm])}</div>`).join("")}</td>
            <td class="acts">${have ? `<button type="button" class="btn small danger" data-act="remove" data-row="${c.key}" data-tooltip="Take this chain's stores off the map"><i class="fa-solid fa-trash"></i></button>` : ""}</td></tr>
            ${c.keep ? `<tr class="keep ${r.on ? "" : "off"}"><td><small>Keep <input class="tiny" type="number" min="0" max="${n}" step="1" data-row="${c.key}" data-f="keep" value="${r.keep}"> of them as</small></td>
                <td><input data-row="${c.key}" data-f="keepName" value="${esc(r.keepName)}"></td>
                <td>${actorSelect(`data-row="${c.key}" data-f="keepActor"`, r.keepActor)}${logoButton(c, r.keepName, r.keepActor)}</td><td></td></tr>` : ""}`;
        }).join("");
        const total = shown.reduce((s, c) => s + (this.row(c).on ? this.#count(c, raw, box) : 0), 0);
        const tabs = `<nav class="dev-tabs" role="tablist">${GROUPS.map((g) => `<button type="button" role="tab" aria-selected="${g.key === this.tab}" class="${g.key === this.tab ? "on" : ""}" data-act="tab" data-value="${g.key}"><i class="fa-solid ${g.icon}"></i> ${g.label}</button>`).join("")}</nav>`;
        const hint = {
          drug: `Where the drugstores stood in 1986 was never published, so today's stand in. Today's CVS were CVS; today's Walgreens and Rite Aids stand in for <b>Brooks Drug</b> (many are Brooks's old stores: Rite Aid bought Brooks in 2007, Walgreens bought those in 2017). Walgreens came to Boston about 2000.`,
          bank: `Banks and ATMs work as soon as you place them. No bank actors are needed. Players use the Bank or ATM button on each location's card for their accounts. Today's branches are shared among the 1986 names below; standalone ATMs are placed separately. Choose a logo for each bank, or keep the default badges.`,
          electronics: `No Radio Shack is left on today's map, so today's phone stores (AT&amp;T, Verizon, T-Mobile and the like) stand in: they sit in the same neighborhood strips. Every store opens the one shop actor, so stock and prices are kept in one place.`
        }[this.tab];
        const shop = this.tab === "electronics" ? `<div class="ch-shop">${itemPiles()
          ? `<button type="button" class="btn" data-act="make-shop"><i class="fa-solid fa-satellite-dish"></i> Make / repair the Radio Shack</button><span class="hint">Creates the shop or adds missing catalog items to the selected merchant. Keeps existing items and prices. All stores share its 49-item catalog, with unlimited stock and no buybacks.</span>`
          : `<span class="hint">The shop needs the <b>Item Piles</b> module: with it, each store's card has a Shop button. Without it, the stores are placed and linked to any actor you pick.</span>`}</div>` : "";
        content.innerHTML = `<div class="ch-body">
          ${tabs}
          <div class="ch-scroll">
          <p class="hint">${hint}</p>
          ${raw.length ? "" : `<p class="warn">This scene's places have not loaded. Open a city scene first.</p>`}
          ${shown.length ? `<table class="sb-table"><thead><tr><th>Today</th><th>In 1986</th><th>${this.tab === "bank" ? "Bank logos" : "Shop actor (optional)"}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="hint">No chains of this kind are set up for this city yet.</p>`}
          ${shop}
          ${this.tab === "bank" ? "" : `<label class="pr-check-line"><input type="checkbox" data-f="useToken" ${this.useToken ? "checked" : ""}> Use actor tokens where no custom logo is set (without an actor: a gold pin)</label>`}
          <p class="hint">Places the checked chains of this tab. Running this again updates their markers and keeps what you wrote on their cards.</p>
          </div>
          <div class="ch-foot">${this.status ? `<span class="ok"><i class="fa-solid fa-check"></i> ${esc(this.status)}</span>` : ""}<span class="grow"></span>
            <button type="button" class="btn primary" data-act="place" ${total ? "" : "disabled"}><i class="fa-solid fa-location-dot"></i> Place ${total} store${total === 1 ? "" : "s"}</button></div>
          </div>`;
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
            const bank = this.chains.find((c) => c.key === key)?.group === "bank";
            for (const n of parseNames(v)) if (!(n in r.actors)) r.actors[n] = bank ? "" : defaultActor(all, { actor: nameMatcher(n) })?.uuid ?? "";
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
          const tok = storeLogo(name) || (group !== "bank" && this.useToken ? tokenOf(a) || null : null);
          if (group !== "bank") return [{ chain: c.key, group, stores, name, actorUuid: a?.uuid ?? null, icon: tok }];
          const atm = stores.filter((s) => s.kind === "atm"), branch = stores.filter((s) => s.kind !== "atm");
          return [
            { chain: c.key, group, stores: branch, name, actorUuid: a?.uuid ?? null, icon: tok ?? BANK_ICON },
            { chain: c.key, group, stores: atm, name, actorUuid: a?.uuid ?? null, icon: tok ?? ATM_ICON }
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
        if (act === "logo") {
          const name = el.dataset.name;
          const actor = el.dataset.actor ? fromUuidSync(el.dataset.actor) : null;
          return new foundry.applications.apps.FilePicker.implementation({
            type: "image", current: storeLogo(name) || tokenOf(actor),
            callback: async (path) => {
              if (!path) return;
              try {
                const n = await setStoreLogo(name, path, actor);
                this.status = `${name} logo saved. ${n} store${n === 1 ? "" : "s"} updated across all cities.`;
              } catch (err) { ui.notifications.error(`KG Cities: ${err.message}`); }
              this.#draw();
            }
          }).render(true);
        }
        if (act === "make-shop") {
          el.disabled = true;
          try {
            const c = this.chains.find((x) => x.key === "radioshack");
            const name = this.namesOf(c)[0];
            const uuid = this.row(c).actors[name];
            const shop = await makeRadioShack(uuid ? await fromUuid(uuid) : null);
            if (shop && storeLogo(name)) await setStoreLogo(name, storeLogo(name), shop);
            if (shop) for (const c of this.chains.filter((x) => x.key === "radioshack")) this.row(c).actors[this.namesOf(c)[0]] = shop.uuid;
            this.status = shop ? `Radio Shack ready (${shop.items.size} items).` : "";
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
  if (opening) return open;
  if (!open?.rendered) open = new AppClass(deps);
  open.deps = deps;
  // ApplicationV2's forced render raises the window once its element exists.
  // Calling bringToFront immediately races the initial asynchronous render.
  opening = Promise.resolve(open.render({ force: true }))
    .catch((err) => { console.error("kg-cities | Chain stores", err); ui.notifications.error(`KG Cities: ${err.message}`); })
    .finally(() => { opening = null; });
  return open;
}
let open = null, opening = null;
