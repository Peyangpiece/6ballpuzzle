// Online: never trust the opponent's attack payload blindly.  A packet can
// carry at most one full board of garbage; shapes must be known techniques.
const ATTACK_MAX_BALLS = 120;
function sanitizeAttackCount(n) { n = Number(n); if (!Number.isFinite(n) || n < 0) return 0; return Math.min(ATTACK_MAX_BALLS, Math.floor(n)); }
function sanitizeAttackShapes(shapes) { if (!Array.isArray(shapes)) return []; const out = []; for (const w of shapes) { if (typeof w === "string" && WAZA[w] && out.length < 8) out.push(w); } return out; }
function App() {
var _a, _b, _c, _d, _e, _f, _g, _h;
const [screen, setScreen] = useState("HOME");
const prefsRef = useRef(null);if(!prefsRef.current)prefsRef.current=hexLoadMenuPrefs();const prefs=prefsRef.current;
const [rating, setRating] = useState(()=>hexReadStoredNumber("hexdrop_rating",1000));
const [record, setRecord] = useState(()=>({w:hexReadStoredNumber("hexdrop_wins",0),l:hexReadStoredNumber("hexdrop_losses",0)}));
const [nickname, setNickname] = useState(prefs.nickname);
const [profileDraft, setProfileDraft] = useState(prefs.nickname);
const [bgmVolume, setBgmVolume] = useState(prefs.bgmVolume);
const [sfxVolume, setSfxVolume] = useState(prefs.sfxVolume);
const [haptics, setHaptics] = useState(prefs.haptics);
const [offset, setOffset] = useState(prefs.offset);
const [mode, setMode] = useState(null);
const [aiLevel, setAiLevel] = useState(1);
const [opp, setOpp] = useState(null);
const [room, setRoom] = useState("");
const [result, setResult] = useState(null);
const [portrait, setPortrait] = useState(false);
const [, force] = useState(0);
const meRef = useRef(null), foeRef = useRef(null), cvRef = useRef(null);
if(typeof window!=="undefined"){
    window.__sixBallDebugRefs=
        window.__sixBallDebugRefs||{};

    window.__sixBallDebugRefs.meRef=
        meRef;

    window.__sixBallDebugRefs.foeRef=
        foeRef;
}

const orbsRef = useRef([]), runRef = useRef(false), dropFlashRef = useRef(0);
const matchRef = useRef(null), reportedRef = useRef(false);
const sizeRef = useRef({ scale: 0, dpr: 1, rect: null });
const [netErr, setNetErr] = useState(null);
const [googleUser,setGoogleUser]=useState(null);
const [googleBusy,setGoogleBusy]=useState(false);
const [googleErr,setGoogleErr]=useState("");
const [foeConn, setFoeConn] = useState(true);
const [roomErr, setRoomErr] = useState("");
const [shortHome, setShortHome] = useState(() => typeof window !== "undefined" && window.innerHeight < 500);
const [tutorialDone, setTutorialDone] = useState(() => hexReadStored("hexdrop_tutorial_done", "0") === "1");
const [pauseOpen, setPauseOpen] = useState(false);
const pausedRef = useRef(false);
const matchKindRef = useRef("RANKED");
const matchGenRef = useRef(0);
// Playable tutorial: {lesson, tracker, status, message} while a lesson runs.
const tutorialRef = useRef(null);
const [tut, setTut] = useState(null);
const [colorSymbols, setColorSymbols] = useState(()=>hexReadStored("hexdrop_color_symbols","0")==="1");
useEffect(() => {window.__sixBallColorSymbols = colorSymbols;hexStoreMenuPref("hexdrop_color_symbols",colorSymbols?"1":"0");}, [colorSymbols]);
// Offline matches freeze while the pause menu is open; an online match keeps
// running because the opponent's clock cannot be stopped.
useEffect(() => {pausedRef.current = pauseOpen && !matchRef.current;window.__sixBallPaused = pausedRef.current;const g = meRef.current;if (pausedRef.current && g) g.fastForward = false;}, [pauseOpen]);
useEffect(() => {window.__sixBallScreen = screen;if (screen !== "GAME") setPauseOpen(false);}, [screen]);
useEffect(() => {const onHide = () => {if (document.hidden && stateRef.current.screen === "GAME" && !matchRef.current && runRef.current) setPauseOpen(true);};document.addEventListener("visibilitychange", onHide);return () => document.removeEventListener("visibilitychange", onHide);}, []);
const stateRef = useRef({ mode, opp, rating, nickname, screen });stateRef.current = { mode, opp, rating, nickname, screen };
const optRef = useRef({ offset });optRef.current = { offset };
const initUiAudio=useCallback(()=>{Sfx.init();hexApplySfxVolume(sfxVolume);},[sfxVolume]);
const saveProfile=useCallback(()=>{const next=(profileDraft||"").trim().slice(0,12)||"Player";setNickname(next);setProfileDraft(next);Sfx.init();hexApplySfxVolume(sfxVolume);Sfx.play({t:"move"},.7);},[profileDraft,sfxVolume]);
useEffect(() => {hexApplySfxVolume(sfxVolume);hexStoreMenuPref("hexdrop_sfx_volume",sfxVolume);}, [sfxVolume]);
useEffect(() => {hexStoreMenuPref("hexdrop_bgm_volume",bgmVolume);window.__hexBgmVolume=bgmVolume/100;if(window.Bgm&&typeof window.Bgm.setVolume==="function")window.Bgm.setVolume(bgmVolume/100);}, [bgmVolume]);
useEffect(() => {Sfx.haptics = haptics;hexStoreMenuPref("hexdrop_haptics",haptics?"1":"0");}, [haptics]);
useEffect(() => {hexStoreMenuPref("hexdrop_offset",offset?"1":"0");}, [offset]);
useEffect(() => {hexStoreMenuPref("hexdrop_nickname",nickname);Net.profile.name=nickname;if(Net.fb&&Net.uid){const F=Net.fb;F.update(F.ref(Net.db,"users/"+Net.uid),{name:nickname,updatedAt:F.serverTimestamp()}).catch(()=>{});F.set(F.ref(Net.db,"leaderboard/"+Net.uid),{name:nickname,rating:Net.profile.rating||rating}).catch(()=>{});}}, [nickname]);
useEffect(() => {if(screen!=="PROFILE")return;let alive=true;(async()=>{try{await Net.connect();if(!alive)return;setRating(Number(Net.profile.rating)||1000);setRecord({w:Number(Net.profile.wins)||0,l:Number(Net.profile.losses)||0});hexStoreMenuPref("hexdrop_rating",Number(Net.profile.rating)||1000);hexStoreMenuPref("hexdrop_wins",Number(Net.profile.wins)||0);hexStoreMenuPref("hexdrop_losses",Number(Net.profile.losses)||0);if((nickname==="Player"||!nickname)&&Net.profile.name&&Net.profile.name!=="Player"){setNickname(String(Net.profile.name).slice(0,12));setProfileDraft(String(Net.profile.name).slice(0,12));}else if(Net.profile.name!==nickname){Net.profile.name=nickname;const F=Net.fb;F.update(F.ref(Net.db,"users/"+Net.uid),{name:nickname,updatedAt:F.serverTimestamp()}).catch(()=>{});}}catch(_){}})();return()=>{alive=false;};},[screen]);
useEffect(() => {const cv = cvRef.current;if (!cv)return;const measure = () => {const r = cv.getBoundingClientRect();sizeRef.current = {scale: r.width > 0 ? r.width / VW : 0,dpr: Math.min(2, window.devicePixelRatio || 1),rect: r};};measure();const ro = new ResizeObserver(measure);ro.observe(cv);window.addEventListener("orientationchange", measure);window.addEventListener("scroll", measure, { passive: true });return () => { ro.disconnect(); window.removeEventListener("orientationchange", measure); window.removeEventListener("scroll", measure); };}, []);
useEffect(() => {const check = () => {setPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 900);setShortHome(window.innerHeight < 500);};check();window.addEventListener("resize", check);window.addEventListener("orientationchange", check);return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };}, []);
useEffect(()=>{
    let alive=true;

    if(
        typeof Net.restoreGoogleUser!=="function"
    )return()=>{alive=false;};

    Net.restoreGoogleUser()
    .then(user=>{
        if(!alive||!user)return;

        setGoogleUser({
            name:
                user.displayName||
                Net.profile.name||
                "Google"
        });

        setRating(
            Number(Net.profile.rating)||1000
        );

        setRecord({
            w:Number(Net.profile.wins)||0,
            l:Number(Net.profile.losses)||0
        });

        if(Net.profile.name){
            setNickname(Net.profile.name);
            setProfileDraft(Net.profile.name);
        }
    })
    .catch(()=>{});

    return()=>{
        alive=false;
    };
},[]);

