// Chain stores (GM): today's drugstores on this city map, made 1986 points of interest in one go,
// each linked to its chain's shop actor and drawn with the actor's token. Run again to relink
// or re-mark them; a store's card (text, art, other actors) is kept.

import { CHAINS, defaultActor, placeStores, removeChain, splitStores, storesOf } from "./chains.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The picture an actor's token is drawn with. */
const tokenOf = (a) => a?.prototypeToken?.texture?.src || a?.img || "";

let AppClass = null;

/**
 * Open the window. deps: places (PlaceStore: raw is today's map data), landmarks
 * (LandmarkStore), bounds() (this scene's lat/lon box).
 */
export function openChainStores(deps) {
  if (!AppClass) {
    const { ApplicationV2 } = foundry.applications.api;
    AppClass = class ChainStores extends ApplicationV2 {
      static DEFAULT_OPTIONS = { id: "kgc-chains", tag: "div", classes: ["kgc-ui", "kgc-switchboard", "kgc-chains"], window: { title: "Chain stores", icon: "fa-solid fa-prescription-bottle-medical", resizable: true }, position: { width: 680, height: "auto" } };
      constructor(d) {
        super();
        this.deps = d;
        const actors = [...game.actors];
        this.rows = Object.fromEntries(CHAINS.map((c) => [c.key, {
          on: true, name: c.name, actor: defaultActor(actors, c)?.uuid ?? "",
          // Some of today's Walgreens may stay Walgreens (your table's Boston).
          ...(c.keep ? { keep: 0, keepName: c.keep.name, keepActor: defaultActor(actors, { actor: c.keep.actor })?.uuid ?? "" } : {})
        }]));
        this.useToken = true;
        this.status = "";
      }
      async _renderHTML() { return ""; }
      _replaceHTML(html, content) {
        if (!content.kgcBound) {
          content.kgcBound = true;
          content.addEventListener("change", (e) => this.#change(e));
          content.addEventListener("click", (e) => this.#click(e));
        }
        this.#draw(content);
      }
      #draw(content = this.element?.querySelector(".window-content")) {
        if (!content) return;
        const raw = this.deps.places.raw ?? [], box = this.deps.bounds();
        const list = this.deps.landmarks.list;
        const actors = [...game.actors].sort((a, b) => a.name.localeCompare(b.name));
        const rows = CHAINS.map((c) => {
          const r = this.rows[c.key], n = storesOf(raw, c, box).length, have = list.filter((l) => l.chain === c.key).length;
          const actor = r.actor ? fromUuidSync(r.actor) : null;
          return `<tr class="${r.on ? "" : "off"}">
            <td><label class="pr-check-line"><input type="checkbox" data-row="${c.key}" data-f="on" ${r.on ? "checked" : ""}> Today's ${esc(c.today)}</label><small>${n} on this map${have ? ` · ${have} placed` : ""}</small></td>
            <td><input data-row="${c.key}" data-f="name" value="${esc(r.name)}"></td>
            <td class="who"><img src="${esc(tokenOf(actor))}" alt="" ${actor ? "" : "hidden"}><select data-row="${c.key}" data-f="actor"><option value="">No actor</option>${actors.map((a) => `<option value="${a.uuid}" ${a.uuid === r.actor ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></td>
            <td class="acts">${have ? `<button type="button" class="btn small danger" data-act="remove" data-row="${c.key}" data-tooltip="Take this chain's stores off the map"><i class="fa-solid fa-trash"></i></button>` : ""}</td></tr>
            ${c.keep ? (() => {
              const k = r.keepActor ? fromUuidSync(r.keepActor) : null;
              return `<tr class="keep ${r.on ? "" : "off"}"><td><small>Keep <input class="tiny" type="number" min="0" max="${n}" step="1" data-row="${c.key}" data-f="keep" value="${r.keep}"> of them as</small></td>
                <td><input data-row="${c.key}" data-f="keepName" value="${esc(r.keepName)}"></td>
                <td class="who"><img src="${esc(tokenOf(k))}" alt="" ${k ? "" : "hidden"}><select data-row="${c.key}" data-f="keepActor"><option value="">No actor</option>${actors.map((a) => `<option value="${a.uuid}" ${a.uuid === r.keepActor ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></td><td></td></tr>`;
            })() : ""}`;
        }).join("");
        const total = CHAINS.reduce((s, c) => s + (this.rows[c.key].on ? storesOf(raw, c, box).length : 0), 0);
        content.innerHTML = `<div class="ch-body">
          <p class="hint">Where the drugstores stood in 1986 was never published, so today's stand in. Today's CVS were CVS; today's Walgreens and Rite Aids stand in for <b>Brooks Drug</b> (many are Brooks's old stores: Rite Aid bought Brooks in 2007, Walgreens bought those in 2017). Walgreens came to Boston about 2000. Change any 1986 name or actor.</p>
          ${raw.length ? "" : `<p class="warn">This scene's places have not loaded. Open a city scene first.</p>`}
          <table class="sb-table"><thead><tr><th>Today</th><th>In 1986</th><th>Shop actor</th><th></th></tr></thead><tbody>${rows}</tbody></table>
          <label class="pr-check-line"><input type="checkbox" data-f="useToken" ${this.useToken ? "checked" : ""}> Mark each store with its actor's token (instead of a gold pin)</label>
          <div class="ch-foot">${this.status ? `<span class="ok"><i class="fa-solid fa-check"></i> ${esc(this.status)}</span>` : ""}<span class="grow"></span>
            <button type="button" class="btn primary" data-act="place" ${total ? "" : "disabled"}><i class="fa-solid fa-location-dot"></i> Place ${total} store${total === 1 ? "" : "s"}</button></div>
          <p class="hint">Each becomes a point of interest players can see, with the shop actor on its card. Running this again relinks and re-marks them, and keeps what you wrote on their cards.</p></div>`;
      }
      #change(e) {
        const el = e.target, key = el.dataset.row, f = el.dataset.f;
        if (!f) return;
        const v = el.type === "checkbox" ? el.checked : el.value;
        if (key) this.rows[key][f] = v; else this[f] = v;
        this.status = "";
        this.#draw();
      }
      async #click(e) {
        const el = e.target.closest("[data-act]");
        if (!el) return;
        if (el.dataset.act === "remove") {
          const c = CHAINS.find((x) => x.key === el.dataset.row);
          const { list, removed } = removeChain(this.deps.landmarks.list, c.key);
          if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: "Remove stores" }, content: `<p>Take the ${removed.length} stores made from today's ${esc(c.today)} off the map, cards and all?</p>` }))) return;
          await this.deps.landmarks.save(list);
          this.status = `${removed.length} removed.`;
          return this.#draw();
        }
        if (el.dataset.act === "place") {
          const raw = this.deps.places.raw ?? [], box = this.deps.bounds();
          const plans = CHAINS.filter((c) => this.rows[c.key].on).flatMap((c) => {
            const r = this.rows[c.key], actor = r.actor ? fromUuidSync(r.actor) : null;
            const plan = (stores, name, a) => ({ chain: c.key, stores, name, actorUuid: a?.uuid ?? null, icon: this.useToken ? tokenOf(a) || null : null });
            const all = storesOf(raw, c, box);
            if (!c.keep || !(Number(r.keep) > 0)) return [plan(all, r.name.trim() || c.name, actor)];
            const { kept, rest } = splitStores(all, r.keep);
            const keepActor = r.keepActor ? fromUuidSync(r.keepActor) : null;
            return [plan(rest, r.name.trim() || c.name, actor), plan(kept, r.keepName.trim() || c.keep.name, keepActor)];
          });
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
