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
// First launch asks for a nickname once (skippable). Automated browsers skip
// it, like the launch splash, unless ?nameprompt=1.
const [namePrompt, setNamePrompt] = useState(()=>prefs.nickname==="Player"&&hexReadStored("hexdrop_name_prompted","")!=="1"&&!(typeof navigator!=="undefined"&&navigator.webdriver&&!/[?&]nameprompt=1(&|$)/.test(location.search)));
const [nameDraft, setNameDraft] = useState("");
const [nameErr, setNameErr] = useState("");
const [bgmVolume, setBgmVolume] = useState(prefs.bgmVolume);
const [sfxVolume, setSfxVolume] = useState(prefs.sfxVolume);
const [haptics, setHaptics] = useState(prefs.haptics);
const [offset, setOffset] = useState(prefs.offset);
const [mode, setMode] = useState(null);
const [aiLevel, setAiLevel] = useState(1);
const [opp, setOpp] = useState(null);
const [room, setRoom] = useState("");
// A room invitation link (?room=123456, app-17.js) opens the room screen with
// the code filled in; one tap on 参加 joins. The parameter is then removed.
// The iOS app receives the same link as a universal link (app-native-v1.js
// calls window.__hexOpenRoomInvite, or leaves it in __hexPendingRoomInvite).
// An iPhone/iPad browser that got the link has no app: once the App Store ID
// is set (app-17.js) it goes to the App Store page instead.
useEffect(() => {const open = (c) => {if (!/^\d{6}$/.test(String(c || ""))) return;if (stateRef.current.screen === "GAME") return;setRoom(String(c));setScreen("FRIEND");};window.__hexOpenRoomInvite = open;if (window.__hexPendingRoomInvite) {open(window.__hexPendingRoomInvite);window.__hexPendingRoomInvite = null;}try {const q = new URLSearchParams(location.search);if (q.has("room")) {const store = hexAppStoreUrl();if (store && hexIsAppleMobileBrowser() && /^\d{6}$/.test(q.get("room") || "")) {location.replace(store);return;}open(q.get("room"));q.delete("room");q.delete("openExternalBrowser");const rest = q.toString();history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);}} catch (_) {}return () => {if (window.__hexOpenRoomInvite === open) window.__hexOpenRoomInvite = null;};}, []);
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
// Static background shown once behind the canvas (see drawBackground in app-10.js).
const [bgLayerUrl] = useState(() => (typeof window !== "undefined" && typeof window.__sixBallStaticBackgroundUrl === "function" ? window.__sixBallStaticBackgroundUrl() : null));
const [bgWideUrl, setBgWideUrl] = useState(null);
useEffect(() => {if (!bgLayerUrl || typeof window.__sixBallStaticBackgroundWideUrl !== "function") return;let alive = true;window.__sixBallStaticBackgroundWideUrl().then((u) => {if (alive && u) setBgWideUrl(u);});return () => {alive = false;};}, [bgLayerUrl]);
// Decode both background images up front so the first match does not show
// the plain page colour beside the board for a frame while they decode.
useEffect(() => {for (const u of [bgLayerUrl, bgWideUrl]) {if (!u) continue;try {const im = new Image();im.src = u;if (im.decode) im.decode().catch(() => {});} catch (_) {}}}, [bgLayerUrl, bgWideUrl]);
useEffect(() => { const cv = cvRef.current; if (cv) cv.__sixBallBgLayer = !!bgLayerUrl; }, [bgLayerUrl]);
const [netErr, setNetErr] = useState(null);
const [googleUser,setGoogleUser]=useState(null);
const [googleBusy,setGoogleBusy]=useState(false);
const [googleErr,setGoogleErr]=useState("");
const [deleteState,setDeleteState]=useState("idle");
const [deleteErr,setDeleteErr]=useState("");
const [ranking,setRanking]=useState({status:"idle",rows:[],me:null});
const [foeConn, setFoeConn] = useState(true);
const [roomErr, setRoomErr] = useState("");
const [helpAllInputs, setHelpAllInputs] = useState(false);
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
useEffect(() => {const pauseIfAway = () => {const away = document.hidden || window.innerWidth < window.innerHeight;if (away && stateRef.current.screen === "GAME" && !matchRef.current && runRef.current) setPauseOpen(true);};document.addEventListener("visibilitychange", pauseIfAway);window.addEventListener("resize", pauseIfAway);window.addEventListener("orientationchange", pauseIfAway);return () => {document.removeEventListener("visibilitychange", pauseIfAway);window.removeEventListener("resize", pauseIfAway);window.removeEventListener("orientationchange", pauseIfAway);};}, []);
const stateRef = useRef({ mode, opp, rating, nickname, screen, pauseOpen, aiLevel });stateRef.current = { mode, opp, rating, nickname, screen, pauseOpen, aiLevel };
const optRef = useRef({ offset });optRef.current = { offset };
const initUiAudio=useCallback(()=>{Sfx.init();hexApplySfxVolume(sfxVolume);},[sfxVolume]);
const NAME_BLOCKED="この名前は使えません";
const saveProfile=useCallback(()=>{const c=HexPlayerName.check(profileDraft);if(c.reason==="blocked"){setNameErr(NAME_BLOCKED);return;}const next=c.name||"Player";setNameErr("");setNickname(next);setProfileDraft(next);Sfx.init();hexApplySfxVolume(sfxVolume);Sfx.play({t:"move"},.7);},[profileDraft,sfxVolume]);
useEffect(() => {hexApplySfxVolume(sfxVolume);hexStoreMenuPref("hexdrop_sfx_volume",sfxVolume);}, [sfxVolume]);
useEffect(() => {hexStoreMenuPref("hexdrop_bgm_volume",bgmVolume);window.__hexBgmVolume=bgmVolume/100;if(window.Bgm&&typeof window.Bgm.setVolume==="function")window.Bgm.setVolume(bgmVolume/100);}, [bgmVolume]);
useEffect(() => {Sfx.haptics = haptics;hexStoreMenuPref("hexdrop_haptics",haptics?"1":"0");}, [haptics]);
useEffect(() => {hexStoreMenuPref("hexdrop_offset",offset?"1":"0");}, [offset]);
useEffect(() => {hexStoreMenuPref("hexdrop_nickname",nickname);Net.profile.name=nickname;if(Net.fb&&Net.uid){const F=Net.fb;F.update(F.ref(Net.db,"users/"+Net.uid),{name:nickname,updatedAt:F.serverTimestamp()}).catch(()=>{});F.set(F.ref(Net.db,"leaderboard/"+Net.uid),{name:nickname,rating:Net.profile.rating||rating}).catch(()=>{});}}, [nickname]);
useEffect(() => {if(screen!=="PROFILE")return;let alive=true;(async()=>{try{await Net.connect();if(!alive)return;setRating(Number(Net.profile.rating)||1000);setRecord({w:Number(Net.profile.wins)||0,l:Number(Net.profile.losses)||0});hexStoreMenuPref("hexdrop_rating",Number(Net.profile.rating)||1000);hexStoreMenuPref("hexdrop_wins",Number(Net.profile.wins)||0);hexStoreMenuPref("hexdrop_losses",Number(Net.profile.losses)||0);if((nickname==="Player"||!nickname)&&Net.profile.name&&Net.profile.name!=="Player"&&HexPlayerName.isAllowed(Net.profile.name)){setNickname(String(Net.profile.name).slice(0,12));setProfileDraft(String(Net.profile.name).slice(0,12));}else if(Net.profile.name!==nickname){Net.profile.name=nickname;const F=Net.fb;F.update(F.ref(Net.db,"users/"+Net.uid),{name:nickname,updatedAt:F.serverTimestamp()}).catch(()=>{});}}catch(_){}})();return()=>{alive=false;};},[screen]);
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

