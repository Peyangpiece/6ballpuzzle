#!/usr/bin/env node
// Writes the trophy rules into firebase/database.rules.json from the numbers in
// public/app-trophies-v1.js (HexTrophies.delta and HexTrophies.ITEMS):
//   users/{uid}/trophies   moves only with a new finished match (lastMatch), by
//                          HexTrophies.delta for lastResult; unranked: no change
//   users/{uid}/best       the highest trophy count reached
//   users/{uid}/equip/*    an item of that slot unlocked at best, or owned
//   users/{uid}/points     +30..100 once per day (+100 on every 7th day of a
//                          streak) with dailyDay set to today (JST); -price of
//                          the item named by lastPurchase, owned in the same
//                          write; otherwise unchanged
//   users/{uid}/owned/*    a shop item, bought in that write
//   daily/{day}/{uid}      today's best score for the daily ranking
//   leaderboard/{uid}      trophies and icon equal the profile's
//   matches players, rooms, lobby: trophies and icon equal the profile's
// Run after changing those numbers:  node tools/trophy-rules.js
// (tests/trophies.js fails while the rules file is out of date).
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

function loadTrophies() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "app-trophies-v1.js"), "utf8") + "\nthis.HexTrophies=HexTrophies;", ctx);
  return ctx.HexTrophies;
}

// The delta of HexTrophies, as bands: [upper bound (exclusive), win, loss].
const BANDS = [[300, 10, 0], [1000, 8, -4], [Infinity, 6, -6]];
// The daily reward (HexDaily in public/app-daily-v1.js): 30..100 points, and
// a bonus on every 7th day of a streak.
const DAILY = { min: 30, max: 100, streakEvery: 7, streakBonus: 100, maxScore: 1000000 };
// Today's day number in Japan time, as the rules compute it from `now`.
const TODAY = "((now + 32400000 - (now + 32400000) % 86400000) / 86400000)";

function rules(T) {
  for (const t of [0, 1, 299, 300, 301, 999, 1000, 1001, 5000]) {
    const band = BANDS.find(b => t < b[0]);
    if (T.delta(t, true) !== band[1] || T.delta(t, false) !== band[2]) throw new Error("HexTrophies.delta and BANDS differ at " + t);
  }
  const old = "(data.exists() ? data.val() : 0)";
  const lm = "newData.parent().child('lastMatch').val()";
  const step = (res) => BANDS.reduceRight((acc, b) => b[0] === Infinity ? String(res === "win" ? b[1] : b[2]) : `(${old} < ${b[0]} ? ${res === "win" ? b[1] : b[2]} : ${acc})`, "");
  const trophies = `newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000 && (${lm} == data.parent().child('lastMatch').val() ? newData.val() == ${old} : (root.child('config/ratingAuthority').val() != 'server' && (root.child('matches/' + ${lm} + '/meta/ranked').val() == false ? newData.val() == ${old} : newData.val() == ${old} + (newData.parent().child('lastResult').val() == 'win' ? ${step("win")} : ${step("loss")}))))`;
  const newT = "(newData.parent().child('trophies').exists() ? newData.parent().child('trophies').val() : 0)";
  const best = `newData.isNumber() && newData.val() == (${newT} > ${old} ? ${newT} : ${old})`;
  const equip = { ".validate": "newData.hasChildren()", "$other": { ".validate": false } };
  const bestOf = "(newData.parent().parent().child('best').exists() ? newData.parent().parent().child('best').val() : 0)";
  for (const slot of Object.keys(T.DEFAULTS)) {
    const items = T.ITEMS.filter(i => i.slot === slot);
    equip[slot] = { ".validate": "newData.isString() && (" + items.map(i => i.price > 0 ? `(newData.val() == '${i.id}' && newData.parent().parent().child('owned/${T.ownKey(i)}').val() == true)` : i.min > 0 ? `(newData.val() == '${i.id}' && ${bestOf} >= ${i.min})` : `newData.val() == '${i.id}'`).join(" || ") + ")" };
  }
  // Prices of the shop items, by owned key; anything else costs an impossible amount.
  const price = (keyExpr) => T.SHOP.reduceRight((acc, i) => `(${keyExpr} == '${T.ownKey(i)}' ? ${i.price} : ${acc})`, "-1");
  const sib = (k) => `newData.parent().child('${k}')`, oldSib = (k) => `data.parent().child('${k}')`;
  const oldPts = "(data.exists() ? data.val() : 0)";
  const claimed = `${sib("dailyDay")}.val() != ${oldSib("dailyDay")}.val()`;
  const bought = `${sib("lastPurchase")}.val() != ${oldSib("lastPurchase")}.val()`;
  const lp = `${sib("lastPurchase")}.val()`;
  const points = `newData.isNumber() && newData.val() >= 0 && (${claimed} ? (newData.val() - ${oldPts} >= ${DAILY.min} && newData.val() - ${oldPts} <= ${DAILY.max} + (${sib("streak")}.val() % ${DAILY.streakEvery} == 0 ? ${DAILY.streakBonus} : 0)) : (${bought} ? (newData.val() == ${oldPts} - ${price(lp)} && !data.parent().child('owned/' + ${lp}).exists() && newData.parent().child('owned/' + ${lp}).val() == true) : newData.val() == ${oldPts}))`;
  const dailyDay = `newData.isNumber() && newData.val() == ${TODAY}`;
  const oldStreak = "(data.exists() ? data.val() : 0)";
  const streak = `newData.isNumber() && (${claimed} ? newData.val() == (${oldSib("dailyDay")}.val() == ${TODAY} - 1 ? ${oldStreak} + 1 : 1) : newData.val() == ${oldStreak})`;
  const lastPurchase = `newData.isString() && newData.val() != data.val() && ${price("newData.val()")} > 0`;
  // The points must go down by the price in the same write: without this, a
  // write of owned/* alone (points untouched, so unchecked) would be free.
  const ptsAfter = "(newData.parent().parent().child('points').exists() ? newData.parent().parent().child('points').val() : 0)";
  const ptsBefore = "(data.parent().parent().child('points').exists() ? data.parent().parent().child('points').val() : 0)";
  const owned = { "$key": { ".validate": `newData.val() == true && !data.exists() && newData.parent().parent().child('lastPurchase').val() == $key && ${price("$key")} > 0 && ${ptsAfter} == ${ptsBefore} - ${price("$key")}` } };
  const profileTrophies = (uidExpr) => `(root.child('users/' + ${uidExpr} + '/trophies').exists() ? root.child('users/' + ${uidExpr} + '/trophies').val() : 0)`;
  const profileIcon = (uidExpr) => `(root.child('users/' + ${uidExpr} + '/equip/icon').exists() ? root.child('users/' + ${uidExpr} + '/equip/icon').val() : 'initial')`;
  return { trophies, best, equip, profileTrophies, profileIcon, points, dailyDay, streak, lastPurchase, owned };
}

