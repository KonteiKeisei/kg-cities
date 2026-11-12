// Payroll in the world: each character's jobs (actor flags), paydays on the world clock, pay to the
// wallet or as a paper check (an item, cashed later), and a pay stub in the chat for the
// character's owners and the GM. Paydays are run by the GM in charge's client, so a time skip pays
// once, however many GMs are on.

import { DAY, billsDue, cents, computePay, dollars, dueTimes, homeBills, inSeason, makeHome, makeJob, MONTHS } from "./payroll-core.mjs";
import { addCopper, pay, walletValue } from "./money.mjs";

const ID = "kg-cities";
const SOCKET = `module.${ID}`;
const STUBS_KEPT = 30;
export const CHECK_ICON = `modules/${ID}/assets/payroll/check.svg`;
const isPrimaryGM = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** A character's jobs, each with every field. */
export const jobsOf = (actor) => (actor?.flags?.[ID]?.payroll?.jobs ?? []).map((j) => makeJob(j));
/** A character's pay stubs, newest first. */
export const stubsOf = (actor) => [...(actor?.flags?.[ID]?.payroll?.stubs ?? [])].sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
/** The paper checks a character holds, not yet cashed. */
export const checksOf = (actor) => actor?.items?.filter((i) => i.flags?.[ID]?.check) ?? [];
/** The characters on the payroll: player characters, and anyone given a job. */
export const payrollActors = () => game.actors.filter((a) => a.type !== "group" && (a.hasPlayerOwner || jobsOf(a).length)).sort((a, b) => a.name.localeCompare(b.name));

export async function saveJobs(actor, jobs) {
  await actor.update({ [`flags.${ID}.payroll.jobs`]: jobs.map((j) => makeJob(j)) });
}

/** A character's household: where they live, what they drive, what they eat, what they owe. */
export const homeOf = (actor) => makeHome(actor?.flags?.[ID]?.payroll?.home ?? {});
export async function saveHome(actor, home) {
  const h = makeHome(home);
  // Bills start a week (rent a month) from when they are turned on.
  if (h.on && !Number.isFinite(h.next)) h.next = game.time.worldTime + 7 * DAY;
  if (h.on && !Number.isFinite(h.rentNext)) h.rentNext = game.time.worldTime + 30 * DAY;
  await actor.update({ [`flags.${ID}.payroll.home`]: h });
}

/** The world clock's month (0 to 11, or the calendar's), for seasons. */
export function monthAt(t) {
  const c = game.time.calendar?.timeToComponents?.(t);
  return Number.isInteger(c?.month) ? c.month : null;
}
const monthNames = () => {
  const c = game.time.calendar, list = c?.monthsArray ?? (Array.isArray(c?.months?.values) ? c.months.values : Object.values(c?.months?.values ?? {}));
  return list.length ? list.map((m, i) => game.i18n.localize(m?.name ?? MONTHS[i] ?? `Month ${i + 1}`)) : MONTHS;
};
export const monthList = () => monthNames();

/** "Friday, October 17" (or as much of it as the calendar knows) for a world time. */
export function dateLabel(t) {
  const c = game.time.calendar?.timeToComponents?.(t);
  if (!c) return `Day ${Math.floor(t / DAY) + 1}`;
  const cal = game.time.calendar;
  const days = cal?.weekdaysArray ?? (Array.isArray(cal?.days?.values) ? cal.days.values : Object.values(cal?.days?.values ?? {}));
  const wd = Number.isInteger(c.dayOfWeek) && days[c.dayOfWeek] ? `${game.i18n.localize(days[c.dayOfWeek].name ?? "")}, ` : "";
  const m = monthNames()[c.month] ?? "";
  return `${wd}${m} ${(c.dayOfMonth ?? 0) + 1}`.trim();
}

/** The skill (dnd5e's "inv") or ability ("int") bonus a payday roll adds, or 0. */
export function skillBonus(actor, key) {
  if (!key) return 0;
  const s = actor?.system?.skills?.[key];
  if (s) return Number(s.total ?? s.mod) || 0;
  return Number(actor?.system?.abilities?.[key]?.mod) || 0;
}
/** The skills and abilities a payday roll can add (dnd5e's names). */
export function skillChoices() {
  const out = [["", "No skill"]];
  for (const [k, v] of Object.entries(CONFIG.DND5E?.skills ?? {})) out.push([k, game.i18n.localize(v.label ?? k)]);
  for (const [k, v] of Object.entries(CONFIG.DND5E?.abilities ?? {})) out.push([k, game.i18n.localize(v.label ?? k)]);
  return out;
}