const startMatch = useCallback((m, lv, o) => {matchGenRef.current++;tutorialRef.current = null;setTut(null);Sfx.init();hexApplySfxVolume(sfxVolume);const seed = (Math.random() * 1e9) | 0;meRef.current = createEngine(seed, { offset: optRef.current.offset });foeRef.current = createEngine(seed, { offset: optRef.current.offset });foeRef.current.ai = { level: lv, target: null, thinkT: 0, actT: 0 };if (matchRef.current) {matchRef.current.leave();matchRef.current = null;}orbsRef.current = [];reportedRef.current = false;matchKindRef.current = m;setPauseOpen(false);setMode(m);setAiLevel(lv);setOpp(o);setResult(null);setScreen("GAME");runRef.current = true;}, [sfxVolume]);
const startTutorial = useCallback((lesson) => {matchGenRef.current++;Sfx.init();hexApplySfxVolume(sfxVolume);const seed = (Math.random() * 1e9) | 0;const me = createEngine(seed, { offset: false });const foe = createEngine(seed, { offset: false });foe.ai = null;hexTutorialSetupEngine(me, lesson);meRef.current = me;foeRef.current = foe;if (matchRef.current) {matchRef.current.leave();matchRef.current = null;}orbsRef.current = [];reportedRef.current = false;const t = { lesson, tracker: hexTutorialTracker(), status: "play", message: "" };tutorialRef.current = t;setTut({ ...t, tracker: { ...t.tracker } });matchKindRef.current = "TUTORIAL";setPauseOpen(false);setMode("TUTORIAL");setAiLevel(0);setOpp({ name: "チュートリアル" });setResult(null);setScreen("GAME");runRef.current = true;}, [sfxVolume]);
const finish = useCallback((win, reason = "") => {const gen = matchGenRef.current;const me=meRef.current,foe=foeRef.current;if(win&&me)me.matchFrozen=true;if(!win&&foe)foe.matchFrozen=true;Sfx.play({ t: win ? "win" : "lose" }, 1);const { mode: m, opp: o, rating: r } = stateRef.current;const match = matchRef.current;setTimeout(async () => {if (m === "ONLINE" && match) {let delta=0;try{delta=await Net.applyRating(win,match.opponent?.rating||r,match.ranked,match.matchId);const nr=Number(Net.profile.rating)||r,nw=Number(Net.profile.wins)||0,nl=Number(Net.profile.losses)||0;setRating(nr);setRecord({w:nw,l:nl});hexStoreMenuPref("hexdrop_rating",nr);hexStoreMenuPref("hexdrop_wins",nw);hexStoreMenuPref("hexdrop_losses",nl);}catch(_){}setResult({ win, delta, reason, ranked: match.ranked !== false, online: true, rating: Number(Net.profile.rating) || r });match.leave();if (matchRef.current === match) matchRef.current = null;} else if (m === "ONLINE") {setResult({ win, delta: 0, reason, online: true });} else setResult({ win, delta: 0, reason });if (stateRef.current.screen === "GAME" && matchGenRef.current === gen) setScreen("RESULT");}, RESULT_REVEAL_DELAY_MS);}, []);
const beginOnline = useCallback((match, kind = "RANKED") => {matchGenRef.current++;tutorialRef.current = null;setTut(null);matchKindRef.current = kind;setPauseOpen(false);setRoomErr("");Sfx.init();hexApplySfxVolume(sfxVolume);setRating(Number(Net.profile.rating)||rating);setRecord({w:Number(Net.profile.wins)||0,l:Number(Net.profile.losses)||0});const seed = match.seed >>> 0;meRef.current = createEngine(seed, { offset: optRef.current.offset });const foe = createEngine(seed, { offset: optRef.current.offset });foe.ai = null;foe.piece = null;foe.state = "NET";foeRef.current = foe;orbsRef.current = [];reportedRef.current = false;matchRef.current = match;setFoeConn(true);match.events.onOpponentState = (st) => {const g = foeRef.current;if (!g)return;applySnapshot(g,st.board,st.fx);g.incoming = st.incoming || 0;applyRemoteVisualState(g,st);if(st.alive===false&&g.alive)die(g,null,"REMOTE");};match.events.onAttack = (atk) => {const n = sanitizeAttackCount(typeof atk === "number" ? atk : ((atk === null || atk === void 0 ? void 0 : atk.n) || 0));const shapes = sanitizeAttackShapes(atk === null || atk === void 0 ? void 0 : atk.shapes);if (n <= 0 && !shapes.length) return;orbsRef.current.push({ side: 1, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });};match.events.onConnection = (c) => setFoeConn(c);match.events.onFinish = (win, reason) => { runRef.current = false; finish(win, reason); };setMode("ONLINE");setAiLevel(0);setOpp({ name: match.opponent.name, rating: match.opponent.rating });setResult(null);setScreen("GAME");runRef.current = true;}, [finish,sfxVolume,rating]);
useEffect(() => {
let raf, last = performance.now(), acc = 0, hud = 0, T = 0, netT = 0, lastNetState = "";const FIXED = PHYSICS_FRAME;
const drain = (g, vol) => { for (const e of g.events) Sfx.play(e, vol); g.events.length = 0; };
const loop = (now) => {
raf = requestAnimationFrame(loop);let dt = (now - last) / 1000;last = now;if (dt > 0.1)dt = 0.1;T += dt;dropFlashRef.current = Math.max(0, dropFlashRef.current - dt * 4);
const me = meRef.current, foe = foeRef.current, cv = cvRef.current;if (!me || !foe || !cv)return;const net = matchRef.current;
const advance = (h) => {me.fastForwardCarry = 0;stepEngine(me, h);if (net) stepNetView(foe, h); else if (!tutorialRef.current) stepEngine(foe, h);
if (net) {if (me.sendBuffer > 0 || me.sendShapes.length > 0) {const n = me.sendBuffer, shapes = me.sendShapes.splice(0);me.sendBuffer = 0;net.sendAttack(n, shapes);orbsRef.current.push({ side: 0, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });}foe.sendBuffer = 0;foe.sendShapes.length = 0;} else {[me, foe].forEach((g, i) => {if (g.sendBuffer > 0 || g.sendShapes.length > 0) {const n = g.sendBuffer, shapes = g.sendShapes.splice(0);orbsRef.current.push({ side: i, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });g.sendBuffer = 0;}});}
orbsRef.current = orbsRef.current.filter((o) => {o.t += h;if (o.t >= o.dur) {const tgt = o.side === 0 ? foe : me;if (!(net && o.side === 0)) {if (o.shapes && o.shapes.length)tgt.incomingShapes.push(...o.shapes.filter((w) => WAZA[w]));else tgt.incoming += o.n;}tgt.fx.incomingPreviews=tgt.fx.incomingPreviews||[];tgt.fx.incomingPreviews.push({shapes:(o.shapes||[]).slice(0,6),n:o.n||0,tint:o.tint,life:3.05,max:3.05});tgt.fx.shake = Math.max(tgt.fx.shake, 0.55);return false;}return true;});};
if (pausedRef.current) acc = 0;
else if (runRef.current) {acc += dt;let guard = 0;while (acc >= FIXED && guard++ < MAX_PHYSICS_CATCHUP_STEPS) {advance(FIXED);acc -= FIXED;if (tutorialRef.current) {if (!me.alive) {runRef.current = false;const t = tutorialRef.current;t.status = "retry";t.message = "あふれてしまいました。もう一度やってみよう。";setTut({ ...t, tracker: { ...t.tracker } });setTimeout(() => { if (tutorialRef.current === t) startTutorial(t.lesson); }, 1400);break;}} else if (!net) {if (!me.alive || !foe.alive) {runRef.current = false;finish(me.alive && !foe.alive);break;}} else if (!me.alive) break;}if(acc>=FIXED)acc=Math.min(acc,FIXED);} else advance(dt);
{const t = tutorialRef.current;if (t && t.status === "play") {const r = hexTutorialObserve(me, t.lesson, t.tracker);if (r === "success") {t.status = "success";t.message = t.lesson === HEX_TUTORIAL_LESSONS.length - 1 ? "チュートリアル完了！これで対戦の準備はばっちりです。" : "できました！";try { localStorage.setItem("hexdrop_tutorial_done", "1"); } catch (_) {}if (t.lesson === HEX_TUTORIAL_LESSONS.length - 1) setTutorialDone(true);setTut({ ...t, tracker: { ...t.tracker } });} else if (r && r.startsWith("retry")) {t.status = "retry";t.message = r.slice(6);setTut({ ...t, tracker: { ...t.tracker } });setTimeout(() => { if (tutorialRef.current === t) startTutorial(t.lesson); }, 1600);} else if (JSON.stringify(t.tracker) !== t._sig) {t._sig = JSON.stringify(t.tracker);setTut({ ...t, tracker: { ...t.tracker } });}}}
drain(me, 1);drain(foe, 0.32);
if (net) {netT += dt;if (netT >= 0.066) {netT = 0;const snap=snapshotOf(me),piece=pieceSnapshotOf(me),fx=remoteFxSnapshotOf(me),sig=snap+"|"+pendingIncomingCount(me)+"|"+me.alive+"|"+JSON.stringify(piece)+"|"+JSON.stringify(fx);if(sig!==lastNetState){lastNetState=sig;net.sendBoard(snap,pendingIncomingCount(me),me.alive,piece,fx);}}if (!me.alive && !reportedRef.current) {reportedRef.current = true;net.reportResult(false, "dead");}}
const renderLead=runRef.current?Math.min(FIXED,Math.max(0,acc)):0;
const scale = sizeRef.current.scale;if (scale <= 0)return;const dpr = sizeRef.current.dpr;const w = Math.round(VW * scale * dpr), h = Math.round(VH * scale * dpr);if (cv.width !== w || cv.height !== h) {cv.width = w;cv.height = h;}const ctx = cv.getContext("2d");ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);renderScene(ctx, me, foe, orbsRef.current, T, {me: stateRef.current.nickname||"Player", meSub: net && stateRef.current.rating ? `${stateRef.current.rating}` : "",foe: stateRef.current.opp?.name ?? "CPU",foeSub: net && stateRef.current.opp?.rating ? `${stateRef.current.opp.rating}` : ""}, dropFlashRef.current, 0,renderLead);hud += dt;if (hud > 0.2) {hud = 0;force((x) => x + 1);}
};raf = requestAnimationFrame(loop);return () => cancelAnimationFrame(raf);}, [finish]);
useEffect(() => {const typing = (e) => {const t = e.target;return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);};
const softDrop = (g, on) => {if (on) {if (g.state !== "PLAYING" || !g.piece) return;if (!g.fastForward) emit(g, { t: "fast" });g.fastForward = true;} else g.fastForward = false;};
const dn = (e) => {if (typing(e)) return;const g = meRef.current;if (!g || screen !== "GAME")return;
if (e.key === "Escape" || e.key === "p" || e.key === "P") {e.preventDefault();if (!e.repeat) setPauseOpen((v) => !v);return;}
if (pausedRef.current || pauseOpen) return;
if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key))e.preventDefault();if (e.key === "ArrowDown") { softDrop(g, true); return; }if (e.repeat && e.key !== "ArrowLeft" && e.key !== "ArrowRight")return;if (e.key === "ArrowLeft") { move(g, -1); }else if (e.key === "ArrowRight") { move(g, 1); }else if (e.key === "ArrowUp" || e.key === " ") {dropFlashRef.current = 1;hardDrop(g);}else if (e.key === "z" || e.key === "Z") { rotate(g, -1); }else if (e.key === "x" || e.key === "X") { rotate(g, 1); }};
const up = (e) => {const g = meRef.current;if (g && e.key === "ArrowDown") softDrop(g, false);};window.addEventListener("keydown", dn);window.addEventListener("keyup", up);return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };}, [screen, pauseOpen]);
useEffect(() => {if(window.__hexControlsV7Installed)return;const cv = cvRef.current;if (!cv) return;let dragging=false, startVX=0, moved=false, t0=0, downV=null;let pressActive=false, longActive=false, longTimer=null, bottomPress=false, fastEligible=false;const toVirtual = (e) => {const r=sizeRef.current.rect || cv.getBoundingClientRect();return [(e.clientX-r.left)/r.width*VW, (e.clientY-r.top)/r.height*VH];};const remeasure=()=>{const r=cv.getBoundingClientRect();sizeRef.current={...sizeRef.current,rect:r,scale:r.width>0?r.width/VW:0};};const stopFast=()=>{const g=meRef.current;if (g) g.fastForward=false;longActive=false;if (longTimer) { clearTimeout(longTimer); longTimer=null; }};
const dn=(e)=>{Sfx.init();hexApplySfxVolume(sfxVolume); remeasure();const g=meRef.current; if(!g) return;const v=toVirtual(e); downV=v;pressActive=true; longActive=false; bottomPress=v[1]>=DROP_ZONE_Y; fastEligible=v[1]>=VH*0.5;t0=performance.now(); moved=false;try{cv.setPointerCapture(e.pointerId);}catch(err){}if(longTimer) clearTimeout(longTimer);if(fastEligible) longTimer=setTimeout(()=>{const gg=meRef.current;if(!pressActive || !fastEligible || !gg || gg.state!=="PLAYING" || !gg.piece) return;longActive=true;if (!gg.fastForward) { emit(gg, { t: "fast" }); }gg.fastForward=true;},LONG_PRESS_MS);if(!bottomPress){dragging=true;startVX=v[0];const startCol=g.piece?g.pieceVX:SPAWN_X;if(g.piece){g.dragging=true;g.freeX=g.pieceVX;}cv._hexStartCol=startCol;} else {dragging=false; g.dragging=false;}};
const mv=(e)=>{const g=meRef.current;if(!g || !dragging || !g.piece) return;const v=toVirtual(e), dx=v[0]-startVX;if(Math.abs(dx)>6 && !moved){ moved=true; }setFreeX(g,(cv._hexStartCol??g.pieceVX)+(dx/ME.D)*2);};
const up=(e)=>{const g=meRef.current;try{cv.releasePointerCapture(e.pointerId);}catch(err){}const wasLong=longActive;pressActive=false;stopFast();if(bottomPress){if(!wasLong && g && g.state==="PLAYING" && g.piece){dropFlashRef.current=1; hardDrop(g);}bottomPress=false; fastEligible=false; dragging=false;return;}bottomPress=false; fastEligible=false;if(!g || !dragging){dragging=false;return;}dragging=false; g.dragging=false;const elapsed=performance.now()-t0;if(!wasLong && !moved && elapsed<350 && g.piece && downV){const px=ME.X+ME.D/2+(g.pieceVX+1)*ME.D*0.5;rotate(g,downV[0]>=px?1:-1);}};
cv.addEventListener("pointerdown",dn);cv.addEventListener("pointermove",mv);cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);return()=>{pressActive=false; stopFast();cv.removeEventListener("pointerdown",dn);cv.removeEventListener("pointermove",mv);cv.removeEventListener("pointerup",up);cv.removeEventListener("pointercancel",up);};}, [screen,sfxVolume]);
const me = meRef.current;
const rankName=hexRankLabel(rating),winRate=hexWinRate(record.w,record.l);
const homeWordmark=React.createElement(
    "div",
    {
        "aria-hidden":"true",
        style:{
            "--logoH":"clamp(225px,39vh,320px)",
            position:"absolute",
            left:"clamp(30px,4vw,64px)",
            top:"50%",
            transform:"translateY(-57%)",
            display:"flex",
            alignItems:"center",
            height:"var(--logoH)",
            pointerEvents:"none",
            whiteSpace:"nowrap",
            zIndex:0
        }
    },

    React.createElement(
        "img",
        {
            src:"/assets/6ball-logo-transparent.png",
            alt:"",
            draggable:false,
            style:{
                height:"var(--logoH)",
                width:"auto",
                objectFit:"contain",
                flexShrink:0,
                filter:
                    "saturate(1.08) contrast(1.03) brightness(1.04) drop-shadow(0 18px 28px rgba(0,0,0,.30))"
            }
        }
    ),

    /*
     * BALL is a fixed part of the logo.
     * Its position never follows the menu buttons.
     */
    React.createElement(
        "svg",
        {
            viewBox:"0 0 760 300",
            preserveAspectRatio:"none",
            style:{
                width:"calc(var(--logoH) * 2.45)",
                height:"var(--logoH)",
                marginLeft:"clamp(24px,2.8vw,46px)",
                overflow:"visible"
            }
        },

        React.createElement(
            "text",
            {
                x:"8",
                y:"246",
                fill:"rgba(205,210,220,.20)",
                fontFamily:
                    'ui-sans-serif,system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif',
                fontSize:"255",
                fontWeight:"900",
                letterSpacing:"22"
            },
            "BALL"
        )
    )
);