const startMatch = useCallback((m, lv, o) => {matchGenRef.current++;tutorialRef.current = null;setTut(null);Sfx.init();hexApplySfxVolume(sfxVolume);const seed = (Math.random() * 1e9) | 0;meRef.current = createEngine(seed, { offset: optRef.current.offset, gravityRamp: true });foeRef.current = createEngine(seed, { offset: optRef.current.offset, gravityRamp: true });foeRef.current.ai = { level: lv, target: null, thinkT: 0, actT: 0 };if (matchRef.current) {matchRef.current.leave();matchRef.current = null;}orbsRef.current = [];reportedRef.current = false;matchKindRef.current = m;setPauseOpen(false);setMode(m);setAiLevel(lv);setOpp(o);setResult(null);setScreen("GAME");runRef.current = true;}, [sfxVolume]);
const startTutorial = useCallback((lesson) => {matchGenRef.current++;Sfx.init();hexApplySfxVolume(sfxVolume);const seed = (Math.random() * 1e9) | 0;const me = createEngine(seed, { offset: false });const foe = createEngine(seed, { offset: false });foe.ai = null;hexTutorialSetupEngine(me, lesson);meRef.current = me;foeRef.current = foe;if (matchRef.current) {matchRef.current.leave();matchRef.current = null;}orbsRef.current = [];reportedRef.current = false;const t = { lesson, tracker: hexTutorialTracker(), status: "play", message: "" };tutorialRef.current = t;setTut({ ...t, tracker: { ...t.tracker } });matchKindRef.current = "TUTORIAL";setPauseOpen(false);setMode("TUTORIAL");setAiLevel(0);setOpp({ name: "チュートリアル" });setResult(null);setScreen("GAME");runRef.current = true;}, [sfxVolume]);
const finish = useCallback((win, reason = "") => {const gen = matchGenRef.current;const me=meRef.current,foe=foeRef.current;if(win&&me)me.matchFrozen=true;if(!win&&foe)foe.matchFrozen=true;Sfx.play({ t: win ? "win" : "lose" }, 1);const { mode: m, opp: o, rating: r, aiLevel: lv } = stateRef.current;const match = matchRef.current;const summary = me ? hexMatchSummary(me) : null;const progress = hexRecordMatch({ cpuLevel: m === "CPU" ? lv : 0, win, summary });setTimeout(async () => {if (m === "ONLINE" && match) {let delta=0;try{delta=await Net.applyRating(win,match.opponent?.rating||r,match.ranked,match.matchId);const nr=Number(Net.profile.rating)||r,nw=Number(Net.profile.wins)||0,nl=Number(Net.profile.losses)||0;setRating(nr);setRecord({w:nw,l:nl});hexStoreMenuPref("hexdrop_rating",nr);hexStoreMenuPref("hexdrop_wins",nw);hexStoreMenuPref("hexdrop_losses",nl);}catch(_){}setResult({ win, delta, reason, ranked: match.ranked !== false, online: true, rating: Number(Net.profile.rating) || r, summary, progress });match.leave();if (matchRef.current === match) matchRef.current = null;} else if (m === "ONLINE") {setResult({ win, delta: 0, reason, online: true, summary, progress });} else setResult({ win, delta: 0, reason, summary, progress });if (stateRef.current.screen === "GAME" && matchGenRef.current === gen) setScreen("RESULT");}, RESULT_REVEAL_DELAY_MS);}, []);
const beginOnline = useCallback((match, kind = "RANKED") => {matchGenRef.current++;tutorialRef.current = null;setTut(null);matchKindRef.current = kind;setPauseOpen(false);setRoomErr("");Sfx.init();hexApplySfxVolume(sfxVolume);setRating(Number(Net.profile.rating)||rating);setRecord({w:Number(Net.profile.wins)||0,l:Number(Net.profile.losses)||0});const seed = match.seed >>> 0;meRef.current = createEngine(seed, { offset: optRef.current.offset, gravityRamp: true });const foe = createEngine(seed, { offset: optRef.current.offset });foe.ai = null;foe.piece = null;foe.state = "NET";foeRef.current = foe;orbsRef.current = [];reportedRef.current = false;matchRef.current = match;setFoeConn(true);match.events.onOpponentState = (st) => {const g = foeRef.current;if (!g)return;applySnapshot(g,st.board,st.fx);g.incoming = st.incoming || 0;applyRemoteVisualState(g,st);if(st.alive===false&&g.alive)die(g,null,"REMOTE");};match.events.onAttack = (atk) => {const n = sanitizeAttackCount(typeof atk === "number" ? atk : ((atk === null || atk === void 0 ? void 0 : atk.n) || 0));const shapes = sanitizeAttackShapes(atk === null || atk === void 0 ? void 0 : atk.shapes);if (n <= 0 && !shapes.length) return;orbsRef.current.push({ side: 1, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });};match.events.onConnection = (c) => setFoeConn(c);match.events.onFinish = (win, reason) => { runRef.current = false; finish(win, reason); };setMode("ONLINE");setAiLevel(0);setOpp({ name: match.opponent.name, rating: match.opponent.rating });setResult(null);setScreen("GAME");runRef.current = true;}, [finish,sfxVolume,rating]);
useEffect(() => {
let raf, last = performance.now(), acc = 0, hud = 0, T = 0, netT = 0, lastNetState = "", pausedSig = "";const FIXED = PHYSICS_FRAME;
const drain = (g, vol) => { for (const e of g.events) Sfx.play(e, vol); g.events.length = 0; };
const loop = (now) => {
raf = requestAnimationFrame(loop);window.__sixBallRenderFrame = ((window.__sixBallRenderFrame | 0) + 1) | 0;let dt = (now - last) / 1000;last = now;if (dt > 0.1)dt = 0.1;T += dt;dropFlashRef.current = Math.max(0, dropFlashRef.current - dt * 4);
const me = meRef.current, foe = foeRef.current, cv = cvRef.current;if (!me || !foe || !cv)return;const net = matchRef.current;
// Battery: nothing is simulated or drawn behind the menus once a match has been left.
{const scr = stateRef.current.screen;if (scr !== "GAME" && scr !== "RESULT") { pausedSig = ""; return; }}
const advance = (h) => {me.fastForwardCarry = 0;stepEngine(me, h);if (me.alive && me.state !== "READY") me.stats.time = (me.stats.time || 0) + h;if (net) stepNetView(foe, h); else if (!tutorialRef.current) stepEngine(foe, h);
if (net) {if (me.sendBuffer > 0 || me.sendShapes.length > 0) {const n = me.sendBuffer, shapes = me.sendShapes.splice(0);me.sendBuffer = 0;net.sendAttack(n, shapes);orbsRef.current.push({ side: 0, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });}foe.sendBuffer = 0;foe.sendShapes.length = 0;} else {[me, foe].forEach((g, i) => {if (g.sendBuffer > 0 || g.sendShapes.length > 0) {const n = g.sendBuffer, shapes = g.sendShapes.splice(0);orbsRef.current.push({ side: i, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });g.sendBuffer = 0;}});}
orbsRef.current = orbsRef.current.filter((o) => {o.t += h;if (o.t >= o.dur) {const tgt = o.side === 0 ? foe : me;if (!(net && o.side === 0)) {if (o.shapes && o.shapes.length)tgt.incomingShapes.push(...o.shapes.filter((w) => WAZA[w]));else tgt.incoming += o.n;}tgt.fx.incomingPreviews=tgt.fx.incomingPreviews||[];tgt.fx.incomingPreviews.push({shapes:(o.shapes||[]).slice(0,6),n:o.n||0,tint:o.tint,life:3.05,max:3.05});tgt.fx.shake = Math.max(tgt.fx.shake, 0.55);return false;}return true;});};
if (pausedRef.current) acc = 0;
else if (runRef.current) {acc += dt;let guard = 0;while (acc >= FIXED && guard++ < MAX_PHYSICS_CATCHUP_STEPS) {advance(FIXED);acc -= FIXED;if (tutorialRef.current) {if (!me.alive) {runRef.current = false;const t = tutorialRef.current;t.status = "retry";t.message = "あふれました。もう一度！";setTut({ ...t, tracker: { ...t.tracker } });setTimeout(() => { if (tutorialRef.current === t) startTutorial(t.lesson); }, 1400);break;}} else if (!net) {if (!me.alive || !foe.alive) {runRef.current = false;finish(me.alive && !foe.alive);break;}} else if (!me.alive) break;}if(acc>=FIXED)acc=Math.min(acc,FIXED);} else advance(dt);
{const t = tutorialRef.current;if (t && t.status === "play") {const r = hexTutorialObserve(me, t.lesson, t.tracker);if (r === "success") {t.status = "success";t.message = t.lesson === HEX_TUTORIAL_LESSONS.length - 1 ? "チュートリアル完了！" : "できました！";try { localStorage.setItem("hexdrop_tutorial_done", "1"); } catch (_) {}if (t.lesson === HEX_TUTORIAL_LESSONS.length - 1) setTutorialDone(true);setTut({ ...t, tracker: { ...t.tracker } });} else if (r && r.startsWith("retry")) {t.status = "retry";t.message = r.slice(6);setTut({ ...t, tracker: { ...t.tracker } });setTimeout(() => { if (tutorialRef.current === t) startTutorial(t.lesson); }, 1600);} else if (JSON.stringify(t.tracker) !== t._sig) {t._sig = JSON.stringify(t.tracker);setTut({ ...t, tracker: { ...t.tracker } });}}}
drain(me, 1);drain(foe, 0.32);
if (net) {netT += dt;if (netT >= 0.066) {netT = 0;const snap=snapshotOf(me),piece=pieceSnapshotOf(me),fx=remoteFxSnapshotOf(me),sig=snap+"|"+pendingIncomingCount(me)+"|"+me.alive+"|"+JSON.stringify(piece)+"|"+JSON.stringify(fx);if(sig!==lastNetState){lastNetState=sig;net.sendBoard(snap,pendingIncomingCount(me),me.alive,piece,fx);}}if (!me.alive && !reportedRef.current) {reportedRef.current = true;net.reportResult(false, "dead");}}
// Paused: the frame does not change, so draw it once (again only after a resize).
if (pausedRef.current) {const sz = sizeRef.current, sig = sz.scale + "|" + sz.dpr;if (pausedSig === sig) return;pausedSig = sig;} else pausedSig = "";
const renderLead=runRef.current?Math.min(FIXED,Math.max(0,acc)):0;
const scale = sizeRef.current.scale;if (scale <= 0)return;const dpr = sizeRef.current.dpr;const w = Math.round(VW * scale * dpr), h = Math.round(VH * scale * dpr);if (cv.width !== w || cv.height !== h) {cv.width = w;cv.height = h;}const ctx = cv.getContext("2d");ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);renderScene(ctx, me, foe, orbsRef.current, T, {me: stateRef.current.nickname||"Player", meSub: net && stateRef.current.rating ? `${stateRef.current.rating}` : "",foe: stateRef.current.opp?.name ?? "CPU",foeSub: net && stateRef.current.opp?.rating ? `${stateRef.current.opp.rating}` : ""}, dropFlashRef.current, 0,renderLead);hud += dt;if (hud > 0.2) {hud = 0;force((x) => x + 1);}
};raf = requestAnimationFrame(loop);return () => cancelAnimationFrame(raf);}, [finish]);
useEffect(() => {const typing = (e) => {const t = e.target;return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);};
const softDrop = (g, on) => {if (on) {if (g.state !== "PLAYING" || !g.piece) return;if (!g.fastForward) emit(g, { t: "fast" });g.fastForward = true;} else g.fastForward = false;};
const dn = (e) => {if (typing(e)) return;const g = meRef.current;if (!g || screen !== "GAME")return;if (g.state === "READY") skipIntro();
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
const googleSignedIn=!!googleUser;
// In the iOS app (app-native-v1.js) Apple sign-in is offered next to Google.
const nativeApp=typeof window!=="undefined"?window.DropBallNative:null;
const loginWithGoogle=(provider)=>loginWith(provider==="apple"?"apple":"google");
const loginWith=async(provider)=>{
    if(googleBusy||googleSignedIn)return;
    initUiAudio();setGoogleBusy(true);setGoogleErr("");
    try{
        const user=await (provider==="apple"?Net.loginWithApple():Net.loginWithGoogle());
        setGoogleUser({name:user?.displayName||Net.profile.name||(provider==="apple"?"Apple":"Google")});
        setRating(Number(Net.profile.rating)||1000);
        setRecord({w:Number(Net.profile.wins)||0,l:Number(Net.profile.losses)||0});
        if(Net.profile.name){setNickname(Net.profile.name);setProfileDraft(Net.profile.name);}
    }catch(err){
        const code=String(err?.code||"");
        if(code==="auth/popup-closed-by-user"||code==="auth/cancelled-popup-request")setGoogleErr("");
        else{console.error("Google login",err);setGoogleErr(hexGoogleLoginError(code));}
    }finally{setGoogleBusy(false);}
};
// HOME. Left: the logo and the player's card (opens the profile). Right: the
// quiet links (ランキング / 遊び方 / 設定) above the four actions. Nothing else.
const homeLogo=React.createElement("div",{className:"flex flex-col items-center",style:{gap:"clamp(6px,1.4vh,12px)"}},
    React.createElement("h1",{className:"m-0"},React.createElement("img",{src:"/assets/drop-ball-logo.svg",alt:"Drop Ball",draggable:false,style:{display:"block",height:"clamp(74px,19vh,150px)",width:"auto",filter:"drop-shadow(0 10px 24px rgba(0,0,0,.35))"}})),
    React.createElement("div",{className:"text-center font-bold",style:{fontSize:"clamp(10px,1.8vh,13px)",letterSpacing:".2em",whiteSpace:"nowrap",color:"rgba(150,230,255,.8)"}},"Connect six."));
const homePlayer=React.createElement("button",{onClick:()=>{initUiAudio();setProfileDraft(nickname);setScreen("PROFILE");},"aria-label":`プロフィール（${nickname||"Player"}）`,className:"inline-flex items-center gap-3 rounded-2xl text-left active:scale-[.98]",style:{minWidth:220,maxWidth:320,minHeight:60,padding:"0 16px 0 12px",...HEX_MENU_SURFACE}},
    React.createElement(HexAvatar,{name:nickname||"Player",size:38}),
    React.createElement("div",{className:"min-w-0 flex-1"},
        React.createElement("div",{className:"text-[15px] font-bold text-white truncate"},nickname||"Player"),
        React.createElement("div",{className:"mt-0.5 text-[12px] tabular-nums text-white/55 truncate"},`レート ${rating} · ${record.w}勝 ${record.l}敗`)),
    React.createElement(HexChevron,null));
const homeLinks=React.createElement("div",{className:"flex justify-end items-center gap-2",style:{marginBottom:"clamp(12px,2.6vh,24px)"}},
    [["RANKING","ランキング","trophy"],["HELP","遊び方","help"],["SETTINGS","設定","gear"]].map(([to,label,icon])=>React.createElement("button",{key:to,onClick:()=>{initUiAudio();setScreen(to);},className:"inline-flex items-center gap-2 rounded-full pl-3.5 pr-4 text-[14px] font-semibold text-white/85 active:scale-[.98]",style:{minHeight:44,...HEX_MENU_SURFACE}},React.createElement(HexIcon,{name:icon,size:17,color:"rgba(255,255,255,.8)"}),label)));
const homeMenu=React.createElement("div",{className:"relative flex flex-col justify-center",style:{width:"100%",maxWidth:480,justifySelf:"end"}},
    homeLinks,
    React.createElement("div",{className:shortHome?"space-y-2":"space-y-3"},
        React.createElement(HexMenuButton,{icon:"globe",compact:shortHome,title:"オンライン対戦",accent:"pink",onClick:()=>{initUiAudio();setNetErr(null);setScreen("MATCHING");}}),
        React.createElement(HexMenuButton,{icon:"chip",compact:shortHome,title:"AI対戦",accent:"cyan",onClick:()=>{initUiAudio();setScreen("CPU");}}),
        React.createElement(HexMenuButton,{icon:"people",compact:shortHome,title:"ルームでプレイ",accent:"violet",onClick:()=>{initUiAudio();setScreen("FRIEND");}}),
        React.createElement(HexMenuButton,{icon:"book",compact:shortHome,title:"チュートリアル",accent:"gold",onClick:()=>{initUiAudio();setScreen("TUTORIAL");}})),
    netErr&&React.createElement("div",{className:"mt-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed",role:"alert",style:{border:"1px solid rgba(255,62,165,.28)",background:"rgba(255,62,165,.08)",color:"#ffb8d6"}},hexFriendlyNetError(netErr)));
const home=screen==="HOME"&&React.createElement(HexMenuShell,{wide:true},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"minmax(200px,1fr) minmax(300px,480px)",justifyContent:"space-between",gap:"clamp(24px,5vw,80px)",alignItems:"center",width:"100%"}},
        React.createElement("div",{className:"flex flex-col items-center",style:{gap:"clamp(18px,4vh,32px)",paddingLeft:"clamp(8px,3vw,40px)"}},homeLogo,homePlayer),
        homeMenu));