/**
 * The payroll. deps: dollarRate() (copper a dollar), onChange() (redraw the windows).
 */
export class Payroll {
  constructor(deps) {
    this.deps = deps;
    this.running = null;
  }

  install() {
    game.socket.on(SOCKET, (msg) => {
      if (msg?.action !== "payroll") return;
      if (msg.op === "cash" && isPrimaryGM()) this.#askToCash(msg).catch((err) => console.error(`${ID} | payroll`, err));
      if (msg.op === "notice" && msg.userId === game.user.id) ui.notifications.info(msg.text);
    });
    Hooks.on("updateWorldTime", () => this.runDue());
    // The windows follow a character's jobs, stubs, checks and wallet.
    const changed = (doc) => { if (doc?.flags?.[ID]?.check || doc?.documentName === "Actor") this.deps.onChange?.(); };
    Hooks.on("updateActor", (actor, changes) => { if (foundry.utils.hasProperty(changes, `flags.${ID}.payroll`) || foundry.utils.hasProperty(changes, "system.currency")) this.deps.onChange?.(); });
    Hooks.on("createItem", changed);
    Hooks.on("deleteItem", changed);
  }

  get rate() { return Number(this.deps.dollarRate?.()) || 1000; }
  get cashMode() { try { return game.settings.get(ID, "payCheckCashing"); } catch { return "anywhere"; } }

