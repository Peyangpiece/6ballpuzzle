const fs=require('fs');
function expect(v,m){if(!v)throw new Error(m);}
const path=require('path');const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'public/app-menu-ui.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app-16.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
new Function(ui);
new Function(app);
const menuPos=index.indexOf('"app-menu-ui.js"'),appPos=index.indexOf('"app-16.js"');
expect(menuPos>=0&&appPos>menuPos,'menu UI must load before App');
expect(ui.includes('window.__hexMenuUiVersion="menu-ui-v1"'),'menu UI version marker missing');
for(const s of ['対戦','プロフィール','設定','オンライン対戦','AI対戦','フレンド対戦'])expect(app.includes(s),`missing menu item: ${s}`);
for(const s of ['BGM音量','効果音音量','振動'])expect(app.includes(s),`missing setting: ${s}`);
for(const s of ['ニックネーム','勝率','レート'])expect(app.includes(s),`missing profile field: ${s}`);
expect(app.includes('stateRef.current.nickname||"Player"'),'game HUD should use saved nickname');
expect(app.includes('Net.applyRating(win'),'online results should update profile record');
expect(app.includes('hexdrop_sfx_volume')&&app.includes('hexdrop_bgm_volume'),'audio preferences must persist');
expect(!ui.includes('stepEngine')&&!ui.includes('settlePass')&&!ui.includes('SLIDE_SPEED')&&!ui.includes('GRAV='),'menu UI must not alter physics');
console.log('immersive menu UI regression PASS');
