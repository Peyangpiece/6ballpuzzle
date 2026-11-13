(function(){
    if(
        typeof window==="undefined" ||
        typeof Net==="undefined"
    )return;

    Net._ensureFirebase=async function(){
        const F=await this.sdk();

        if(!this.app){
            this.app=
                F.initializeApp(
                    FIREBASE_CONFIG
                );
        }

        if(!this.auth){
            this.auth=
                F.getAuth(
                    this.app
                );
        }

        if(!this.db){
            this.db=
                F.getDatabase(
                    this.app
                );
        }

        return F;
    };

    Net._restoredAuthUser=async function(){
        const F=
            await this._ensureFirebase();

        if(this.auth.currentUser){
            return this.auth.currentUser;
        }

        // Wait until the SDK has restored the saved session. It reloads
        // the saved user over the network first; the old 900 ms limit
        // gave up on a slow connection and signed in a NEW guest, which
        // replaced a Google/Apple session (rating 1000, 0 wins shown,
        // and the local record overwritten).
        if(typeof this.auth.authStateReady==="function"){
            try{
                await this.auth.authStateReady();
            }catch(_){}

            return this.auth.currentUser||null;
        }

        return await new Promise(
            (resolve)=>{
                let finished=false;
                let un=()=>{};

                const finish=(user)=>{
                    if(finished)return;

                    finished=true;

                    try{
                        un();
                    }catch(_){}

                    resolve(user||null);
                };

                un=
                    F.onAuthStateChanged(
                        this.auth,
                        finish,
                        ()=>finish(null)
                    );

                setTimeout(
                    ()=>{
                        finish(
                            this.auth.currentUser
                        );
                    },
                    900
                );
            }
        );
    };

    // Starting values of a profile (Net.profile in app-15.js).
    const freshProfile=(name)=>({
        name:name||"Player",
        rating:1000,
        wins:0,
        losses:0,
        trophies:0,
        best:0
    });

    Net._syncAuthProfile=async function(user){
        if(!user)return null;

        const F=
            await this._ensureFirebase();

        const previous={
            ...this.profile
        };

        // Another account than before (guest -> Google, or a different
        // Google account): start from clean values. Merging the stored
        // record over the previous account's profile kept its trophies,
        // points and equipped items wherever the new record had none,
        // and the lobby and match rules then refused every search.
        const switched=
            !!this.uid &&
            this.uid!==user.uid;

        this.uid=user.uid;

        const userRef=
            F.ref(
                this.db,
                "users/"+this.uid
            );

        const snap=
            await F.get(userRef);

        if(snap.exists()){
            this.profile={
                ...(switched?freshProfile(previous.name):this.profile),
                ...snap.val()
            };
        }else{
            // The nickname the player chose on this device, or "Player".
            // The Google/Apple account name is NOT copied: it is usually a
            // real name, and the nickname is shown to opponents and on the
            // rankings (the privacy policy asks not to use a real name).
            // The rules accept a new record only with the starting rating and
            // record, whatever the guest account had locally.
            this.profile={
                name:previous.name||"Player",
                rating:1000,
                wins:0,
                losses:0
            };

            await F.set(
                userRef,
                {
                    ...this.profile,
                    updatedAt:
                        F.serverTimestamp()
                }
            );
        }

        // Who settles ratings: "client" (default, bounded by the rules) or
        // "server" (the Cloud Function in firebase/functions). This layer
        // replaces Net.connect(), which used to read the flag, so without
        // this the server mode never reached the client.
        try{
            const cfg=
                await F.get(
                    F.ref(this.db,"config/ratingAuthority")
                );

            this.ratingAuthority=
                cfg.exists()&&cfg.val()==="server"?"server":"client";
        }catch(_){
            this.ratingAuthority="client";
        }

        if(!user.isAnonymous){
            await F.set(
                F.ref(
                    this.db,
                    "leaderboard/"+
                    this.uid
                ),
                this.leaderboardEntry()
            ).catch(()=>{});
        }

        this.syncTrophies();
        return user;
    };

    Net.restoreGoogleUser=async function(){
        const user=
            await this._restoredAuthUser();

        if(
            !user ||
            user.isAnonymous
        ){
            return null;
        }

        await this._syncAuthProfile(
            user
        );

        return user;
    };

    Net.connect=async function(){
        const F=
            await this._ensureFirebase();

        let user=
            this.auth.currentUser;

        if(!user){
            user=
                await this._restoredAuthUser();
        }

        if(!user){
            const credential=
                await F.signInAnonymously(
                    this.auth
                );

            user=
                credential.user;
        }

        await this._syncAuthProfile(
            user
        );

        return this.uid;
    };

    // The Google popup must open in the task of the click itself: Safari (and
    // other browsers after a delay) block a popup opened after awaited work.
    // When Firebase is already set up (restored at start-up, or by the profile
    // screen), the popup is requested synchronously here.
    Net.loginWithGoogle=function(){
        const F=this.fb||window.FB;
        if(F&&this.app&&this.auth)
            return this._googlePopup(F,this.auth.currentUser);
        return (async()=>{
            const F=await this._ensureFirebase();
            const current=
                this.auth.currentUser||
                await this._restoredAuthUser();
            return this._googlePopup(F,current);
        })();
    };

    Net._googlePopup=function(F,current){
        if(current&&!current.isAnonymous)
            return this._syncAuthProfile(current).then(()=>current);

        const provider=new F.GoogleAuthProvider();
        provider.setCustomParameters({prompt:"select_account"});

        let pending;
        if(current&&current.isAnonymous&&typeof F.linkWithPopup==="function"){
            pending=F.linkWithPopup(current,provider).catch(err=>{
                // This Google account already belongs to a player (signed in
                // before on another device or before the browser data was
                // cleared): sign in to it with the credential the popup just
                // returned. A second popup here would be blocked, as it is no
                // longer opened by the click.
                const code=String(err?.code||"");
                if(code!=="auth/credential-already-in-use"&&code!=="auth/email-already-in-use")throw err;
                const credential=
                    typeof F.GoogleAuthProvider.credentialFromError==="function"?
                        F.GoogleAuthProvider.credentialFromError(err):null;
                if(!credential||typeof F.signInWithCredential!=="function")throw err;
                return F.signInWithCredential(this.auth,credential);
            });
        }else{
            pending=F.signInWithPopup(this.auth,provider);
        }

        return pending.then(async result=>{
            const user=result?.user||this.auth.currentUser;
            await this._syncAuthProfile(user);
            return user;
        });
    };

    window.__sixBallGoogleAuthVersion=
        "google-auth-v2";
})();