const battle=screen==="BATTLE"&&React.createElement(HexMenuShell,{title:"対戦",eyebrow:"BATTLE SELECT",back:()=>setScreen("HOME"),wide:false},
    React.createElement("div",{className:"grid gap-2.5"},
        React.createElement(HexMenuButton,{icon:"◉",title:"オンライン対戦",subtitle:"レート戦",meta:"RANKED",accent:"pink",onClick:()=>{initUiAudio();setScreen("MATCHING");}}),
        React.createElement(HexMenuButton,{icon:"◇",title:"AI対戦",subtitle:"5段階の強さから相手を選択",meta:"SOLO",accent:"cyan",onClick:()=>{initUiAudio();setScreen("CPU");}}),
        React.createElement(HexMenuButton,{icon:"⌁",title:"フレンド対戦",subtitle:"ルームコードで友だちと遊ぶ",meta:"ROOM",accent:"violet",onClick:()=>{initUiAudio();setScreen("FRIEND");}})));
// RANKING: the top 50 by rating, the player's own row highlighted; below the
// list, the player's rating when it is not among them.
useEffect(()=>{
    if(screen!=="RANKING")return;
    let alive=true;setRanking(r=>({...r,status:"loading"}));
    Net.fetchLeaderboard(50).then(res=>{if(alive)setRanking({status:"ok",rows:res.rows,me:res.me});})
        .catch(err=>{console.error("ranking",err);if(alive)setRanking({status:"error",rows:[],me:null});});
    return()=>{alive=false;};
},[screen]);
const rankingMine=ranking.rows.find(r=>r.uid===ranking.me);
const rankingRow=(r)=>{const mine=r.uid===ranking.me,top=r.rank<=3?["#FFD36A","#C9D3E6","#E3A06A"][r.rank-1]:null;
    return React.createElement("div",{key:r.uid,"data-hex-ranking-row":mine?"me":"1",className:"flex items-center gap-3 rounded-xl px-3",style:{minHeight:46,background:mine?"rgba(47,227,245,.10)":"transparent",border:mine?"1px solid rgba(47,227,245,.35)":"1px solid transparent"}},
        React.createElement("div",{className:"w-9 text-center text-[15px] font-bold tabular-nums",style:{color:top||"rgba(255,255,255,.6)"}},r.rank),
        React.createElement(HexAvatar,{name:r.name,size:28,color:mine?HEX_MENU_ACCENTS.cyan:"#8B93A7"}),
        React.createElement("div",{className:"min-w-0 flex-1 truncate text-[14px] font-semibold text-white"},r.name,mine&&React.createElement("span",{className:"ml-2 text-[11px] font-bold",style:{color:HEX_MENU_ACCENTS.cyan}},"あなた")),
        React.createElement("div",{className:"shrink-0 text-[15px] font-bold tabular-nums text-white"},r.rating));};
