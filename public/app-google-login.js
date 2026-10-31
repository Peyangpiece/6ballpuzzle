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

    Net._syncAuthProfile=async function(user){
        if(!user)return null;

        const F=
            await this._ensureFirebase();

        const previous={
            ...this.profile
        };

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
                ...this.profile,
                ...snap.val()
            };
        }else{
            let name=
                previous.name||
                "Player";

            if(
                (
                    !name ||
                    name==="Player"
                ) &&
                user.displayName
            ){
                name=
                    String(
                        user.displayName
                    ).slice(0,12);
            }

            // The rules accept a new record only with the starting rating and
            // record, whatever the guest account had locally.
            this.profile={
                name,
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

        if(
            !user.isAnonymous &&
            (
                !this.profile.name ||
                this.profile.name==="Player"
            ) &&
            user.displayName
        ){
            this.profile.name=
                String(
                    user.displayName
                ).slice(0,12);

            await F.update(
                userRef,
                {
                    name:
                        this.profile.name,
                    updatedAt:
                        F.serverTimestamp()
                }
            ).catch(()=>{});
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
