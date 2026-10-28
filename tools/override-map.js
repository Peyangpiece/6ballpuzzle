#!/usr/bin/env node
// Lists every global that more than one layer defines, in load order, with the
// kind of each definition: `base` (first definition), `wrap` (captures the
// previous value and calls it), `replace` (captures nothing it calls).
// Usage: node tools/override-map.js [name]   (prints all chains, or one)
const fs = require("fs"), path = require("path");
const acorn = require("acorn"), scope = require("eslint-scope"), estraverse = require("estraverse");
const PUB = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
const files = JSON.parse(/var files=(\[[\s\S]*?\]);/.exec(html)[1].replace(/,\s*\]$/, "]"));
const chains = new Map();
for (const f of files) {
  const src = fs.readFileSync(path.join(PUB, f), "utf8");
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: "script", ranges: true, locations: true, allowReturnOutsideFunction: true });
  const sm = scope.analyze(ast, { ecmaVersion: 2022 });
  const parent = new Map(); estraverse.traverse(ast, { enter(n, p) { parent.set(n, p); } });
  // Local variables that hold a captured global: v -> global name.
  const captured = new Map();
  for (const sc of sm.scopes) for (const v of sc.variables) for (const d of v.defs) {
    if (d.node.type !== "VariableDeclarator" || !d.node.init) continue;
    let init = d.node.init;
    if (init.type === "ConditionalExpression") init = init.consequent;
    if (init.type === "Identifier" && sc.type !== "global") captured.set(v, init.name);
  }
  const add = (name, def) => (chains.get(name) || chains.set(name, []).get(name)).push(def);
  for (const n of ast.body) if (n.type === "FunctionDeclaration") add(n.id.name, { f, line: n.loc.start.line, lines: n.loc.end.line - n.loc.start.line + 1, kind: "base" });
  const refs = [...sm.globalScope.through];
  for (const r of refs) {
    if (!r.isWrite()) continue;
    const id = r.identifier, p = parent.get(id);
    const val = p && p.type === "AssignmentExpression" && p.left === id ? p.right : null;
    if (!val || !/Function/.test(val.type)) continue;
    // Does the new value call a captured copy of this same global?
    let wraps = false;
    for (const [v, g] of captured) if (g === id.name && v.references.some(x => x.isRead() && x.identifier.start > val.start && x.identifier.end < val.end)) wraps = true;
    add(id.name, { f, line: id.loc.start.line, lines: val.loc.end.line - val.loc.start.line + 1, kind: wraps ? "wrap" : "replace" });
  }
}
const only = process.argv[2];
const rows = [...chains].filter(([n, c]) => c.length > 1 && (!only || n === only)).sort((a, b) => b[1].length - a[1].length);
for (const [n, c] of rows) console.log(`${n} (${c.length}): ` + c.map(d => `${d.kind}@${d.f}:${d.line}[${d.lines}]`).join(" -> "));
if (!only) console.log(`${rows.length} globals with more than one definition`);
