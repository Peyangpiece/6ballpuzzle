# Ordinary-clear collapse correction, 2026-10-04

## Confirmed implementation defects

- The final no-bounce event wrapper rebased newly queued segments to the unchanged rendered origin, even when a preceding segment already existed. A compiled upper-green path became `[11,8] -> [11,10]`, then `[11,8] -> [10,11]`. Only the first segment may use the rendered origin.
- Ordinary clears were routed through the large-clear epoch branch merely because their size was at least six. The ordinary support-loss scheduler was therefore bypassed.
- The final deadline wrapper compressed collision-tested ordinary-clear clocks to 30% and forced common completion. Ordinary support-loss paths now retain their scheduler's timing.
- Zero initial speed was treated as missing and replaced by release speed. Ordinary-clear gravity retains finite zero speed.
- Real support-contact pivots were erased by the pile-gravity adapter. Ordinary contact rolls now retain their authored geometry; garbage's gravity-only adapter remains unchanged.

## Source comparison remains failing

Source: Nintendo clip 3, reconstructed 21-ball board, ordinary six-yellow clear, 14 circle-centre measurements for two green balls. Phase origin at frame 599 remains visually inferred; no input telemetry. This is not a full-game equivalence proof.

| Implementation | RMS error, source px | Maximum error, source px |
| --- | ---: | ---: |
| Published baseline 1a7033f | 46.29 | 81.85 |
| Contact restoration without queued-origin fix | 43.06 | 122.58 |
| Causal clocks, contiguous contact paths, zero rest velocity | 17.06 | 39.32 |

The existing motion comparison limits (RMS 8, max 17) are not met and have not been relaxed. Lower-green motion remains late relative to the source; further investigation of support release and inherited velocity is required. The intentionally failing diagnostic is not a CI success gate.

New regression `tests/post-clear-causal-paths.js` checks queue continuity, per-ball clocks, zero rest speed, absence of deadline compression, and preserved real support geometry. Browser review additionally runs the reconstructed collapse for four simulated seconds and checks finite positions and zero unfinished paths.
