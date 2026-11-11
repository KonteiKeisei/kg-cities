// The place card: one window for a city's points of interest and safe havens, ported from KG
// Realms. Players read what they may know; for the GM the card is also its editor (Edit turns it
// into its form in place, Save or Discard turns it back). No journal is needed: a place's text
// lives on the place (What is known, for everyone; GM notes, for the GM; Rumours, while it is only
// rumoured), and secret blocks in What is known stay with the GM until revealed. A journal, a
// scene, actors and pictures can be linked; a dropped journal page's text can be copied in.

import { findPlaceLinks, placeToken, capturePlaceEditor, insertPlaceToken, placeReference } from "./place-links.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const ID = "kgc-place-card";
const TE = () => foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
const confirm = (title, content) => foundry.applications.api.DialogV2.confirm({ window: { title }, content, rejectClose: false });

/** Who sees a place, and what each choice gives players. */
export const VISIBILITY = { hidden: "Hidden", rumoured: "Rumoured", discovered: "Discovered" };
const VIS_HINT = {
  hidden: "Players see nothing: no marker, no card, not in search.",
  rumoured: "Players see its name, its marker and the rumours below. Nothing else.",
  discovered: "Players see the card: art, What is known, and any secret blocks you reveal."
};
/** The visibility of a record: hidden, rumoured or discovered (older records: the hidden box). */
export const visibilityOf = (r) => r?.visibility ?? (r?.hidden ? "hidden" : "discovered");

/** Text as HTML: kept as it is when it is HTML, else paragraphs. */
export function asHtml(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  return /<[a-z][\s\S]*>/i.test(t) ? t : t.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
}

/** Journal text as a GM-only secret block, for players to see only what the GM reveals. */
export const asSecret = (html) => (html ? `<section class="secret" id="secret-${foundry.utils.randomID()}">${html}</section>` : "");

/** The first paragraph of some HTML, plain; for players without the secrets they may not see. */
export function firstParagraph(html, gm = game.user.isGM, max = 320) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  if (!gm) for (const s of div.querySelectorAll("section.secret:not(.revealed)")) s.remove();
  const p = [...div.querySelectorAll("p")].map((x) => x.textContent.trim()).find(Boolean) ?? div.textContent.trim();
  return p.length > max ? `${p.slice(0, max - 1)}…` : p;
}

// Foundry's content links in text: @UUID[Actor.x]{Name}, @Actor[x]{Name}, ... and our place links.
const LINK = /@(\w+)\[([^\]]+)\](?:\{([^}]*)\})?/g;
const LINK_ICONS = { Actor: "fa-user", Item: "fa-suitcase", JournalEntry: "fa-book-open", JournalEntryPage: "fa-book-open", Scene: "fa-map", RollTable: "fa-table-list", Macro: "fa-code", Playlist: "fa-music" };
function linkChip(type, target, label) {
  if (type === "CityPlace" && placeReference(target)) return `<span class="kgc-link"><i class="fa-solid fa-landmark"></i>${esc(label || "Place")}</span>`;
  const uuid = type === "UUID" || type === "Compendium" ? target : `${type}.${target}`;
  let doc = null;
  try { doc = fromUuidSync(uuid, { strict: false }); } catch { /* not loaded */ }
  const kind = doc?.documentName ?? (type === "UUID" ? uuid.split(".").at(-2) : type);
  return `<span class="kgc-link"><i class="fa-solid ${LINK_ICONS[kind] ?? "fa-link"}"></i>${esc(label || doc?.name || target.split(".").pop())}</span>`;
}
/** HTML with its content links drawn as chips (for previews that are not enriched). */
const inlineLinks = (html) => String(html ?? "").replace(LINK, (m, type, target, label) => linkChip(type, target, label));
/** A plain excerpt with content links shown by their names, not their codes. */
export const plainLinks = (text) => String(text ?? "").replace(LINK, (m, type, target, label) => label || target.split(".").pop());

/* ---------------------------------------- */
/*  The cards                                */
/* ---------------------------------------- */

/**
 * The card's source of places. deps:
 *   get(ref) -> card data or null: { name, type, tone, icon, subtitle, img, known, gmNotes, rumours,
 *     visibility, actors, journal, images, scene, locate, gmOnly? }
 *   save(ref, fields), remove(ref), enter(ref, all), locate(ref), placeChoices() -> [{ name, where, ref }]
 */
export class PlaceCards {
  constructor(deps) {
    this.deps = deps;
    this.app = null;
  }

  /** Open (or retarget) the card. ref: { kind: "landmark", city, id }. edit: open straight into the form (GM). */
  async open(ref, { edit = false, warnMissing = false } = {}) {
    const data = await this.deps.get(ref);
    if (!data) { if (warnMissing) ui.notifications.warn("KG Cities: this place no longer exists."); return; }
    if (!game.user.isGM && visibilityOf(data) === "hidden") return ui.notifications.info("Nothing is known about this place.");
    const App = cardClass();
    if (this.app?.rendered) {
      if (this.app.dirty && !(await this.app.confirmDiscard())) return;
      this.app.target(ref, edit && game.user.isGM);
      await this.app.render({ force: true });
      if (this.app.minimized) await this.app.maximize();
      this.app.bringToFront?.();
      return this.app;
    }
    this.app = new App({ cards: this, ref, edit: edit && game.user.isGM });
    return this.app.render({ force: true });
  }

