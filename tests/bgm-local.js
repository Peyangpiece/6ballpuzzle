// Same-origin gameplay BGM adapter contract (public/app-bgm-local.js).
const fs = require('fs'), path = require('path');
function expect(v, m) { if (!v) throw new Error(m); }
const root = path.join(__dirname, '..');
const local = fs.readFileSync(path.join(root, 'public/app-bgm-local.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
new Function(local);
const order = JSON.parse(/var files=(\[[\s\S]*?\]);/.exec(index)[1]);
const pos = f => order.indexOf(f);
expect(pos('app-brand-bgm.js') >= 0 && pos('app-bgm-local.js') > pos('app-brand-bgm.js') && pos('app-16.js') > pos('app-bgm-local.js'), 'same-origin BGM override must load after brand audio and before App');
// transcoded, same-origin, versioned sources; the 21 MB MP3 is gone
expect(local.includes('/assets/6ball-battle-bgm.ogg?v='), 'Opus source missing');
expect(local.includes('/assets/6ball-battle-bgm.m4a?v='), 'AAC fallback source missing');
expect(!local.includes('6ball-battle-bgm.mp3'), 'MP3 source must not be referenced');
expect(local.includes('canPlayType'), 'format must be chosen with canPlayType');
for (const f of ['6ball-battle-bgm.ogg', '6ball-battle-bgm.m4a']) {
  const size = fs.statSync(path.join(root, 'public/assets', f)).size;
  expect(size > 1e6 && size < 10e6, f + ' has an unexpected size ' + size);
}
expect(!fs.existsSync(path.join(root, 'public/assets/6ball-battle-bgm.mp3')), 'the 21 MB MP3 must be removed from public/assets');
// lazy: nothing downloads until a gesture primes the element
expect(local.includes('a.preload="none"'), 'BGM element must start with preload=none');
expect(/warm\(\)\{[\s\S]*?a\.preload="auto";[\s\S]*?a\.load\(\)/.test(local), 'warm() must switch to preload=auto and load');
expect(/prime\(\)\{\s*const a=this\.warm\(\);/.test(local), 'prime() must warm the element under the user gesture');
expect(/activate\(restart=false\)\{\s*const a=this\.warm\(\);/.test(local), 'activate() must warm the element');
expect(local.includes('window.__sixBallGameplayBgmLazy=true'), 'lazy marker missing');
// behaviour kept from the previous adapter
expect(local.includes('const BGM_OUTPUT_SCALE=0.10'), 'BGM output scale changed');
expect(local.includes('this.volume*BGM_OUTPUT_SCALE'), 'BGM scale must apply to effective playback volume');
expect(local.includes('window.__sixBallGameplayBgmSameOrigin=true'), 'same-origin marker missing');
expect(local.includes('legacy.prime=function()') && local.includes('legacy.start=function()'), 'legacy BGM adapter must be disabled');
expect(local.includes('Bgm.prime();'), 'BGM must be primed under menu user gesture');
expect(local.includes('Bgm.start(true);'), 'BGM must start when GAME becomes visible');
expect(local.includes('document.addEventListener("click",()=>sync(),{capture:false})'), 'Safari BGM promotion must remain in the same click without setTimeout');
expect(!local.includes('setTimeout(sync,0)'), 'BGM start must not be deferred out of the trusted click');
expect(local.includes('ensureGameSfxContext()'), 'gameplay SFX AudioContext recovery missing');
expect(local.includes('Sfx.__sixBallSafariResumeBridge=true'), 'SFX resume bridge marker missing');
expect(local.includes('ctx.resume()'), 'WebAudio resume call missing');
expect(local.includes('a.loop=true'), 'BGM must loop');
expect(!local.includes('stepEngine(') && !local.includes('settlePass(') && !local.includes('SLIDE_SPEED') && !local.includes('GRAV='), 'local audio adapter must not alter gameplay physics');
console.log('same-origin lazy Opus/AAC BGM + Safari gameplay SFX regression PASS');