const rankingScreen=screen==="RANKING"&&React.createElement(HexMenuShell,{title:"ランキング",back:()=>setScreen("HOME"),wide:false},
    nativeApp&&nativeApp.gameCenter&&React.createElement("button",{onClick:()=>{initUiAudio();nativeApp.showLeaderboard();},"data-hex-game-center":"1",className:"mb-3 inline-flex items-center gap-2 rounded-xl px-4 text-[14px] font-semibold text-white/85 active:scale-[.98]",style:{minHeight:44,...HEX_MENU_SURFACE}},"Game Center のランキング"),
    React.createElement("div",{className:"rounded-2xl p-2",style:HEX_MENU_SURFACE},
        ranking.status==="loading"&&!ranking.rows.length&&React.createElement("div",{role:"status","aria-label":"読み込み中","data-hex-ranking-skeleton":"1",className:"grid gap-0.5"},[0,1,2,3,4,5].map(i=>React.createElement("div",{key:i,"aria-hidden":"true",className:"flex items-center gap-3 px-3 animate-pulse",style:{minHeight:46,opacity:1-i*.13}},React.createElement("div",{className:"w-9 flex justify-center"},React.createElement("div",{className:"rounded",style:{width:14,height:12,background:"rgba(255,255,255,.12)"}})),React.createElement("div",{className:"rounded-full",style:{width:28,height:28,background:"rgba(255,255,255,.10)"}}),React.createElement("div",{className:"flex-1"},React.createElement("div",{className:"rounded",style:{width:`${46-i*4}%`,height:12,background:"rgba(255,255,255,.10)"}})),React.createElement("div",{className:"rounded",style:{width:40,height:12,background:"rgba(255,255,255,.12)"}})))),
        ranking.status==="error"&&React.createElement("div",{role:"alert",className:"py-8 text-center text-[13px]",style:{color:"#ff9bbf"}},"読み込めませんでした"),
        ranking.status==="ok"&&!ranking.rows.length&&React.createElement("div",{className:"py-8 text-center text-[13px] text-white/60"},"まだ誰もいません"),
        ranking.rows.length>0&&React.createElement("div",{"data-hex-ranking":"1",className:"grid gap-0.5"},ranking.rows.map(rankingRow))),
    ranking.status==="ok"&&!rankingMine&&React.createElement("div",{className:"mt-3 px-1 text-[12px] text-white/60"},ranking.rows.length<50?`あなたのレートは ${rating} です。オンライン対戦（レート戦）を1回するとランキングに載ります。`:`あなたのレートは ${rating} です。上位50位に入るとここに載ります。`));
