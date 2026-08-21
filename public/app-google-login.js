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

            this.profile={
                ...previous,
                name
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
                {
                    name:
                        this.profile.name,
                    rating:
                        Number(
                            this.profile.rating
                        )||1000
                }
            ).catch(()=>{});
        }

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

    Net.loginWithGoogle=async function(){
        const F=
            await this._ensureFirebase();

        const provider=
            new F.GoogleAuthProvider();

        provider.setCustomParameters({
            prompt:"select_account"
        });

        let current=
            this.auth.currentUser;

        if(!current){
            current=
                await this._restoredAuthUser();
        }

        let result;

        if(
            current &&
            !current.isAnonymous
        ){
            await this._syncAuthProfile(
                current
            );

            return current;
        }

        if(
            current &&
            current.isAnonymous &&
            typeof F.linkWithPopup===
                "function"
        ){
            try{
                result=
                    await F.linkWithPopup(
                        current,
                        provider
                    );
            }catch(err){
                const code=
                    String(
                        err?.code||""
                    );

                if(
                    code===
                        "auth/credential-already-in-use" ||
                    code===
                        "auth/email-already-in-use"
                ){
                    result=
                        await F.signInWithPopup(
                            this.auth,
                            provider
                        );
                }else{
                    throw err;
                }
            }
        }else{
            result=
                await F.signInWithPopup(
                    this.auth,
                    provider
                );
        }

        const user=
            result?.user||
            this.auth.currentUser;

        await this._syncAuthProfile(
            user
        );

        return user;
    };

    window.__sixBallGoogleAuthVersion=
        "google-auth-v1";
})();