  /** A record changed elsewhere: redraw the card if it is open and not being edited. */
  refresh() { if (this.app?.rendered && !this.app.editing) this.app.render(); }
}

/* ---------------------------------------- */
/*  The edit form's fields                   */
/* ---------------------------------------- */

const FIELDS = [
  { name: "img", label: "Art", type: "image", group: "identity" },
  { name: "name", label: "Name", type: "text", group: "identity" },
  { name: "visibility", label: "Who sees it", type: "visibility", group: "who" },
  { name: "rumours", label: "Rumours · what players hear while it is Rumoured", type: "rich", group: "who" },
  { name: "known", label: "What is known · players, once Discovered", type: "rich", group: "text", hint: "Secret blocks stay with you until you reveal them on the card." },
  { name: "gmNotes", label: "GM notes · only you", type: "rich", group: "text" },
  { name: "scene", label: "Scene (Enter takes everyone there)", type: "doc", doc: "Scene", icon: "fa-map", group: "links" },
  { name: "actors", label: "Actors (who you meet here)", type: "docs", doc: "Actor", icon: "fa-user", group: "links" },
  { name: "journal", label: "Journal (optional, opens from the card)", type: "doc", doc: "JournalEntry", icon: "fa-book-open", group: "links" },
  { name: "images", label: "Pictures", type: "images", group: "links" },
  { name: "phoneKind", label: "Phone", type: "phonekind", group: "phone" },
  { name: "phoneNumber", label: "Its number", type: "phonenumber", group: "phone" }
];
const GROUPS = [["identity", ""], ["who", "Who sees it"], ["text", "Text"], ["links", "Links"], ["phone", "Phone"]];
const FORM_TABS = [["text", "Text", "fa-pen-nib", ["identity", "who", "text"]], ["links", "Links", "fa-link", ["links", "phone"]]];
const PHONE_KINDS = [["none", "None"], ["line", "Phone"], ["payphone", "Payphone"]];
const PHONE_HINT = {
  none: "No phone here.",
  line: "A phone: it rings for the players whose characters are here, and they can call out. Listed in the phone book once the place is Discovered.",
  payphone: "A payphone: calls out cost a quarter (911 and the operator are free). It rings for whoever is here. Not in the phone book."
};

/** A rich text field's preview on the form. */
const preview = (html) => (html ? `<div class="text">${inlineLinks(html)}</div>` : `<span class="empty">Nothing written yet.</span>`);
const DROP_WHAT = { Scene: "a scene from the Scenes sidebar", Actor: "an actor", JournalEntry: "a journal or page" };

/** A scene, actor or journal field: the linked one with a clear button, or where to drop one. */
function docBox(f, v) {
  const doc = !v ? null : f.doc === "Scene" ? game.scenes.get(v) : fromUuidSync(v, { strict: false });
  const name = doc?.name ?? (v ? `Missing ${f.doc.toLowerCase()}` : "");
  return `<input type="hidden" name="${f.name}" value="${esc(v)}">${name
    ? `<span><i class="fa-solid ${f.icon}"></i> ${esc(name)}</span><button type="button" class="btn ghost small" data-act="clear" aria-label="Unlink" data-tooltip="Unlink"><i class="fa-solid fa-xmark"></i></button>`
    : `<span class="empty"><i class="fa-solid ${f.icon}"></i> Drop ${DROP_WHAT[f.doc] ?? "it"} here</span>`}`;
}

/** A list field (actors, or pictures): each with a remove button, and where to add more. */
function listBox(f, list) {
  const items = list.map((v, i) => {
    if (f.type === "images") return `<span class="item pic" style="background-image:url('${esc(foundry.utils.getRoute(v))}')" title="${esc(v.split("/").pop())}"><button type="button" data-act="list-remove" data-i="${i}" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></span>`;
    const doc = fromUuidSync(v, { strict: false });
    return `<span class="item"><i class="fa-solid ${f.icon}"></i> ${esc(doc?.name ?? "Missing")}<button type="button" data-act="list-remove" data-i="${i}" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></span>`;
  }).join("");
  const add = f.type === "images" ? `<button type="button" class="btn small" data-act="list-add"><i class="fa-solid fa-plus"></i> Add a picture</button>`
    : `<span class="empty"><i class="fa-solid ${f.icon}"></i> Drop ${list.length ? "more actors" : "actors"} here</span>`;
  return `<input type="hidden" name="${f.name}" value="${esc(JSON.stringify(list))}">${items}${add}`;
}

/** Open a linked journal to read: an entry in its own view, or a page's journal turned to that page. */
export async function openJournal(uuid) {
  const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
  if (!doc) return ui.notifications.warn("KG Cities: the linked journal is missing.");
  if (!doc.testUserPermission(game.user, "OBSERVER")) return ui.notifications.warn("You cannot see that journal.");
  const entry = doc.documentName === "JournalEntryPage" ? doc.parent : doc;
  return entry?.sheet?.render({ force: true, ...(doc.documentName === "JournalEntryPage" ? { pageId: doc.id } : {}) });
}
/** A journal the user may open, or null. */
const readableJournal = (uuid) => {
  const doc = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  return doc && (game.user.isGM || doc.testUserPermission?.(game.user, "OBSERVER")) ? doc : null;
};

