# 2026-09-12 reference-video motion audit

Four supplied Nintendo captures were inspected. Two landing layouts were reconstructed in the production physics harness. Raw source names, SHA-256 values, coverage windows and before/after measurements are in `reference-video-motion-20260912.json`.

## Corrections

- Keep each motion batch on the duration and starting velocity captured at entry. Recomputing from current velocity produced deceleration and a final snap.
- Limit batch-end lattice cleanup to roundoff. A fractional release below its reserved row must enter the next gravity event rather than move upward.
- After a lower UP member becomes pinned between two stationary supports, allow the remaining valid pair to move together. Outer slope contact alone still cannot authorize a split.
- For clear DOWN-floor contact, roll both uppers outward about the seating lower centre using the same checked path for normal and hard drop.
- Run the garbage-presentation test with the production runtime; its old partial loader omitted the continuous-motion layers.

## Measured replay changes at 120 Hz

| Layout | Before settling | After settling | Upward steps before / after |
| --- | ---: | ---: | ---: |
| UP, left/right mirrored | 0.425 s | 0.258 s | 0 / 0 |
| DOWN, left/right mirrored hard drop | 0.425 s | 0.167 s | 1 / 0 |
| DOWN, normal drop | 0.425 s | 0.167 s | 0 / 0 |

A separate free-fall probe reduced maximum deviation from its analytic trajectory from 1.862 lattice rows to floating-point roundoff. These numbers compare the old and new engine under identical reconstructed inputs, not every source-video pixel.

## Validation and limits

The new replay tests pass at 30, 60, 120 and 240 Hz, checking all board balls for overlap, monotonic downward movement, settling and mirrored endpoints. Existing no-bounce, even-row, rigidity state/release, garbage and pile regressions also pass. The final production rigidity audit passed 10,000/10,000 cases.

**Full equivalence is not established.** The UP example still differs from the approximate source timing by one to two 30fps frames. Full clear/chain/garbage trajectories and input reconstruction across all four videos remain to be calibrated. Historical CI entrypoints also contain obsolete loaders or assertions and must not be represented as a green full deployment gate.
