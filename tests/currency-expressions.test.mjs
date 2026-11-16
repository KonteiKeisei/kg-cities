// Item Piles 3.3.4's own calls (dist/item-piles.js), run on currency abbreviations with sums in them.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, installCurrencyExpressions } from "../scripts/currency-expressions.mjs";

installCurrencyExpressions();

test("a price is written with the sum worked out (getPriceArray, getPriceData, getPaymentData)", () => {
  assert.equal("${#/10}".replace("{#}", 799), "$79.9");
  assert.equal("${#/1000}".replace("{#}", 3490), "$3.49");
  assert.equal("${#/100).toFixed(2}".replace("{#}", 5), "$0.05");
  assert.equal("{#*10}¢".replace("{#}", 7), "70¢");
  assert.equal("${#/10}".replace("{#}", 0), "$0");
});

test("the token is found and taken out (getCurrenciesAbbreviations, getStringFromCurrencies, getPriceFromString)", () => {
  const abbr = "${#/10}";
  assert.equal(abbr?.includes("{#}"), true);
  assert.equal(abbr?.replace("{#}", ""), "$");
  assert.equal(abbr.toLowerCase().replace("{#}", "").trim(), "$");
  assert.equal(abbr?.replace("{#}", "")?.toLowerCase() === "${#/10}"?.replace("{#}", "")?.toLowerCase(), true);
  // getStringFromCurrencies: with the token it is filled in, not "cost + abbreviation".
  const cost = 12;
  assert.equal(abbr.includes("{#}") ? abbr.replace("{#}", cost) : cost + abbr, "$1.2");
});

test("plain abbreviations and every other string are untouched", () => {
  assert.equal("{#}GP".replace("{#}", 5), "5GP");
  assert.equal("{#}GP".includes("{#}"), true);
  assert.equal("{#} Gold Coin".replace("{#}", ""), " Gold Coin");
  assert.equal("GP".includes("{#}"), false);
  assert.equal("a-b-c".replace("-", "+"), "a+b-c");
  assert.equal("a-b-c".replace(/-/g, "+"), "a+b+c");
  assert.equal("x1".replace(/\d/, (d) => d * 2), "x2");
  assert.equal("{#/10}".replace("{", "("), "(#/10}");
  assert.equal("hello".includes("ell"), true);
  // A merchant column's formatting with a word, not a number: put in as it is.
  assert.equal("{#!}".replace("{#}", "Common"), "Common");
});

test("a broken sum falls back to the amount", () => {
  assert.equal(evaluate(")(", 5), 5);
  assert.equal("${#/zz}".replace("{#}", 5), "$5");
  assert.equal(evaluate("", 5), 5);
});

test("the hand-patched Item Piles' own helpers still work alongside (they use a regex)", () => {
  const _ipStripCoinToken = (abbr) => abbr.replace(/\{#[^}]*\}/g, "");
  const _ipEvalCoin = (abbr, cost) => abbr.replace(/\{#([^}]*)\}/, (_m, expr) => (expr ? Function(`"use strict"; const x=(${+cost}); return (x${expr});`)() : cost));
  assert.equal(_ipStripCoinToken("${#/10}"), "$");
  assert.equal(_ipEvalCoin("${#/10}", 799), "$79.9");
});
