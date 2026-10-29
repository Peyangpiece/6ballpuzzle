// Deployment audit: run the FINAL production planner on the original 10,000
// random and 2,000 directed inputs. Check preview purity, preview/commit parity,
// complete rigid cohorts, and authorized split state instead of pinning counts
// of differences against obsolete intermediate resolver wrappers.
// (The older comparison that counted differences against the historical oracle was removed.)
const previous=process.env.INCLUDE_DIRECTED;
process.env.INCLUDE_DIRECTED="1";
try{
  require("./rigidity-final-authority-production-10000.js");
}finally{
  if(previous===undefined)delete process.env.INCLUDE_DIRECTED;
  else process.env.INCLUDE_DIRECTED=previous;
}