const homeHero=React.createElement(
    "div",
    {
        className:"relative flex items-end",
        style:{
            minHeight:"clamp(330px,57vh,420px)",
            paddingLeft:"clamp(18px,3vw,42px)",
            paddingBottom:8,
            zIndex:2
        }
    },

    React.createElement(
        "button",
        {
            onClick:()=>{
                initUiAudio();
                setProfileDraft(nickname);
                setScreen("PROFILE");
            },
            className:
                "inline-flex items-center rounded-2xl px-5 py-3 text-left active:scale-[.98]",
            style:{
                minWidth:185,
                border:
                    "1px solid rgba(255,255,255,.10)",
                background:
                    "rgba(10,12,28,.52)",
                backdropFilter:"blur(15px)",
                boxShadow:
                    "0 12px 30px rgba(0,0,0,.24)"
            }
        },

        React.createElement(
            "div",
            {
                className:"min-w-0 flex-1"
            },

            React.createElement(
                "div",
                {
                    className:
                        "text-[12px] font-black text-white/90"
                },
                "戦績"
            ),

            React.createElement(
                "div",
                {
                    className:
                        "mt-1 text-[11px] tracking-[.08em] font-black text-white/60"
                },
                record.w,
                "勝 ",
                record.l,
                "敗  //  ",
                rating
            )
        ),

        React.createElement(
            "div",
            {
                className:"ml-4 text-white/60",
                "aria-hidden":"true"
            },
            "›"
        )
    )
);

