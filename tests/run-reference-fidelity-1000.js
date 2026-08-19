const path=require("path");
const cp=require("child_process");

// Frozen capture-reference baseline. Run the canonical 1000-point suite exactly
// as authored; production policy adapters are covered by separate current-runtime
// regressions and must not alter this historical reference harness.
cp.execFileSync(process.execPath,[path.join(__dirname,"reference-fidelity-1000.js")],{stdio:"inherit"});
