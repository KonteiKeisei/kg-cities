// The bank window: a teller at a branch (open an account, cash in and out, pay in paychecks, rent
// and open a safe deposit box) or an ATM (cash in and out). Opened from a bank's place card, by a
// player whose character is there; the GM picks whose account to see.

import { BOX_SIZES, accountOf } from "./bank-core.mjs";
import { itemPiles } from "./bank.mjs";
import { checksOf, dateLabel, payrollActors } from "./payroll.mjs";

const ID = "kg-cities";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const dollars = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const opts = (list, value) => list.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("");

let AppClass = null, open = null;

/**
 * Open the window at a place: { city, id, name, bank (its 1986 name), atm }. actor: whose account
 * (the player's character there; the GM may change it). bank: the Bank service.
 */
export function openBank(bank, place, actor) {
  if (!AppClass) {
    const { ApplicationV2 } = foundry.applications.api;
    AppClass = class BankWindow extends ApplicationV2 {
      static DEFAULT_OPTIONS = { id: "kgc-bank", tag: "div", classes: ["kgc-ui", "kgc-switchboard", "kgc-bank"], window: { title: "Bank", icon: "fa-solid fa-building-columns", resizable: true }, position: { width: 460, height: "auto" } };
      constructor() {
        super();
        this.amount = "";
        this.size = "small";
        this.pay = "account";
        this.adjust = "";
      }
      get title() { return this.place?.atm ? `${this.place.bank} ATM` : this.place?.bank ?? "Bank"; }
      at(bankSvc, place, actor) {
        Object.assign(this, { svc: bankSvc, place, actorId: actor?.id ?? this.actorId ?? null });
        this.error = "";
        return this;
      }
      get actor() { return game.actors.get(this.actorId) ?? null; }
      async _renderHTML() { return ""; }
      _replaceHTML(html, content) {
        if (!content.kgcBound) {
          content.kgcBound = true;
          content.addEventListener("change", (e) => this.#change(e));
          content.addEventListener("input", (e) => { const f = e.target.dataset.f; if (f) this[f] = e.target.value; });
          content.addEventListener("click", (e) => this.#click(e));
        }
        this.#draw(content);
      }
      refresh() { if (this.rendered) this.#draw(); }

      #draw(content = this.element?.querySelector(".window-content")) {
        if (!content) return;
        const p = this.place, a = this.actor, acc = accountOf(a), gm = game.user.isGM;
        const wallet = this.svc.wallet(a);
        const who = gm
          ? `<label class="bk-who">Whose account<select data-f="actorId"><option value="">Pick a character</option>${opts(payrollActors().map((x) => [x.id, x.name]), this.actorId)}</select></label>`
          : `<p class="bk-who"><i class="fa-solid fa-user"></i> ${esc(a?.name ?? "")}</p>`;
        let body = "";
        if (!a) body = `<p class="hint">Pick whose account to see.</p>`;
        else if (!acc) body = p.atm
          ? `<p class="hint">The machine wants a bank card. Open an account at a branch first.</p>`
          : `<p>Open a checking account at ${esc(p.bank)}. No minimum, no monthly charge.</p><button type="button" class="btn primary" data-act="open"><i class="fa-solid fa-signature"></i> Open an account</button>`;
        else body = this.#account(a, acc, wallet);
        content.innerHTML = `<div class="bk-body">
          <header class="bk-head"><i class="fa-solid ${p.atm ? "fa-money-bill-wave" : "fa-building-columns"}"></i><div><b>${esc(this.title)}</b><small>${esc(p.name)}</small></div></header>
          ${who}${body}
          ${this.error ? `<p class="warn-line"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(this.error)}</p>` : ""}</div>`;
      }

      #account(a, acc, wallet) {
        const p = this.place, gm = game.user.isGM, here = acc.bank === p.bank;
        const move = !p.atm && !here ? `<p class="hint">The account is at ${esc(acc.bank)}. This teller can move it here (the balance and any boxes go with it), or you can bank with ${esc(acc.bank)} at its own branches.</p><button type="button" class="btn small" data-act="open">Move the account to ${esc(p.bank)}</button>` : "";
        const canTeller = p.atm || here;
        const quick = p.atm ? `<div class="bk-quick">${[20, 40, 60, 100].map((n) => `<button type="button" class="btn small" data-act="quick" data-n="${n}">$${n}</button>`).join("")}</div>` : "";
        const checks = canTeller ? checksOf(a) : [];
        const log = acc.log.slice(0, 8);
        return `<div class="bk-acct"><div><small>${esc(acc.bank)} · No. ${esc(acc.number)}</small><b>${dollars(acc.balance)}</b></div><div><small>In the wallet</small><b>${wallet == null ? "n/a" : dollars(wallet)}</b></div></div>
          ${move}
          ${canTeller ? `<div class="bk-cash"><input type="number" min="0" step="0.01" data-f="amount" value="${esc(this.amount)}" placeholder="Amount, $" aria-label="Amount in dollars">
            <button type="button" class="btn" data-act="deposit"><i class="fa-solid fa-arrow-down"></i> Deposit</button>
            <button type="button" class="btn" data-act="withdraw"><i class="fa-solid fa-arrow-up"></i> Withdraw</button></div>${quick}` : ""}
          ${checks.length ? `<h4>Paychecks</h4><div class="pr-checks">${checks.map((i) => `<div class="pr-check"><img src="${esc(i.img)}" alt=""><span>${esc(i.flags[ID].check.from)}<small>${esc(dateLabel(i.flags[ID].check.time))}</small></span><b>${dollars(i.flags[ID].check.amount)}</b><button type="button" class="btn small" data-act="check" data-uuid="${i.uuid}">Pay it in</button></div>`).join("")}</div>` : ""}
          ${p.atm && !(game.user.isGM && acc.boxes.length) ? "" : this.#boxes(acc)}
          ${gm ? `<div class="bk-cash gm"><input type="number" step="0.01" data-f="adjust" value="${esc(this.adjust)}" placeholder="GM: + or − $" aria-label="Change the balance by"><button type="button" class="btn small" data-act="adjust" data-tooltip="Change the balance without the wallet: a wire, a fee, a seizure">Change the balance</button></div>` : ""}
          ${log.length ? `<h4>Statement</h4><table class="sb-table bk-log"><tbody>${log.map((l) => `<tr><td><small>${esc(dateLabel(l.time))}</small></td><td>${esc(l.what)}${l.where ? `<small>${esc(l.where)}</small>` : ""}</td><td class="${l.amount < 0 ? "neg" : ""}">${l.amount ? dollars(l.amount) : ""}</td><td>${dollars(l.balance)}</td></tr>`).join("")}</tbody></table>` : ""}`;
      }

      #boxes(acc) {
        const p = this.place, ip = !!itemPiles(), gmHere = !!game.users.activeGM;
        const mine = acc.boxes;
        const rows = mine.map((b) => {
          // The GM can open or give up any box anywhere (its branch may be gone from the map).
          const atThis = (b.branch.city === p.city && b.branch.id === p.id) || game.user.isGM;
          return `<tr><td><b>Box ${esc(b.number)}</b><small>${esc(BOX_SIZES[b.size].label)}, ${dollars(b.fee)} a month</small></td><td><small>${esc(b.bank)}, ${esc(b.branch.name)}</small></td>
            <td class="acts">${atThis ? `<button type="button" class="btn small" data-act="box-open" data-id="${b.id}" ${ip ? "" : "disabled"}><i class="fa-solid fa-key"></i> Open</button><button type="button" class="btn small danger" data-act="box-give" data-id="${b.id}" data-tooltip="Give it up (it must be empty)"><i class="fa-solid fa-xmark"></i></button>` : `<small>Opens only there</small>`}</td></tr>`;
        }).join("");
        const why = p.atm ? "Boxes are rented at a branch." : !ip ?"Safe deposit boxes need the Item Piles module." : !gmHere ? "A GM has to be here to rent a box." : acc.bank !== p.bank ? `Boxes here are for ${p.bank}'s customers.` : "";
        return `<h4>Safe deposit boxes</h4>
          ${rows ? `<table class="sb-table bk-boxes"><tbody>${rows}</tbody></table>` : ""}
          <div class="bk-rent"><select data-f="size" aria-label="Box size">${opts(Object.entries(BOX_SIZES).map(([k, s]) => [k, `${s.label}, ${dollars(s.fee)} a month`]), this.size)}</select>
            <select data-f="pay" aria-label="Pay the first month from">${opts([["account", "First month from the account"], ["wallet", "First month in cash"]], this.pay)}</select>
            <button type="button" class="btn" data-act="rent" ${why ? `disabled data-tooltip="${esc(why)}"` : ""}><i class="fa-solid fa-box-archive"></i> Rent a box</button></div>
          <p class="hint">${why ? esc(why) : "The rent comes with the bills each month. Only this character can open the box, and only at this branch."}</p>`;
      }

      #change(e) {
        const f = e.target.dataset.f;
        if (!f) return;
        this[f] = e.target.value;
        if (f === "actorId") { this.error = ""; this.#draw(); }
      }

      async #click(e) {
        const el = e.target.closest("[data-act]");
        if (!el) return;
        const a = this.actor, p = this.place, where = p.name, acc = accountOf(a);
        const act = el.dataset.act;
        this.error = "";
        try {
          if (act === "open") {
            if (acc && acc.boxes.some((b) => b.bank !== p.bank) && !(await foundry.applications.api.DialogV2.confirm({ window: { title: "Move the account" }, content: `<p>Your boxes stay at their own branches; only you can open them, and their rent keeps coming.</p>` }))) return;
            await this.svc.open(a, p.bank, where);
          }
          if (act === "deposit") await this.svc.deposit(a, this.amount, where);
          if (act === "withdraw") await this.svc.withdraw(a, this.amount, where);
          if (act === "quick") await this.svc.withdraw(a, Number(el.dataset.n), where);
          if (act === "deposit" || act === "withdraw") this.amount = "";
          if (act === "check") await this.svc.depositCheck(a, await fromUuid(el.dataset.uuid), where);
          if (act === "adjust") { await this.svc.adjust(a, this.adjust, where); this.adjust = ""; }
          if (act === "rent") await this.svc.rent(a, { size: this.size, pay: this.pay, bank: p.bank, branch: { city: p.city, id: p.id, name: p.name } });
          const box = acc?.boxes.find((b) => b.id === el.dataset.id);
          if (act === "box-open" && box) await this.svc.openBox(a, box);
          if (act === "box-give" && box) {
            if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: "Give up the box" }, content: `<p>Give up box ${esc(box.number)}? It has to be empty. Its rent stops.</p>` }))) return;
            await this.svc.giveUp(a, box);
          }
        } catch (err) {
          this.error = err.message;
        }
        this.#draw();
      }
    };
  }
  open ??= new AppClass();
  open.at(bank, place, actor);
  open.render({ force: true });
  open.bringToFront?.();
  return open;
}

/** Redraw the window if it is open (an account or a wallet changed). */
export const refreshBank = () => open?.refresh();