  /** Pay every payday that has come (the GM in charge). Called on every tick of the clock. */
  async runDue() {
    if (!isPrimaryGM()) return;
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      do {
        this.again = false;
        const now = game.time.worldTime;
        for (const actor of payrollActors()) {
          const jobs = jobsOf(actor);
          if (jobs.some((j) => dueTimes(j, now).times.length)) await this.#pay(actor, jobs, (j) => dueTimes(j, now));
          // Then the bills: paid out of what payday just put in the wallet.
          const home = homeOf(actor), due = billsDue(home, now);
          if (due.weeks.length || due.months.length) await this.#bills(actor, home, due);
        }
      } while (this.again);
    })().catch((err) => console.error(`${ID} | payroll`, err)).finally(() => { this.running = null; });
    return this.running;
  }

  /** Pay one job now, outside its schedule (its next payday stays where it is). */
  async payNow(actor, jobId) {
    if (!game.user.isGM) return;
    const jobs = jobsOf(actor);
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    await this.#pay(actor, jobs, (j) => (j.id === jobId ? { times: [game.time.worldTime], next: j.next, manual: true } : { times: [], next: j.next }));
  }

  /**
   * The paydays `due(job)` gives, for every job of one character: rolled, deposited, stubbed and
   * written in one go.
   */
  async #pay(actor, jobs, due) {
    const stubs = [], checks = [];
    let wallet = 0;
    for (const job of jobs) {
      const { times, next, manual } = due(job);
      for (const time of times) {
        if (!manual && !inSeason(job, monthAt(time))) continue;
        if (job.left === 0) break;
        const stub = await this.#payday(actor, job, time);
        stubs.push(stub);
        if (stub.paid === "check" && stub.net > 0) checks.push(this.#check(actor, stub));
        wallet += stub.paid === "check" ? stub.cashTotal : stub.total;
        // A "once" bonus is spent; a job with paydays left counts one down.
        job.bonuses = job.bonuses.filter((b) => !stub.used.includes(b.id));
        if (job.left != null) job.left = Math.max(0, job.left - 1);
      }
      if (!manual) job.next = next;
    }
    const update = { [`flags.${ID}.payroll.jobs`]: jobs, [`flags.${ID}.payroll.stubs`]: [...stubs, ...stubsOf(actor)].slice(0, STUBS_KEPT) };
    const cur = actor.system?.currency;
    if (wallet > 0 && cur) update["system.currency"] = { ...cur, ...addCopper(cur, Math.round(wallet * this.rate)) };
    await actor.update(update);
    if (checks.length) await actor.createEmbeddedDocuments("Item", checks);
    if (stubs.length) await this.#tell(actor, stubs, { wallet, noWallet: wallet > 0 && !cur });
    return stubs;
  }

  /**
   * Living costs come due: the weekly bills for each week, the monthly ones for each month, and
   * anything still owed, taken from the wallet. Short, the wallet is emptied and the rest is owed.
   */
  async #bills(actor, home, due) {
    const bills = homeBills(home), lines = [];
    const sum = (list) => list.reduce((s, b) => s + b.amount, 0);
    if (due.weeks.length) for (const b of bills.weekly) lines.push({ label: due.weeks.length > 1 ? `${b.label} × ${due.weeks.length} weeks` : b.label, amount: cents(b.amount * due.weeks.length) });
    if (due.months.length) for (const b of bills.monthly) lines.push({ label: due.months.length > 1 ? `${b.label} × ${due.months.length} months` : b.label, amount: cents(b.amount * due.months.length) });
    if (home.owed > 0) lines.push({ label: "Still owed from before", amount: home.owed });
    const total = cents(sum(lines));
    const cur = actor.system?.currency, rate = this.rate;
    let paid = 0, wallet = null;
    if (cur) {
      const have = walletValue(cur) / rate;
      paid = cents(Math.min(have, total));
      const r = pay(cur, Math.round(paid * rate)) ?? pay(cur, walletValue(cur));
      if (r) wallet = { ...cur, ...r.after };
    }
    const owed = cents(cur ? total - paid : 0);
    const update = { [`flags.${ID}.payroll.home`]: { ...home, next: due.next, rentNext: due.rentNext, owed } };
    if (wallet) update["system.currency"] = wallet;
    await actor.update(update);
    if (!total) return;
    const owners = game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id);
    const time = (due.weeks.at(-1) ?? due.months.at(-1));
    const content = `<div class="kgc-stub-msg"><div class="kgc-stub bills"><header><b>Bills</b><span>${esc(dateLabel(time))}</span></header>
      <table>${lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${dollars(l.amount)}</td></tr>`).join("")}
      <tr class="net"><td>${cur ? "Paid from the wallet" : "Due (note it down)"}</td><td>${dollars(cur ? paid : total)}</td></tr>
      ${owed > 0 ? `<tr class="tax"><td>Short: owed</td><td>${dollars(owed)}</td></tr>` : ""}</table>
      ${owed > 0 && checksOf(actor).length ? `<div class="kgc-stub-roll">${dollars(checksOf(actor).reduce((s, i) => s + (i.flags[ID].check.amount ?? 0), 0))} in paychecks not cashed: cash them and pay up.</div>` : ""}</div></div>`;
    await ChatMessage.create({ content, whisper: owners, speaker: { alias: `Bills: ${actor.name}` }, flags: { [ID]: { bills: true } } });
  }

  async #payday(actor, job, time) {
    let roll = null, rollText = "";
    if (job.roll) {
      const bonus = skillBonus(actor, job.roll.skill);
      const formula = `${job.roll.formula}${bonus ? ` ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}` : ""}`;
      try {
        const r = await new Roll(formula).evaluate();
        roll = r.total;
        rollText = `${job.roll.label || "Payday roll"}: ${formula} = ${r.total}`;
      } catch (err) { console.warn(`${ID} | payroll roll ${formula}`, err); }
    }
    const p = computePay(job, { roll });
    return {
      id: foundry.utils.randomID(), jobId: job.id, title: job.title, employer: job.employer, time, paid: job.paid,
      rollText, band: p.band?.text ?? "", lines: p.lines, taxes: p.taxes, cash: p.cash,
      gross: p.gross, withheld: p.withheld, net: p.net, cashTotal: p.cashTotal, total: p.total, used: p.used
    };
  }

  /** A paper check for a stub's net pay: an item the character holds until it is cashed. */
  #check(actor, stub) {
    const type = game.system.id === "dnd5e" ? "loot" : (game.documentTypes?.Item ?? []).find((t) => t !== "base") ?? "base";
    const from = stub.employer || stub.title;
    return {
      name: `Paycheck: ${from}, ${dollars(stub.net)}`, type, img: CHECK_ICON,
      system: game.system.id === "dnd5e" ? { description: { value: `<p>Pay to the order of ${esc(actor.name)}: <b>${dollars(stub.net)}</b>, from ${esc(from)}, ${esc(dateLabel(stub.time))}. Cash it from <b>Your pay</b>.</p>` }, quantity: 1, weight: { value: 0 } } : {},
      flags: { [ID]: { check: { amount: stub.net, from, stub: stub.id, time: stub.time, payee: actor.id } } }
    };
  }

  /** The pay stubs in the chat, for the character's owners and the GMs. */
  async #tell(actor, stubs, { wallet, noWallet }) {
    const owners = game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id);
    const content = `<div class="kgc-stub-msg">${stubs.map((s) => stubHtml(s)).join("")}
      ${wallet > 0 ? `<p class="kgc-stub-note"><i class="fa-solid fa-wallet"></i> ${dollars(wallet)} ${noWallet ? "in cash (this system has no wallet: note it down)" : "into the wallet"}</p>` : ""}</div>`;
    await ChatMessage.create({ content, whisper: owners, speaker: { alias: `Payday: ${actor.name}` }, flags: { [ID]: { payday: true } } });
  }

  /* -------- Cashing checks -------- */

  /** Cash a check this user holds: at once, or asking the GM, by the setting. */
  async cash(item) {
    const check = item?.flags?.[ID]?.check;
    if (!check) return;
    if (this.cashMode === "gm" && !game.user.isGM) {
      if (!game.users.activeGM) return ui.notifications.warn("A GM has to be here to cash a check.");
      game.socket.emit(SOCKET, { action: "payroll", op: "cash", userId: game.user.id, uuid: item.uuid });
      return ui.notifications.info(`You hand over the ${dollars(check.amount)} check. The GM decides.`);
    }
    return this.#deposit(item);
  }

  async #deposit(item) {
    const actor = item.parent, check = item.flags[ID].check, cur = actor?.system?.currency;
    if (!actor) return;
    if (cur) await actor.update({ "system.currency": { ...cur, ...addCopper(cur, Math.round(cents(check.amount) * this.rate)) } });
    await item.delete();
    ui.notifications.info(`${actor.name} cashed ${dollars(check.amount)}${cur ? "" : " (no wallet in this system: note it down)"}.`);
    return true;
  }

  async #askToCash(msg) {
    const item = await fromUuid(msg.uuid), user = game.users.get(msg.userId);
    const check = item?.flags?.[ID]?.check;
    if (!check) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Cash a check" },
      content: `<p><b>${esc(user?.name)}</b> wants to cash <b>${esc(item.parent?.name)}</b>'s check from ${esc(check.from)} for <b>${dollars(check.amount)}</b>.</p><p>At a bank, with ID? A check casher takes a cut; a bar might not take it at all.</p>`,
      yes: { label: "Cash it" }, no: { label: "Not here" }
    });
    if (ok) await this.#deposit(item);
    game.socket.emit(SOCKET, { action: "payroll", op: "notice", userId: msg.userId, text: ok ? `Your ${dollars(check.amount)} check was cashed.` : "They won't cash your check here." });
  }
}

/** One pay stub, as the chat and the windows show it. */
export function stubHtml(s) {
  const row = (l, a, cls = "") => `<tr class="${cls}"><td>${esc(l)}</td><td>${dollars(a)}</td></tr>`;
  return `<div class="kgc-stub"><header><b>${esc(s.employer || s.title)}</b><span>${esc(dateLabel(s.time))}</span></header>
    ${s.employer ? `<div class="kgc-stub-job">${esc(s.title)}</div>` : ""}
    ${s.rollText ? `<div class="kgc-stub-roll"><i class="fa-solid fa-dice"></i> ${esc(s.rollText)}${s.band ? `: ${esc(s.band)}` : ""}</div>` : ""}
    <table>${s.lines.map((l) => row(l.label, l.amount)).join("")}
      ${s.taxes.length ? row("Gross", s.gross, "sum") + s.taxes.map((t) => row(t.label, t.amount, "tax")).join("") : ""}
      ${row(s.paid === "check" ? "Net pay, by check" : "Net pay, in cash", s.net, "net")}
      ${s.cash.map((c) => row(`${c.label} (cash, on the side)`, c.amount, "side")).join("")}</table></div>`;
}
