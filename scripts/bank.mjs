// Banks in the world: a character's account (free; flags.kg-cities.bank), cash in and out of the
// wallet at a branch or an ATM, paychecks paid in, and safe deposit boxes: Item Piles vaults only
// that character can open, rented by the month (the rent comes with the bills, see payroll.mjs).
//
// The player changes their own character's account. A box's vault is an actor, so the GM in
// charge's client makes it, and takes it away when it is given up empty.

import { BOX_SIZES, MONTH, accountOf, boxNumber, credit, debit, makeBox, openAccount, putInWallet, takeFromWallet, walletDollars } from "./bank-core.mjs";
import { walletValue } from "./money.mjs";

const ID = "kg-cities";
const SOCKET = `module.${ID}`;
const isPrimaryGM = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;
const dollars = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const BANK_ICON = `modules/${ID}/assets/banks/bank.svg`;
export const ATM_ICON = `modules/${ID}/assets/banks/atm.svg`;
export const BOX_ICON = `modules/${ID}/assets/banks/box.svg`;
const BOX_FOLDER = "KG Cities: safe deposit boxes";

/** Item Piles is on (vaults and shops need it). */
export const itemPiles = () => (game.modules.get("item-piles")?.active && game.itempiles?.API) || null;
const pileData = (actor) => actor?.flags?.["item-piles"]?.data ?? null;
/** An Item Piles shop: a chain store's actor whose Shop button opens it. */
export const isMerchant = (actor) => !!pileData(actor)?.enabled && pileData(actor).type === "merchant";

export class Bank {
  /** deps: dollarRate() (copper a dollar), onChange() (redraw the windows). */
  constructor(deps) {
    this.deps = deps;
  }

  install() {
    game.socket.on(SOCKET, (msg) => {
      if (msg?.action !== "bank") return;
      if (msg.op === "notice" && msg.userId === game.user.id) return ui.notifications[msg.warn ? "warn" : "info"](msg.text);
      if (!isPrimaryGM()) return;
      const tell = (text, warn = false) => game.socket.emit(SOCKET, { action: "bank", op: "notice", userId: msg.userId, text, warn });
      const run = msg.op === "rent" ? this.#rent(msg) : msg.op === "giveUp" ? this.#giveUp(msg) : msg.op === "show" ? this.#show(msg) : null;
      run?.then((text) => text && tell(text)).catch((err) => { console.warn(`${ID} | bank`, err); tell(err.message, true); });
    });
    Hooks.on("updateActor", (actor, changes) => {
      if (foundry.utils.hasProperty(changes, `flags.${ID}.bank`) || foundry.utils.hasProperty(changes, "system.currency")) this.deps.onChange?.();
    });
  }

  get rate() { return Number(this.deps.dollarRate?.()) || 1000; }
  wallet(actor) { return actor?.system?.currency ? walletDollars(actor.system.currency, this.rate) : null; }