const googleSignedIn=!!googleUser;

const homeMenu=React.createElement(
    "div",
    {
        className:
            "relative flex flex-col justify-center",
        style:{
            width:"100%",
            maxWidth:525,
            justifySelf:"end",
            zIndex:3
        }
    },

    /*
     * Login belongs to normal layout flow.
     * It can no longer overlap Online Battle.
     */
    React.createElement(
        "div",
        {
            className:"flex justify-end items-center gap-2 mb-4"
        },

        [["HELP","遊び方","?"],["SETTINGS","設定","⚙"]].map(([to,label,icon])=>React.createElement(
            "button",
            {
                key:to,
                onClick:()=>{
                    initUiAudio();
                    setScreen(to);
                },
                className:"inline-flex items-center gap-1.5 rounded-2xl px-3.5 text-[12px] font-black text-white/85 active:scale-[.98]",
                style:{
                    minHeight:42,
                    border:"1px solid rgba(255,255,255,.12)",
                    background:"rgba(10,12,28,.52)",
                    backdropFilter:"blur(15px)"
                }
            },
            React.createElement("span",{"aria-hidden":"true",className:"text-cyan-200/80"},icon),
            label
        )),

        React.createElement(
            "button",
            {
                disabled:
                    googleBusy||
                    googleSignedIn,

                onClick:async()=>{
                    if(
                        googleBusy||
                        googleSignedIn
                    )return;

                    initUiAudio();
                    setGoogleBusy(true);
                    setGoogleErr("");

                    try{
                        const user=
                            await Net.loginWithGoogle();

                        setGoogleUser({
                            name:
                                user?.displayName||
                                Net.profile.name||
                                "Google"
                        });

                        setRating(
                            Number(
                                Net.profile.rating
                            )||1000
                        );

                        setRecord({
                            w:
                                Number(
                                    Net.profile.wins
                                )||0,
                            l:
                                Number(
                                    Net.profile.losses
                                )||0
                        });

                        if(Net.profile.name){
                            setNickname(
                                Net.profile.name
                            );
                            setProfileDraft(
                                Net.profile.name
                            );
                        }
                    }catch(err){
                        const code=
                            String(err?.code||"");

                        if(
                            code===
                            "auth/operation-not-allowed"
                        ){
                            setGoogleErr(
                                "GoogleログインをFirebaseで有効にしてください"
                            );
                        }else if(
                            code===
                            "auth/popup-closed-by-user"
                        ){
                            setGoogleErr("");
                        }else{
                            console.error(
                                "Google login",
                                err
                            );
                            setGoogleErr(
                                "Googleログインに失敗しました"
                            );
                        }
                    }finally{
                        setGoogleBusy(false);
                    }
                },

                className:
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-black active:scale-[.98] disabled:opacity-70",

                style:{
                    color:
                        googleSignedIn
                            ?"rgba(255,255,255,.54)"
                            :"rgba(255,255,255,.88)",
                    border:
                        "1px solid rgba(255,255,255,.13)",
                    background:
                        "rgba(10,13,28,.64)",
                    backdropFilter:"blur(16px)",
                    boxShadow:
                        "0 8px 24px rgba(0,0,0,.22)"
                }
            },

            React.createElement(
                "div",
                {
                    className:
                        "flex items-center justify-center rounded-full font-black",
                    style:{
                        width:20,
                        height:20,
                        background:
                            "rgba(255,255,255,.94)",
                        color:"#202124",
                        fontSize:12
                    }
                },
                "G"
            ),

            googleBusy
                ?"ログイン中…"
                :googleSignedIn
                    ?"Googleログイン済み"
                    :"Googleでログイン"
        )
    ),

    googleErr&&React.createElement(
        "div",
        {
            className:
                "mb-3 text-right text-[11px] font-bold",
            style:{
                color:"#ff9bbf"
            }
        },
        googleErr
    ),

    React.createElement(
        "div",
        {
            className:shortHome?"space-y-2":"space-y-3",
            style:{
                width:"100%"
            }
        },

        React.createElement(
            HexMenuButton,
            {
                icon:"↗",
                compact:shortHome,
                title:"オンライン対戦",
                subtitle:
                    "レートをかけてプレイヤーと対戦",
                accent:"pink",
                onClick:()=>{
                    initUiAudio();
                    setNetErr(null);
                    setScreen("MATCHING");
                }
            }
        ),

        React.createElement(
            HexMenuButton,
            {
                icon:"AI",
                compact:shortHome,
                title:"AI対戦",
                subtitle:
                    "5段階の強さから相手を選択",
                accent:"cyan",
                onClick:()=>{
                    initUiAudio();
                    setScreen("CPU");
                }
            }
        ),

        React.createElement(
            HexMenuButton,
            {
                icon:"+",
                compact:shortHome,
                title:"ルームでプレイ",
                subtitle:
                    "ルームを作成・参加して友だちと対戦",
                accent:"violet",
                onClick:()=>{
                    initUiAudio();
                    setScreen("FRIEND");
                }
            }
        ),

        React.createElement(
            HexMenuButton,
            {
                icon:"▶",
                compact:shortHome,
                title:"チュートリアル",
                subtitle:
                    "説明と実際のプレイで遊び方を覚える",
                meta:tutorialDone?null:"NEW",
                accent:"gold",
                onClick:()=>{
                    initUiAudio();
                    setScreen("TUTORIAL");
                }
            }
        )
    ),

    netErr&&React.createElement(
        "div",
        {
            className:
                "mt-3 rounded-xl px-3 py-2 text-[12px] leading-relaxed font-bold",
            role:"alert",
            style:{
                border:
                    "1px solid rgba(255,62,165,.28)",
                background:
                    "rgba(255,62,165,.08)",
                color:"#ffb8d6"
            }
        },
        hexFriendlyNetError(netErr)
    )
);

