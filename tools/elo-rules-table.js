#!/usr/bin/env node
// Generates the exact Elo delta tables used inside firebase/database.rules.json.
//
// The Realtime Database rules language has no Math.pow, so the client formula
//   eloDelta(mine, foe, win) = Math.round(32 * ((win ? 1 : 0) - 1 / (1 + 10 ** ((foe - mine) / 400))))
// is turned into a piecewise-constant table over d = foe - mine (integers in
// [-4000, 4000], the rating range enforced by the rules).  Each integer delta
// corresponds to one contiguous interval of d, so the table is exact.
//
//   node tools/elo-rules-table.js          # prints the two expressions
//   node tools/elo-rules-table.js --write  # rewrites the ELO_WIN / ELO_LOSS
//                                          # expressions inside the rules file
"use strict";
const fs = require("fs"), path = require("path");

const K = 32, MIN_D = -4000, MAX_D = 4000;
const eloDelta = (mine, foe, win) => Math.round(K * ((win ? 1 : 0) - 1 / (1 + Math.pow(10, (foe - mine) / 400))));

/** Breakpoints: [{from, value}] with `from` ascending, value constant for d >= from until the next entry. */
function intervals(win) {
  const out = [];
  let prev = null;
  for (let d = MIN_D; d <= MAX_D; d++) {
    const v = eloDelta(0, d, win) || 0; // normalise -0
    if (v !== prev) { out.push({ from: d, value: v }); prev = v; }
  }
  return out;
}

/** Rules expression for the delta given a rules sub-expression `dExpr` evaluating to foe - mine. */
function expression(win, dExpr) {
  const iv = intervals(win);
  // Highest `from` first so that the chain `d >= from ? value : ...` is correct.
  const desc = iv.slice().reverse();
  let expr = String(desc[desc.length - 1].value);
  for (const { from, value } of desc.slice(0, -1)) expr = `(${dExpr} >= ${from} ? ${value} : ${expr})`;
  return expr;
}

// mine = the rating currently stored for the user (what the client also uses);
// foe  = the opponent rating recorded in the match at creation, which the
//        rules verify against users/<foe>/rating at creation time.
const D_EXPR = "(root.child('matches/' + newData.parent().child('lastMatch').val() + '/players/' + (root.child('matches/' + newData.parent().child('lastMatch').val() + '/players/0/uid').val() == $uid ? '1' : '0') + '/rating').val() - data.val())";

/**
 * Membership form: given the delta the client wrote (newData - data) and
 * d = foe - mine, the delta is valid only if d lies in that delta's interval.
 * The ternary chain tests cheap integer equalities first and evaluates the
 * root.child lookups in D_EXPR at most twice, instead of once per interval.
 */
function membership(win, deltaExpr, dExpr) {
  const iv = intervals(win);
  let expr = "false";
  for (let i = iv.length - 1; i >= 0; i--) {
    const lo = iv[i].from, hi = i + 1 < iv.length ? iv[i + 1].from : null;
    const range = hi === null ? `${dExpr} >= ${lo}` : (i === 0 ? `${dExpr} < ${hi}` : `(${dExpr} >= ${lo} && ${dExpr} < ${hi})`);
    expr = `(${deltaExpr} == ${iv[i].value} ? ${range} : ${expr})`;
  }
  return expr;
}

/** The complete users/$uid/rating .validate rule (client-settled mode + server mode lock). */
function ratingValidate() {
  const delta = "(newData.val() - data.val())";
  const inWin = membership(true, delta, D_EXPR), inLoss = membership(false, delta, D_EXPR);
  // A loss that would take the rating below 0 is clamped to 0 by the client
  // (Math.max(0, ...)); accept 0 only when the true delta reaches that far.
  const clampLoss = `(newData.parent().child('lastResult').val() == 'loss' && data.val() + ${expression(false, D_EXPR)} <= 0)`;
  const exact = `(newData.val() == 0 && data.val() + (-32) < 0 ? (${clampLoss} || ${inLoss}) : (newData.parent().child('lastResult').val() == 'win' ? ${inWin} : ${inLoss}))`;
  const unranked = "root.child('matches/' + newData.parent().child('lastMatch').val() + '/meta/ranked').val() == false";
  const sameMatch = "newData.parent().child('lastMatch').val() == data.parent().child('lastMatch').val()";
  return "newData.isNumber() && newData.val() >= 0 && newData.val() <= 4000 && (" +
    "!data.exists() ? newData.val() == 1000 : (" +
    `${sameMatch} ? newData.val() == data.val() : (` +
    "root.child('config/ratingAuthority').val() != 'server' && " +
    `(${unranked} ? newData.val() == data.val() : ${exact}))))`;
}

function build() {
  return { win: expression(true, D_EXPR), loss: expression(false, D_EXPR), ratingValidate: ratingValidate(), intervalsWin: intervals(true), intervalsLoss: intervals(false) };
}

module.exports = { K, eloDelta, intervals, expression, membership, build, ratingValidate, D_EXPR };

if (require.main === module) {
  const t = build();
  if (process.argv.includes("--write")) {
    const p = path.join(__dirname, "..", "firebase", "database.rules.json");
    const rules = JSON.parse(fs.readFileSync(p, "utf8"));
    rules.rules.users.$uid.rating[".validate"] = t.ratingValidate;
    fs.writeFileSync(p, JSON.stringify(rules, null, 2) + "\n");
    console.log("rules updated: users/$uid/rating .validate is " + t.ratingValidate.length + " chars");
  } else {
    console.log("win intervals:", t.intervalsWin.length, "loss intervals:", t.intervalsLoss.length);
    console.log("rating validate chars:", t.ratingValidate.length);
  }
}