async function openDoc(uuid) {
  const doc = uuid ? await fromUuid(uuid).catch(() => null) : null;
  if (!doc?.sheet) return ui.notifications.warn("KG Cities: the linked document is missing.");
  return doc.sheet.render(true);
}

/* ---------------------------------------- */
/*  The full-size text editor                */
/* ---------------------------------------- */

/** Foundry's editor in a resizable window; resolves with the text on Done, or null. One per field. */
const textWindows = new Map();
function textWindow({ id, title, value, hint, getPlaces }) {
  const open = textWindows.get(id);
  if (open?.rendered) { open.bringToFront?.(); return open.promise; }
  const { ApplicationV2 } = foundry.applications.api;
  class TextWindow extends ApplicationV2 {
    static DEFAULT_OPTIONS = { tag: "div", classes: ["kgc-ui", "kgc-text-window"], window: { icon: "fa-solid fa-pen-nib", resizable: true }, position: { width: 820, height: 680 } };
    get title() { return title; }
    async _renderHTML() {
      const editor = customElements.get("prose-mirror") ? `<prose-mirror name="text" value="${esc(value)}"></prose-mirror>` : `<textarea name="text">${esc(value)}</textarea>`;
      return `<div class="links"><button type="button" class="btn small" data-act="place-picker" aria-expanded="false"><i class="fa-solid fa-link"></i> Insert place link</button><span class="hint">A link opens that place's card.</span>
        <div class="picker" hidden><div class="find"><input type="search" aria-label="Find a place to link" placeholder="Find a place, e.g. Faneuil Hall" autocomplete="off"><button type="button" class="btn ghost small" data-act="close-picker" aria-label="Close place search"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="results" role="listbox" aria-label="Places"></div><p class="hint" role="status" data-status>Loading places…</p></div></div>
        <div class="body">${editor}</div>
        <footer class="foot">${hint ? `<span class="hint">${hint}</span>` : ""}<span class="grow"></span>
        <button type="button" class="btn" data-act="cancel">Cancel</button><button type="button" class="btn primary" data-act="ok"><i class="fa-solid fa-check"></i> Done</button></footer>`;
    }
    _replaceHTML(html, content) {
      // The custom element dispatches this event synchronously while it is connected.
      if (!content.kgcPlugins) {
        content.kgcPlugins = true;
        content.addEventListener("plugins", (e) => capturePlaceEditor(e, (view) => { this.editorView = view; }));
      }
      content.innerHTML = html;
      if (content.kgcBound) return;
      content.kgcBound = true;
      content.addEventListener("input", () => { this.changed = true; });
      content.addEventListener("pointerdown", (e) => {
        if (!e.target.closest('[data-act="place-picker"]')) return;
        const el = content.querySelector('textarea[name="text"]');
        if (el) this.textSelection = { start: el.selectionStart, end: el.selectionEnd };
      });
      const search = content.querySelector(".find input");
      search.addEventListener("input", (e) => { e.stopPropagation(); this.#search(content); });
      search.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); this.#hidePicker(content); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const n = this.matches?.length ?? 0;
          if (n) { this.active = ((this.active ?? 0) + (e.key === "ArrowDown" ? 1 : -1) + n) % n; this.#highlight(content); }
        } else if (e.key === "Enter") { e.preventDefault(); this.#insert(content, this.active ?? 0); }
      });
      content.addEventListener("click", (e) => {
        const b = e.target.closest("[data-act]"), act = b?.dataset.act;
        if (act === "place-picker") return this.#showPicker(content);
        if (act === "close-picker") return this.#hidePicker(content);
        if (act === "insert-place") return this.#insert(content, Number(b.dataset.i));
        if (act === "ok") {
          const el = content.querySelector('[name="text"]');
          this.result = String(el?.value ?? el?.querySelector(".ProseMirror")?.innerHTML ?? "").trim();
          this.close();
        } else if (act === "cancel") { this.changed = false; this.close(); }
      });
    }
    async #showPicker(content) {
      const picker = content.querySelector(".picker");
      if (!picker.hidden) return this.#hidePicker(content);
      picker.hidden = false;
      content.querySelector('[data-act="place-picker"]').setAttribute("aria-expanded", "true");
      content.querySelector(".find input").focus();
      if (!this.choices) {
        try { this.choices = (await getPlaces?.()) ?? []; } catch (err) {
          console.error("kg-cities | place search:", err);
          if (this.rendered) content.querySelector("[data-status]").textContent = "Places could not be loaded. Close this search and try again.";
          return;
        }
      }
      if (this.rendered) this.#search(content);
    }
    #hidePicker(content) {
      content.querySelector(".picker").hidden = true;
      content.querySelector('[data-act="place-picker"]').setAttribute("aria-expanded", "false");
    }
    #search(content) {
      const q = content.querySelector(".find input").value;
      this.matches = findPlaceLinks(q, this.choices ?? []);
      this.active = 0;
      content.querySelector(".results").innerHTML = this.matches.map((p, i) => `<button type="button" role="option" aria-selected="${i === 0}" data-act="insert-place" data-i="${i}"><i class="fa-solid fa-landmark"></i><span>${esc(p.name)}<small>${esc(p.where)}</small></span></button>`).join("");
      content.querySelector("[data-status]").textContent = !q.trim() ? "Search this city's points of interest and safe havens." : this.matches.length ? "Choose one to insert its link at the cursor. Arrow keys and Enter work too." : "No matching places.";
    }
    #highlight(content) {
      for (const row of content.querySelectorAll('[data-act="insert-place"]')) row.setAttribute("aria-selected", Number(row.dataset.i) === this.active ? "true" : "false");
      content.querySelector('.results [aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }
    #insert(content, i) {
      const place = this.matches?.[i];
      if (!place) return;
      if (!insertPlaceToken(content.querySelector('[name="text"]'), this.editorView, placeToken(place.ref, place.name), this.textSelection)) {
        return ui.notifications.warn("KG Cities: wait for the text editor to finish opening, then choose the place again.");
      }
      this.changed = true;
      this.textSelection = null;
      this.#hidePicker(content);
    }
    async close(options) {
      if (this.result === undefined && this.changed) {
        if (!(await confirm("Unsaved text", "<p>Close the editor and lose these changes?</p>"))) return this;
        this.changed = false;
      }
      return super.close(options);
    }
    _onClose(options) { super._onClose?.(options); textWindows.delete(id); this.resolve(this.result ?? null); }
  }
  const app = new TextWindow({ id: `kgc-text-${foundry.utils.randomID()}` });
  app.promise = new Promise((resolve) => { app.resolve = resolve; });
  textWindows.set(id, app);
  app.render({ force: true });
  return app.promise;
}