const home=
screen==="HOME"&&
React.createElement(
    HexMenuShell,
    {
        wide:true
    },

    homeWordmark,

    /*
     * Buttons only reserve space against the polygon 6.
     * BALL may continue behind the buttons.
     */
    React.createElement(
        "div",
        {
            style:{
                position:"relative",
                zIndex:2,
                display:"grid",
                gridTemplateColumns:
                    "minmax(190px,38%) minmax(300px,525px)",
                justifyContent:"space-between",
                gap:"clamp(18px,2vw,34px)",
                alignItems:"center",
                width:"100%"
            }
        },

        homeHero,
        homeMenu
    )
);

const battle=screen==="BATTLE"&&React.createElement(HexMenuShell,{title:"対戦",eyebrow:"BATTLE SELECT",back:()=>setScreen("HOME"),wide:false},
    React.createElement("div",{className:"grid gap-2.5"},
        React.createElement(HexMenuButton,{icon:"◉",title:"オンライン対戦",subtitle:"レートをかけてプレイヤーとマッチング",meta:"RANKED",accent:"pink",onClick:()=>{initUiAudio();setScreen("MATCHING");}}),
        React.createElement(HexMenuButton,{icon:"◇",title:"AI対戦",subtitle:"5段階の強さから相手を選択",meta:"SOLO",accent:"cyan",onClick:()=>{initUiAudio();setScreen("CPU");}}),
        React.createElement(HexMenuButton,{icon:"⌁",title:"フレンド対戦",subtitle:"ルームコードで友だちと遊ぶ",meta:"ROOM",accent:"violet",onClick:()=>{initUiAudio();setScreen("FRIEND");}})));
