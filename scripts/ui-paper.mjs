// The paper books' windows: a little black book (ruled cream pages in a black leather cover) and a
// Rolodex (index cards on a wheel), every entry in handwriting. Open anywhere: a number heard in
// play is written in here, not only at a phone. A number tapped calls it from a phone the
// character is at.

import { PAPER, paperOf, setDeviceContacts } from "./phones.mjs";
import { contact, digits, findContact, formatNumber, putContact, sortBook } from "./phone-core.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const TABS = [["all", "All", null], ["af", "A–F", /^[a-f]/i], ["gm", "G–M", /^[g-m]/i], ["ns", "N–S", /^[n-s]/i], ["tz", "T–Z", /^[t-z]/i], ["other", "#", /^[^a-z]/i]];
const LINES = 12;

const windows = new Map();
let PaperClass = null;

/** Open a paper book. deps: callBack(number) (dial it from a phone here). */
export function openPaper(item, deps) {
  if (!paperOf(item)) return null;
  if (!game.user.isGM && !item.isOwner) return ui.notifications.warn("That book is not yours.");
  let app = windows.get(item.uuid);
  if (app?.rendered) { app.bringToFront?.(); return app; }
  app = new (paperClass())(item, deps);
  windows.set(item.uuid, app);
  app.render({ force: true });
  return app;
}

/** Redraw the open books (a book's pages changed). */
export function refreshPaper() {
  for (const app of windows.values()) if (app.rendered) app.redraw();
}