/* ---------------------------------------- */
/*  The card window                          */
/* ---------------------------------------- */

const tabsHtml = (tabs, on, label) => `<nav class="tabs" role="tablist" aria-label="${esc(label)}">${tabs.map(([k, l, i]) =>
  `<button type="button" role="tab" data-card-tab="${k}" aria-selected="${k === on}" class="${k === on ? "on" : ""}"><i class="fa-solid ${i}"></i> ${esc(l)}</button>`).join("")}</nav>`;

let CardClass = null;
function cardClass() {
  if (CardClass) return CardClass;
  const { ApplicationV2 } = foundry.applications.api;
  CardClass = class PlaceCardApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: ID, tag: "div", classes: ["kgc-ui", "kgc-place-card"],
      window: { title: "Place", icon: "fa-solid fa-landmark", resizable: true },
      position: { width: 460, height: "auto" }
    };

    constructor(options) {
      super(options);
      this.cards = options.cards;
      this.target(options.ref, options.edit);
    }

    // Opened straight into editing: Save or Cancel closes the card, since the card itself was never
    // asked for. Edit pressed on an open card goes back to it.
    target(ref, edit = false) { Object.assign(this, { ref, editing: !!edit, editOnly: !!edit, dirty: false, draft: null, viewTab: "about", formTab: "text" }); }
    get title() { return this.data?.name ?? "Place"; }

    confirmDiscard() { return confirm("Unsaved changes", "<p>Discard the changes to this card?</p>"); }

    async close(options) {
      if (this.dirty && !(await this.confirmDiscard())) return this;
      this.dirty = false;
      this.draft = null;
      return super.close(options);
    }

    async _renderHTML() {
      const d = await this.cards.deps.get(this.ref);
      this.data = d;
      if (!d) return `<div class="pc"><p class="empty">This place is gone.</p></div>`;
      const gm = game.user.isGM, vis = visibilityOf(d);
      if (!gm && vis === "hidden") return `<div class="pc"><p class="empty">Nothing is known about this place.</p></div>`;
      return this.editing && gm ? this.#formHtml(d) : this.#viewHtml(d, vis, gm);
    }

    async #viewHtml(d, vis, gm) {
      const rumoured = !gm && vis === "rumoured";
      const enrich = async (html) => (html ? TE().enrichHTML(html, { secrets: gm }) : "");
      const known = rumoured ? "" : await enrich(d.known);
      const notes = gm ? await enrich(d.gmNotes) : "";
      const rumours = await enrich(asHtml(d.rumours));
      const sect = (title, body, cls = "") => (body ? `<section class="sect ${cls}"><h4>${title}</h4><div class="text">${body}</div></section>` : "");
      const art = !rumoured && d.img ? `<div class="art" data-act="art" style="background-image:url('${esc(foundry.utils.getRoute(d.img))}')" data-tooltip="View it"></div>` : "";
      const badge = `<span class="badge ${d.tone}"><i class="fa-solid ${d.icon}"></i>${esc(d.type)}</span>`;
      const audience = gm && vis !== "discovered" ? `<span class="badge gm"><i class="fa-solid fa-eye-slash"></i>${esc(VISIBILITY[vis])} to players</span>` : "";
      const rows = (d.rows ?? []).filter(([, v]) => v).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("");
      const scene = gm && d.scene ? game.scenes.get(d.scene) : null;
      const journal = !rumoured ? readableJournal(d.journal) : null;
      const actors = (gm ? d.actors ?? [] : []).map((u, i) => {
        const a = fromUuidSync(u, { strict: false });
        return a ? `<button type="button" class="asset" data-act="actor" data-i="${i}" draggable="true" data-drag-uuid="${esc(u)}" data-tooltip="Open, or drag onto the scene"><img src="${esc(a.img ?? "")}" alt=""> ${esc(a.name)}</button>` : "";
      }).join("");
      const pics = (!rumoured ? d.images ?? [] : []).map((p, i) => `<button type="button" class="asset pic" data-act="pic" data-i="${i}" style="background-image:url('${esc(foundry.utils.getRoute(p))}')" aria-label="Picture ${i + 1}" data-tooltip="View it"></button>`).join("");
      const assets = actors || pics ? `<section class="sect"><h4>${actors ? "Who and what is here" : "Pictures"}</h4>${actors ? `<div class="assets">${actors}</div>` : ""}${pics ? `<div class="assets">${pics}</div>` : ""}</section>` : "";
      const foot = [
        // The main button takes everyone (activates the scene); View is a look for the GM alone.
        scene ? `<button type="button" class="btn primary" data-act="enter-all" data-tooltip="Activate it: everyone goes there"><i class="fa-solid fa-users"></i> ${esc(d.enterLabel ?? `Enter ${d.name}`)}</button><button type="button" class="btn" data-act="enter" data-tooltip="View it, only you"><i class="fa-solid fa-eye"></i> View</button>` : "",
        d.locate ? `<button type="button" class="btn" data-act="locate" aria-label="Show it on the map" data-tooltip="Show it on the map"><i class="fa-solid fa-location-crosshairs"></i></button>` : "",
        journal ? `<button type="button" class="btn" data-act="journal" data-tooltip="Open ${esc(journal.name)}"><i class="fa-solid fa-book-open"></i> Journal</button>` : "",
        d.phone && !rumoured ? `<button type="button" class="btn" data-act="phone" ${d.phone.here ? "" : "disabled"} data-tooltip="${esc(d.phone.here ? `Use the ${d.phone.label.toLowerCase()}` : "Only once you are there")}"><i class="fa-solid fa-phone"></i> ${esc(d.phone.label)}</button>` : "",
        `<span class="grow"></span>`,
        gm && d.img ? `<button type="button" class="btn" data-act="share" aria-label="Show the art to players" data-tooltip="Show the art to players"><i class="fa-solid fa-image"></i></button>` : "",
        gm ? `<button type="button" class="btn" data-act="edit"><i class="fa-solid fa-pen-to-square"></i> Edit</button>` : ""
      ].join("");
      const about = `${rows ? `<div class="rows">${rows}</div>` : ""}
        ${rumoured ? sect("Rumours", rumours || "<p>Only rumours so far.</p>") : sect("What is known", known)}
        ${!rumoured && !known && !rows ? `<p class="empty">${gm ? "Nothing written yet. Edit to add what is known." : "Little is known about this place."}</p>` : ""}
        ${gm ? "" : assets}`;
      const gmTab = gm ? `${assets}${vis === "rumoured" || d.rumours ? sect("Rumours (what players hear while it is Rumoured)", rumours, "gm") : ""}${sect("GM notes", notes, "gm")}` : "";
      const panes = [["about", "About", "fa-scroll", about], ["gm", "GM", "fa-user-secret", gmTab.trim()]].filter(([k, , , body]) => k === "about" || body);
      if (!panes.some(([k]) => k === this.viewTab)) this.viewTab = "about";
      return `<div class="pc">
        ${art}
        <header class="head">${badge}${audience}<h2>${esc(d.name)}</h2>${d.subtitle ? `<p class="sub">${esc(d.subtitle)}</p>` : ""}</header>
        ${panes.length > 1 ? tabsHtml(panes, this.viewTab, "Card") : ""}
        ${panes.map(([k, , , body]) => `<div class="pane" data-pane="${k}" ${k === this.viewTab ? "" : "hidden"}>${body}</div>`).join("")}
      </div><footer class="foot">${foot}</footer>`;
    }

    #formHtml(d) {
      const form = { ...(d.form ?? {}), ...(this.draft ?? {}) };
      const field = (f) => {
        const v = form[f.name] ?? "";
        const label = `<label>${esc(f.label)}</label>`;
        if (f.type === "image") return `<div class="field art-field"><input type="hidden" name="${f.name}" value="${esc(v)}">
          <button type="button" class="thumb" data-act="pick" aria-label="Choose the art" style="${v ? `background-image:url('${esc(foundry.utils.getRoute(v))}')` : ""}"><span>${v ? "Change art" : "Choose art"}</span></button>
          <button type="button" class="btn ghost small" data-act="clear-art" ${v ? "" : "hidden"}>Remove</button></div>`;
        if (f.type === "visibility") return `<div class="field"><input type="hidden" name="${f.name}" value="${esc(v)}">
          <div class="seg" role="radiogroup" aria-label="${esc(f.label)}">${Object.entries(VISIBILITY).map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === v}" class="${k === v ? "on" : ""}" data-act="vis" data-value="${k}">${l}</button>`).join("")}</div>
          <p class="hint vis-hint">${VIS_HINT[v] ?? ""}</p></div>`;
        if (f.type === "rich") return `<div class="field rich">${label}<input type="hidden" name="${f.name}" value="${esc(v)}">
          <div class="preview" data-act="write" data-field="${f.name}" data-tooltip="Edit the text">${preview(v)}</div>
          <div class="inline"><button type="button" class="btn small" data-act="write" data-field="${f.name}"><i class="fa-solid fa-pen-nib"></i> Edit text</button>${f.hint ? `<p class="hint">${f.hint}</p>` : ""}</div></div>`;
        if (f.type === "phonekind") return `<div class="field phone-kind"><input type="hidden" name="${f.name}" value="${esc(v || "none")}">
          <div class="seg" role="radiogroup" aria-label="${esc(f.label)}">${PHONE_KINDS.map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === (v || "none")}" class="${k === (v || "none") ? "on" : ""}" data-act="phone-kind" data-value="${k}">${l}</button>`).join("")}</div>
          <p class="hint phone-hint">${PHONE_HINT[v || "none"]}</p></div>`;
        if (f.type === "phonenumber") return `<div class="field" ${form.phoneKind && form.phoneKind !== "none" ? "" : "hidden"} data-phone-number>${label}<div class="phone-field"><input type="text" name="${f.name}" value="${esc(v)}" placeholder="555-0142">
          <button type="button" class="btn small" data-act="new-number"><i class="fa-solid fa-shuffle"></i> New number</button></div></div>`;
        if (f.type === "doc") return `<div class="field">${label}<div class="drop" data-drop="${f.doc}" data-field="${f.name}">${docBox(f, v)}</div></div>`;
        if (f.type === "docs" || f.type === "images") return `<div class="field">${label}<div class="drop list" data-drop="${f.doc ?? "image"}" data-field="${f.name}">${listBox(f, Array.isArray(v) ? v : [])}</div></div>`;
        return `<div class="field">${label}<input type="text" name="${f.name}" value="${esc(v)}"></div>`;
      };
      const box = (g, title) => {
        const list = FIELDS.filter((f) => f.group === g);
        const art = list.find((f) => f.type === "image"), rest = list.filter((f) => f !== art);
        const inner = art ? `<div class="ident">${field(art)}<div class="grid">${rest.map(field).join("")}</div></div>` : `<div class="grid">${rest.map(field).join("")}</div>`;
        // The Text box takes a dropped journal page: its text is copied into What is known.
        if (g === "text") return `<fieldset class="group" data-drop="journal-text"><legend>${title}</legend>${inner}<p class="hint">Drop a journal page on this box to copy its text into What is known, hidden until you reveal it.</p></fieldset>`;
        return title ? `<fieldset class="group"><legend>${title}</legend>${inner}</fieldset>` : inner;
      };
      const panes = FORM_TABS.map(([k, label, icon, groups]) => [k, label, icon, GROUPS.filter(([g]) => groups.includes(g)).map(([g, t]) => box(g, t)).join("")]);
      if (!panes.some(([k]) => k === this.formTab)) this.formTab = "text";
      return `<form class="pc pc-form" autocomplete="off">${tabsHtml(panes, this.formTab, "Edit")}
        ${panes.map(([k, , , body]) => `<div class="pane" data-pane="${k}" ${k === this.formTab ? "" : "hidden"}>${body}</div>`).join("")}
        ${d.mapNote ? `<p class="hint map-note"><i class="fa-solid fa-circle-info"></i> ${d.mapNote}</p>` : ""}</form>
        <footer class="foot">
        ${d.canDelete ? `<button type="button" class="btn danger" data-act="delete"><i class="fa-solid fa-trash"></i> Remove</button>` : ""}
        <span class="grow"></span>${this.dirty ? `<span class="dirty"><i class="fa-solid fa-circle"></i> unsaved</span>` : ""}
        <button type="button" class="btn" data-act="discard">${this.dirty ? "Discard" : "Cancel"}</button>
        <button type="button" class="btn primary" data-act="save"><i class="fa-solid fa-floppy-disk"></i> Save</button></footer>`;
    }

    _replaceHTML(html, content) {
      content.innerHTML = html;
      const title = this.element?.querySelector(".window-title");
      if (title) title.textContent = this.data?.name ?? "Place";
      this.element?.classList.toggle("haven", this.data?.tone === "haven");
      // The content element is kept from render to render: listen once.
      if (!content.kgcBound) {
        content.kgcBound = true;
        content.addEventListener("click", (e) => this.#click(e));
        content.addEventListener("input", () => this.#markDirty());
        content.addEventListener("change", () => this.#markDirty());
        content.addEventListener("dragover", (e) => { if (e.target.closest?.("[data-drop]")) e.preventDefault(); });
        content.addEventListener("dragstart", (e) => {
          const el = e.target.closest?.("[data-drag-uuid]");
          if (el) e.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: el.dataset.dragUuid }));
        });
        content.addEventListener("drop", (e) => this.#drop(e));
      }
      this.#decorate(content);
    }

    /** GM: a Reveal or Hide button on each secret block of What is known, in place. */
    #decorate(root) {
      if (!game.user.isGM || this.editing) return;
      root.querySelectorAll(".sect:not(.gm) section.secret").forEach((sec, i) => {
        const shown = sec.classList.contains("revealed");
        const b = sec.querySelector(":scope > button.reveal") ?? document.createElement("button");
        b.type = "button";
        b.className = "reveal btn small";
        b.dataset.act = "reveal";
        b.dataset.i = i;
        b.innerHTML = shown ? '<i class="fa-solid fa-eye-slash"></i> Hide' : '<i class="fa-solid fa-eye"></i> Reveal';
        b.dataset.tooltip = shown ? "Hide this from players again" : "Show this to players";
        const label = document.createElement("span");
        label.className = "reveal-state";
        label.innerHTML = shown ? '<i class="fa-solid fa-eye"></i> Shown to players' : '<i class="fa-solid fa-eye-slash"></i> GM only';
        sec.prepend(label, b);
      });
    }

    #markDirty() {
      if (!this.editing || this.dirty) return;
      this.dirty = true;
      const foot = this.element?.querySelector(".foot");
      if (foot && !foot.querySelector(".dirty")) {
        const s = document.createElement("span");
        s.className = "dirty";
        s.innerHTML = '<i class="fa-solid fa-circle"></i> unsaved';
        foot.querySelector(".grow")?.after(s);
        const d = foot.querySelector('[data-act="discard"]');
        if (d) d.textContent = "Discard";
      }
    }

    /** The form's values, by field type. */
    #values() {
      const form = this.element.querySelector("form.pc-form"), out = {};
      for (const f of FIELDS) {
        const el = form.querySelector(`[name="${f.name}"]`);
        if (!el) continue;
        if (f.type === "docs" || f.type === "images") { try { out[f.name] = JSON.parse(el.value || "[]"); } catch { out[f.name] = []; } }
        else out[f.name] = String(el.value ?? "").trim();
      }
      return out;
    }

    async #click(e) {
      // A tab: shown in place (no redraw, so edits in the form stay).
      const tab = e.target.closest("[data-card-tab]");
      if (tab) {
        e.preventDefault();
        const k = tab.dataset.cardTab, root = tab.closest(".pc");
        this[this.editing ? "formTab" : "viewTab"] = k;
        for (const t of root.querySelectorAll("[data-card-tab]")) { const on = t.dataset.cardTab === k; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); }
        for (const p of root.querySelectorAll(":scope > .pane")) p.hidden = p.dataset.pane !== k;
        return;
      }
      const b = e.target.closest("[data-act]");
      if (!b) return;
      e.preventDefault();
      const act = b.dataset.act, d = this.data, deps = this.cards.deps;
      const popout = (src) => new foundry.applications.apps.ImagePopout({ src, window: { title: d.name } }).render(true);
      switch (act) {
        case "edit": this.editing = true; this.editOnly = false; this.dirty = false; this.draft = null; return this.render();
        case "discard":
          if (this.dirty && !(await this.confirmDiscard())) return;
          this.editing = false; this.dirty = false; this.draft = null;
          return this.editOnly ? this.close() : this.render();
        case "save": {
          const values = this.#values();
          this.editing = false; this.dirty = false; this.draft = null;
          await deps.save(this.ref, values);
          ui.notifications.info(`KG Cities: ${values.name || d.name} saved.`);
          return this.editOnly ? this.close() : this.render();
        }
        case "delete": {
          if (!(await confirm("Remove from the map", `<p>Remove <b>${esc(d.name)}</b> from the map, with its card?</p>`))) return;
          this.dirty = false;
          await deps.remove(this.ref);
          return this.close();
        }
        case "pick": case "clear-art": {
          const box = b.closest(".art-field"), input = box.querySelector("input"), thumb = box.querySelector(".thumb");
          const set = (path) => {
            input.value = path;
            thumb.style.backgroundImage = path ? `url('${foundry.utils.getRoute(path)}')` : "";
            thumb.querySelector("span").textContent = path ? "Change art" : "Choose art";
            box.querySelector('[data-act="clear-art"]').hidden = !path;
            this.#markDirty();
          };
          if (act === "clear-art") return set("");
          return new foundry.applications.apps.FilePicker.implementation({ type: "image", current: input.value, callback: set }).render(true);
        }
        case "vis": {
          const box = b.closest(".field");
          box.querySelector("input").value = b.dataset.value;
          for (const x of box.querySelectorAll("[data-act=vis]")) { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }
          box.querySelector(".vis-hint").textContent = VIS_HINT[b.dataset.value] ?? "";
          return this.#markDirty();
        }
        case "phone-kind": {
          const box = b.closest(".field"), form = b.closest("form");
          box.querySelector("input").value = b.dataset.value;
          for (const x of box.querySelectorAll("[data-act=phone-kind]")) { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }
          box.querySelector(".phone-hint").textContent = PHONE_HINT[b.dataset.value] ?? "";
          const num = form.querySelector("[data-phone-number]");
          num.hidden = b.dataset.value === "none";
          const input = num.querySelector("input");
          if (!num.hidden && !input.value) input.value = deps.newNumber?.() ?? "";
          return this.#markDirty();
        }
        case "new-number": {
          const input = b.closest(".field").querySelector("input");
          input.value = deps.newNumber?.() ?? "";
          return this.#markDirty();
        }
        case "phone": return deps.phone?.(this.ref);
        case "clear": {
          const box = b.closest("[data-drop]");
          box.innerHTML = docBox(FIELDS.find((x) => x.name === box.dataset.field), "");
          return this.#markDirty();
        }
        case "list-remove": case "list-add": {
          const box = b.closest("[data-drop]"), f = FIELDS.find((x) => x.name === box.dataset.field);
          const list = JSON.parse(box.querySelector("input").value || "[]");
          const put = (l) => { box.innerHTML = listBox(f, l); this.#markDirty(); };
          if (act === "list-remove") { list.splice(Number(b.dataset.i), 1); return put(list); }
          return new foundry.applications.apps.FilePicker.implementation({ type: "image", callback: (path) => path && put([...list, path]) }).render(true);
        }
        case "write": return this.#write(b.dataset.field);
        case "reveal": return this.#reveal(Number(b.dataset.i));
        case "art": return popout(d.img);
        case "pic": return popout(d.images[Number(b.dataset.i)]);
        case "share": {
          const pop = new foundry.applications.apps.ImagePopout({ src: d.img, window: { title: d.name }, uuid: null });
          await pop.render(true);
          return pop.shareImage?.();
        }
        case "actor": return openDoc(d.actors?.[Number(b.dataset.i)]);
        case "journal": return openJournal(d.journal);
        case "locate": return deps.locate?.(this.ref);
        case "enter": case "enter-all":
          // Once there, the card is done.
          await deps.enter?.(this.ref, act === "enter-all");
          return this.close();
      }
    }

    /** Reveal (or hide again) the i-th secret block of What is known. */
    async #reveal(i) {
      const div = document.createElement("div");
      div.innerHTML = this.data.known ?? "";
      const sec = div.querySelectorAll("section.secret")[i];
      if (!sec) return;
      sec.classList.toggle("revealed");
      await this.cards.deps.save(this.ref, { known: div.innerHTML });
      return this.render();
    }

    /** A rich text field in the full-size editor; Done puts the text back in the form (still unsaved). */
    async #write(name) {
      const f = FIELDS.find((x) => x.name === name), input = this.element.querySelector(`input[name="${name}"]`);
      if (!f || !input) return;
      const refKey = JSON.stringify(this.ref);
      const html = await textWindow({ id: `${refKey}:${name}`, title: `${this.data.name}: ${f.label.split(" · ")[0]}`, value: input.value, hint: f.hint, getPlaces: () => this.cards.deps.placeChoices?.(this.ref) });
      // The card may have been drawn again (or closed, or saved) while the editor was open.
      const now = this.rendered && this.editing && JSON.stringify(this.ref) === refKey ? this.element.querySelector(`input[name="${name}"]`) : null;
      if (html == null || !now || html === now.value) return;
      now.value = html;
      const box = this.element.querySelector(`.preview[data-field="${name}"]`);
      if (box) box.innerHTML = preview(html);
      this.#markDirty();
    }

    async #drop(e) {
      const box = e.target.closest?.("[data-drop]");
      if (!box) return;
      e.preventDefault();
      e.stopPropagation();
      let data = null;
      try { data = TE().getDragEventData(e); } catch { /* not a document */ }
      const f = FIELDS.find((x) => x.name === box.dataset.field);
      if (f?.type === "docs") {
        if (data?.type !== f.doc || !data.uuid) return ui.notifications.warn(`KG Cities: drop ${DROP_WHAT[f.doc]}.`);
        const list = JSON.parse(box.querySelector("input").value || "[]");
        if (!list.includes(data.uuid)) list.push(data.uuid);
        box.innerHTML = listBox(f, list);
        return this.#markDirty();
      }
      if (f?.type === "doc") {
        // A journal field takes a whole journal or one of its pages.
        const fits = data?.type === f.doc || (f.doc === "JournalEntry" && data?.type === "JournalEntryPage");
        if (!fits || !data.uuid) return ui.notifications.warn(`KG Cities: drop ${DROP_WHAT[f.doc]}.`);
        let value = data.uuid;
        if (f.doc === "Scene") {
          const doc = fromUuidSync(data.uuid, { strict: false });
          if (!doc || data.uuid.startsWith("Compendium.")) return ui.notifications.warn("KG Cities: import the scene into the world first, then drop it from the Scenes sidebar.");
          if (doc.id === canvas.scene?.id) return ui.notifications.warn("KG Cities: a place cannot link the scene it is on.");
          value = doc.id;
        }
        box.innerHTML = docBox(f, value);
        return this.#markDirty();
      }
      // A journal page's text, copied into What is known as a secret block. The journal is not linked.
      if (!data?.uuid || !["JournalEntry", "JournalEntryPage"].includes(data.type)) return ui.notifications.warn("KG Cities: drop a journal page.");
      const doc = await fromUuid(data.uuid);
      const html = doc?.text?.content ?? doc?.pages?.contents?.map((p) => p.text?.content ?? "").join("") ?? "";
      if (!html) return ui.notifications.warn("KG Cities: that journal has no text.");
      const values = this.#values();
      this.draft = { ...values, known: `${values.known ?? ""}${asSecret(html)}` };
      this.dirty = true;
      await this.render();
      ui.notifications.info(`KG Cities: ${doc.name} copied in, hidden from players until you reveal it.`);
    }
  };
  return CardClass;
}
