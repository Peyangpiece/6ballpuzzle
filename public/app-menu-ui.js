/* HEXDROP immersive menu system.
 * UI-only components and persisted preferences. No game physics are touched.
 */
const HEX_MENU_ACCENTS={cyan:"#2FE3F5",pink:"#FF3EA5",violet:"#9B6DFF",gold:"#FFD36A",gray:"#AAB6D6"};

function hexReadStored(key,fallback){
    try{const v=localStorage.getItem(key);return v===null?fallback:v;}catch(_){return fallback;}
}
function hexReadStoredNumber(key,fallback){
    const n=Number(hexReadStored(key,fallback));return Number.isFinite(n)?n:fallback;
}
function hexLoadMenuPrefs(){
    return{
        nickname:String(hexReadStored("hexdrop_nickname","Player")||"Player").slice(0,12),
        bgmVolume:Math.max(0,Math.min(100,hexReadStoredNumber("hexdrop_bgm_volume",70))),
        sfxVolume:Math.max(0,Math.min(100,hexReadStoredNumber("hexdrop_sfx_volume",85))),
        haptics:hexReadStored("hexdrop_haptics","1")!=="0",
        offset:hexReadStored("hexdrop_offset","0")==="1"
    };
}
function hexStoreMenuPref(key,value){try{localStorage.setItem(key,String(value));}catch(_){} }
function hexApplySfxVolume(percent){
    const p=Math.max(0,Math.min(100,Number(percent)||0));
    Sfx._menuVolume=p/100;
    Sfx.enabled=p>0;
    if(Sfx.master&&Sfx.ctx){
        const target=.70*Sfx._menuVolume;
        try{Sfx.master.gain.setTargetAtTime(target,Sfx.ctx.currentTime,.025);}catch(_){Sfx.master.gain.value=target;}
    }
}
(function installMenuSfxVolumeBridge(){
    if(typeof Sfx==="undefined"||Sfx.__menuVolumeBridge)return;
    Sfx.__menuVolumeBridge=true;Sfx._menuVolume=1;
    const baseInit=Sfx.init.bind(Sfx);
    Sfx.init=function(){baseInit();if(this.master&&this.ctx){const target=.70*(Number.isFinite(this._menuVolume)?this._menuVolume:1);this.master.gain.value=target;}};
})();
function hexRankLabel(r){
    r=Number(r)||0;
    if(r>=1800)return"MASTER";if(r>=1500)return"DIAMOND";if(r>=1300)return"PLATINUM";if(r>=1150)return"GOLD";if(r>=1000)return"SILVER";return"BRONZE";
}
function hexWinRate(w,l){const n=(Number(w)||0)+(Number(l)||0);return n?Math.round((Number(w)||0)/n*100):0;}

/* Match records kept in this browser: personal bests over every CPU and online
 * match, and wins/losses/streaks per CPU level. The online win/loss record and
 * rating stay on the server profile.
 */
