// No layer may leave a superseded definition behind: when a layer replaces a
// global outright, the old definition must be deleted (tools/dead-overrides.js).
const assert = require("assert");
const { findDeadOverrides } = require("../tools/dead-overrides.js");
const dead = findDeadOverrides();
assert.deepStrictEqual(dead.map(d => `${d.name} at ${d.f}:${d.line}, replaced by ${d.by}:${d.byLine}`), [], "superseded definitions must be deleted");
console.log("no dead overrides PASS");
