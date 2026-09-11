# Deployment validation repair

The latest main run (34177837684) stopped before deployment on the historical
intermediate-planner delta signature. The repair branch had not reached main.

Changes in this repair affect tests and CI naming only; game behavior is the
already-pushed a73b718 release.

- Production audit reuses all 10,000 original random inputs and all 2,000 original
  directed inputs. The directed builder is extracted unchanged into a shared
  fixture module. Checks include preview purity, preview/commit equivalence,
  complete rigid cohorts, common rigid motion, and split-state restrictions.
  Known contact, direction, arc, and timing results remain checked in the other
  workflow regressions. The old intermediate-wrapper/delta comparison is kept
  under `v1303-historical-delta-suite.js` for historical investigation, rather
  than accepting newly observed mismatch counts as a new golden baseline.
- Regression entrypoints use the shared production loader once; they no longer
  reload deleted or earlier layers after the final production layer.
- Three landing tests call hardDrop to establish the actual signed contact
  location. Calling lock directly had bypassed that input path.
- Diagnostic reads follow the final Nintendo decision and first-contact probe.
  Removed assertions required an earlier wrapper to have emitted debug labels
  even when the final layer had already safely rejected the motion. Existing
  geometric, direction, final-cell, and frame-duration assertions are retained.
- Smoothness keeps its motion assertions. A source-string assertion requiring a
  removed garbage queue is replaced by the garbage behavior stress test.
- Garbage stress begins from a settled pile, matching the production CHECK to
  GARBAGE transition. The previous fixture placed unsupported balls directly
  into an attack. Four dense terrains still check pile stability, separation,
  progress, completion, and absence of remaining legal gravity moves. Diagnostic
  serialization now excludes circular runtime objects.

Local evidence: final production contract audit passed 12,000/12,000; all
Nintendo motion regressions and the four dense garbage terrains passed. This
repairs the deployment gate; it does not establish pixel-exact equivalence to
all reference videos. See the reference-video audit for remaining limits.
