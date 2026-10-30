/* iOS app bridge (Capacitor). Does nothing in a browser.
 *
 * In the app (window.Capacitor.isNativePlatform()):
 * - Firebase Auth uses initializeAuth with IndexedDB persistence (getAuth's
 *   popup resolver never settles in WKWebView).
 * - "Google でログイン" and "Apple でサインイン" use the native sign-in sheets
 *   (@capacitor-firebase/authentication, skipNativeAuth) and pass their
 *   credential to the web Firebase SDK; a guest account is linked, and an
 *   account that already exists is signed in instead (as on the web).
 * - Deleting the account signs in again natively first.
 * - navigator.vibrate drives the Taptic Engine (@capacitor/haptics), so the
 *   existing 振動 setting and calls work unchanged.
 * - Game Center (GameCenterPlugin in ios/App/App/DropBallNative.swift): the
 *   rating leaderboard and achievements, from the existing match record and
 *   rating hooks (hexRecordMatch, Net.applyRating).
 * - Ads (@capacitor-community/admob): a full-screen ad when the player leaves
 *   the result screen of every third match, after Google's consent form (where
 *   the law asks for it) and Apple's tracking prompt; the one-time purchase
 *   "広告を削除" (StorePlugin, StoreKit 2) turns them off (window.DropBallAds).
 * The IDs below must match those created in App Store Connect and AdMob
 * (docs/IOS.md).
 */
