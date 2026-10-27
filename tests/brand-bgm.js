// Brand (Drop Ball), menu tap sound and legacy BGM adapter contract (public/app-brand-bgm.js).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
function expect(v, m) { if (!v) throw new Error(m); }
const root = path.join(__dirname, '..');
const brand = fs.readFileSync(path.join(root, 'public/app-brand-bgm.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
new Function(brand);
expect(manifest.name === 'Drop Ball' && manifest.short_name === 'Drop Ball', 'installed app name is not Drop Ball');
expect(index.includes('<title>Drop Ball</title>'), 'document title is not Drop Ball');
expect(index.includes('apple-mobile-web-app-title" content="Drop Ball"'), 'iOS app title is not Drop Ball');
expect(index.includes('Drop Ballは横画面専用です'), 'orientation gate still shows old app name');
const order = JSON.parse(/var files=(\[[\s\S]*?\]);/.exec(index)[1]);
const pos = f => order.indexOf(f);
expect(pos('app-menu-ui.js') >= 0 && pos('app-brand-bgm.js') > pos('app-menu-ui.js') && pos('app-bgm-local.js') > pos('app-brand-bgm.js') && pos('app-16.js') > pos('app-bgm-local.js'), 'brand/BGM adapters must load after menu UI and before App');
expect(brand.includes('v==="HEXDROP"?"Drop Ball":v'), 'visible old app name is not bridged to Drop Ball');
expect(brand.includes('window.__sixBallUsesGameBallAssets=true'), 'game-ball menu art marker missing');
expect(brand.includes('src:BALL_SRC[ci]'), 'menu illustration is not using gameplay BALL_SRC assets');
const gameplay = fs.readFileSync(path.join(root, 'public/app-10.js'), 'utf8');
for (const s of ['ball-glass-red.png', 'ball-glass-blue.png', 'ball-glass-green.png', 'ball-glass-yellow.png', 'ball-glass-purple.png']) {
  expect(gameplay.includes(s), `missing gameplay ball asset ${s}`);
  expect(fs.existsSync(path.join(root, 'public/assets', s)), `ball asset file missing ${s}`);
}
// Menu tap sound: a single valid same-origin MP3, versioned by content hash.
const menuAudio = fs.readFileSync(path.join(root, 'public/assets/menu-confirm-42.mp3'));
const menuHash = crypto.createHash('sha256').update(menuAudio).digest('hex');
expect(menuAudio.length > 8000 && menuAudio.length < 20000, `menu audio size unexpected: ${menuAudio.length}`);
expect(menuAudio.slice(0, 3).toString() === 'ID3' || (menuAudio[0] === 0xff && (menuAudio[1] & 0xe0) === 0xe0), 'menu audio is not an MPEG stream');
expect(brand.includes(`const MENU_CONFIRM_SHA256="${menuHash}";`), 'menu sound hash marker must match the shipped file');
expect(brand.includes(`/assets/menu-confirm-42.mp3?v=${menuHash.slice(0, 12)}`), 'menu sound URL must be versioned by the shipped file hash');
expect(!brand.includes('XMLHttpRequest') && !brand.includes('readMenuChunkSync'), 'synchronous chunk rebuild must be gone');
expect(!fs.existsSync(path.join(root, 'public/assets/menu-confirm-42.b64.00')), 'base64 chunks must be removed');
expect(brand.includes('window.__sixBallMenuClickAllButtons=true'), 'all-menu-button sound marker missing');
expect(brand.includes('e.target.closest("button,[role=\'button\']")'), 'menu tap bridge must cover button and role=button controls');
expect(brand.includes('document.addEventListener("pointerdown",handleMenuPress'), 'menu sound must fire on pointerdown');
expect(brand.includes('document.addEventListener("touchstart",handleMenuPress'), 'touch fallback missing');
expect(brand.includes('MenuClick.play();') && brand.includes('Bgm.prime();'), 'menu press must play supplied SE and prime BGM in the same user action');
expect(brand.includes('ev.t==="move"'), 'legacy menu move sound is not suppressed');
// The legacy adapter must never reach an external host; app-bgm-local.js owns gameplay BGM.
expect(!/https?:\/\//.test(brand.replace(/\/\*[\s\S]*?\*\//g, '')), 'brand adapter must not reference external URLs');
expect(brand.includes('const CYBER44_SRC="";'), 'legacy BGM source must be empty (superseded by app-bgm-local.js)');
expect(brand.includes('BGM：Glass Cascade'), 'music credit missing from settings');
expect(!brand.includes('stepEngine(') && !brand.includes('settlePass(') && !brand.includes('SLIDE_SPEED') && !brand.includes('GRAV='), 'brand/BGM adapter must not alter gameplay physics');
console.log('6ball brand + exact rebuilt menu tap regression PASS', JSON.stringify({ menuHash, bytes: menuAudio.length }));
