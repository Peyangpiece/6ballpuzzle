#!/usr/bin/env node
// Static defect scan of the whole runtime in its real shape: every script in
// production load order concatenated into one shared global scope, then ESLint
// `no-undef` and bug-pattern rules.  The layered runtime reassigns function
// declarations on purpose (no-func-assign is off) and redeclares nothing that
// would already break in the browser.
const fs = require("fs"), path = require("path"), os = require("os");
const { ESLint } = require("eslint");
const globals = require("globals");
const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const files = JSON.parse(/var files=(\[[\s\S]*?\]);/.exec(html)[1]);
const starts = []; let concat = "";
for (const f of files) {
  starts.push({ file: f, line: concat.split("\n").length + 1 });
  concat += `\n;/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(ROOT, "public", f), "utf8") + "\n;\n";
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "6ball-lint-"));
const target = path.join(tmp, "runtime.concat.js");
fs.writeFileSync(target, concat);
(async () => {
  const eslint = new ESLint({
    cwd: tmp,
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.js"],
      languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser, React: "readonly", ReactDOM: "readonly" } },
      rules: {
        "no-undef": "error", "no-dupe-keys": "error", "no-dupe-args": "error", "no-dupe-else-if": "error",
        "no-unreachable": "error", "no-self-assign": "error", "use-isnan": "error", "valid-typeof": "error",
        "no-unsafe-negation": "error", "no-import-assign": "error", "no-compare-neg-zero": "error",
        "no-func-assign": "off", "no-redeclare": "off", "no-unused-vars": "off", "no-cond-assign": "off", "no-constant-condition": "off", "no-empty": "off"
      }
    }]
  });
  const [result] = await eslint.lintFiles([target]);
  fs.rmSync(tmp, { recursive: true, force: true });
  const toFile = line => { let cur = starts[0]; for (const s of starts) if (s.line <= line) cur = s; return `${cur.file}:${line - cur.line}`; };
  for (const m of result.messages) console.log(`${toFile(m.line)}  ${m.ruleId}  ${m.message}`);
  console.log(`lint: ${result.messages.length} problem(s) across ${files.length} scripts`);
  process.exit(result.errorCount ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
