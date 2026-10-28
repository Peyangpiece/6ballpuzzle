// The production physics stack: the layers the AI worker loads
// (public/ai-worker.js AI_WORKER_FILES), which are the page's physics layers in
// page order. Tests that load layers into a VM should use this list, so they
// exercise the code that ships rather than a partial stack.
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "ai-worker.js"), "utf8");
const files = JSON.parse(/var AI_WORKER_FILES=(\[[\s\S]*?\]);/.exec(src)[1].replace(/,\s*\]$/, "]"));
module.exports = { files };