const profile=screen==="PROFILE"&&React.createElement(HexMenuShell,{title:"プロフィール",eyebrow:"PLAYER PROFILE",back:()=>setScreen("HOME"),wide:true},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"minmax(260px,.9fr) minmax(0,1.1fr)",gap:14}},
        React.createElement(HexPanel,{accent:"cyan",className:"p-5 flex items-center gap-4"},
            React.createElement("div",{className:"shrink-0 rounded-3xl flex items-center justify-center font-black text-[#07101a]",style:{width:74,height:74,fontSize:30,background:"linear-gradient(145deg,#9AF8FF,#2FE3F5)",boxShadow:"0 0 28px rgba(47,227,245,.25)" }},(nickname||"P").slice(0,1).toUpperCase()),
            React.createElement("div",{className:"min-w-0 flex-1"},
                React.createElement("div",{className:"text-[11px] tracking-[.2em] font-black text-cyan-200/70"},rankName),
                React.createElement("div",{className:"text-xl font-black text-white truncate"},nickname),
                React.createElement("div",{className:"mt-2 flex items-center gap-2"},React.createElement("div",{className:"text-[11px] font-black text-white/60"},"RATING"),React.createElement("div",{className:"text-2xl font-black tabular-nums",style:{color:"#2FE3F5",textShadow:"0 0 15px rgba(47,227,245,.35)"}},rating)))),
        React.createElement("div",{className:"grid grid-cols-3 gap-2.5"},React.createElement(HexStat,{label:"MATCHES",value:record.w+record.l,accent:"gray"}),React.createElement(HexStat,{label:"WIN",value:record.w,accent:"cyan"}),React.createElement(HexStat,{label:"WIN RATE",value:`${winRate}%`,accent:"violet"})),
        React.createElement(HexPanel,{accent:"violet",className:"p-4",style:{gridColumn:"1 / -1"}},
            React.createElement("div",{className:"flex items-end gap-3"},
                React.createElement("div",{className:"flex-1"},React.createElement("div",{className:"text-[11px] font-black tracking-[.16em] text-white/60 mb-1.5"},"NICKNAME"),React.createElement("input",{value:profileDraft,maxLength:12,onChange:e=>setProfileDraft(e.target.value.slice(0,12)),placeholder:"ニックネーム",className:"w-full rounded-xl px-3 py-2.5 text-sm font-black text-white outline-none",style:{background:"rgba(0,0,0,.28)",border:"1px solid rgba(255,255,255,.13)"}})),
                React.createElement("button",{onClick:saveProfile,className:"rounded-xl px-5 py-2.5 text-xs font-black text-[#070915] active:scale-95",style:{background:"linear-gradient(135deg,#96F8FF,#2FE3F5)",boxShadow:"0 0 18px rgba(47,227,245,.2)"}},"保存")),
            React.createElement("div",{className:"mt-2 text-[11px] text-white/60"},"ニックネームはオンライン対戦時の表示名にも使用されます。"))));
