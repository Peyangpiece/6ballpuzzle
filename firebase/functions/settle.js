// Pure rating settlement.  Shared formula with the client (public/app-14.js):
//   eloDelta(mine, foe, win) = round(32 * (score - 1 / (1 + 10^((foe - mine) / 400))))
// No I/O here so it can be unit-tested in plain node (tests/rating-settlement.js).
"use strict";

const K = 32;
function eloDelta(mine, foe, win) {
  return Math.round(K * ((win ? 1 : 0) - 1 / (1 + Math.pow(10, (foe - mine) / 400))));
}
// Same steps as HexTrophies.delta (public/app-trophies-v1.js); tests/trophies.js
// keeps the two equal.
function trophyDelta(trophies, win) {
  const t = Math.max(0, Math.floor(Number(trophies) || 0));
  if (t < 300) return win ? 10 : 0;
  if (t < 1000) return win ? 8 : -4;
  return win ? 6 : -6;
}

/**
 * @param {object} match     matches/{mid} snapshot value ({meta, players, result})
 * @param {string} reporter  index ("0" | "1") of the player whose result was created
 * @param {object} ratings   { [uid]: currentRating } read from users/* at settlement time
 * @param {object} trophies  { [uid]: currentTrophies } (missing = 0)
 * @returns {null | { winnerIndex, loserIndex, ranked, updates: { [uid]: { delta, rating, win, trophyDelta, trophies } } }}
 */
function computeSettlement(match, reporter, ratings, trophies = {}) {
  if (!match || !match.players || !match.result) return null;
  const p0 = match.players[0], p1 = match.players[1];
  if (!p0 || !p1 || typeof p0.uid !== "string" || typeof p1.uid !== "string" || p0.uid === p1.uid) return null;
  const r = match.result[reporter];
  if (!r || typeof r.win !== "boolean") return null;
  const reporterIndex = reporter === "1" ? 1 : 0;
  const winnerIndex = r.win ? reporterIndex : 1 - reporterIndex;
  const loserIndex = 1 - winnerIndex;
  const ranked = !match.meta || match.meta.ranked !== false;
  const winner = match.players[winnerIndex], loser = match.players[loserIndex];
  const rw = Number.isFinite(ratings[winner.uid]) ? ratings[winner.uid] : 1000;
  const rl = Number.isFinite(ratings[loser.uid]) ? ratings[loser.uid] : 1000;
  const dw = ranked ? eloDelta(rw, rl, true) : 0;
  const dl = ranked ? eloDelta(rl, rw, false) : 0;
  const tw = Math.max(0, Number(trophies[winner.uid]) || 0), tl = Math.max(0, Number(trophies[loser.uid]) || 0);
  const tdw = ranked ? trophyDelta(tw, true) : 0, tdl = ranked ? trophyDelta(tl, false) : 0;
  return {
    winnerIndex, loserIndex, ranked,
    updates: {
      [winner.uid]: { delta: dw, rating: Math.max(0, rw + dw), win: true, trophyDelta: tdw, trophies: tw + tdw },
      [loser.uid]: { delta: dl, rating: Math.max(0, rl + dl), win: false, trophyDelta: tdl, trophies: tl + tdl }
    }
  };
}

module.exports = { K, eloDelta, trophyDelta, computeSettlement };
