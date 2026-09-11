const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Drive the final presentation layer with a valid rigid pivot. A follower must
// not shorten the moving arm or restore stale coordinates after a solver edit.
const H = Math.sqrt(3) / 2;
const ctx = vm.createContext({ window: {}, Math, Map, Set, WeakMap, Number,
  HEX_ROW_H: H, PIECE_SNAP_SPEED: 10, ROWS: 1, W2: 2,
  valid: () => true, boardScanMin: () => 0,
  ordinarySplitSegmentNoLift: () => true,
  updateVisuals: g => {
    if (g.expectedInput) assert.deepEqual({...g.vis.get(2)}, g.expectedInput);
    g.frame++;
    const angle = -Math.PI / 3 + g.frame * Math.PI / 12;
    g.vis.set(1, {x: 0, y: 2});
    g.vis.set(2, {x: 2 * Math.cos(angle), y: 2 + Math.sin(angle) / H});
    return 'integrated';
  }
});
const source = fs.readFileSync(path.join(__dirname, '../public/app-split-visual-smoothness-v1.js'), 'utf8');
vm.runInContext(source, ctx);
for (const dt of [1/30, 1/60, 1/120]) {
  const g = {frame: 0, board: [[
    {id:1, fallPath:[{to:[0,2],groupSize:2}]},
    {id:2, fallPath:[{to:[2,2],groupSize:2}]}
  ]], vis: new Map()};
  for (let frame = 0; frame < 4; frame++) {
    const result = ctx.updateVisuals(g, dt);
    const a = g.vis.get(1), b = g.vis.get(2);
    assert.ok(Math.abs(Math.hypot((a.x-b.x)/2, (a.y-b.y)*H)-1) < 1e-10,
      `rigid pair shortened at ${1/dt} Hz, frame ${frame}`);
    if(frame===3) assert.equal(result, 'integrated', 'presentation swallowed integrator result');
  }
  g.expectedInput = {x: 6, y: 4, vy: 2};
  g.vis.set(2, {...g.expectedInput});
  ctx.updateVisuals(g, dt);
}
console.log('split visual state integrity PASS: rigid pivot, external correction, return value at 30/60/120 Hz');
