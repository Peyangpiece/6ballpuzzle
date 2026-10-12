// Syntax-check every runtime script the same way CI used to (node --check).
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const pub = path.join(__dirname, "..", "public");
const files = fs.readdirSync(pub).filter(f => /^(app-.*|controls-.*)\.js$/.test(f));
let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", path.join(pub, f)], { stdio: "pipe" }); }
  catch (e) { bad++; console.error("SYNTAX ERROR " + f + "\n" + e.stderr); }
}
console.log(`syntax ok: ${files.length - bad}/${files.length}`);
process.exit(bad ? 1 : 0);
