// Phones and pagers, the parts without Foundry: numbers, what a dialled number reaches, what a
// pager can show, address books. Places have phones (a line or a payphone); people carry pagers.
// A device kind is one of DEVICES; a carried phone that both rings and dials (an early cell
// phone) can join later as another kind without changing how numbers and calls work.

/** Device kinds: where each lives and what it can do. */
export const DEVICES = {
  line: { label: "Phone", on: "place", dials: true, rings: true },
  payphone: { label: "Payphone", on: "place", dials: true, rings: true, coin: true },
  pager: { label: "Pager", on: "person", dials: false, rings: false, pages: true }
};

/** Pager models, as in 1986: what each one's screen can show. */
export const PAGER_MODELS = {
  tone: { name: "Motorola Pageboy II", mode: "Tone only", year: 1975, img: "assets/phones/pager-tone.svg", description: "Tone only: it beeps and the wearer calls the agreed number. Rugged; hospitals and city crews still carry them." },
  numeric: { name: "Motorola Bravo", mode: "Numeric", year: 1986, img: "assets/phones/pager-numeric.svg", description: "A numeric display: the caller keys in a number to call back, or a short code." },
  alpha: { name: "NEC 21A", mode: "Alphanumeric", year: 1986, img: "assets/phones/pager-alpha.svg", description: "An alphanumeric display: an operator types the caller's message, up to 80 characters." }
};

/** The pager models as a list. */
export const pagerModels = () => Object.entries(PAGER_MODELS).map(([key, m]) => ({ key, ...m }));

/** What a payphone takes for a call: a quarter. */
export const PAYPHONE_DOLLARS = 0.25;
/** The coin in copper at `rate` copper per dollar. */
export const coinCopper = (rate = 1000) => Math.max(1, Math.round(PAYPHONE_DOLLARS * (Number(rate) || 1000)));

/** Numbers that need no coin and no number of their own: the GM answers them. */
export const SERVICES = {
  "911": { name: "Emergency (911)", free: true },
  "0": { name: "Operator", free: true },
  "411": { name: "Directory assistance", free: true },
  "611": { name: "Repair service", free: true }
};