const profileBests=screen==="PROFILE"?hexBests():null,profileCpu=screen==="PROFILE"?hexCpuRecord():null;
// Account deletion (app-account-delete-v1.js). Net.deleteAccount() is called
// in the click itself so that a sign-in popup it needs is not blocked.
const deleteAccount=()=>{
    if(deleteState==="busy")return;
    if(deleteState!=="confirm"){setDeleteState("confirm");setDeleteErr("");return;}
    initUiAudio();setDeleteState("busy");setDeleteErr("");
    let pending;
    try{pending=Net.deleteAccount();}catch(err){pending=Promise.reject(err);}
    pending.then(()=>{try{window.location.reload();}catch(_){}}).catch((err)=>{
        const code=String(err?.code||"");
        setDeleteState("confirm");
        if(code==="auth/popup-closed-by-user"||code==="auth/cancelled-popup-request")return;
        console.error("delete account",err);
        setDeleteErr(code==="auth/requires-recent-login"?"データは削除しました。再ログインしてから、もう一度削除してください。"
            :code==="auth/popup-blocked"?"ログイン画面を開けませんでした。もう一度押してください。"
            :"削除できませんでした。通信を確認してください。");
    });
};
const profile=screen==="PROFILE"&&React.createElement(HexMenuShell,{title:"プロフィール",back:()=>setScreen("HOME"),wide:true},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"minmax(260px,.9fr) minmax(0,1.1fr)",gap:14}},
        React.createElement(HexPanel,{accent:"cyan",className:"p-5 flex items-center gap-4"},
            React.createElement(HexAvatar,{name:nickname,size:72}),
            React.createElement("div",{className:"min-w-0 flex-1"},
                React.createElement("div",{className:"text-[11px] tracking-[.2em] font-black text-cyan-200/70"},rankName),
                React.createElement("div",{className:"text-xl font-black text-white truncate"},nickname),
                React.createElement("div",{className:"mt-2 flex items-center gap-2"},React.createElement("div",{className:"text-[12px] font-bold text-white/60"},"レート"),React.createElement("div",{className:"text-2xl font-black tabular-nums",style:{color:"#2FE3F5",textShadow:"0 0 15px rgba(47,227,245,.35)"}},rating)))),
        React.createElement("div",{className:"grid grid-cols-3 gap-2.5"},React.createElement(HexStat,{label:"対戦数",value:record.w+record.l,accent:"gray"}),React.createElement(HexStat,{label:"勝利数",value:record.w,accent:"cyan"}),React.createElement(HexStat,{label:"勝率",value:`${winRate}%`,accent:"violet"})),
        React.createElement(HexPanel,{accent:"gold",className:"p-4","data-hex-profile-records":"1",style:{gridColumn:"1 / -1"}},
            React.createElement("div",{className:"text-[12px] font-bold tracking-[.08em] text-white/50 mb-2"},"自己ベスト"),
            React.createElement("div",{className:"grid grid-cols-4 gap-2"},[["最大連鎖",profileBests.maxChain||"—"],["1試合の技",profileBests.waza||"—"],["1試合で消した球",profileBests.cleared||"—"],["最速の勝利",profileBests.fastestWin?hexFormatTime(profileBests.fastestWin):"—"]].map(([k,v])=>React.createElement("div",{key:k,className:"min-w-0 rounded-xl px-3 py-2",style:{background:"rgba(0,0,0,.22)",border:"1px solid rgba(255,255,255,.1)"}},React.createElement("div",{className:"text-[10px] font-black text-white/60 truncate"},k),React.createElement("div",{className:"text-lg font-black tabular-nums",style:{color:"#FFD36A"}},v)))),
            React.createElement("div",{className:"text-[12px] font-bold tracking-[.08em] text-white/50 mt-4 mb-2"},"AI対戦"),
            React.createElement("div",{className:"grid grid-cols-5 gap-2"},[1,2,3,4,5].map((lv)=>{const r=profileCpu[lv];return React.createElement("div",{key:lv,className:"min-w-0 rounded-xl px-2 py-2 text-center",style:{background:r.w?"rgba(255,216,59,.08)":"rgba(0,0,0,.22)",border:`1px solid ${r.w?"rgba(255,216,59,.45)":"rgba(255,255,255,.1)"}`}},React.createElement("div",{className:"text-[11px] font-black text-white/80 truncate"},AI_PARAMS[lv].name),React.createElement("div",{className:"text-[12px] font-black tabular-nums text-white/70"},r.w+r.l?`${r.w}勝 ${r.l}敗`:"未対戦"),r.best>=2&&React.createElement("div",{className:"text-[10px] font-bold text-white/55"},`最高${r.best}連勝`));}))),
        React.createElement(HexPanel,{accent:"violet",className:"p-4",style:{gridColumn:"1 / -1"}},
            React.createElement("div",{className:"flex items-end gap-3"},
                React.createElement("div",{className:"flex-1"},React.createElement("div",{className:"text-[12px] font-bold text-white/50 mb-1.5"},"ニックネーム"),React.createElement("input",{value:profileDraft,maxLength:12,onChange:e=>{setProfileDraft(e.target.value.slice(0,12));setNameErr("");},"aria-invalid":nameErr?"true":undefined,placeholder:"ニックネーム",className:"w-full rounded-xl px-3 py-2.5 text-sm font-black text-white outline-none",style:{background:"rgba(0,0,0,.28)",border:"1px solid rgba(255,255,255,.13)"}})),
                React.createElement("button",{onClick:saveProfile,className:"hex-btn hex-btn-primary px-5 text-[13px]",style:{minHeight:42}},"保存")),
            nameErr&&screen==="PROFILE"?React.createElement("div",{role:"alert","data-hex-name-error":"1",className:"mt-2 text-[12px] font-semibold",style:{color:"#ff9bbf"}},nameErr)
                :null),
    React.createElement(HexPanel,{className:"p-5 flex items-center gap-4 flex-wrap",style:{gridColumn:"1 / -1"}},
        React.createElement("div",{className:"flex-1 min-w-[240px]"},
            React.createElement("div",{className:"text-[15px] font-bold text-white"},googleSignedIn?(nativeApp?"ログイン済み":"Googleログイン済み"):"戦績のバックアップ"),
            React.createElement("div",{className:"mt-1 text-[13px] leading-relaxed text-white/55"},googleSignedIn?"ほかの端末に引き継げます":"ログインすると、ほかの端末に引き継げます"),
            googleErr&&React.createElement("div",{role:"alert",className:"mt-2 text-[12px] font-semibold",style:{color:"#ff9bbf"}},googleErr)),
        !googleSignedIn&&nativeApp&&nativeApp.appleSignIn&&React.createElement("button",{disabled:googleBusy,onClick:()=>loginWith("apple"),"data-hex-apple-signin":"1",className:"hex-btn pl-4 pr-5 text-[14px] text-black disabled:opacity-60",style:{background:"#fff",border:"1px solid #fff",fontWeight:600}},React.createElement("span",{"aria-hidden":"true",style:{fontSize:17,lineHeight:1}},"\uF8FF"),googleBusy?"サインイン中…":"Appleでサインイン"),
        !googleSignedIn&&React.createElement("button",{disabled:googleBusy,onClick:loginWithGoogle,className:"hex-btn hex-btn-secondary pl-3.5 pr-5 text-[14px] disabled:opacity-60"},React.createElement("span",{"aria-hidden":"true",className:"flex items-center justify-center rounded-full font-bold",style:{width:22,height:22,background:"#fff",color:"#202124",fontSize:13}},"G"),googleBusy?"ログイン中…":"Googleでログイン")),
    React.createElement(HexPanel,{className:"p-5 flex items-center gap-4 flex-wrap",style:{gridColumn:"1 / -1"}},
        React.createElement("div",{"data-hex-account-delete":"1",className:"flex-1 min-w-[240px]"},
            React.createElement("div",{className:"text-[15px] font-bold text-white"},"アカウントを削除"),
            React.createElement("div",{className:"mt-1 text-[13px] leading-relaxed text-white/55"},deleteState==="idle"?"戦績・レート・ランキングを削除します":"元に戻せません。本当に削除しますか？"),
            deleteErr&&React.createElement("div",{role:"alert",className:"mt-2 text-[12px] font-semibold",style:{color:"#ff9bbf"}},deleteErr)),
        deleteState!=="idle"&&React.createElement("button",{disabled:deleteState==="busy",onClick:()=>{setDeleteState("idle");setDeleteErr("");},className:"hex-btn hex-btn-secondary px-5 text-[14px]"},"やめる"),
        React.createElement("button",{disabled:deleteState==="busy",onClick:deleteAccount,className:"hex-btn hex-btn-danger px-5 text-[14px] disabled:opacity-60",style:deleteState==="idle"?undefined:{color:"#fff",background:"linear-gradient(180deg,#E8445A,#C9233A)",borderColor:"rgba(255,120,140,.6)"}},deleteState==="busy"?"削除中…":deleteState==="confirm"?"削除する":"アカウントを削除…"))));