function paperClass() {
  if (PaperClass) return PaperClass;
  const { ApplicationV2 } = foundry.applications.api;
  PaperClass = class PaperBook extends ApplicationV2 {
    static DEFAULT_OPTIONS = { tag: "div", classes: ["kgc-ui", "kgc-paper-window"], window: { icon: "fa-solid fa-book", resizable: false }, position: { width: 400, height: "auto" } };
    constructor(item, deps) {
      super({ id: `kgc-paper-${foundry.utils.randomID()}` });
      this.uuid = item.uuid;
      this.deps = deps;
      this.tab = "all";
      this.card = 0;
      this.editing = null;
      this.err = "";
    }
    get item() { return fromUuidSync(this.uuid, { strict: false }); }
    get paper() { return paperOf(this.item); }
    get title() { const i = this.item; return i ? `${i.parent?.name ?? ""}'s ${i.name.toLowerCase().startsWith("rolodex") ? "Rolodex" : i.name.toLowerCase()}` : "Book"; }
    get rolodex() { return this.paper?.style === "rolodex"; }

    redraw() {
      if (!this.rendered) return;
      const vals = Object.fromEntries([...this.element.querySelectorAll("[data-f]")].map((el) => [el.dataset.f, el.value]));
      const focus = document.activeElement?.dataset?.f;
      this.#draw();
      if (!this.keepForm) for (const [k, v] of Object.entries(vals)) { const el = this.element.querySelector(`[data-f="${k}"]`); if (el) el.value = v; }
      this.keepForm = false;
      if (focus) this.element.querySelector(`[data-f="${focus}"]`)?.focus();
    }
    async _renderHTML() { return ""; }
    _replaceHTML(html, content) {
      if (!content.kgcBound) {
        content.kgcBound = true;
        content.addEventListener("click", (e) => this.#click(e));
        content.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-f]")) { e.preventDefault(); this.#save(); } });
        content.addEventListener("input", () => { if (this.err) { this.err = ""; this.element.querySelector(".pp-err")?.remove(); } });
      }
      this.#draw(content);
    }
    _onClose(o) { super._onClose?.(o); windows.delete(this.uuid); }

    #draw(content = this.element?.querySelector(".window-content")) {
      if (!content) return;
      const t = this.element?.querySelector(".window-title");
      if (t) t.textContent = this.title;
      const p = this.paper;
      if (!p) { content.innerHTML = `<p class="empty">This book is gone.</p>`; return; }
      const list = sortBook(p.contacts ?? []);
      const editing = this.editing ? list.find((c) => c.id === this.editing) : null;
      const book = this.rolodex ? this.#rolodex(list) : this.#blackbook(list);
      const verb = editing ? "Save changes" : this.rolodex ? "Add a card" : "Write it in";
      content.innerHTML = `${book}
        <div class="pp-form">
          <div class="pp-label">${editing ? `Changing ${esc(editing.name || formatNumber(editing.number))}` : "Add a number"}</div>
          <div class="pp-fields"><input data-f="name" placeholder="Who is it?" aria-label="Name" value="${esc(editing?.name ?? "")}"><input data-f="number" placeholder="555-0188" aria-label="Number" value="${esc(editing?.number ?? "")}"></div>
          <input data-f="note" placeholder="${this.rolodex ? "A note (ask for Mick, cash only)" : "A note, if any"}" aria-label="Note" value="${esc(editing?.note ?? "")}">
          ${this.err ? `<p class="pp-err">${esc(this.err)}</p>` : ""}
          <div class="pp-acts">${editing ? `<button type="button" class="btn small danger" data-act="cross">${this.rolodex ? "Take the card out" : "Cross it out"}</button><button type="button" class="btn small" data-act="cancel">Cancel</button>` : ""}<span class="grow"></span>
            <button type="button" class="btn small primary" data-act="save"><i class="fa-solid fa-pen"></i> ${verb}</button></div>
          <p class="hint">Tap a number to call it from a phone ${esc(this.item?.parent?.name ?? "they")} ${this.item?.parent ? "is" : "are"} at. Click an entry to change it. Everything written here is remembered too, so a new book or pager starts with it.</p>
        </div>`;
    }

    #blackbook(list) {
      const re = TABS.find((t) => t[0] === this.tab)?.[2];
      const rows = list.filter((c) => !re || re.test(c.name || "#"));
      const lines = Math.max(LINES, rows.length + 1);
      const entry = (c) => `<div class="pp-line entry ${c.id === this.editing ? "on" : ""}" data-act="edit" data-id="${esc(c.id)}"><span class="who">${esc(c.name || "?")}${c.note ? ` <span class="note">(${esc(c.note)})</span>` : ""}</span><button type="button" class="dial" data-act="call" data-value="${esc(c.number)}" data-tooltip="Call it">${esc(formatNumber(c.number))}</button></div>`;
      return `<div class="pp-cover"><div class="pp-stamp">${esc(this.item?.parent?.name ?? "")}</div>
        <nav class="pp-tabs">${TABS.map(([k, l]) => `<button type="button" class="${k === this.tab ? "on" : ""}" data-act="tab" data-value="${k}">${l}</button>`).join("")}</nav>
        <div class="pp-page hand">${Array.from({ length: lines }, (_, i) => (rows[i] ? entry(rows[i]) : `<div class="pp-line"></div>`)).join("")}</div></div>`;
    }

    #rolodex(list) {
      if (!list.length) return `<div class="pp-rolo"><div class="pp-drum"><div class="pp-card hand only"><div class="head"><span>No cards yet</span></div><div class="l"></div><div class="l"></div><div class="notch"></div></div></div></div>`;
      this.card = Math.max(0, Math.min(this.card, list.length - 1));
      const cards = list.map((c, i) => {
        const d = i - this.card;
        if (Math.abs(d) > 2) return "";
        // The cards still to come stand up behind the front one, their tops showing; the ones
        // already flipped lie forward, below it.
        const t = d === 0 ? "translateY(54px)" : d > 0 ? `translateY(${54 - d * 18}px) scale(${1 - d * 0.05})` : `translateY(${224 + (Math.abs(d) - 1) * 8}px) rotateX(-55deg) scale(${1 - Math.abs(d) * 0.05})`;
        return `<div class="pp-card hand ${d === 0 ? "front" : ""}" style="transform:${t};z-index:${10 - Math.abs(d)}" ${d === 0 ? `data-act="edit" data-id="${esc(c.id)}"` : `data-act="flip" data-value="${i}"`}>
          <div class="head"><span class="who">${esc(c.name || "?")}</span><button type="button" class="dial" data-act="call" data-value="${esc(c.number)}" data-tooltip="Call it">${esc(formatNumber(c.number))}</button></div>
          <div class="l">${esc(c.note ?? "")}</div><div class="l"></div><div class="l"></div><div class="notch"></div></div>`;
      }).join("");
      return `<div class="pp-rolo"><div class="pp-drum">${cards}</div>
        <div class="pp-nav"><button type="button" data-act="flip" data-value="${this.card - 1}" aria-label="Previous card" ${this.card ? "" : "disabled"}><i class="fa-solid fa-chevron-left"></i></button>
          <span>${esc(list[this.card]?.name?.[0]?.toUpperCase() ?? "")} · ${this.card + 1} of ${list.length}</span>
          <button type="button" data-act="flip" data-value="${this.card + 1}" aria-label="Next card" ${this.card < list.length - 1 ? "" : "disabled"}><i class="fa-solid fa-chevron-right"></i></button></div></div>`;
    }

    async #save() {
      const item = this.item, p = this.paper;
      if (!item || !p) return;
      const f = (k) => this.element.querySelector(`[data-f="${k}"]`)?.value.trim() ?? "";
      const name = f("name"), number = f("number"), note = f("note");
      if (!name) { this.err = "Write who it is."; return this.redraw(); }
      if (digits(number).length < 7) { this.err = "Write the whole number."; return this.redraw(); }
      const list = p.contacts ?? [];
      const other = findContact(list, number);
      const c = contact({ id: this.editing ?? (other?.id || null), name, number, note }, () => foundry.utils.randomID());
      await setDeviceContacts(item, putContact(list, c));
      this.editing = null;
      this.err = "";
      this.keepForm = true;
      if (this.rolodex) this.card = sortBook(paperOf(item).contacts).findIndex((x) => x.id === c.id);
      this.#clearForm();
      this.redraw();
    }

    #clearForm() { for (const el of this.element.querySelectorAll("[data-f]")) el.value = ""; }

    async #click(e) {
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled) return;
      const act = b.dataset.act;
      if (act === "call") { e.stopPropagation(); return this.deps.callBack?.(b.dataset.value, this.item?.parent); }
      if (act === "tab") { this.tab = b.dataset.value; return this.redraw(); }
      if (act === "flip") { this.card = Number(b.dataset.value); this.editing = null; this.keepForm = true; this.#clearForm(); return this.redraw(); }
      if (act === "edit") { this.editing = b.dataset.id; this.err = ""; this.keepForm = true; return this.redraw(); }
      if (act === "cancel") { this.editing = null; this.err = ""; this.keepForm = true; this.#clearForm(); return this.redraw(); }
      if (act === "save") return this.#save();
      if (act === "cross") {
        const item = this.item, p = this.paper, c = (p?.contacts ?? []).find((x) => x.id === this.editing);
        if (!c) return;
        // Crossed out of the book; still remembered (a new book would bring it back: that is the GM's to forget).
        await item.update({ [`flags.${ID}.paper.contacts`]: (p.contacts ?? []).filter((x) => x.id !== c.id) });
        this.editing = null;
        this.keepForm = true;
        this.#clearForm();
        return this.redraw();
      }
    }
  };
  return PaperClass;
}

export { PAPER };
