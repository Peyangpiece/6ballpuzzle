const fs=require('fs');
function expect(v,m){if(!v)throw new Error(m);}
const local=fs.readFileSync('public/app-bgm-local.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
new Function(local);
expect(index.includes('"app-brand-bgm.js","app-bgm-local.js","app-16.js"'),'same-origin BGM override must load after brand audio and before App');
expect(local.includes('const SRC="/assets/maou_bgm_cyber44.mp3?v="'),'Cyber44 must be served from same origin');
expect(local.includes('4dedd2b97b80aca8ab47e9b797ad0e8a400c1e941a43b1c2b53aca40ea9cc532'),'Cyber44 source hash marker missing');
expect(local.includes('window.__sixBallGameplayBgmSameOrigin=true'),'same-origin marker missing');
expect(local.includes('legacy.prime=function()')&&local.includes('legacy.start=function()'),'legacy cross-origin BGM must be disabled');
expect(local.includes('Bgm.prime();'),'BGM must be primed under menu user gesture');
expect(local.includes('if(game&&!wasGame)Bgm.start(true)'),'BGM must start when GAME becomes visible');
expect(local.includes('a.loop=true'),'BGM must loop');
expect(!local.includes('stepEngine(')&&!local.includes('settlePass(')&&!local.includes('SLIDE_SPEED')&&!local.includes('GRAV='),'local BGM override must not alter gameplay physics');
console.log('same-origin Cyber44 BGM regression PASS');
