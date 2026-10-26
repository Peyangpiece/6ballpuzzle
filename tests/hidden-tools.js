// ⌘+D calculator logic (public/app-hidden-tools-v1.js): immediate execution
// like a pocket calculator, decimals, sign, percent, backspace, division by
// zero, and rounding of binary floating point (0.1 + 0.2 = 0.3).
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const noop = () => {};
const ctx = { document: { createElement: noop, addEventListener: noop, body: { appendChild: noop } }, addEventListener: noop };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "app-hidden-tools-v1.js"), "utf8"), ctx);
function run(keys) {
  const c = ctx.__sixBallCreateCalculator();
  for (const k of keys) {
    if (/^[0-9.]$/.test(k)) c.digit(k);
    else if (["+", "−", "×", "÷"].includes(k)) c.op(k);
    else ({ "=": () => c.equals(), C: () => c.clear(), "⌫": () => c.back(), "±": () => c.negate(), "%": () => c.percent() })[k]();
  }
  return c.display;
}
assert.strictEqual(run(["1", "2", "+", "3", "×", "2", "="]), "30", "left to right");
assert.strictEqual(run(["0", ".", "1", "+", "0", ".", "2", "="]), "0.3", "0.1 + 0.2");
assert.strictEqual(run(["7", "÷", "0", "="]), "エラー", "division by zero");
assert.strictEqual(run(["7", "÷", "0", "=", "5"]), "5", "a digit after an error starts over");
assert.strictEqual(run(["1", "2", "3", "⌫"]), "12");
assert.strictEqual(run(["5", "±", "−", "3", "="]), "-8");
assert.strictEqual(run(["5", "0", "%"]), "0.5");
assert.strictEqual(run(["1", ".", ".", "5"]), "1.5", "one decimal point");
assert.strictEqual(run(["9", "+", "="]), "18", "= repeats the shown value as the second operand");
assert.strictEqual(run(["1", "+", "2", "C"]), "0");
assert.strictEqual(ctx.__sixBallHiddenToolsVersion, "hidden-tools-v1");
const index = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
assert(index.includes('"app-hidden-tools-v1.js"'), "the layer is loaded");
console.log("hidden tools PASS");
