// public/app-audio-element-gain-v1.js: where an <audio> element ignores its
// volume (iPhone / iPad), setting it routes the element through a gain node
// on the sound-effect AudioContext and the slider value reaches that gain.
// Where element volume works, nothing is changed.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "app-audio-element-gain-v1.js"), "utf8");

function run(volumeWorks) {
  class HTMLMediaElement { play() { this.playing = true; return Promise.resolve(); } }
  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    get() { return volumeWorks ? (this._v ?? 1) : 1; },
    set(v) { if (volumeWorks) this._v = v; }
  });
  const ctx = { state: "suspended", currentTime: 0, sources: 0, resumed: 0, destination: {},
    resume() { this.resumed++; this.state = "running"; return Promise.resolve(); },
    createMediaElementSource(el) { this.sources++; return { connect() {} }; },
    createGain() { const g = { context: ctx, gain: { value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; } }, connect() {} }; return g; } };
  const Sfx = { ctx: null, init() { this.ctx = ctx; } };
  const c = { HTMLMediaElement, Sfx, document: { createElement: () => new HTMLMediaElement() } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(src, c);
  return { c, ctx, HTMLMediaElement };
}

{
  const { c, ctx, HTMLMediaElement } = run(false);
  assert.strictEqual(c.__sixBallAudioElementVolumeIgnored, true);
  const a = new HTMLMediaElement();
  a.volume = 0.3;
  assert.strictEqual(ctx.sources, 1, "the element is routed through Web Audio");
  assert.strictEqual(a.volume, 0.3, "volume reads back the slider value");
  a.volume = 0.05;
  assert.strictEqual(ctx.sources, 1, "an element is routed only once");
  const b = new HTMLMediaElement();
  b.volume = 0.7;
  assert.strictEqual(ctx.sources, 2);
  a.play();
  assert.strictEqual(ctx.resumed, 1, "play() resumes a suspended context");
}
{
  const { c, ctx, HTMLMediaElement } = run(true);
  assert.strictEqual(c.__sixBallAudioElementVolumeIgnored, false);
  assert(!c.__sixBallAudioElementGainVersion, "nothing is installed where element volume works");
  const a = new HTMLMediaElement();
  a.volume = 0.3;
  assert.strictEqual(a.volume, 0.3);
  assert.strictEqual(ctx.sources, 0);
}
// Loaded after the audio layers that set element volume.
const index = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
assert(index.indexOf('"app-audio-element-gain-v1.js"') > index.indexOf('"app-menu-volume-fix.js"'), "load the gain layer after the volume layers");
console.log("audio element gain PASS");