/** A number as its digits (and * #), at most 15. */
export const digits = (n) => String(n ?? "").replace(/[^0-9*#]/g, "").slice(0, 15);

/** "555-0142", "(617) 555-0142", "1 (617) 555-0142"; anything else as typed. */
export function formatNumber(n) {
  const d = digits(n);
  if (/^\d{7}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (/^\d{10}$/.test(d)) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^1\d{10}$/.test(d)) return `1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return d;
}

/**
 * Two numbers are the same line: the same digits, or one is the other's last seven (a local
 * call leaves out the area code), with a leading 1 ignored.
 */
export function sameNumber(a, b) {
  const x = digits(a).replace(/^1(?=\d{10}$)/, ""), y = digits(b).replace(/^1(?=\d{10}$)/, "");
  if (!x || !y) return false;
  if (x === y) return true;
  const local = (s) => (s.length === 10 ? s.slice(3) : s);
  return (x.length === 7 || y.length === 7) && /^\d+$/.test(x + y) && local(x) === local(y);
}

/**
 * A free number: 555-01XX first (the exchange set aside for fiction), then 555-XXXX. `taken`:
 * numbers already given out; `random`: a 0..1 source, for tests.
 */
export function freeNumber(taken = [], random = Math.random) {
  const used = (n) => taken.some((t) => sameNumber(t, n));
  const tries = [];
  for (let i = 0; i < 100; i++) tries.push(`5550${100 + i}`);
  for (let i = tries.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [tries[i], tries[j]] = [tries[j], tries[i]]; }
  const found = tries.find((n) => !used(n));
  if (found) return formatNumber(found);
  for (let k = 0; k < 2000; k++) {
    const n = `555${String(Math.floor(random() * 10000)).padStart(4, "0")}`;
    if (!used(n)) return formatNumber(n);
  }
  return null;
}

/**
 * What a dialled number reaches in a directory of entries { kind: "place" | "pager" | "line",
 * number, ... }: { kind: "service", number, name } for 911 and the like, the directory entry, or
 * { kind: "none" } (not in service). Incomplete numbers (fewer than 7 digits, not a service):
 * { kind: "incomplete" }.
 */
export function reach(dialled, directory = []) {
  const d = digits(dialled);
  if (SERVICES[d]) return { kind: "service", number: d, ...SERVICES[d] };
  if (d.replace(/[*#]/g, "").length < 7) return { kind: "incomplete", number: d };
  return directory.find((e) => e.number && sameNumber(e.number, d)) ?? { kind: "none", number: d };
}

/** Numbers given out more than once in a directory: [[number, [entries]]]. */
export function duplicates(directory = []) {
  const groups = [];
  for (const e of directory) {
    if (!e.number) continue;
    const g = groups.find(([n]) => sameNumber(n, e.number));
    if (g) g[1].push(e); else groups.push([e.number, [e]]);
  }
  return groups.filter(([, list]) => list.length > 1);
}

/**
 * What a pager of this model shows for a page: tone-only a call-back alert, numeric the digits
 * and pager punctuation of the message (falling back to the callback number), alphanumeric up to
 * 80 characters. { text, callback } where callback is the number to call, when there is one.
 */
export function pageFor(model, { text = "", callback = "" } = {}) {
  const cb = digits(callback);
  if (model === "tone") return { text: "CALL BACK", callback: cb };
  if (model === "numeric") {
    const shown = String(text ?? "").replace(/[^0-9*#() .-]/g, "").trim().slice(0, 20) || cb;
    return { text: shown || "CALL BACK", callback: cb || digits(shown) };
  }
  const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 80).toUpperCase();
  return { text: t || (cb ? `CALL ${formatNumber(cb)}` : "CALL BACK"), callback: cb };
}

/* ---------------------------------------- */
/*  Address books                            */
/* ---------------------------------------- */

/** A contact: { id, name, number, note }. */
export const contact = ({ id, name = "", number = "", note = "" } = {}, makeId = () => Math.random().toString(36).slice(2, 10)) =>
  ({ id: id || makeId(), name: String(name).trim().slice(0, 60), number: formatNumber(number), note: String(note ?? "").trim().slice(0, 200) });

/** The contact for a number in a book, or null. */
export const findContact = (book = [], number) => book.find((c) => sameNumber(c.number, number)) ?? null;

/** A book sorted by name, then number. */
export const sortBook = (book = []) => [...book].sort((a, b) => (a.name || "~").localeCompare(b.name || "~") || digits(a.number).localeCompare(digits(b.number)));

/**
 * `extra` merged into `book`: a contact whose number is already there takes the name only when
 * the book's has none; new numbers are added. Neither is changed; returns the merged book.
 */
export function mergeBooks(book = [], extra = []) {
  const out = book.map((c) => ({ ...c }));
  for (const c of extra) {
    const have = out.find((x) => sameNumber(x.number, c.number));
    if (!have) out.push({ ...c });
    else if (!have.name && c.name) have.name = c.name;
  }
  return out;
}

/** The book with this contact set (by id, else by number), or removed when `remove`. */
export function putContact(book = [], c, { remove = false } = {}) {
  const i = book.findIndex((x) => (c.id && x.id === c.id) || (!c.id && sameNumber(x.number, c.number)));
  const out = [...book];
  if (remove) { if (i >= 0) out.splice(i, 1); return out; }
  if (i >= 0) out[i] = { ...out[i], ...c }; else out.push(c);
  return out;
}

/* ---------------------------------------- */
/*  From Unsleeping Pagers                   */
/* ---------------------------------------- */

/** Unsleeping Pagers' pager types as our models. */
export const OLD_MODELS = { tone: "tone", numeric: "numeric", alphanumeric: "alpha" };

/**
 * An Unsleeping Pagers log (a user's received pages: { fromName, fromNumber, message, time } with
 * time in real milliseconds) as pages and contacts: { recent, contacts }. Senders with a number
 * become contacts (the GM's master pager does not); pages keep their real time, as `at`.
 */
export function fromOldLog(history = [], makeId = () => Math.random().toString(36).slice(2, 10)) {
  const recent = [], contacts = [];
  for (const h of Array.isArray(history) ? history : []) {
    const text = String(h?.message ?? "").trim();
    if (!text) continue;
    const number = digits(h.fromNumber);
    recent.push({ id: makeId(), at: Number(h.time) || 0, text, callback: number.length >= 7 ? formatNumber(number) : "" });
    const name = String(h.fromName ?? "").trim();
    if (number.length >= 7 && name && !/master pager/i.test(name) && !findContact(contacts, number)) contacts.push(contact({ name, number }, makeId));
  }
  recent.sort((a, b) => a.at - b.at);
  return { recent, contacts };
}

/** The newest `max` entries of a list kept oldest first, with `entry` added. */
export const pushRecent = (list = [], entry, max = 30) => [...list, entry].slice(-max);