(function(){
if(typeof window==="undefined"||window.__dropBallNativeV1)return;
window.__dropBallNativeV1=true;
const cap=window.Capacitor;
const isNative=!!(cap&&typeof cap.isNativePlatform==="function"&&cap.isNativePlatform());
if(!isNative)return;

const call=(plugin,method,options={})=>cap.nativePromise(plugin,method,options);
const LEADERBOARD_RATING="dropball.rating";
const ACH={
  firstWin:"dropball.first_win",
  ai:lv=>"dropball.ai_"+lv,
  waza:"dropball.waza_first",
  hexagon:"dropball.hexagon",
  chain3:"dropball.chain_3",
  chain5:"dropball.chain_5",
  onlineWin:"dropball.online_win",
  rating1200:"dropball.rating_1200"
};

// ---------------------------------------------------------------- audio
// The app's web view ignores an <audio> element's volume, and an element
// routed into Web Audio plays nothing there. So the battle BGM is played by
// the native NativeBgm plugin (AVAudioPlayer) behind an element-like object
// that the existing BGM code drives unchanged (play/pause/volume/muted), and
// the menu tap plays its decoded sample through Web Audio at the SFX volume.
window.__dropBallNativeAudio=true;
const BGM_PATH="assets/6ball-battle-bgm.m4a";
function nativeBgmElement(){
  const listeners={};
  const fire=t=>{for(const f of listeners[t]||[]){try{f({type:t});}catch(_){}}};
  let volume=1,muted=false,playing=false;
  // The web BGM plays at volume x BGM_OUTPUT_SCALE (0.10, set for desktop
  // speakers); Safari on iPhone ignored that and played at full volume, which
  // is the loudness iPhone players know. So the app undoes the scale: the
  // slider value is the native volume (100% = as loud as before).
  const level=()=>{
    if(muted)return 0;
    const scale=Number(window.__sixBallGameplayBgmOutputScale)||1;
    return Math.max(0,Math.min(1,volume/scale));
  };
  // Taps re-apply the BGM volume and call play(); only real changes cross
  // the bridge to the native player.
  let sent=-1,lastAsk=0;
  const push=()=>{const v=level();if(playing&&v!==sent){sent=v;call("NativeBgm","setVolume",{volume:v}).catch(()=>{});}};
  return{
    loop:true,preload:"none",src:"",playsInline:true,error:null,readyState:4,
    setAttribute(){},removeAttribute(){},
    addEventListener(t,f){(listeners[t]=listeners[t]||[]).push(f);},
    removeEventListener(t,f){listeners[t]=(listeners[t]||[]).filter(x=>x!==f);},
    canPlayType(){return"probably";},
    load(){call("NativeBgm","load",{path:BGM_PATH}).then(()=>fire("canplaythrough")).catch(()=>{});},
    play(){
      // Already playing: at most every 2 s, ask the native player again, so
      // a loop stopped by an audio interruption comes back on the next tap.
      if(playing){
        push();
        const now=Date.now();
        if(now-lastAsk>2000){lastAsk=now;call("NativeBgm","play",{path:BGM_PATH,volume:level()}).catch(()=>{});}
        return Promise.resolve();
      }
      lastAsk=Date.now();
      playing=true;sent=level();
      return call("NativeBgm","play",{path:BGM_PATH,volume:sent}).then(()=>{fire("playing");})
        .catch(err=>{playing=false;window.__sixBallGameplayBgmLastError="native: "+(err&&err.message||err);fire("error");throw err;});
    },
    pause(){if(!playing)return;playing=false;call("NativeBgm","pause").catch(()=>{});fire("pause");},
    get paused(){return!playing;},
    get volume(){return volume;},
    set volume(v){const n=Number(v);if(Number.isFinite(n)){volume=Math.max(0,Math.min(1,n));push();}},
    get muted(){return muted;},
    set muted(v){muted=!!v;push();},
    get currentTime(){return 0;},
    set currentTime(t){call("NativeBgm","seek",{time:Number(t)||0}).catch(()=>{});}
  };
}
const patchBgm=b=>{
  if(!b||typeof b!=="object"||b.__dropBallNative)return b;
  b.__dropBallNative=true;
  b.init=function(){if(!this.audio)this.audio=nativeBgmElement();return this.audio;};
  return b;
};
const patchMenuClick=m=>{
  if(!m||typeof m!=="object"||m.__dropBallNative)return m;
  m.__dropBallNative=true;
  const elementPlay=m.play;
  let buffer=null,loading=null;
  const load=()=>{
    if(loading||typeof Sfx==="undefined")return;
    try{Sfx.init();}catch(_){}
    const ctx=Sfx.ctx,src=window.__sixBallMenuClickSource;
    if(!ctx||!src)return;
    loading=fetch(src).then(r=>r.arrayBuffer()).then(ab=>ctx.decodeAudioData(ab)).then(b=>{buffer=b;}).catch(()=>{loading=null;});
  };
  m.play=function(){
    const ctx=typeof Sfx!=="undefined"?Sfx.ctx:null;
    if(buffer&&ctx){
      try{
        if(ctx.state!=="running")ctx.resume().catch(()=>{});
        const s=ctx.createBufferSource(),g=ctx.createGain();
        g.gain.value=Math.max(0,Math.min(1,Number(this.volume())||0));
        s.buffer=buffer;s.connect(g);g.connect(ctx.destination);s.start();
        return;
      }catch(_){}
    }
    load();
    return elementPlay.apply(this,arguments);
  };
  return m;
};
for(const [name,patch] of [["Bgm",patchBgm],["MenuClick",patchMenuClick]]){
  let value=patch(window[name]);
  try{Object.defineProperty(window,name,{configurable:true,enumerable:true,get(){return value;},set(v){value=patch(v);}});}catch(_){}
}

// ---------------------------------------------------------------- room invitations
// A room invitation link (https://dropball.hrk-6888.workers.dev/?room=NNNNNN,
// app-17.js) opens the app as a universal link (apple-app-site-association,
// Associated Domains); @capacitor/app reports it at launch or while running.
// The room screen opens with the code filled in (app-16.js).
const openInviteUrl=url=>{
  let code="";
  try{code=new URL(String(url||"")).searchParams.get("room")||"";}catch(_){return;}
  if(!/^\d{6}$/.test(code))return;
  if(typeof window.__hexOpenRoomInvite==="function")window.__hexOpenRoomInvite(code);
  else window.__hexPendingRoomInvite=code;
};
try{cap.addListener("App","appUrlOpen",e=>openInviteUrl(e&&e.url));}catch(_){}
call("App","getLaunchUrl").then(r=>openInviteUrl(r&&r.url)).catch(()=>{});

// ---------------------------------------------------------------- haptics
const IMPACT=ms=>ms<15?"LIGHT":ms<35?"MEDIUM":"HEAVY";
try{
  Object.defineProperty(navigator,"vibrate",{configurable:true,value:function(pattern){
    const ms=Array.isArray(pattern)?pattern.filter((_,i)=>i%2===0).reduce((a,b)=>a+(Number(b)||0),0):Number(pattern)||0;
    if(ms>0)call("Haptics","impact",{style:IMPACT(ms)}).catch(()=>{});
    return true;
  }});
}catch(_){}

// ---------------------------------------------------------------- Game Center
let gcReady=null;
const gameCenter=()=>gcReady||(gcReady=call("GameCenter","signIn").then(r=>!!r?.authenticated).catch(()=>false));
const unlock=id=>gameCenter().then(ok=>ok&&call("GameCenter","unlockAchievement",{achievementID:id})).catch(()=>{});
const submitRating=r=>gameCenter().then(ok=>ok&&Number.isFinite(r)&&call("GameCenter","submitScore",{leaderboardID:LEADERBOARD_RATING,score:Math.round(r)})).catch(()=>{});

if(typeof hexRecordMatch==="function"){
  const base=hexRecordMatch;
  hexRecordMatch=function(args){
    const out=base.apply(this,arguments);
    try{
      const {cpuLevel=0,win,summary}=args||{};
      if(win)unlock(ACH.firstWin);
      if(win&&cpuLevel>=1&&cpuLevel<=5)unlock(ACH.ai(cpuLevel));
      if(summary){
        if(summary.wazaTotal>0)unlock(ACH.waza);
        if(summary.waza&&summary.waza.HEXAGON>0)unlock(ACH.hexagon);
        if(summary.maxChain>=3)unlock(ACH.chain3);
        if(summary.maxChain>=5)unlock(ACH.chain5);
      }
    }catch(_){}
    return out;
  };
}

// ---------------------------------------------------------------- ads
// ADMOB_INTERSTITIAL is the interstitial ad unit from AdMob; while it is empty
// Google's test ad unit is used (Info.plist's GADApplicationIdentifier is then
// Google's test app ID too). Both are replaced together before release.
const ADMOB_INTERSTITIAL="";
const TEST_INTERSTITIAL="ca-app-pub-3940256099942544/4411468910";
const REMOVE_ADS="app.dropball.game.removeads";
const ADS_EVERY=3;              // matches between two ads
const ADS_MIN_GAP_MS=120000;    // and at least this long
const ADS_REMOVED_KEY="hexdrop_ads_removed";
const ads={removed:false,ready:false,loaded:false,loading:false,sinceAd:0,lastShown:0,price:"",busy:false,onDone:null,listeners:new Set()};
try{ads.removed=localStorage.getItem(ADS_REMOVED_KEY)==="1";}catch(_){}
const adsState=()=>({removed:ads.removed,price:ads.price,busy:ads.busy});
const adsNotify=()=>{for(const f of ads.listeners){try{f(adsState());}catch(_){}}};
const setAdsRemoved=v=>{
  ads.removed=!!v;
  try{localStorage.setItem(ADS_REMOVED_KEY,ads.removed?"1":"0");}catch(_){}
  adsNotify();
};
const loadAd=()=>{
  if(ads.removed||!ads.ready||ads.loaded||ads.loading)return;
  ads.loading=true;
  call("AdMob","prepareInterstitial",{adId:ADMOB_INTERSTITIAL||TEST_INTERSTITIAL,isTesting:!ADMOB_INTERSTITIAL})
    .then(()=>{ads.loaded=true;}).catch(()=>{}).then(()=>{ads.loading=false;});
};
// Consent first: Google's form where it is required (EU/UK), then Apple's
// tracking prompt; ads are requested only when the consent allows them.
async function startAds(){
  if(ads.removed||ads.ready)return;
  try{
    let info=await call("AdMob","requestConsentInfo");
    if(info&&info.status==="REQUIRED"&&info.isConsentFormAvailable)info=await call("AdMob","showConsentForm");
    if(info&&info.canRequestAds===false)return;
    const t=await call("AdMob","trackingAuthorizationStatus");
    if(t&&t.status==="notDetermined")await call("AdMob","requestTrackingAuthorization");
    await call("AdMob","initialize",{maxAdContentRating:"ParentalGuidance"});
    ads.ready=true;
    loadAd();
  }catch(_){}
}
const adFinished=()=>{const f=ads.onDone;ads.onDone=null;if(f)f();};
try{
  cap.addListener("AdMob","interstitialAdDismissed",adFinished);
  cap.addListener("AdMob","interstitialAdFailedToShow",adFinished);
}catch(_){}
const refreshOwned=()=>call("Store","owned").then(r=>{
  setAdsRemoved(Array.isArray(r&&r.productIDs)&&r.productIDs.includes(REMOVE_ADS));
}).catch(()=>{});
try{cap.addListener("Store","ownedChanged",refreshOwned);}catch(_){}

window.DropBallAds={
  state:adsState,
  subscribe(f){ads.listeners.add(f);return()=>ads.listeners.delete(f);},
  // Called when the player leaves a result screen; resolves once any ad
  // shown has been closed (the next screen opens after it).
  afterMatch(){
    if(ads.onDone)return Promise.resolve(false);
    ads.sinceAd++;
    if(ads.removed||!ads.loaded||ads.sinceAd<ADS_EVERY||Date.now()-ads.lastShown<ADS_MIN_GAP_MS)return Promise.resolve(false);
    ads.loaded=false;ads.sinceAd=0;ads.lastShown=Date.now();
    // The battle BGM is native (not paused with the web view's media).
    const bgm=window.Bgm&&window.Bgm.audio,resume=!!(bgm&&!bgm.paused);
    if(resume)bgm.pause();
    return new Promise(resolve=>{
      const guard=setTimeout(adFinished,90000);
      ads.onDone=()=>{
        clearTimeout(guard);
        if(resume)Promise.resolve(bgm.play()).catch(()=>{});
        loadAd();
        resolve(true);
      };
      call("AdMob","showInterstitial").catch(adFinished);
    });
  },
  price(){
    if(ads.price)return Promise.resolve(ads.price);
    return call("Store","product",{productID:REMOVE_ADS}).then(r=>{ads.price=String(r&&r.displayPrice||"");adsNotify();return ads.price;}).catch(()=>"");
  },
  async purchase(){
    ads.busy=true;adsNotify();
    try{
      const r=await call("Store","purchase",{productID:REMOVE_ADS});
      if(r&&r.owned)setAdsRemoved(true);
      return r||{};
    }finally{ads.busy=false;adsNotify();}
  },
  async restore(){
    ads.busy=true;adsNotify();
    try{
      const r=await call("Store","restore");
      const owned=Array.isArray(r&&r.productIDs)&&r.productIDs.includes(REMOVE_ADS);
      if(owned)setAdsRemoved(true);
      return owned;
    }finally{ads.busy=false;adsNotify();}
  }
};
// After the Game Center sign-in banner: the purchase decides whether ads run.
setTimeout(()=>{refreshOwned().then(()=>{if(!ads.removed)startAds();});},2500);

// ---------------------------------------------------------------- Firebase Auth
if(typeof Net!=="undefined"){
  const baseEnsure=Net._ensureFirebase;
  Net._ensureFirebase=async function(){
    if(!this.auth){
      const F=await this.sdk();
      if(!this.app)this.app=F.initializeApp(FIREBASE_CONFIG);
      if(typeof F.initializeAuth==="function")this.auth=F.initializeAuth(this.app,{persistence:F.indexedDBLocalPersistence});
    }
    return baseEnsure.call(this);
  };

  if(typeof Net.applyRating==="function"){
    const baseApply=Net.applyRating;
    Net.applyRating=async function(win,foeRating,ranked){
      const out=await baseApply.apply(this,arguments);
      const r=Number(this.profile?.rating);
      if(ranked!==false&&Number.isFinite(r)){
        submitRating(r);
        if(win)unlock(ACH.onlineWin);
        if(r>=1200)unlock(ACH.rating1200);
      }
      return out;
    };
  }

  // Native sheet -> credential for the web SDK.
  async function nativeCredential(F,provider){
    if(provider==="apple"){
      const r=await call("FirebaseAuthentication","signInWithApple",{skipNativeAuth:true});
      const c=r&&r.credential;
      if(!c||!c.idToken)throw Object.assign(new Error("no Apple credential"),{code:"auth/popup-closed-by-user"});
      return new F.OAuthProvider("apple.com").credential({idToken:c.idToken,rawNonce:c.nonce});
    }
    const r=await call("FirebaseAuthentication","signInWithGoogle",{skipNativeAuth:true});
    const c=r&&r.credential;
    if(!c||(!c.idToken&&!c.accessToken))throw Object.assign(new Error("no Google credential"),{code:"auth/popup-closed-by-user"});
    return F.GoogleAuthProvider.credential(c.idToken||null,c.accessToken||null);
  }
  const cancelled=err=>/cancel|canceled|cancelled|1001|-5/i.test(String(err?.message||err?.code||""));

  async function nativeLogin(provider){
    const F=await Net._ensureFirebase();
    const current=Net.auth.currentUser||await Net._restoredAuthUser();
    if(current&&!current.isAnonymous){await Net._syncAuthProfile(current);return current;}
    let cred;
    try{cred=await nativeCredential(F,provider);}
    catch(err){if(cancelled(err))throw Object.assign(new Error("cancelled"),{code:"auth/popup-closed-by-user"});throw err;}
    let user;
    if(current){
      try{user=(await F.linkWithCredential(current,cred)).user;}
      catch(err){
        const code=String(err?.code||"");
        if(code!=="auth/credential-already-in-use"&&code!=="auth/email-already-in-use")throw err;
        const again=(provider==="apple"?F.OAuthProvider:F.GoogleAuthProvider).credentialFromError?.(err)||cred;
        user=(await F.signInWithCredential(Net.auth,again)).user;
      }
    }else user=(await F.signInWithCredential(Net.auth,cred)).user;
    await Net._syncAuthProfile(user);
    return user;
  }
  Net.loginWithGoogle=function(){return nativeLogin("google");};
  Net.loginWithApple=function(){return nativeLogin("apple");};

  window.DropBallNative={
    isNative:true,
    appleSignIn:true,
    gameCenter:true,
    showLeaderboard(){return gameCenter().then(ok=>ok&&call("GameCenter","showLeaderboard",{leaderboardID:LEADERBOARD_RATING}));},
    async reauthenticate(user){
      const F=await Net._ensureFirebase();
      const apple=(user.providerData||[]).some(p=>p&&p.providerId==="apple.com");
      const cred=await nativeCredential(F,apple?"apple":"google");
      await F.reauthenticateWithCredential(user,cred);
    }
  };
}

// Sign in to Game Center once the app is up (it shows its own banner).
setTimeout(()=>{gameCenter();},1500);
window.__dropBallNativeVersion="native-v1";
})();