const settings=screen==="SETTINGS"&&React.createElement(HexMenuShell,{title:"設定",eyebrow:"SYSTEM OPTION",back:()=>setScreen("HOME"),wide:true},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}},
        React.createElement("div",{className:"space-y-2.5"},
            React.createElement("div",{className:"text-[11px] font-black tracking-[.18em] text-white/60 px-1"},"AUDIO"),
            React.createElement(HexSettingSlider,{label:"BGM音量",caption:"ゲーム内BGMの音量",value:bgmVolume,onChange:setBgmVolume,accent:"violet"}),
            React.createElement(HexSettingSlider,{label:"効果音音量",caption:"操作・落下・技などの効果音",value:sfxVolume,onChange:setSfxVolume,accent:"cyan"})),
        React.createElement("div",{className:"space-y-2.5"},
            React.createElement("div",{className:"text-[11px] font-black tracking-[.18em] text-white/60 px-1"},"CONTROL"),
            React.createElement(HexSettingToggle,{label:"振動",caption:"対応端末で操作と技の振動を使用",value:haptics,onChange:setHaptics,accent:"pink"}),
            React.createElement(HexSettingToggle,{label:"色の記号表示",caption:"ボールに色ごとの記号を重ねて、色だけに頼らず見分けられるようにします",value:colorSymbols,onChange:setColorSymbols,accent:"cyan"})),
        React.createElement(HexPanel,{accent:"gray",className:"p-3 flex items-center justify-between gap-4",style:{gridColumn:"1 / -1"}},
            React.createElement("div",null,React.createElement("div",{className:"text-sm font-black text-white/88"},"初期設定に戻す"),React.createElement("div",{className:"text-[11px] text-white/60 mt-0.5"},"音量・振動・色の記号表示を最初の状態に戻します。")),
            React.createElement("div",{className:"flex gap-2"},React.createElement("button",{onClick:()=>{setBgmVolume(70);setSfxVolume(85);setHaptics(true);setOffset(false);setColorSymbols(false);},className:"rounded-xl px-4 py-2 text-[12px] font-black",style:{color:"#9B6DFF",border:"1px solid rgba(155,109,255,.3)",background:"rgba(155,109,255,.07)"}},"初期設定")))));
const helpSection=(title,rows)=>React.createElement(HexPanel,{accent:"cyan",className:"p-4"},React.createElement("div",{className:"text-sm font-black text-white mb-2"},title),React.createElement("dl",{className:"grid gap-1.5"},rows.map(([k,v])=>React.createElement("div",{key:k,className:"flex gap-3 text-[13px] leading-relaxed"},React.createElement("dt",{className:"shrink-0 font-black text-cyan-100",style:{width:"6.5em"}},k),React.createElement("dd",{className:"flex-1 min-w-0 text-white/80"},v)))));
const help=screen==="HELP"&&React.createElement(HexMenuShell,{title:"遊び方",eyebrow:"HOW TO PLAY",back:()=>setScreen("HOME"),wide:true},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:12}},
        helpSection("ルール",[["勝ち負け","球が盤面からあふれた方の負けです。"],["消す","3個1組の三角ピースを落とし、同じ色を6個以上つなげると消えます。消えた後にまたつながると連鎖になります。"],["技","つなげた6個が形になると技です。ストレート（一直線）・ピラミッド（三角形）・ヘキサゴン（六角形）。技を作るとその色の球が盤面からすべて消えます。"],["攻撃","相手におじゃま球を送れるのは技だけです（ストレート19個・ピラミッド24個・ヘキサゴン36個）。"],["おじゃま","攻撃を受けると盤面の上部が赤く光り、少し後に球が降ってきます。"]]),
        helpSection("タッチ操作",HEX_CONTROL_GUIDES.touch),
        helpSection("キーボード",HEX_CONTROL_GUIDES.keys),
        helpSection("コントローラー",[...HEX_CONTROL_GUIDES.pad,["A / B（メニュー）","決定 / 戻る"]])));
const tutorial=screen==="TUTORIAL"&&React.createElement(HexTutorial,{onExit:()=>{setTutorialDone(hexReadStored("hexdrop_tutorial_done","0")==="1");setScreen("HOME");},onShowHelp:()=>{setTutorialDone(true);setScreen("HELP");},onPractice:()=>{initUiAudio();startTutorial(0);},onVsAi:()=>{setTutorialDone(true);initUiAudio();startMatch("CPU",1,{name:`CPU ${AI_PARAMS[1].name}`,rating:880+1*130});}});
const cpu=screen==="CPU"&&React.createElement(HexMenuShell,{title:"AI対戦",eyebrow:"AI BATTLE",back:()=>setScreen("HOME"),wide:false},
    React.createElement("div",{className:"grid grid-cols-2 gap-2.5"},[1,2,3,4,5].map((lv)=>React.createElement(HexMenuButton,{key:lv,compact:true,icon:String(lv),title:AI_PARAMS[lv].name,subtitle:lv===5?"技の発動を最優先する最高難度":lv>=4?"高度な判断で攻める":lv===3?"標準的な強さ":lv===2?"ゆっくり考える相手":"はじめての対戦向け",meta:`LV.${lv}`,accent:lv===5?"pink":lv>=3?"cyan":"gray",onClick:()=>startMatch("CPU",lv,{name:`CPU ${AI_PARAMS[lv].name}`,rating:880+lv*130})}))));
