// Bank accounts and safe deposit boxes, as numbers: a character's account (free, one at a time),
// deposits and withdrawals in dollars, and boxes rented by the month. Pure: no Foundry.
//
// The account lives on the character (flags.kg-cities.bank). Cash moves between the wallet and the
// account as whole copper at the world's dollar rate; the wallet is counted out afresh in the
// fewest coins after a deposit, as a teller would give change.

import { COINS, walletValue } from "./money.mjs";

export const DAY = 86400;
export const MONTH = 30 * DAY;
/** Lines of history an account keeps. */
export const LOG_KEPT = 40;

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Safe deposit boxes by size, with a 1986 rent (about $25 to $100 a year) and the vault grid
 * Item Piles draws inside it.
 */
export const BOX_SIZES = {
  small: { label: "Small (3 by 5 inches)", fee: 2, cols: 4, rows: 2 },
  medium: { label: "Medium (5 by 10 inches)", fee: 4, cols: 6, rows: 4 },
  large: { label: "Large (10 by 10 inches)", fee: 8, cols: 8, rows: 6 }
};

/** An account with every field, or null when there is none. */
export function makeAccount(part) {
  if (!part || !part.bank) return null;
  return {
    bank: String(part.bank),
    number: String(part.number ?? ""),
    balance: Math.max(0, cents(part.balance)),
    opened: Number.isFinite(part.opened) ? part.opened : null,
    log: (part.log ?? []).slice(0, LOG_KEPT).map((l) => ({ time: Number(l.time) || 0, what: String(l.what ?? ""), amount: cents(l.amount), balance: cents(l.balance), where: String(l.where ?? "") })),
    boxes: (part.boxes ?? []).map(makeBox).filter(Boolean)
  };
}

/** A character's account (an actor, or anything with its flags), or null. */
export const accountOf = (actor) => makeAccount(actor?.flags?.["kg-cities"]?.bank);

/** A box with every field: { id, number, size, fee, vault (its actor's uuid), bank, branch { city, id, name }, opened, next }. */
export function makeBox(part) {
  if (!part?.id) return null;
  const size = BOX_SIZES[part.size] ? part.size : "small";
  return {
    id: String(part.id), number: String(part.number ?? ""), size,
    fee: part.fee == null ? BOX_SIZES[size].fee : Math.max(0, cents(part.fee)),
    vault: part.vault ?? null, bank: String(part.bank ?? ""),
    branch: { city: part.branch?.city ?? null, id: part.branch?.id ?? null, name: String(part.branch?.name ?? "") },
    opened: Number.isFinite(part.opened) ? part.opened : null,
    next: Number.isFinite(part.next) ? part.next : null
  };
}

/** An account number in the style of the day: "042-118734-6". */
export function accountNumber(random = Math.random) {
  const d = (n) => Array.from({ length: n }, () => Math.floor(random() * 10)).join("");
  return `0${d(2)}-${d(6)}-${d(1)}`;
}

/** A box number: three or four digits. */
export const boxNumber = (random = Math.random) => String(100 + Math.floor(random() * 1900));

/** A new account at a bank. */
export function openAccount(bank, { time = 0, where = "", random = Math.random } = {}) {
  return makeAccount({ bank, number: accountNumber(random), balance: 0, opened: time, log: [{ time, what: "Opened", amount: 0, balance: 0, where }], boxes: [] });
}

function logged(acc, entry) {
  return { ...acc, log: [entry, ...acc.log].slice(0, LOG_KEPT) };
}

/** Money in: the account with `amount` dollars more. */
export function credit(acc, amount, { time = 0, what = "Deposit", where = "" } = {}) {
  const a = cents(amount);
  if (!(a > 0)) throw new Error("Nothing to put in.");
  const balance = cents(acc.balance + a);
  return logged({ ...acc, balance }, { time, what, amount: a, balance, where });
}

/** Money out: the account with `amount` dollars less. Throws when the balance is short. */
export function debit(acc, amount, { time = 0, what = "Withdrawal", where = "" } = {}) {
  const a = cents(amount);
  if (!(a > 0)) throw new Error("Nothing to take out.");
  if (a > acc.balance + 1e-9) throw new Error(`Only ${fmt(acc.balance)} in the account.`);
  const balance = cents(acc.balance - a);
  return logged({ ...acc, balance }, { time, what, amount: -a, balance, where });
}

const fmt = (d) => `$${cents(d).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A wallet holding exactly `copper`, in the fewest coins. */
export function coinsFor(copper) {
  let left = Math.max(0, Math.round(Number(copper) || 0));
  const out = {};
  for (const c of COINS) { out[c.key] = Math.floor(left / c.value); left -= out[c.key] * c.value; }
  return out;
}

/**
 * Take `dollars` out of a wallet: the wallet after, counted out afresh, or null when it holds
 * less. Arithmetic on the total, so a $10,000 deposit is as quick as a dime.
 */
export function takeFromWallet(currency, dollars, rate = 1000) {
  const copper = Math.round(cents(dollars) * (Number(rate) || 1000));
  const have = walletValue(currency);
  if (copper > have) return null;
  return { ...(currency ?? {}), ...coinsFor(have - copper) };
}

/** Put `dollars` into a wallet: the wallet after, counted out afresh. */
export function putInWallet(currency, dollars, rate = 1000) {
  const copper = Math.round(cents(dollars) * (Number(rate) || 1000));
  return { ...(currency ?? {}), ...coinsFor(walletValue(currency) + copper) };
}

/** What a wallet holds, in dollars. */
export const walletDollars = (currency, rate = 1000) => cents(walletValue(currency) / (Number(rate) || 1000));

/**
 * The months a box's rent has come due by `now`: { months: [t], next }. The first month is paid
 * when it is rented, so the next is a month on.
 */
export function boxRentDue(box, now, max = 60) {
  const months = [];
  let t = Number.isFinite(box?.next) ? box.next : now + MONTH;
  while (t <= now && months.length < max) { months.push(t); t += MONTH; }
  if (t <= now) t += Math.ceil((now - t + 1) / MONTH) * MONTH;
  return { months, next: t };
}

/**
 * Every box rent come due by `now`, as bill lines: { lines: [{ label, amount }], boxes (each with
 * its next rent day moved on), due (any at all) }.
 */
export function boxRentsDue(acc, now) {
  const lines = [], boxes = [];
  for (const b of acc?.boxes ?? []) {
    const { months, next } = boxRentDue(b, now);
    if (months.length && b.fee > 0) lines.push({ label: `Safe deposit box ${b.number}, ${b.bank}${months.length > 1 ? ` × ${months.length} months` : ""}`, amount: cents(b.fee * months.length) });
    boxes.push({ ...b, next });
  }
  return { lines, boxes, due: lines.length > 0 };
}

/** The boxes' monthly rents, as bills the budget shows: [{ key, label, amount }]. */
export const boxBills = (acc) => (acc?.boxes ?? []).map((b) => ({ key: `box:${b.id}`, label: `Safe deposit box ${b.number}, ${b.bank}`, amount: b.fee }));
