# Split and slide comparison, 2026-10-04

Reference sources are the Nintendo recordings identified in `tests/fixtures/reference-motion-20260814.json` (clip 0 upward pocket landing; clip 2 inverted floor landing). Source video was re-inspected at clip 2 frames 30–40. Controller telemetry and exact input timestamps are unavailable.

## Changes

- Floor-contact playback formerly used one constant angular speed for both uppers, despite the centre member seating laterally. The clock now includes gravity-shaped progress and the centre's seating direction. The measured leading roll is four frames and the other roll five; the leading duration varies continuously to the centred case, rather than changing abruptly at zero offset.
- A bounded 128-entry clock cache avoids per-frame energy-table construction. Motion is mirrored by geometry, never by colour or an absolute board side.
- After an upward pocket pins, the continuous roll clocks are fitted as 2.5 and 3.5 source-frame intervals instead of integer-rounded 3 and 4. This affects trajectory playback, not contact eligibility, split pairing or lattice destinations.

## Measured position errors (1920×1080 source pixels, 120 Hz replay)

| Scene | Samples | Previous RMS / max | Current RMS / max |
| --- | ---: | ---: | ---: |
| Upward pocket release | 23 | 5.16 / 12.61 | 3.27 / 8.59 |
| Inverted floor release | 17 | 6.63 / 13.95 | 3.94 / 10.48 |

The inherited engineering tolerance (RMS 8, maximum 17) is unchanged. Passing it does **not** mean exact equality, even within these scenes. Inverted early motion and pre-pocket upward motion still differ. This is a calibration of these source scenes, not evidence for all board configurations, all inputs, or all motion in the six videos.

`tests/reference-floor-slide-clock.js` checks 1,809 samples over centred and positive/negative offsets: mirrored positions, monotonically downward motion, contact distances >= one diameter, continuous clocks near zero offset, and measured 4/5-frame completion. The production runtime suite also includes source trajectory comparisons at 30/60/120/240 Hz. `tests/quality-split-browser-review.js` replays the reconstructed upward scene, its mirror and the inverted scene with production rendering and checks completed paths.

The remaining post-clear benchmark also remains mismatched (RMS 17.06, max 39.32 from the previous correction). No complete-match or goal-completion claim is justified.