const friend=screen==="FRIEND"&&React.createElement(HexMenuShell,{title:"ルームでプレイ",eyebrow:"PRIVATE ROOM",back:()=>{setRoomErr("");setScreen("HOME");},wide:false},
    React.createElement(HexPanel,{accent:"violet",className:"p-5"},
        React.createElement("div",{className:"grid gap-3"},
            React.createElement("button",{onClick:()=>{initUiAudio();setRoomErr("");setScreen("ROOM_HOST");},className:"w-full rounded-2xl px-4 py-3 text-sm font-black text-[#0a0f18]",style:{background:"linear-gradient(145deg,#c59cff,#8e66ff)",minHeight:48}},"新しくルームを作成"),
            React.createElement("div",{className:"text-[11px] font-black tracking-[.18em] text-white/65 text-center pt-1"},"または"),
            React.createElement("label",{htmlFor:"hex-room-code",className:"text-[11px] font-black tracking-[.16em] text-white/55 mb-1"},"友だちのルームコードを入力"),
            React.createElement("div",{className:"flex gap-2"},
                React.createElement("input",{id:"hex-room-code",value:room,onChange:e=>{setRoomErr("");setRoom(e.target.value.replace(/\D/g,"").slice(0,6));},onKeyDown:e=>{if(e.key==="Enter"&&room.length===6){initUiAudio();setScreen("ROOM_JOIN");}},placeholder:"6桁のコード",inputMode:"numeric",autoComplete:"off",className:"flex-1 min-w-0 px-4 py-3 rounded-xl bg-black/30 border border-white/15 text-white text-center tracking-[0.28em] font-black tabular-nums placeholder:text-white/60"}),
                React.createElement("button",{disabled:room.length!==6,onClick:()=>{initUiAudio();setRoomErr("");setScreen("ROOM_JOIN");},className:"px-6 rounded-xl text-sm font-black text-[#061016] disabled:opacity-40",style:{background:"#2FE3F5",minHeight:48}},"参加")),
            roomErr&&React.createElement("div",{role:"alert",className:"rounded-xl px-3 py-2 text-[12px] leading-relaxed font-bold",style:{border:"1px solid rgba(255,62,165,.28)",background:"rgba(255,62,165,.08)",color:"#ffb8d6"}},hexFriendlyNetError(roomErr)),
            React.createElement("div",{className:"text-[11px] leading-relaxed text-white/55"},"ルーム対戦はレートに影響しません。勝敗は戦績に記録されます。"))));
const roomHost=screen==="ROOM_HOST"&&React.createElement(RoomHost,{onMatched:(match)=>beginOnline(match,"ROOM"),onCancel:()=>setScreen("FRIEND"),onError:(m)=>{setRoomErr(m);setScreen("FRIEND");}});
const roomJoin=screen==="ROOM_JOIN"&&React.createElement(RoomJoin,{code:room,onMatched:(match)=>beginOnline(match,"ROOM"),onCancel:()=>setScreen("FRIEND"),onError:(m)=>{setRoomErr(m);setScreen("FRIEND");}});
return (React.createElement("div", { className: "relative w-full h-screen overflow-hidden font-sans", style: { background: "#060512" } },
React.createElement("div", { className: "w-full h-full flex items-center justify-center" },React.createElement("div", { className: "relative", style: { width: "min(100vw, calc(100vh * 16 / 9))", aspectRatio: `${VW} / ${VH}` } },React.createElement("canvas", { ref: cvRef, className: "touch-none select-none", role: "img", "aria-label": screen === "GAME" ? `対戦画面：左があなた（${nickname||"Player"}）、右が相手（${opp?.name ?? "CPU"}）` : "", style: { width: "100%", height: "100%" } }),
screen === "GAME" && tut && React.createElement(HexTutorialPanel, { lesson: tut.lesson, tracker: tut.tracker, status: tut.status, message: tut.message, onNext: () => startTutorial(tut.lesson + 1), onRetry: () => startTutorial(tut.lesson), onExit: () => {runRef.current = false;tutorialRef.current = null;setTut(null);setScreen("HOME");}, onVsAi: () => startMatch("CPU", 1, { name: `CPU ${AI_PARAMS[1].name}`, rating: 880 + 1 * 130 }) }))),
screen === "GAME" && React.createElement("button", { onClick: () => setPauseOpen(true), "aria-label": "ポーズメニューを開く", title: "ポーズ（Esc）", className: "absolute left-1/2 -translate-x-1/2 z-10 w-11 h-11 rounded-xl flex items-center justify-center gap-1 border border-white/25 bg-black/50", style: { top: "max(8px, env(safe-area-inset-top))" } }, React.createElement("span", { className: "block w-1 h-4 rounded-sm bg-white/80" }), React.createElement("span", { className: "block w-1 h-4 rounded-sm bg-white/80" })),
screen === "GAME" && matchRef.current && !foeConn && React.createElement("div", { role: "status", className: "absolute left-1/2 -translate-x-1/2 z-10 rounded-xl px-4 py-2 text-[13px] font-bold text-center", style: { top: 60, color: "#ffd2e3", background: "rgba(40,6,24,.82)", border: "1px solid rgba(255,62,165,.4)" } }, "相手の接続が切れました。5秒以内に戻らなければあなたの勝ちになります。"),
screen === "GAME" && pauseOpen && React.createElement(HexPauseMenu, { online: !!matchRef.current, ranked: !!matchRef.current && matchKindRef.current !== "ROOM" && matchRef.current.ranked !== false, onResume: () => setPauseOpen(false), onRestart: matchRef.current ? null : () => (tutorialRef.current ? startTutorial(tutorialRef.current.lesson) : startMatch(mode, aiLevel, opp)), onQuit: () => {runRef.current = false;setPauseOpen(false);/* Online: the resignation goes through finish(), which records the loss (and rating) before leaving the match. */if (matchRef.current) matchRef.current.reportResult(false, "resign");setScreen("HOME");} }),
portrait && React.createElement("div", { className: "absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-8 text-center", style: { background: SPACE_BG } },React.createElement("div", { className: "text-5xl" }, "📱"),React.createElement("div", { className: "text-white font-extrabold text-lg" }, "端末を横向きにしてください"),React.createElement("div", { className: "text-white/65 text-sm leading-relaxed" },"このゲームは横画面専用です。",React.createElement("br", null),"画面の自動回転をオンにしてから横に倒してください。")),
home,battle,profile,settings,help,tutorial,cpu,
screen === "MATCHING" && React.createElement(Matching, { onMatched: beginOnline, onCancel: () => { Net.cancelMatchmaking(); setScreen("HOME"); }, onError: (m) => { setNetErr(m); setScreen("HOME"); } }),
friend,roomHost,roomJoin,
screen === "RESULT" && React.createElement(ResultOverlay,{win:!!result?.win,delta:result?.delta||0,reason:result?.reason||"",online:!!result?.online,ranked:!!result?.ranked&&matchKindRef.current!=="ROOM",rating:result?.rating,meName:nickname||"Player",foeName:opp?.name??"CPU",nextLabel:mode==="ONLINE"?(matchKindRef.current==="ROOM"?"ルームへ戻る":"次の相手を探す"):"もう一度",onNext:()=>{if(mode==="ONLINE")setScreen(matchKindRef.current==="ROOM"?"FRIEND":"MATCHING");else startMatch(mode,aiLevel,opp);},onExit:()=>setScreen("HOME")})));
}