const settings=screen==="SETTINGS"&&React.createElement(HexMenuShell,{title:"設定",back:()=>setScreen("HOME"),wide:true},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:shortHome?10:14}},
        React.createElement("div",{className:shortHome?"space-y-2.5":"space-y-3.5"},
            React.createElement(HexSettingSlider,{label:"BGM音量",value:bgmVolume,onChange:setBgmVolume,accent:"violet"}),
            React.createElement(HexSettingSlider,{label:"効果音音量",value:sfxVolume,onChange:setSfxVolume,accent:"cyan"})),
        React.createElement("div",{className:shortHome?"space-y-2.5":"space-y-3.5"},
            (typeof navigator!=="undefined"&&typeof navigator.vibrate==="function")&&React.createElement(HexSettingToggle,{label:"振動",value:haptics,onChange:setHaptics,accent:"pink"}),
            React.createElement(HexSettingToggle,{label:"色の記号表示",value:colorSymbols,onChange:setColorSymbols,accent:"cyan"})),
        React.createElement("div",{className:"flex justify-center flex-wrap gap-3",style:{gridColumn:"1 / -1"}},
            React.createElement("button",{onClick:()=>{setBgmVolume(70);setSfxVolume(85);setHaptics(true);setOffset(false);setColorSymbols(false);},className:"hex-btn hex-btn-ghost px-5 text-[14px]"},"初期設定に戻す"),
            React.createElement("a",{href:"/privacy.html",target:"_blank",rel:"noopener","data-hex-privacy-link":"1",className:"hex-btn hex-btn-ghost px-5 text-[14px]"},"プライバシーポリシー"))));
const helpSection=(title,rows)=>React.createElement(HexPanel,{className:"p-5"},React.createElement("div",{className:"text-[15px] font-bold text-white mb-2"},title),React.createElement("dl",{className:"grid text-[13px] leading-relaxed",style:{gridTemplateColumns:"minmax(5em,max-content) minmax(0,1fr)",columnGap:14,rowGap:6}},rows.map(([k,v])=>React.createElement(React.Fragment,{key:k},React.createElement("dt",{className:"font-black text-cyan-100",style:{whiteSpace:"nowrap"}},k),React.createElement("dd",{className:"m-0 min-w-0 text-white/80"},v)))));
const help=screen==="HELP"&&React.createElement(HexMenuShell,{title:"遊び方",back:()=>setScreen("HOME"),wide:true},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:12}},
        helpSection("ルール",[["勝ち負け","あふれたら負け"],["消す","同じ色を6個つなげる"],["連鎖","続けて消える"],["技","一直線・三角形・六角形で消す"],["攻撃","技でおじゃま球を送る"],["おじゃま","赤く光ったら降ってくる"],["速さ","少しずつ速くなる"]]),
        ...[["touch","タッチ操作",HEX_CONTROL_GUIDES.touch],["keys","キーボード",HEX_CONTROL_GUIDES.keys],["pad","コントローラー",[...HEX_CONTROL_GUIDES.pad,["A / B（メニュー）","決定 / 戻る"]]]].filter(([k])=>helpAllInputs||k===hexInputKind()).map(([k,t,rows])=>React.createElement("div",{key:k},helpSection(t,rows)))),
    !helpAllInputs&&React.createElement("button",{onClick:()=>setHelpAllInputs(true),className:"mt-4 self-center inline-flex items-center gap-2 rounded-full pl-5 pr-4 text-[14px] font-semibold text-white/85 active:scale-[.98]",style:{minHeight:44,...HEX_MENU_SURFACE}},"ほかの入力方法の操作も見る",React.createElement(HexChevron,{dir:"down",color:"rgba(255,255,255,.7)",size:16})));
