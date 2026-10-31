// Server-authoritative rating settlement.
//
// Trigger: the first `matches/{mid}/result/{index}` written by either client.
// Effect:  users/{uid}.rating|wins|losses|trophies|best|lastMatch,
//          leaderboard/{uid}, and
//          matches/{mid}/settlement/{uid} = { delta, rating, wins, losses, trophies, trophyDelta }
//          which the client waits for (Net.awaitServerRating).
// Idempotent: a transaction on matches/{mid}/settlement/state claims the match
// once, so the second result or a retry never double-counts.
//
// Enable on the client/rules side by setting config/ratingAuthority = "server"
// in the database (see docs/OPERATIONS.md).  Until then this function is inert
// because clients still settle ratings themselves and the rules allow it.
"use strict";
const { onValueCreated } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const { computeSettlement } = require("./settle");

admin.initializeApp();

exports.settleMatchResult = onValueCreated(
  { ref: "/matches/{mid}/result/{index}", instance: "ballpuzzle-8cc87-default-rtdb", region: "asia-southeast1" },
  async (event) => {
    const db = admin.database();
    const { mid, index } = event.params;
    const authority = (await db.ref("config/ratingAuthority").get()).val();
    if (authority !== "server") return;

    const claim = await db.ref(`matches/${mid}/settlement/state`).transaction((cur) => (cur ? undefined : "claimed"));
    if (!claim.committed) return;

    const match = (await db.ref(`matches/${mid}`).get()).val();
    const uids = [match && match.players && match.players[0] && match.players[0].uid, match && match.players && match.players[1] && match.players[1].uid];
    const ratings = {}, trophies = {};
    for (const uid of uids) if (typeof uid === "string") {
      ratings[uid] = (await db.ref(`users/${uid}/rating`).get()).val();
      trophies[uid] = (await db.ref(`users/${uid}/trophies`).get()).val();
    }
    const settlement = computeSettlement(match, String(index), ratings, trophies);
    if (!settlement) { await db.ref(`matches/${mid}/settlement/state`).set("invalid"); return; }

    const out = {};
    for (const [uid, u] of Object.entries(settlement.updates)) {
      const res = await db.ref(`users/${uid}`).transaction((profile) => {
        if (!profile) return;
        if (profile.lastMatch === mid) return; // already applied (abort)
        return { ...profile, rating: u.rating, wins: (profile.wins || 0) + (u.win ? 1 : 0), losses: (profile.losses || 0) + (u.win ? 0 : 1), trophies: u.trophies, best: Math.max(profile.best || 0, u.trophies), lastMatch: mid, updatedAt: admin.database.ServerValue.TIMESTAMP };
      });
      const profile = res.snapshot.val() || {};
      out[uid] = { delta: u.delta, rating: profile.rating, wins: profile.wins || 0, losses: profile.losses || 0, trophies: profile.trophies || 0, trophyDelta: u.trophyDelta };
      await db.ref(`leaderboard/${uid}`).set({ name: profile.name || "Player", rating: profile.rating, trophies: profile.trophies || 0, icon: (profile.equip && profile.equip.icon) || "initial" });
    }
    await db.ref(`matches/${mid}/settlement`).update({ ...out, state: "settled", ranked: settlement.ranked, winner: settlement.winnerIndex, at: admin.database.ServerValue.TIMESTAMP });
  }
);
