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
 * The IDs below must match those created in App Store Connect (docs/IOS.md).
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

// ---------------------------------------------------------------- diagnostics
// One line per event in the Xcode console ("[DropBall] …"): the web view's
// size and safe-area insets, and the audio state, to check the layout and the
// sound on a device.
const diag=(tag)=>{try{
  const probe=document.createElement("div");
  probe.style.cssText="position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);const cs=getComputedStyle(probe);
  const inset=[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft].map(v=>parseFloat(v)||0).join(",");
  probe.remove();
  const ctx=typeof Sfx!=="undefined"?Sfx.ctx:null;
  console.log("[DropBall] "+tag+" view="+innerWidth+"x"+innerHeight+" screen="+screen.width+"x"+screen.height+" safe="+inset+
    " audio="+(ctx?ctx.state+"@"+ctx.sampleRate:"none")+" elVolIgnored="+window.__sixBallAudioElementVolumeIgnored+
    " session="+(navigator.audioSession?navigator.audioSession.type:"n/a"));
}catch(e){console.log("[DropBall] diag error "+e);}};
setTimeout(()=>diag("start"),1500);
window.addEventListener?.("resize",()=>diag("resize"));
let diagTaps=0;
window.addEventListener?.("pointerup",()=>{if(diagTaps++<3)setTimeout(()=>diag("tap"+diagTaps),400);},true);

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
