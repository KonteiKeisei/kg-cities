// Currency expressions for Item Piles: a currency's abbreviation may do sums on its amount, so
// coins read as dollars. "{#}" is the amount as it is; "{#/10}" is the amount divided by 10;
// anything after the # is put after the amount and worked out ("${#/1000}", "{#*5}¢",
// "${#/100).toFixed(2}"). With dnd5e coins at 1000 copper a dollar, gold reads "${#/10}".
//
// Item Piles writes every price by `abbreviation.replace("{#}", amount)` and checks for the
// token with `abbreviation.includes("{#}")` (3.3.4: getPriceArray, getStringFromCurrencies,
// getPriceFromString, getPriceData, getPaymentData, the currency labels). Its functions are
// private to its bundle, so this teaches those two string calls the expression instead, and
// only for a string that holds an expression token while the call asks for "{#}" exactly:
// every other string, and every other use of replace and includes, is untouched.
//
// It replaces the hand edit once made to Item Piles' dist/item-piles.js, which an update wipes.
// That edit uses its own helpers, never these calls, so the two do not clash.

export const TOKEN = "{#}";
const EXPR = /\{#([^}]*)\}/;
const EXPR_ALL = /\{#[^}]*\}/g;

const compiled = new Map();
/** The sum an expression stands for, on an amount: "/10" on 799 is 79.9. Falls back to the amount. */
export function evaluate(expr, amount) {
  const x = Number(amount);
  if (!expr) return amount;
  if (!Number.isFinite(x)) return amount;
  let fn = compiled.get(expr);
  if (fn === undefined) {
    // The GM writes these in Item Piles' world settings, as trusted as a macro.
    try { fn = new Function("x", `"use strict"; return (x${expr});`); } catch { fn = null; }
    compiled.set(expr, fn);
  }
  if (!fn) return amount;
  try {
    const v = fn(x);
    // Floating point dust (0.1 + 0.2) off a plain number; a string (toFixed) as it is.
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : v;
  } catch { return amount; }
}

/** Does this string carry an expression token ("{#/10}"), not the plain "{#}"? */
export const hasExpression = (s, includes = String.prototype.includes) => !includes.call(s, TOKEN) && EXPR.test(s);

/** The abbreviation with its amount put in: worked out, or the token taken out (""). */
export function fill(abbreviation, amount, replace = String.prototype.replace) {
  if (amount === "") return replace.call(abbreviation, EXPR_ALL, "");
  return replace.call(abbreviation, EXPR, (_m, expr) => String(evaluate(expr, amount)));
}

let installed = false;
/** Teach replace("{#}", amount) and includes("{#}") the expression token. Once; returns whether it did. */
export function installCurrencyExpressions() {
  if (installed) return false;
  installed = true;
  const replace = String.prototype.replace, includes = String.prototype.includes;
  // eslint-disable-next-line no-extend-native
  String.prototype.replace = function kgcReplace(pattern, replacement) {
    if (pattern === TOKEN && typeof replacement !== "function") {
      const s = `${this}`;
      if (hasExpression(s, includes)) return fill(s, replacement, replace);
    }
    return replace.apply(this, arguments);
  };
  // eslint-disable-next-line no-extend-native
  String.prototype.includes = function kgcIncludes(search) {
    if (search === TOKEN && hasExpression(`${this}`, includes)) return true;
    return includes.apply(this, arguments);
  };
  return true;
}
