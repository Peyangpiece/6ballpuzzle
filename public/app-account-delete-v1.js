/* Account deletion (App Store guideline 5.1.1(v), and for the web too).
 *
 * Net.deleteAccount() removes the player's online data (users/<uid> and
 * leaderboard/<uid>; the rules let only the owner do so), deletes the
 * Firebase account itself, and clears the records kept on this device.
 * Settings such as volume stay. Match logs under matches/ hold no profile
 * beyond the name shown in that match and cannot be changed by a player.
 *
 * A Google or Apple account must have signed in recently before Firebase
 * deletes it. On the web the Google popup is opened in the click itself
 * (a popup opened after awaited work is blocked); in the iOS app the native
 * bridge signs in again (DropBallNative.reauthenticate).
 */
(function(){
if(typeof window==="undefined"||typeof Net==="undefined"||window.__dropBallAccountDeleteV1)return;
window.__dropBallAccountDeleteV1=true;

// Game records on this device; preferences (volume, haptics, colour symbols,
// tutorial) are not personal data and stay.
const LOCAL_KEYS=["hexdrop_nickname","hexdrop_rating","hexdrop_wins","hexdrop_losses","hexdrop_bests","hexdrop_cpu_record"];

function clearLocal(){
  for(const k of LOCAL_KEYS){try{localStorage.removeItem(k);}catch(_){}}
}

function reauthenticate(F,user){
  if(!user||user.isAnonymous)return Promise.resolve();
  const native=window.DropBallNative;
  if(native&&typeof native.reauthenticate==="function")return native.reauthenticate(user);
  const google=(user.providerData||[]).some(p=>p&&p.providerId==="google.com");
  if(!google||typeof F.reauthenticateWithPopup!=="function")return Promise.resolve();
  const provider=new F.GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  return F.reauthenticateWithPopup(user,provider);
}

Net._deleteAccountData=async function(){
  const F=await this._ensureFirebase();
  const user=this.auth.currentUser||await this._restoredAuthUser();
  if(user){
    const uid=user.uid;
    await F.remove(F.ref(this.db,"leaderboard/"+uid)).catch(()=>{});
    await F.remove(F.ref(this.db,"users/"+uid));
    try{
      await F.deleteUser(user);
    }catch(err){
      // The data is gone already; an account Firebase will not delete without
      // a fresh sign-in is signed out so that nothing is left in use.
      if(String(err?.code||"")!=="auth/requires-recent-login")throw err;
      if(typeof F.signOut==="function")await F.signOut(this.auth).catch(()=>{});
      const e=new Error("sign in again to delete the account");e.code="auth/requires-recent-login";throw e;
    }
  }
  clearLocal();
  this.uid=null;
  this.profile={name:"Player",rating:1000,wins:0,losses:0};
  return true;
};

Net.deleteAccount=function(){
  const F=this.fb||window.FB;
  // Firebase already set up: ask for the sign-in synchronously in the click.
  if(F&&this.app&&this.auth){
    return reauthenticate(F,this.auth.currentUser).then(()=>this._deleteAccountData());
  }
  return (async()=>{
    const F=await this._ensureFirebase();
    const user=this.auth.currentUser||await this._restoredAuthUser();
    await reauthenticate(F,user);
    return this._deleteAccountData();
  })();
};

window.__dropBallAccountDeleteVersion="account-delete-v1";
})();