const HEX_CPU_RECORD_KEY="hexdrop_cpu_record",HEX_BESTS_KEY="hexdrop_bests";
function hexReadJson(key){try{const v=JSON.parse(hexReadStored(key,"null"));return v&&typeof v==="object"?v:{};}catch(_){return{};}}
function hexCpuRecord(){
    const raw=hexReadJson(HEX_CPU_RECORD_KEY),out={};
    for(let lv=1;lv<=5;lv++){const r=raw[lv]||{};out[lv]={w:Math.max(0,Number(r.w)||0),l:Math.max(0,Number(r.l)||0),streak:Math.max(0,Number(r.streak)||0),best:Math.max(0,Number(r.best)||0)};}
    return out;
}
function hexBests(){
    const b=hexReadJson(HEX_BESTS_KEY),n=k=>Math.max(0,Number(b[k])||0);
    return{games:n("games"),maxChain:n("maxChain"),waza:n("waza"),cleared:n("cleared"),fastestWin:n("fastestWin")};
}
function hexMatchSummary(g){
    const s=(g&&g.stats)||{},w=s.waza||{},waza={STRAIGHT:Number(w.STRAIGHT)||0,PYRAMID:Number(w.PYRAMID)||0,HEXAGON:Number(w.HEXAGON)||0};
    return{time:Math.max(0,Number(s.time)||0),waza,wazaTotal:waza.STRAIGHT+waza.PYRAMID+waza.HEXAGON,maxChain:Number(s.maxChain)||0,cleared:Number(s.cleared)||0};
}
// Stores one finished match and returns what it changed, for the result screen.
// A best counts as new only when an earlier match set the previous value.
function hexRecordMatch({cpuLevel=0,win,summary}){
    const out={newBests:[],level:null,firstWin:false};
    if(summary){
        const b=hexBests(),had=b.games>0,next={...b,games:b.games+1};
        for(const k of["maxChain","waza","cleared"]){const v=k==="waza"?summary.wazaTotal:summary[k];if(v>b[k]){next[k]=v;if(had&&v>0)out.newBests.push(k);}}
        if(win&&summary.time>0&&(!b.fastestWin||summary.time<b.fastestWin)){next.fastestWin=Math.round(summary.time*10)/10;if(had&&b.fastestWin)out.newBests.push("fastestWin");}
        hexStoreMenuPref(HEX_BESTS_KEY,JSON.stringify(next));
    }
    if(cpuLevel>=1&&cpuLevel<=5){
        const all=hexCpuRecord(),r={...all[cpuLevel]};
        out.firstWin=!!win&&r.w===0;
        if(win){r.w++;r.streak++;r.best=Math.max(r.best,r.streak);}else{r.l++;r.streak=0;}
        all[cpuLevel]=r;out.level={lv:cpuLevel,...r};
        hexStoreMenuPref(HEX_CPU_RECORD_KEY,JSON.stringify(all));
    }
    return out;
}
function hexFormatTime(sec){sec=Math.max(0,Math.round(Number(sec)||0));return`${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;}

function HexLogoMark({size=210}){
    const ref=React.useRef(null);

    React.useEffect(()=>{
        const cv=ref.current;
        if(!cv)return;

        const img=new Image();

        img.onload=()=>{
            const w=img.naturalWidth||816;
            const h=img.naturalHeight||768;

            cv.width=w;
            cv.height=h;

            const ctx=cv.getContext(
                "2d",
                {willReadFrequently:true}
            );

            ctx.clearRect(0,0,w,h);
            ctx.drawImage(img,0,0,w,h);

            try{
                const image=
                    ctx.getImageData(
                        0,0,w,h
                    );

                const d=image.data;

                for(
                    let i=0;
                    i<d.length;
                    i+=4
                ){
                    const r=d[i];
                    const g=d[i+1];
                    const b=d[i+2];

                    const hi=
                        Math.max(r,g,b);

                    const lo=
                        Math.min(r,g,b);

                    const chroma=
                        hi-lo;

                    let alpha=1;

                    /*
                     * JPEGの黒背景だけを透明化。
                     * ロゴ内部の暗い色面は
                     * 色差があるので保持する。
                     */
                    if(
                        hi<=16 &&
                        chroma<=8
                    ){
                        alpha=0;
                    }
                    else if(
                        hi<45 &&
                        chroma<14
                    ){
                        alpha=
                            Math.max(
                                0,
                                Math.min(
                                    1,
                                    (hi-16)/29
                                )
                            );
                    }

                    d[i+3]=
                        Math.round(
                            d[i+3]*alpha
                        );
                }

                ctx.clearRect(
                    0,0,w,h
                );

                ctx.putImageData(
                    image,
                    0,0
                );
            }catch(err){
                console.warn(
                    "logo transparency failed",
                    err
                );
            }
        };

        img.src=
            "/assets/6ball-logo-source.jpg";
    },[]);

    return React.createElement(
        "div",
        {
            style:{
                position:"relative",
                width:size,
                height:size*.94,
                flexShrink:0
            }
        },

        React.createElement(
            "div",
            {
                style:{
                    position:"absolute",
                    inset:"14%",
                    borderRadius:"45%",
                    background:
                        "radial-gradient(circle,rgba(255,93,156,.15),rgba(70,208,214,.11) 48%,transparent 72%)",
                    filter:"blur(25px)",
                    transform:"scale(1.1)"
                }
            }
        ),

        React.createElement(
            "canvas",
            {
                ref,
                style:{
                    position:"absolute",
                    inset:0,
                    width:"100%",
                    height:"100%",
                    objectFit:"contain",
                    filter:
                        "saturate(1.10) contrast(1.04) brightness(1.05) drop-shadow(0 18px 30px rgba(0,0,0,.32))"
                }
            }
        )
    );
}

/* Menu chrome. One quiet surface language for every menu screen: a soft
 * gradient backdrop, hairline-bordered translucent rows and generous spacing.
 * No icon tiles, glows or decorative text; the accent colours survive only as
 * small hints (chevrons, values, switches).
 */
const HEX_MENU_SURFACE={background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)"};
function HexChevron({dir="right",color="rgba(255,255,255,.4)",size=18}){
    const d=dir==="left"?"M11.5 3.5 6 9l5.5 5.5":"M6.5 3.5 12 9l-5.5 5.5";
    return React.createElement("svg",{"aria-hidden":"true",width:size,height:size,viewBox:"0 0 18 18",fill:"none",style:{flexShrink:0,display:"block"}},React.createElement("path",{d,stroke:color,strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"}));
}
function HexMenuBackdrop(){
    return React.createElement("div",{className:"absolute inset-0 pointer-events-none overflow-hidden","aria-hidden":"true",style:{background:"radial-gradient(900px 520px at 12% 18%,rgba(58,38,145,.30),transparent 60%),radial-gradient(760px 460px at 88% 28%,rgba(0,187,210,.16),transparent 62%),radial-gradient(800px 440px at 58% 112%,rgba(255,62,165,.14),transparent 58%),linear-gradient(145deg,#050412 0%,#08081c 46%,#050512 100%)"}});
}

function HexMenuShell({children,title,back,wide=true}){
    return React.createElement("div",{className:"absolute inset-0 z-20 overflow-y-auto font-sans",style:{paddingTop:"max(16px,env(safe-area-inset-top))",paddingBottom:"max(16px,env(safe-area-inset-bottom))",paddingLeft:"max(24px,env(safe-area-inset-left))",paddingRight:"max(24px,env(safe-area-inset-right))"}},
        React.createElement(HexMenuBackdrop,null),
        React.createElement("div",{className:"relative z-10 mx-auto min-h-full flex flex-col justify-center",style:{maxWidth:wide?920:640}},
            (title||back)&&React.createElement("div",{className:"flex items-center gap-3",style:{marginBottom:"clamp(14px,3vh,28px)"}},
                back&&React.createElement("button",{onClick:back,"aria-label":"戻る","data-hex-back":"1",className:"shrink-0 flex items-center justify-center rounded-full active:scale-95",style:{width:40,height:40,...HEX_MENU_SURFACE}},React.createElement(HexChevron,{dir:"left",color:"rgba(255,255,255,.85)",size:20})),
                title&&React.createElement("div",{className:"text-white font-bold tracking-[.01em]",style:{fontSize:"clamp(21px,2.6vw,28px)",lineHeight:1.2}},title)),
            children));
}

function HexMenuButton({title,subtitle,meta,badge=null,accent="cyan",onClick,disabled=false,compact=false}){
    const [hover,setHover]=React.useState(false),[down,setDown]=React.useState(false);const c=HEX_MENU_ACCENTS[accent]||HEX_MENU_ACCENTS.cyan;
    return React.createElement("button",{disabled,onClick,onPointerEnter:()=>setHover(true),onPointerLeave:()=>{setHover(false);setDown(false);},onPointerDown:()=>setDown(true),onPointerUp:()=>setDown(false),className:"w-full text-left flex items-center gap-4 disabled:opacity-35",style:{minHeight:compact?56:64,padding:compact?"0 16px 0 18px":"0 18px 0 22px",borderRadius:16,...HEX_MENU_SURFACE,background:hover?"rgba(255,255,255,.085)":HEX_MENU_SURFACE.background,transform:down?"scale(.985)":"none",transition:"transform .12s ease,background .18s ease"}},
        React.createElement("div",{className:"min-w-0 flex-1"},
            React.createElement("div",{className:"flex items-center gap-2 min-w-0"},React.createElement("div",{className:"font-bold text-white truncate",style:{fontSize:compact?15:17,letterSpacing:".01em"}},title),badge&&React.createElement("span",{className:"shrink-0 rounded-full px-2 text-[11px] font-bold",style:{lineHeight:"18px",color:badge.dark?"#1d1600":badge.color,background:badge.dark?badge.color:`${badge.color}22`}},badge.text)),
            subtitle&&React.createElement("div",{className:"mt-0.5 text-[13px] text-white/55 truncate"},subtitle)),
        meta&&React.createElement("div",{className:"text-[13px] tabular-nums shrink-0 text-white/55"},meta),
        React.createElement(HexChevron,{color:c}));
}

function HexPanel({children,className="",style={}}){return React.createElement("div",{className,style:{...HEX_MENU_SURFACE,borderRadius:18,...style}},children);}
function HexStat({label,value,accent="cyan"}){const c=HEX_MENU_ACCENTS[accent]||HEX_MENU_ACCENTS.cyan;return React.createElement(HexPanel,{className:"p-4 text-center"},React.createElement("div",{className:"text-[11px] font-bold tracking-[.14em] text-white/50"},label),React.createElement("div",{className:"mt-1 font-bold tabular-nums",style:{fontSize:"clamp(20px,3vw,30px)",color:c}},value));}
function HexSettingSlider({label,caption,value,onChange,accent="cyan"}){const c=HEX_MENU_ACCENTS[accent]||HEX_MENU_ACCENTS.cyan;return React.createElement(HexPanel,{className:"px-5 py-4"},React.createElement("div",{className:"flex items-center justify-between gap-4 mb-3"},React.createElement("div",null,React.createElement("div",{className:"text-[15px] font-bold text-white"},label),caption&&React.createElement("div",{className:"text-[12px] text-white/50 mt-0.5 leading-relaxed"},caption)),React.createElement("div",{className:"text-[13px] tabular-nums text-white/60"},`${Math.round(value)}%`)),React.createElement("input",{type:"range",min:0,max:100,step:1,value,"aria-label":label,onChange:e=>onChange(Number(e.target.value)),className:"w-full",style:{accentColor:c}}));}
function HexSettingToggle({label,caption,value,onChange,accent="cyan"}){const c=HEX_MENU_ACCENTS[accent]||HEX_MENU_ACCENTS.cyan;return React.createElement("button",{onClick:()=>onChange(!value),role:"switch","aria-checked":value?"true":"false","aria-label":label,className:"w-full text-left"},React.createElement(HexPanel,{className:"px-5 py-4 flex items-center gap-4"},React.createElement("div",{className:"flex-1"},React.createElement("div",{className:"text-[15px] font-bold text-white"},label),caption&&React.createElement("div",{className:"text-[12px] text-white/50 mt-0.5 leading-relaxed"},caption)),React.createElement("div",{className:"shrink-0 relative rounded-full",style:{width:50,height:30,background:value?c:"rgba(255,255,255,.14)",transition:"background .18s ease"}},React.createElement("div",{style:{position:"absolute",top:2,left:value?22:2,width:26,height:26,borderRadius:"50%",background:"#fff",boxShadow:"0 2px 6px rgba(0,0,0,.35)",transition:"left .16s ease"}}))));}

window.__hexMenuUiVersion="menu-ui-v1";