  async #save(actor, acc, currency = null) {
    const update = { [`flags.${ID}.bank`]: acc };
    if (currency) update["system.currency"] = currency;
    await actor.update(update);
  }

  /** Open a free account at a bank, or move one there (the balance and boxes go with it). */
  async open(actor, bank, where) {
    const now = game.time.worldTime, old = accountOf(actor);
    const acc = openAccount(bank, { time: now, where });
    if (old) {
      acc.balance = old.balance;
      acc.boxes = old.boxes;
      acc.log = [{ time: now, what: `Moved from ${old.bank}`, amount: 0, balance: old.balance, where }, ...old.log].slice(0, 40);
    }
    await this.#save(actor, acc);
    return acc;
  }

  /** Cash from the wallet into the account. */
  async deposit(actor, amount, where) {
    const acc = accountOf(actor), cur = actor.system?.currency;
    if (!acc) throw new Error("No account.");
    if (!cur) throw new Error("This system has no wallet to take cash from.");
    const wallet = takeFromWallet(cur, amount, this.rate);
    if (!wallet) throw new Error(`Only ${dollars(this.wallet(actor))} in the wallet.`);
    await this.#save(actor, credit(acc, amount, { time: game.time.worldTime, where }), wallet);
  }

  /** Cash out of the account into the wallet. */
  async withdraw(actor, amount, where) {
    const acc = accountOf(actor), cur = actor.system?.currency;
    if (!acc) throw new Error("No account.");
    const next = debit(acc, amount, { time: game.time.worldTime, where });
    await this.#save(actor, next, cur ? putInWallet(cur, amount, this.rate) : null);
  }

  /** A paycheck paid into the account. */
  async depositCheck(actor, item, where) {
    const acc = accountOf(actor), check = item?.flags?.[ID]?.check;
    if (!acc || !check) throw new Error("No account, or not a check.");
    await this.#save(actor, credit(acc, check.amount, { time: game.time.worldTime, what: `Paycheck, ${check.from}`, where }));
    await item.delete();
  }

  /** The GM puts money in or takes it out, no wallet involved (a wire, a fee, a freeze). */
  async adjust(actor, amount, where) {
    const acc = accountOf(actor);
    if (!acc || !game.user.isGM) return;
    const a = Number(amount) || 0, opts = { time: game.time.worldTime, what: a > 0 ? "Credit" : "Debit", where };
    await this.#save(actor, a > 0 ? credit(acc, a, opts) : debit(acc, -a, opts));
  }

  /* -------- Safe deposit boxes -------- */

  /** Ask for a box at a branch: the GM in charge makes its vault. pay: "wallet" or "account". */
  async rent(actor, { size, pay, bank, branch }) {
    if (!itemPiles()) throw new Error("Safe deposit boxes need the Item Piles module.");
    const msg = { action: "bank", op: "rent", userId: game.user.id, actorUuid: actor.uuid, size, pay, bank, branch };
    if (isPrimaryGM()) return this.#rent(msg).then((t) => t && ui.notifications.info(t));
    if (!game.users.activeGM) throw new Error("A GM has to be here to rent a box.");
    game.socket.emit(SOCKET, msg);
    ui.notifications.info("The clerk goes to fetch a box.");
  }

  async #rent({ actorUuid, size, pay, bank, branch }) {
    const api = itemPiles();
    if (!api) throw new Error("Safe deposit boxes need the Item Piles module.");
    const actor = await fromUuid(actorUuid), acc = accountOf(actor), s = BOX_SIZES[size];
    if (!actor || !acc || !s) throw new Error("No account to rent a box with.");
    const now = game.time.worldTime, number = boxNumber(), where = branch?.name ?? "";
    // The first month is paid now.
    let next = acc, wallet = null;
    if (pay === "account") next = debit(acc, s.fee, { time: now, what: `Box ${number}, first month`, where });
    else {
      wallet = actor.system?.currency ? takeFromWallet(actor.system.currency, s.fee, this.rate) : null;
      if (!wallet) throw new Error(`The first month's rent, ${dollars(s.fee)}, is more than the wallet holds.`);
    }
    const name = `Box ${number}, ${bank} (${actor.name})`;
    const made = await api.createItemPile({
      createActor: true, actor: name, sceneId: game.user.viewedScene ?? canvas.scene?.id ?? "",
      tokenOverrides: { actorLink: true, name, texture: { src: BOX_ICON } },
      actorOverrides: { img: BOX_ICON },
      folders: [BOX_FOLDER],
      itemPileFlags: {
        enabled: true, type: "vault", cols: s.cols, rows: s.rows, canInspectItems: true,
        description: `<p>Safe deposit box ${number} at ${bank}, ${where}. Rented by ${actor.name}.</p>`,
        // Only the renter opens it: their owners, as that character.
        restrictVaultAccess: true, logVaultActions: true, vaultLogType: "user_actor",
        vaultAccess: [{ uuid: actor.uuid, view: true, organize: true, items: { withdraw: true, deposit: true }, currencies: { withdraw: true, deposit: true } }]
      }
    });
    if (!made?.actorUuid) throw new Error("Item Piles did not make the box.");
    // Its name and picture, whichever way this Item Piles version reads the options.
    const vault = await fromUuid(made.actorUuid);
    if (vault && (vault.name !== name || vault.img !== BOX_ICON)) await vault.update({ name, img: BOX_ICON });
    const box =makeBox({ id: foundry.utils.randomID(), number, size, fee: s.fee, vault: made.actorUuid, bank, branch, opened: now, next: now + MONTH });
    await this.#save(actor, { ...next, boxes: [...next.boxes, box] }, wallet);
    return `${actor.name} rents box ${number} at ${bank}, ${dollars(s.fee)} a month (with the bills).`;
  }

  /** Open a box: its vault, for this character. Only at its branch (the window checks). */
  async openBox(actor, box) {
    const api = itemPiles();
    if (!api) throw new Error("Safe deposit boxes need the Item Piles module.");
    const vault = await fromUuid(box.vault);
    if (!vault) throw new Error("The box's vault is gone (its actor was deleted).");
    try {
      return await api.renderItemPileInterface(vault, { inspectingTarget: actor });
    } catch (err) {
      // Not allowed to open it here: the GM in charge opens it on this player's screen.
      console.warn(`${ID} | opening a box`, err);
      if (!game.users.activeGM) throw new Error("A GM has to be here to open the box.");
      game.socket.emit(SOCKET, { action: "bank", op: "show", userId: game.user.id, actorUuid: actor.uuid, vault: box.vault });
    }
  }

  async #show({ userId, actorUuid, vault }) {
    const v = await fromUuid(vault), actor = await fromUuid(actorUuid);
    if (!v || !actor || !accountOf(actor)?.boxes.some((b) => b.vault === vault)) return null;
    await itemPiles()?.renderItemPileInterface(v, { userIds: [userId], inspectingTarget: actor });
    return null;
  }

  /** Give a box up: it must be empty. The GM in charge takes its vault away. */
  async giveUp(actor, box) {
    const msg = { action: "bank", op: "giveUp", userId: game.user.id, actorUuid: actor.uuid, boxId: box.id };
    if (isPrimaryGM()) return this.#giveUp(msg).then((t) => t && ui.notifications.info(t));
    if (!game.users.activeGM) throw new Error("A GM has to be here to give up a box.");
    game.socket.emit(SOCKET, msg);
  }

  async #giveUp({ actorUuid, boxId }) {
    const actor = await fromUuid(actorUuid), acc = accountOf(actor), box = acc?.boxes.find((b) => b.id === boxId);
    if (!box) return null;
    const vault = box.vault ? await fromUuid(box.vault) : null;
    if (vault && (vault.items.size || walletValue(vault.system?.currency) > 0)) throw new Error(`Box ${box.number} is not empty: take everything out first.`);
    if (vault) await vault.delete();
    await this.#save(actor, { ...acc, boxes: acc.boxes.filter((b) => b.id !== boxId) });
    return `${actor.name} gives up box ${box.number} at ${box.bank}.`;
  }
}