const tutorial=screen==="TUTORIAL"&&React.createElement(HexTutorial,{onExit:()=>{setTutorialDone(hexReadStored("hexdrop_tutorial_done","0")==="1");setScreen("HOME");},onShowHelp:()=>{setTutorialDone(true);setScreen("HELP");},onPractice:()=>{initUiAudio();startTutorial(0);},onVsAi:()=>{setTutorialDone(true);initUiAudio();startMatch("CPU",1,{name:`CPU ${AI_PARAMS[1].name}`,rating:880+1*130});}});
const cpuRecord=screen==="CPU"?hexCpuRecord():null,cpuGoal=cpuRecord?[1,2,3,4,5].find((lv)=>!cpuRecord[lv].w)||0:0;
const cpuCleared=cpuRecord?[1,2,3,4,5].filter((lv)=>cpuRecord[lv].w).length:0;
const cpu=screen==="CPU"&&React.createElement(HexMenuShell,{title:"AI対戦",back:()=>setScreen("HOME"),wide:false},
    React.createElement("div",{"data-hex-cpu-progress":"1",className:"mb-4 flex items-center gap-4 px-1"},
        React.createElement("div",{className:"text-[13px] text-white/60 shrink-0"},"勝利した強さ ",React.createElement("span",{className:"tabular-nums text-white font-bold"},cpuCleared)," / 5"),
        React.createElement("div",{className:"flex-1 flex gap-1.5","aria-hidden":"true"},[1,2,3,4,5].map((lv)=>React.createElement("div",{key:lv,className:"h-1 flex-1 rounded-full",style:{background:cpuRecord[lv].w?"#FFD36A":"rgba(255,255,255,.12)"}})))),
    React.createElement("div",{className:"grid grid-cols-2 gap-3"},[1,2,3,4,5].map((lv)=>React.createElement(HexMenuButton,{key:lv,compact:true,icon:React.createElement("span",null,String(lv)),title:AI_PARAMS[lv].name,meta:cpuRecord[lv].w+cpuRecord[lv].l?`${cpuRecord[lv].w}勝 ${cpuRecord[lv].l}敗`:null,badge:cpuRecord[lv].w?{text:"勝利",color:"#FFD36A",dark:true}:lv===cpuGoal?{text:"次の目標",color:"#2FE3F5"}:null,accent:lv===5?"pink":lv>=3?"cyan":"gray",onClick:()=>startMatch("CPU",lv,{name:`CPU ${AI_PARAMS[lv].name}`,rating:880+lv*130})}))));
const friend=screen==="FRIEND"&&React.createElement(HexMenuShell,{title:"ルームでプレイ",back:()=>{setRoomErr("");setScreen("HOME");},wide:false},
    React.createElement(HexPanel,{className:"p-5"},
        React.createElement("div",{className:"grid gap-4"},
            React.createElement("button",{onClick:()=>{initUiAudio();setRoomErr("");setScreen("ROOM_HOST");},className:"hex-btn hex-btn-violet w-full px-4 text-[15px]",style:{minHeight:52}},"新しくルームを作成"),
            React.createElement("label",{htmlFor:"hex-room-code",className:"text-[13px] font-semibold text-white/60 pt-2"},"ルームコードで参加"),
            React.createElement("div",{className:"flex gap-2"},
                React.createElement("input",{id:"hex-room-code",value:room,onChange:e=>{setRoomErr("");setRoom(e.target.value.replace(/\D/g,"").slice(0,6));},onKeyDown:e=>{if(e.key==="Enter"&&room.length===6){initUiAudio();setScreen("ROOM_JOIN");}},placeholder:"6桁のコード",inputMode:"numeric",autoComplete:"off",className:"flex-1 min-w-0 px-4 py-3 rounded-xl bg-black/30 border border-white/15 text-white text-center tracking-[0.28em] font-bold tabular-nums placeholder:text-white/40"}),
                React.createElement("button",{disabled:room.length!==6,onClick:()=>{initUiAudio();setRoomErr("");setScreen("ROOM_JOIN");},className:"hex-btn hex-btn-primary px-6 text-[15px]",style:{minHeight:52}},"参加")),
            roomErr&&React.createElement("div",{role:"alert",className:"rounded-xl px-3 py-2 text-[12px] leading-relaxed font-bold",style:{border:"1px solid rgba(255,62,165,.28)",background:"rgba(255,62,165,.08)",color:"#ffb8d6"}},hexFriendlyNetError(roomErr))
            )));
const roomHost=screen==="ROOM_HOST"&&React.createElement(RoomHost,{onMatched:(match)=>beginOnline(match,"ROOM"),onCancel:()=>setScreen("FRIEND"),onError:(m)=>{setRoomErr(m);setScreen("FRIEND");}});
const roomJoin=screen==="ROOM_JOIN"&&React.createElement(RoomJoin,{code:room,onMatched:(match)=>beginOnline(match,"ROOM"),onCancel:()=>setScreen("FRIEND"),onError:(m)=>{setRoomErr(m);setScreen("FRIEND");}});
// Keep the screen on while playing or waiting for an opponent; phones
// otherwise lock after ~30 s without touches and the connection drops.
useEffect(() => {
    const want = (screen === "GAME" && !pauseOpen) || screen === "MATCHING" || screen === "ROOM_HOST" || screen === "ROOM_JOIN";
    if (!want || typeof navigator === "undefined" || !navigator.wakeLock) return;
    let lock = null, alive = true;
    const acquire = () => { if (!alive || document.hidden || lock) return; navigator.wakeLock.request("screen").then((l) => { if (!alive) { l.release().catch(() => {}); return; } lock = l; l.addEventListener("release", () => { lock = null; }); }).catch(() => {}); };
    const onVis = () => { if (!document.hidden) acquire(); };
    acquire(); document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); if (lock) lock.release().catch(() => {}); };
}, [screen, pauseOpen]);
// Offline matches: a tap or key during the intro jumps to "スタート！".
const skipIntro = useCallback(() => {const me = meRef.current, foe = foeRef.current;if (!me || matchRef.current || me.state !== "READY") return;for (const g of [me, foe]) if (g && g.state === "READY" && g.stateT < READY_START_BEGIN) g.stateT = READY_START_BEGIN;}, []);
useEffect(() => {const cv = cvRef.current;if (!cv || screen !== "GAME") return;cv.addEventListener("pointerdown", skipIntro);return () => cv.removeEventListener("pointerdown", skipIntro);}, [screen, skipIntro]);
// Phone back button: while away from HOME one extra history entry is kept, so
// "back" returns to the previous screen (in a match it opens or closes the
// pause menu) instead of leaving the app.
const histRef = useRef({ guard: false, ignore: 0 });
useEffect(() => {const h = histRef.current;if (screen !== "HOME" && !h.guard) {try { history.pushState({ sixball: 1 }, ""); h.guard = true; } catch (_) {}} else if (screen === "HOME" && h.guard) {h.guard = false;h.ignore++;try { history.back(); } catch (_) { h.ignore--; }}}, [screen]);
useEffect(() => {const onPop = () => {const h = histRef.current;if (h.ignore > 0) { h.ignore--; return; }h.guard = false;const scr = stateRef.current.screen;
    if (scr === "GAME") {setPauseOpen((v) => !v);try { history.pushState({ sixball: 1 }, ""); h.guard = true; } catch (_) {}return;}
    if (scr === "MATCHING") Net.cancelMatchmaking();
    if (scr === "ROOM_HOST" || scr === "ROOM_JOIN") { setScreen("FRIEND"); return; }
    if (scr !== "HOME") setScreen("HOME");};
    window.addEventListener("popstate", onPop);return () => window.removeEventListener("popstate", onPop);}, []);
