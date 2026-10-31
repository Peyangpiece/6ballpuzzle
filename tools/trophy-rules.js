#!/usr/bin/env node
// Writes the trophy rules into firebase/database.rules.json from the numbers in
// public/app-trophies-v1.js (HexTrophies.delta and HexTrophies.ITEMS):
//   users/{uid}/trophies   moves only with a new finished match (lastMatch), by
//                          HexTrophies.delta for lastResult; unranked: no change
//   users/{uid}/best       the highest trophy count reached
//   users/{uid}/equip/*    an item of that slot unlocked at best
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
    equip[slot] = { ".validate": "newData.isString() && (" + items.map(i => i.min > 0 ? `(newData.val() == '${i.id}' && ${bestOf} >= ${i.min})` : `newData.val() == '${i.id}'`).join(" || ") + ")" };
  }
  const profileTrophies = (uidExpr) => `(root.child('users/' + ${uidExpr} + '/trophies').exists() ? root.child('users/' + ${uidExpr} + '/trophies').val() : 0)`;
  const profileIcon = (uidExpr) => `(root.child('users/' + ${uidExpr} + '/equip/icon').exists() ? root.child('users/' + ${uidExpr} + '/equip/icon').val() : 'initial')`;
  return { trophies, best, equip, profileTrophies, profileIcon };
}

function apply(json, T) {
  const r = rules(T), R = json.rules;
  const user = R.users.$uid;
  user.trophies = { ".validate": r.trophies };
  user.best = { ".validate": r.best };
  user.equip = r.equip;
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
module.exports = { expected, FILE, BANDS, loadTrophies };