function apply(json, T) {
  const r = rules(T), R = json.rules;
  const user = R.users.$uid;
  user.trophies = { ".validate": r.trophies };
  user.best = { ".validate": r.best };
  user.equip = r.equip;
  user.points = { ".validate": r.points };
  user.dailyDay = { ".validate": r.dailyDay };
  user.streak = { ".validate": r.streak };
  user.lastPurchase = { ".validate": r.lastPurchase };
  user.owned = r.owned;
  // A claimed day cannot be removed (it would allow a second claim).
  const base = "newData.hasChildren(['name', 'rating', 'wins', 'losses'])";
  if (!user[".validate"].startsWith(base)) throw new Error("users/$uid .validate changed: " + user[".validate"]);
  user[".validate"] = base + " && (!data.child('dailyDay').exists() || newData.child('dailyDay').exists())";
  R.daily = {
    "$day": {
      ".read": "auth != null",
      ".indexOn": ["score"],
      "$uid": {
        ".write": "auth != null && auth.uid == $uid",
        ".validate": `$day == ${TODAY} + '' && newData.hasChildren(['name', 'score'])`,
        "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 24" },
        "score": { ".validate": `newData.isNumber() && newData.val() >= 0 && newData.val() <= ${DAILY.maxScore} && (!data.exists() || newData.val() >= data.val())` },
        "icon": { ".validate": "newData.isString() && newData.val() == " + r.profileIcon("$uid") },
        "$other": { ".validate": false }
      }
    }
  };
  const lb = R.leaderboard;
  lb[".indexOn"] = ["rating", "trophies"];
  lb.$uid.trophies = { ".validate": "newData.isNumber() && newData.val() == " + r.profileTrophies("$uid") };
  lb.$uid.icon = { ".validate": "newData.isString() && newData.val() == " + r.profileIcon("$uid") };
  const player = R.matches.$mid.players.$i;
  player.trophies = { ".validate": "newData.isNumber() && newData.val() == " + r.profileTrophies("newData.parent().child('uid').val()") };
  player.icon = { ".validate": "newData.isString() && newData.val() == " + r.profileIcon("newData.parent().child('uid').val()") };
  const room = R.rooms.$code;
  room.hostTrophies = { ".validate": "newData.isNumber() && newData.val() == " + r.profileTrophies("newData.parent().child('hostUid').val()") };
  room.hostIcon = { ".validate": "newData.isString() && newData.val() == " + r.profileIcon("newData.parent().child('hostUid').val()") };
  const waiting = R.lobby.$band.waiting;
  waiting.trophies = { ".validate": "newData.isNumber() && newData.val() == " + r.profileTrophies("newData.parent().child('uid').val()") };
  waiting.icon = { ".validate": "newData.isString() && newData.val() == " + r.profileIcon("newData.parent().child('uid').val()") };
  return json;
}

const FILE = path.join(__dirname, "..", "firebase", "database.rules.json");
function expected() { return JSON.stringify(apply(JSON.parse(fs.readFileSync(FILE, "utf8")), loadTrophies()), null, 2) + "\n"; }

if (require.main === module) {
  fs.writeFileSync(FILE, expected());
  console.log("wrote trophy rules to firebase/database.rules.json");
}
module.exports = { expected, FILE, BANDS, DAILY, loadTrophies };