const closeNamePrompt=()=>{hexStoreMenuPref("hexdrop_name_prompted","1");setNamePrompt(false);setNameErr("");};
const submitFirstName=()=>{const c=HexPlayerName.check(nameDraft);if(!c.ok){setNameErr(c.reason==="blocked"?NAME_BLOCKED:"");return;}setNickname(c.name);setProfileDraft(c.name);closeNamePrompt();initUiAudio();Sfx.play({t:"move"},.7);};
const nameDialog=screen==="HOME"&&namePrompt&&React.createElement("div",{role:"dialog","aria-modal":"true","aria-labelledby":"hexNameTitle","data-hex-name-prompt":"1",className:"absolute inset-0 z-[25] flex items-center justify-center px-6",style:{background:"rgba(4,3,14,.72)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)"}},
    React.createElement(HexPanel,{accent:"cyan",className:"w-full p-6",style:{maxWidth:460}},
        React.createElement("div",{id:"hexNameTitle",className:"text-xl font-black text-white"},"ニックネームを決めよう"),
        React.createElement("form",{className:"mt-4 flex items-stretch gap-2",onSubmit:e=>{e.preventDefault();submitFirstName();}},
            React.createElement("input",{value:nameDraft,autoFocus:true,maxLength:12,"aria-label":"ニックネーム","aria-invalid":nameErr?"true":undefined,placeholder:"12文字まで",onChange:e=>{setNameDraft(e.target.value.slice(0,12));setNameErr("");},className:"min-w-0 flex-1 rounded-xl px-3 text-[15px] font-black text-white outline-none",style:{minHeight:44,background:"rgba(0,0,0,.28)",border:`1px solid ${nameErr?"rgba(255,59,77,.6)":"rgba(255,255,255,.13)"}`}}),
            React.createElement("button",{type:"submit",disabled:!nameDraft.trim(),className:"hex-btn hex-btn-primary px-6 text-[14px]"},"決定")),
        nameErr&&React.createElement("div",{role:"alert","data-hex-name-error":"1",className:"mt-2 text-[12px] font-semibold",style:{color:"#ff9bbf"}},nameErr),
        React.createElement("div",{className:"mt-3 flex items-center justify-end gap-1 flex-wrap"},
            React.createElement("button",{onClick:()=>{closeNamePrompt();setProfileDraft(nickname);setScreen("PROFILE");},className:"hex-btn hex-btn-ghost px-4 text-[13px]",style:{color:"rgba(207,250,254,.9)"}},"ログインして引き継ぐ"),
            React.createElement("button",{onClick:closeNamePrompt,className:"hex-btn px-4 text-[13px] text-white/60",style:{fontWeight:700}},"あとで"))));
return (React.createElement("div", { className: "relative w-full h-screen overflow-hidden font-sans", style: { background: "#060512" } },
React.createElement("div", { className: (bgWideUrl ? "hex-wide-bg " : "") + "w-full h-full flex items-center justify-center", style: bgWideUrl ? { "--hex-wide-bg": `url(${bgWideUrl})` } : undefined },React.createElement("div", { className: "hex-board-bg relative", style: { width: "min(100vw, calc(100vh * 16 / 9))", aspectRatio: `${VW} / ${VH}`, ...(bgLayerUrl ? { backgroundImage: `url(${bgLayerUrl})`, backgroundSize: "100% 100%" } : null) } },React.createElement("canvas", { ref: cvRef, className: "touch-none select-none", role: "img", "aria-label": screen === "GAME" ? `対戦画面：左があなた（${nickname||"Player"}）、右が相手（${opp?.name ?? "CPU"}）` : "", style: { width: "100%", height: "100%" } }),
screen === "GAME" && tut && React.createElement(HexTutorialPanel, { lesson: tut.lesson, tracker: tut.tracker, status: tut.status, message: tut.message, onNext: () => startTutorial(tut.lesson + 1), onRetry: () => startTutorial(tut.lesson), onExit: () => {runRef.current = false;tutorialRef.current = null;setTut(null);setScreen("HOME");}, onVsAi: () => startMatch("CPU", 1, { name: `CPU ${AI_PARAMS[1].name}`, rating: 880 + 1 * 130 }) }))),
screen === "GAME" && React.createElement("button", { onClick: () => setPauseOpen(true), "aria-label": "ポーズメニューを開く", title: "ポーズ（Esc）", className: "absolute left-1/2 -translate-x-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center gap-1 active:scale-95", style: { top: "max(8px, env(safe-area-inset-top))", background: "rgba(10,12,28,.6)", border: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } }, React.createElement("span", { className: "block w-1 h-4 rounded-sm bg-white/80" }), React.createElement("span", { className: "block w-1 h-4 rounded-sm bg-white/80" })),
screen === "GAME" && matchRef.current && !foeConn && React.createElement("div", { role: "status", className: "absolute left-1/2 -translate-x-1/2 z-10 rounded-xl px-4 py-2 text-[13px] font-bold text-center", style: { top: 60, color: "#ffd2e3", background: "rgba(40,6,24,.82)", border: "1px solid rgba(255,62,165,.4)" } }, "相手の接続が切れました（5秒で勝利）"),
screen === "GAME" && pauseOpen && React.createElement(HexPauseMenu, { online: !!matchRef.current, ranked: !!matchRef.current && matchKindRef.current !== "ROOM" && matchRef.current.ranked !== false, onResume: () => setPauseOpen(false), onRestart: matchRef.current ? null : () => (tutorialRef.current ? startTutorial(tutorialRef.current.lesson) : startMatch(mode, aiLevel, opp)), onQuit: () => {runRef.current = false;setPauseOpen(false);/* Online: the resignation goes through finish(), which records the loss (and rating) before leaving the match. */if (matchRef.current) matchRef.current.reportResult(false, "resign");setScreen("HOME");} }),
portrait && React.createElement("div", { className: "absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-8 text-center", style: { background: SPACE_BG } },React.createElement("div", { className: "text-white font-extrabold text-lg" }, "端末を横向きにしてください"),React.createElement("div", { className: "text-white/65 text-sm leading-relaxed" },"自動回転をオンにしてください")),
// The match-start reveal: a black layer over the whole screen (a child of the
// root, not of the 16:9 game area) that fades out over READY_FADE_IN_DURATION
// (CSS animation hexIntroFade in index.html), remounted for every match.
screen === "GAME" && React.createElement("div", { key: "intro" + matchGenRef.current, "aria-hidden": "true", "data-hex-intro-dim": "1", className: "absolute inset-0 pointer-events-none", style: { background: "#000", zIndex: 15, animation: `hexIntroFade ${READY_FADE_IN_DURATION}s linear forwards` } }),
home,nameDialog,battle,profile,settings,help,tutorial,cpu,rankingScreen,
screen === "MATCHING" && React.createElement(Matching, { onMatched: beginOnline, onCancel: () => { Net.cancelMatchmaking(); setScreen("HOME"); }, onError: (m) => { setNetErr(m); setScreen("HOME"); } }),
friend,roomHost,roomJoin,
screen === "RESULT" && React.createElement(ResultOverlay,{win:!!result?.win,delta:result?.delta||0,reason:result?.reason||"",online:!!result?.online,ranked:!!result?.ranked&&matchKindRef.current!=="ROOM",rating:result?.rating,summary:result?.summary,progress:result?.progress,levelName:mode==="CPU"?AI_PARAMS[aiLevel]?.name||"":"",meName:nickname||"Player",foeName:opp?.name??"CPU",nextLabel:mode==="ONLINE"?(matchKindRef.current==="ROOM"?"ルームへ戻る":"次の相手を探す"):(mode==="CPU"&&result?.win&&aiLevel<5?"次のレベルへ":"もう一度"),onNext:()=>{if(mode==="ONLINE")setScreen(matchKindRef.current==="ROOM"?"FRIEND":"MATCHING");else if(mode==="CPU"&&result?.win&&aiLevel<5){/* A CPU win moves on to the next level; the top level and a loss replay the same one. */const lv=aiLevel+1;startMatch("CPU",lv,{name:`CPU ${AI_PARAMS[lv].name}`,rating:880+lv*130});}else startMatch(mode,aiLevel,opp);},onExit:()=>setScreen("HOME")})));
}
