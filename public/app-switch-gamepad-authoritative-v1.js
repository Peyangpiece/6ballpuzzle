(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallSwitchGamepadAuthoritativeV1
    ){
        return;
    }

    window.__sixBallSwitchGamepadAuthoritativeV1=true;

    const DEADZONE=0.25;
    const DROP_THRESHOLD=0.72;
    const MOVE_SPEED=11.5;

    const state={
        index:null,
        id:"",
        connected:false,
        buttons:[],
        wasUp:false,
        wasDown:false,
        lastTime:performance.now(),
        lastAction:"",
        lastActionAt:0
    };

    function player(){

        const list=
            window.__hexEnginesV7||[];

        for(let i=list.length-1;i>=0;i--){

            const g=list[i];

            if(
                g &&
                g.state==="PLAYING" &&
                g.piece &&
                !g.ai
            ){
                return g;
            }
        }

        return null;
    }

    function validGame(g){
        return !!(
            g &&
            g.state==="PLAYING" &&
            g.piece &&
            !g.ai
        );
    }

    function gamepads(){

        try{
            return Array.from(
                navigator.getGamepads?.()||[]
            ).filter(Boolean);
        }catch(_){
            return [];
        }
    }

    function choosePad(){

        const list=gamepads();

        if(!list.length){
            state.index=null;
            state.connected=false;
            state.id="";
            return null;
        }

        if(state.index!==null){

            const current=
                list.find(
                    p=>p.index===state.index
                );

            if(current){
                return current;
            }
        }

        const nintendo=
            list.find(
                p=>
                    /nintendo|switch|joy[\s-]?con|pro controller/i
                    .test(String(p.id||""))
            );

        const gp=nintendo||list[0];

        state.index=gp.index;
        state.id=String(gp.id||"");
        state.connected=true;
        state.buttons=[];

        window.__sixBallLastGamepad={
            index:gp.index,
            id:state.id,
            mapping:gp.mapping||"",
            buttons:gp.buttons?.length||0,
            axes:gp.axes?.length||0,
            at:Date.now()
        };

        return gp;
    }

    function button(gp,index){

        const b=gp?.buttons?.[index];

        return !!(
            b &&
            (
                b.pressed ||
                Number(b.value)>0.55
            )
        );
    }

    function justPressed(gp,index){

        return(
            button(gp,index) &&
            !state.buttons[index]
        );
    }

    function saveButtons(gp){

        state.buttons=
            Array.from(
                {
                    length:
                        gp?.buttons?.length||0
                },
                (_,i)=>button(gp,i)
            );
    }

    function axis(gp,index){

        const n=Number(
            gp?.axes?.[index]
        );

        return Number.isFinite(n)
            ? n
            : 0;
    }

    function stickX(gp){

        const x=axis(gp,0);

        if(Math.abs(x)<DEADZONE){
            return 0;
        }

        return x;
    }

    function stickY(gp){

        const y=axis(gp,1);

        if(Math.abs(y)<DEADZONE){
            return 0;
        }

        return y;
    }

    function currentX(g){

        if(Number.isFinite(g?.freeX)){
            return g.freeX;
        }

        if(Number.isFinite(g?.pieceVX)){
            return g.pieceVX;
        }

        if(Number.isFinite(g?.piece?.x)){
            return g.piece.x;
        }

        return typeof SPAWN_X!=="undefined"
            ? SPAWN_X
            : 0;
    }

    function moveHorizontal(g,value,dt){

        if(
            !validGame(g) ||
            typeof setFreeX!=="function"
        ){
            return;
        }

        const magnitude=
            Math.min(
                1,
                (
                    Math.abs(value)-DEADZONE
                )/
                (1-DEADZONE)
            );

        const dx=
            Math.sign(value)*
            magnitude*
            MOVE_SPEED*
            dt;

        g.dragging=true;

        setFreeX(
            g,
            currentX(g)+dx
        );

        state.lastAction="stick-horizontal";
        state.lastActionAt=Date.now();
    }

    function releaseHorizontal(g){

        if(!g?.dragging){
            return;
        }

        if(
            g.piece &&
            Number.isFinite(g.freeX)
        ){
            g.pieceVX=g.freeX;
        }

        g.dragging=false;
    }

    function rotateCW(g){

        if(
            !validGame(g) ||
            typeof rotate!=="function"
        ){
            return;
        }

        rotate(g,1);

        try{
            window.__sixBallPlayRotateDirect?.(1);
        }catch(_){}

        state.lastAction="X-clockwise";
        state.lastActionAt=Date.now();
    }

    function rotateCCW(g){

        if(
            !validGame(g) ||
            typeof rotate!=="function"
        ){
            return;
        }

        rotate(g,-1);

        try{
            window.__sixBallPlayRotateDirect?.(1);
        }catch(_){}

        state.lastAction="A-counterclockwise";
        state.lastActionAt=Date.now();
    }

    function instantDrop(g,source){

        if(!validGame(g)){
            return;
        }

        g.fastForward=false;

        if(
            typeof window.__hexInstantDropV7===
            "function"
        ){
            window.__hexInstantDropV7(g);

        }else if(
            typeof hardDrop==="function"
        ){
            hardDrop(g);
        }

        state.lastAction=source;
        state.lastActionAt=Date.now();
    }

    function setFastFall(g,on){

        if(!g){
            return;
        }

        const next=!!on;

        if(
            next &&
            !g.fastForward
        ){
            try{
                if(typeof emit==="function"){
                    emit(g,{t:"fast"});
                }
            }catch(_){}
        }

        g.fastForward=next;

        if(next){
            state.lastAction="stick-down-fast";
            state.lastActionAt=Date.now();
        }
    }

    function resetInput(){

        const g=player();

        if(g){
            setFastFall(g,false);
            releaseHorizontal(g);
        }

        state.wasUp=false;
        state.wasDown=false;
        state.buttons=[];
    }

    function update(gp,dt){

        const g=player();

        if(!validGame(g)){
            saveButtons(gp);
            return;
        }

        const x=stickX(gp);
        const y=stickY(gp);

        const dpadLeft=
            button(gp,14);

        const dpadRight=
            button(gp,15);

        let horizontal=x;

        if(dpadLeft && !dpadRight){
            horizontal=-1;
        }else if(dpadRight && !dpadLeft){
            horizontal=1;
        }

        if(horizontal!==0){
            moveHorizontal(
                g,
                horizontal,
                dt
            );
        }else{
            releaseHorizontal(g);
        }

        /*
         * Controller mapping confirmed on the actual device:
         *
         * A = button 0
         * B = button 1
         * X = button 2
         * Y = button 3
         *
         * D-pad:
         * UP    = 12
         * DOWN  = 13
         * LEFT  = 14
         * RIGHT = 15
         */

        if(justPressed(gp,2)){
            rotateCW(g);
        }

        if(justPressed(gp,0)){
            rotateCCW(g);
        }

        if(justPressed(gp,3)){
            instantDrop(
                g,
                "Y-instant-drop"
            );
        }

        if(justPressed(gp,12)){
            instantDrop(
                g,
                "dpad-up-instant-drop"
            );
        }

        const up=
            y < -DROP_THRESHOLD;

        if(
            up &&
            !state.wasUp
        ){
            instantDrop(
                g,
                "stick-up-instant-drop"
            );
        }

        state.wasUp=up;

        const down=
            (
                y > DROP_THRESHOLD ||
                button(gp,13)
            );

        if(down!==state.wasDown){
            setFastFall(g,down);
        }

        state.wasDown=down;

        saveButtons(gp);
    }

    let __sixBallGamepadRafPendingV12=false;
    let __sixBallGamepadIdleTimerV12=null;


    function scheduleActiveGamepadPollV12(){

        if(
            __sixBallGamepadRafPendingV12
        ){
            return;
        }

        __sixBallGamepadRafPendingV12=true;

        requestAnimationFrame(
            frame
        );
    }


    function scheduleIdleGamepadPollV12(){

        if(
            __sixBallGamepadIdleTimerV12!==null ||
            __sixBallGamepadRafPendingV12
        ){
            return;
        }

        __sixBallGamepadIdleTimerV12=
            setTimeout(
                ()=>{

                    __sixBallGamepadIdleTimerV12=null;

                    scheduleActiveGamepadPollV12();

                },
                400
            );
    }


    function frame(now){

        __sixBallGamepadRafPendingV12=false;

        const gp=
            choosePad();

        const dt=
            Math.min(
                0.05,
                Math.max(
                    0,
                    (
                        now-
                        state.lastTime
                    )/1000
                )
            );

        state.lastTime=now;

        if(gp){

            update(
                gp,
                dt
            );

            /*
             * Controller connected:
             * full frame-rate input polling.
             */
            scheduleActiveGamepadPollV12();

        }else{

            /*
             * No controller:
             * stop the permanent RAF loop.
             *
             * Safari fallback detection runs only 2.5 times/sec.
             */
            scheduleIdleGamepadPollV12();
        }
    }

    window.addEventListener(
        "gamepadconnected",
        e=>{

            state.index=e.gamepad.index;
            state.id=String(
                e.gamepad.id||""
            );
            state.connected=true;
            state.buttons=[];

            window.__sixBallLastGamepad={
                index:e.gamepad.index,
                id:state.id,
                mapping:e.gamepad.mapping||"",
                buttons:
                    e.gamepad.buttons?.length||0,
                axes:
                    e.gamepad.axes?.length||0,
                at:Date.now()
            };
        }
    );

    window.addEventListener(
        "gamepaddisconnected",
        e=>{

            if(
                state.index===
                e.gamepad.index
            ){
                resetInput();

                state.index=null;
                state.id="";
                state.connected=false;
            }
        }
    );

    window.addEventListener(
        "blur",
        resetInput,
        true
    );

    document.addEventListener(
        "visibilitychange",
        ()=>{
            if(document.hidden){
                resetInput();
            }
        },
        true
    );

    window.__sixBallGamepadVersion=
        "switch-gamepad-authoritative-v1.2-performance";

    window.__sixBallGamepadXBAndDpadV11=
        true;

    window.__sixBallGamepadState=
        state;

    window.__sixBallGamepadIdlePollingV12=
        true;

    window.__sixBallGamepadDisconnectedPollInterval=
        400;

    window.__sixBallGamepadControls={
        X:"clockwise",
        A:"counterclockwise",
        Y:"instant drop",
        B:"unused",
        stickUp:"instant drop",
        stickLeftRight:"horizontal movement",
        stickDown:"fast fall while held",
        dpadUp:"instant drop",
        dpadLeftRight:"horizontal movement",
        dpadDown:"fast fall while held"
    };

    window.__sixBallGamepadSupported=
        typeof navigator!=="undefined" &&
        typeof navigator.getGamepads==="function";

    scheduleIdleGamepadPollV12();

})();
