// Money in dnd5e coins, as KG Transit counts it (its fare.mjs): values in copper, pp 1000, gp 100,
// ep 50, sp 10, cp 1. A period dollar is worth a setting's copper (KG Transit's when it is
// installed, so cab and train fares agree). Pure: no Foundry.

export const COINS = [
  { key: "pp", value: 1000, label: "pp" },
  { key: "gp", value: 100, label: "gp" },
  { key: "ep", value: 50, label: "ep" },
  { key: "sp", value: 10, label: "sp" },
  { key: "cp", value: 1, label: "cp" }
];

export function walletValue(currency = {}) {
  return COINS.reduce((sum, coin) => sum + Math.max(0, Math.floor(Number(currency[coin.key]) || 0)) * coin.value, 0);
}

/** "1 gp 5 sp", "free" for nothing. Stated without electrum. */
export function formatMoney(copper) {
  if (!copper) return "free";
  const parts = [];
  let left = copper;
  for (const coin of COINS.filter((c) => c.key !== "ep")) {
    const n = Math.floor(left / coin.value);
    if (n) parts.push(`${n} ${coin.label}`);
    left -= n * coin.value;
  }
  return parts.join(" ");
}

/** "$7.22". */
export const formatDollars = (d) => `$${(Math.round(d * 100) / 100).toFixed(2)}`;

function makeChange(copper) {
  const coins = {};
  let left = copper;
  for (const coin of COINS) { coins[coin.key] = Math.floor(left / coin.value); left -= coins[coin.key] * coin.value; }
  return coins;
}

/**
 * Pay `price` (copper) from a wallet: exactly when the coins allow, else overpaying as little as
 * possible and taking change; among equal amounts, the fewest coins. { paid, change, after } or
 * null when the wallet is short.
 */
export function pay(currency, price) {
  const have = Object.fromEntries(COINS.map((c) => [c.key, Math.max(0, Math.floor(Number(currency?.[c.key]) || 0))]));
  if (price <= 0) return { paid: makeChange(0), change: makeChange(0), after: have };
  if (walletValue(have) < price) return null;
  const limit = price + COINS[0].value - 1;
  let best = new Array(limit + 1).fill(null);
  best[0] = { count: 0, used: makeChange(0) };
  for (const coin of COINS) {
    const next = best.slice();
    const most = Math.min(have[coin.key], Math.ceil(limit / coin.value));
    for (let amount = 0; amount <= limit; amount++) {
      if (!best[amount]) continue;
      for (let n = 1; n <= most; n++) {
        const total = amount + n * coin.value;
        if (total > limit) break;
        const count = best[amount].count + n;
        if (!next[total] || count < next[total].count) next[total] = { count, used: { ...best[amount].used, [coin.key]: n } };
      }
    }
    best = next;
  }
  let amount = price;
  while (!best[amount]) amount++;
  const paid = best[amount].used, change = makeChange(amount - price);
  return { paid, change, after: Object.fromEntries(COINS.map((c) => [c.key, have[c.key] - paid[c.key] + change[c.key]])) };
}
