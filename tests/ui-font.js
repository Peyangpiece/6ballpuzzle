// The UI typeface (DropBall = Inter + M PLUS 1, tools/subset-fonts.py): both
// subset files ship with their licences, index.html declares and preloads
// them, and Tailwind's font-sans and every canvas font string use the family.
// After changing UI text, run tools/subset-fonts.py again so new characters
// are in the Japanese subset.
const fs = require("fs"), path = require("path"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");
for (const f of ["dropball-latin.woff2", "dropball-jp.woff2", "OFL-Inter.txt", "OFL-MPLUS1.txt"]) {
  assert(fs.existsSync(path.join(PUBLIC, "assets", "fonts", f)), "missing assets/fonts/" + f);
}
const index = read("index.html");
assert((index.match(/@font-face\{font-family:DropBall;/g) || []).length === 2, "two DropBall @font-face rules (Latin + Japanese)");
assert(index.includes('href="/assets/fonts/dropball-latin.woff2" as="font"') && index.includes('href="/assets/fonts/dropball-jp.woff2" as="font"'), "both fonts are preloaded");
assert(/font-family:DropBall,/.test(index), "the page uses DropBall first");
assert(require("../tailwind.config.js").theme.extend.fontFamily.sans[0] === "DropBall", "Tailwind font-sans starts with DropBall");
const app14 = read("app-14.js");
assert(!/(["`]|px )ui-sans-serif/.test(app14.replace(/DropBall,ui-sans-serif/g, "")), "every canvas font string names DropBall first");
console.log("ui font PASS");
