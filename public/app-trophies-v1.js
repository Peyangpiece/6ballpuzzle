/* Trophies: the score shown for online play, with leagues, the trophy road
 * and the cosmetic items it unlocks.
 *
 * - A rated (ranked) online match moves trophies by HexTrophies.delta: +10 / 0
 *   below 300, +8 / -4 below 1000, +6 / -6 from 1000. Everyone starts at 0.
 *   The Elo rating stays as the hidden matchmaking strength (app-15.js).
 * - best is the highest trophy count ever reached. Items on the road unlock at
 *   their trophy count and stay unlocked after a loss.
 * - Points come from the daily challenge (HexDaily, app-daily-v1.js) and buy
 *   the shop items (price instead of min); owned items stay owned.
 * - Three slots are equipped: icon (shown to others: home, ranking, online
 *   opponent), ball (the ball design this player sees) and fx (the clear
 *   effect on this player's own board).
 * firebase/database.rules.json checks the same numbers (tools/trophy-rules.js
 * writes those rules from this file); tests/trophies.js keeps them together.
 */
const HexTrophies=(function(){
"use strict";
function delta(trophies,win){
    const t=Math.max(0,Math.floor(Number(trophies)||0));
    if(t<300)return win?10:0;
    if(t<1000)return win?8:-4;
    return win?6:-6;
}
const LEAGUES=[
    {id:"BRONZE",name:"ブロンズ",min:0,color:"#D69A6A"},
    {id:"SILVER",name:"シルバー",min:300,color:"#C9D4E4"},
    {id:"GOLD",name:"ゴールド",min:600,color:"#FFD36A"},
    {id:"PLATINUM",name:"プラチナ",min:1000,color:"#8FF3E6"},
    {id:"DIAMOND",name:"ダイヤ",min:1500,color:"#9CC4FF"},
    {id:"MASTER",name:"マスター",min:2200,color:"#E39BFF"}
];
function league(trophies){
    const t=Math.max(0,Number(trophies)||0);let out=LEAGUES[0];
    for(const l of LEAGUES)if(t>=l.min)out=l;
    return out;
}
function nextLeague(trophies){const t=Math.max(0,Number(trophies)||0);return LEAGUES.find(l=>l.min>t)||null;}
// The cosmetic items. min is the trophy count (best ever) that unlocks one.
const ITEMS=[
    {slot:"icon",id:"initial",min:0,name:"イニシャル"},
    {slot:"ball",id:"glass",min:0,name:"ガラス"},
    {slot:"fx",id:"spark",min:0,name:"スパーク"},
    {slot:"icon",id:"star",min:50,name:"スター"},
    {slot:"fx",id:"color",min:100,name:"カラーフラッシュ"},
    {slot:"icon",id:"bolt",min:200,name:"イナズマ"},
    {slot:"ball",id:"pastel",min:300,name:"パステル"},
    {slot:"icon",id:"flame",min:450,name:"ほのお"},
    {slot:"fx",id:"hexring",min:600,name:"ヘキサリング"},
    {slot:"ball",id:"neon",min:800,name:"ネオン"},
    {slot:"icon",id:"crown",min:1000,name:"クラウン"},
    {slot:"fx",id:"starburst",min:1250,name:"スターバースト"},
    {slot:"ball",id:"gem",min:1500,name:"ジェム"},
    {slot:"icon",id:"gem",min:1800,name:"ダイヤ"},
    {slot:"fx",id:"nova",min:2200,name:"ノヴァ"},
    {slot:"icon",id:"master",min:2200,name:"マスター"},
    // The shop: bought with points (price), not on the road.
    {slot:"icon",id:"moon",price:300,name:"ムーン"},
    {slot:"icon",id:"sakura",price:400,name:"さくら"},
    {slot:"icon",id:"comet",price:600,name:"コメット"},
    {slot:"fx",id:"ripple",price:500,name:"リップル"},
    {slot:"fx",id:"petal",price:800,name:"ペタル"},
    {slot:"ball",id:"candy",price:1000,name:"キャンディ"},
    {slot:"ball",id:"metal",price:1500,name:"メタル"}
];
const SLOTS={icon:"アイコン",ball:"球のデザイン",fx:"消すときの演出"};
const DEFAULTS={icon:"initial",ball:"glass",fx:"spark"};
const item=(slot,id)=>ITEMS.find(i=>i.slot===slot&&i.id===id)||null;
// Shop items are keyed "<slot>_<id>" under users/{uid}/owned.
const ownKey=it=>it.slot+"_"+it.id;
const SHOP=ITEMS.filter(i=>i.price>0);
function unlocked(it,best,owned){
    if(!it)return false;
    if(it.price>0)return(owned||state.owned).includes(ownKey(it));
    return Math.max(0,Number(best===undefined?state.best:best)||0)>=it.min;
}
// The road: every item above 0 trophies, and each league, in trophy order.
function road(){
    const steps=ITEMS.filter(i=>i.min>0).map(i=>({min:i.min,kind:"item",item:i}));
    for(const l of LEAGUES)if(l.min>0)steps.push({min:l.min,kind:"league",league:l});
    return steps.sort((a,b)=>a.min-b.min||(a.kind==="league"?-1:1));
}
// Icon artwork: round badges drawn by tools/make-avatar-icons.py. "initial"
// has none (the avatar shows the first character of the name).
function iconSrc(id){return id&&id!=="initial"&&ITEMS.some(i=>i.slot==="icon"&&i.id===id)?"assets/icon-"+id+".png":null;}

// ------------------------------------------------------------ local state
const KEY="hexdrop_trophies_v1";
const state={trophies:0,best:0,points:0,owned:[],streak:0,dailyDay:0,equip:{...DEFAULTS},listeners:new Set()};
function read(){try{return JSON.parse(localStorage.getItem(KEY)||"null")||{};}catch(_){return{};}}
function write(){try{localStorage.setItem(KEY,JSON.stringify({trophies:state.trophies,best:state.best,points:state.points,owned:state.owned,streak:state.streak,dailyDay:state.dailyDay,equip:state.equip}));}catch(_){}}
function clean(slot,id){const it=item(slot,id);return it&&unlocked(it)?id:DEFAULTS[slot];}
function notify(){for(const f of state.listeners){try{f(snapshot());}catch(_){}}}
function snapshot(){return{trophies:state.trophies,best:state.best,points:state.points,owned:state.owned.slice(),streak:state.streak,dailyDay:state.dailyDay,equip:{...state.equip},league:league(state.trophies)};}
const ownedList=o=>Array.isArray(o)?o.filter(k=>typeof k==="string"):o&&typeof o==="object"?Object.keys(o).filter(k=>o[k]===true):[];
// What this player sees: the ball design (all balls on screen) and the clear
// effect on their own board (app-clear-all-ball-fx.js reads __hexClearFxStyle).
function applyVisuals(){
    if(typeof window==="undefined")return;
    window.__hexClearFxStyle=state.equip.fx;
    const ball=state.equip.ball;
    if(typeof BALL_IMG!=="undefined"&&Array.isArray(BALL_IMG)&&typeof BALL_SRC!=="undefined"){
        const names=["red","blue","green","yellow","purple"];
        BALL_IMG.forEach((im,i)=>{
            if(!im)return;
            const src=ball==="glass"?BALL_SRC[i]:"assets/ball-"+ball+"-"+names[i]+".png";
            if(!String(im.src||"").endsWith(src))im.src=src;
        });
        if(typeof FILTERED_BALL_SPRITES!=="undefined")FILTERED_BALL_SPRITES.clear();
    }
}
function set(profile){
    if(!profile||typeof profile!=="object")return;
    const t=Math.max(0,Math.floor(Number(profile.trophies)||0));
    state.trophies=t;
    state.best=Math.max(t,Math.floor(Number(profile.best)||0));
    state.points=Math.max(0,Math.floor(Number(profile.points)||0));
    state.owned=ownedList(profile.owned);
    state.streak=Math.max(0,Math.floor(Number(profile.streak)||0));
    state.dailyDay=Math.max(0,Math.floor(Number(profile.dailyDay)||0));
    const e=profile.equip&&typeof profile.equip==="object"?profile.equip:{};
    for(const slot of Object.keys(DEFAULTS))state.equip[slot]=clean(slot,e[slot]||state.equip[slot]);
    write();applyVisuals();notify();
}
{
    const saved=read();
    state.trophies=Math.max(0,Math.floor(Number(saved.trophies)||0));
    state.best=Math.max(state.trophies,Math.floor(Number(saved.best)||0));
    state.points=Math.max(0,Math.floor(Number(saved.points)||0));
    state.owned=ownedList(saved.owned);
    state.streak=Math.max(0,Math.floor(Number(saved.streak)||0));
    state.dailyDay=Math.max(0,Math.floor(Number(saved.dailyDay)||0));
    const e=saved.equip||{};
    for(const slot of Object.keys(DEFAULTS))state.equip[slot]=clean(slot,e[slot]);
}
// Equipping writes users/{uid}/equip/{slot} (rules check the unlock) and the
// icon on the ranking entry.
function equip(slot,id){
    const it=item(slot,id);
    if(!it||!unlocked(it))return false;
    state.equip[slot]=id;write();applyVisuals();notify();
    try{
        if(typeof Net!=="undefined"&&Net.fb&&Net.uid){
            const F=Net.fb;
            Net.profile.equip={...(Net.profile.equip||{}),[slot]:id};
            F.set(F.ref(Net.db,"users/"+Net.uid+"/equip/"+slot),id).catch(()=>{});
            if(slot==="icon")F.update(F.ref(Net.db,"leaderboard/"+Net.uid),{icon:id}).catch(()=>{});
        }
    }catch(_){}
    return true;
}
// Buying a shop item: points go down by its price and the item is owned, in
// one write that the rules check (lastPurchase names the item). Online only.
async function buy(slot,id){
    const it=item(slot,id);
    if(!it||!(it.price>0))throw new Error("not for sale");
    if(unlocked(it))return true;
    if(state.points<it.price)throw Object.assign(new Error("points"),{code:"points"});
    if(typeof Net==="undefined")throw new Error("offline");
    await Net.connect();
    const F=Net.fb,key=ownKey(it),points=state.points-it.price;
    await F.update(F.ref(Net.db,"users/"+Net.uid),{points,lastPurchase:key,["owned/"+key]:true,updatedAt:F.serverTimestamp()});
    Net.profile.points=points;Net.profile.lastPurchase=key;Net.profile.owned={...(Net.profile.owned||{}),[key]:true};
    state.points=points;if(!state.owned.includes(key))state.owned.push(key);write();notify();
    return true;
}
if(typeof document!=="undefined"){
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",applyVisuals,{once:true});
    else applyVisuals();
}
return{
    delta,LEAGUES,league,nextLeague,ITEMS,SHOP,SLOTS,DEFAULTS,item,unlocked,ownKey,road,iconSrc,
    state:snapshot,set,equip,buy,applyVisuals,
    subscribe(f){state.listeners.add(f);return()=>state.listeners.delete(f);}
};
})();

// ------------------------------------------------------------ screens
// Small previews of an item: the icon in its avatar circle, a ball of the
// design, or the shape of the clear effect.
function HexItemPreview({item,size=44}){
    if(item.slot==="icon")return React.createElement(HexAvatar,{name:typeof Net!=="undefined"&&Net.profile?Net.profile.name:"P",icon:item.id,size});
    if(item.slot==="ball")return React.createElement("img",{src:item.id==="glass"?"assets/ball-glass-red.png":"assets/ball-"+item.id+"-red.png",alt:"",width:size,height:size,style:{display:"block",width:size,height:size}});
    const c=item.id==="petal"?"#FF9CC2":"#FF6E7C",w="#FFFFFF",ink=item.id==="spark"||item.id==="hexring"?w:c,star=(n,r,ri)=>{let d="";for(let i=0;i<n*2;i++){const a=i*Math.PI/n-Math.PI/2,k=i%2?ri:r;d+=(i?"L":"M")+(12+Math.cos(a)*k).toFixed(2)+" "+(12+Math.sin(a)*k).toFixed(2);}return d+"Z";};
    const parts=[];
    if(item.id==="hexring")parts.push(React.createElement("path",{key:"r",d:"M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z",fill:"none",stroke:ink,strokeWidth:1.6}));
    else parts.push(React.createElement("circle",{key:"r",cx:12,cy:12,r:item.id==="nova"?10:9,fill:"none",stroke:ink,strokeWidth:item.id==="nova"?2:1.6}));
    if(item.id==="ripple"){parts.push(React.createElement("circle",{key:"r2",cx:12,cy:12,r:5,fill:"none",stroke:c,strokeWidth:1.4}));parts.push(React.createElement("circle",{key:"d",cx:12,cy:12,r:1.8,fill:w}));}
    else if(item.id==="petal"){for(let i=0;i<5;i++){const a=i*72-90;parts.push(React.createElement("ellipse",{key:"p"+i,cx:12+Math.cos(a*Math.PI/180)*3.6,cy:12+Math.sin(a*Math.PI/180)*3.6,rx:3.3,ry:1.9,transform:`rotate(${a} ${12+Math.cos(a*Math.PI/180)*3.6} ${12+Math.sin(a*Math.PI/180)*3.6})`,fill:"#FFD1E3"}));}parts.push(React.createElement("circle",{key:"c",cx:12,cy:12,r:1.5,fill:"#FFE38A"}));}
    else if(item.id==="nova"){for(let i=0;i<8;i++){const a=i*Math.PI/4;parts.push(React.createElement("line",{key:"l"+i,x1:12+Math.cos(a)*2.6,y1:12+Math.sin(a)*2.6,x2:12+Math.cos(a)*7.4,y2:12+Math.sin(a)*7.4,stroke:c,strokeWidth:1.6,strokeLinecap:"round"}));}parts.push(React.createElement("circle",{key:"c",cx:12,cy:12,r:2,fill:w}));}
    else parts.push(React.createElement("path",{key:"s",d:item.id==="starburst"?star(8,7,2.4):star(6,4.6,1.9),fill:item.id==="color"||item.id==="starburst"?c:w}));
    return React.createElement("svg",{"aria-hidden":"true",width:size,height:size,viewBox:"0 0 24 24",style:{display:"block",filter:"drop-shadow(0 0 4px rgba(255,110,124,.55))",background:"rgba(6,5,18,.6)",borderRadius:size/2}},parts);
}
// The trophy screen: the road, a map that runs left to right as trophies
// grow, with every reward and league on it, the gold path up to the player's
// count and their avatar standing there; and the collection to equip items.
const HEX_ROAD_GAP=128,HEX_ROAD_PAD=84,HEX_ROAD_TRACK=150;
function hexRoadX(steps,trophies){
    // Position along the road: even spacing between steps, filled in
    // proportion to the trophies between two steps.
    const t=Math.max(0,Number(trophies)||0);
    for(let i=0;i<steps.length-1;i++){
        const a=steps[i],b=steps[i+1];
        if(t<b.min)return HEX_ROAD_PAD+HEX_ROAD_GAP*(i+(b.min>a.min?(t-a.min)/(b.min-a.min):0));
    }
    return HEX_ROAD_PAD+HEX_ROAD_GAP*(steps.length-1);
}
function HexTrophyRoad({st}){
    const steps=[{min:0,kind:"league",league:HexTrophies.LEAGUES[0]}].concat(HexTrophies.road());
    const boxRef=useRef(null);
    const width=HEX_ROAD_PAD*2+HEX_ROAD_GAP*(steps.length-1);
    const here=hexRoadX(steps,st.trophies);
    useEffect(()=>{const box=boxRef.current;if(box)box.scrollLeft=Math.max(0,here-box.clientWidth*.35);},[]);
    const node=(s,i)=>{
        const x=HEX_ROAD_PAD+HEX_ROAD_GAP*i,got=st.best>=s.min,isLeague=s.kind==="league";
        const it=s.item,on=it&&st.equip[it.slot]===it.id;
        const card=isLeague
            ?React.createElement("div",{className:"flex flex-col items-center"},
                React.createElement("div",{className:"rounded-full flex items-center justify-center",style:{width:58,height:58,background:`radial-gradient(circle at 35% 30%,#ffffffaa,${s.league.color} 58%,${s.league.color}55)`,boxShadow:got?`0 0 22px ${s.league.color}aa`:"none",filter:got?"none":"grayscale(.85) brightness(.6)"}},React.createElement(HexIcon,{name:"trophy",size:26,color:"#07101a",strokeWidth:2.2})),
                React.createElement("div",{className:"mt-1.5 text-[13px] font-black whitespace-nowrap",style:{color:got?s.league.color:"rgba(255,255,255,.45)"}},s.league.name))
            :React.createElement("button",{disabled:!got||on,onClick:()=>HexTrophies.equip(it.slot,it.id),"data-hex-item":it.slot+":"+it.id,"aria-label":it.name+(got?(on?"（装備中）":"を装備"):`（${s.min}で解放）`),
                className:"flex flex-col items-center rounded-2xl px-2 pt-2 pb-1.5",style:{width:108,background:on?"rgba(47,227,245,.12)":got?"rgba(255,211,106,.08)":"rgba(255,255,255,.03)",border:"1px solid "+(on?"rgba(47,227,245,.55)":got?"rgba(255,211,106,.3)":"rgba(255,255,255,.08)"),opacity:got?1:.55}},
                React.createElement(HexItemPreview,{item:it,size:40}),
                React.createElement("div",{className:"mt-1 text-[12px] font-bold text-white leading-tight whitespace-nowrap"},it.name),
                React.createElement("div",{className:"text-[10px] font-semibold whitespace-nowrap",style:{color:on?"#2FE3F5":got?"#7DFFB2":"rgba(255,255,255,.5)"}},on?"装備中":got?"タップで装備":HexTrophies.SLOTS[it.slot]));
        return React.createElement(React.Fragment,{key:i},
            React.createElement("div",{"data-hex-road-step":got?"got":"locked",className:"absolute flex justify-center",style:{left:x-60,width:120,bottom:`calc(100% - ${HEX_ROAD_TRACK-18}px)`}},card),
            React.createElement("div",{"aria-hidden":"true",className:"absolute rounded-full",style:{left:x-(isLeague?9:7),top:HEX_ROAD_TRACK-(isLeague?9:7),width:isLeague?18:14,height:isLeague?18:14,background:got?"#FFD36A":"#2A2850",border:"2px solid "+(got?"#FFF1C2":"rgba(255,255,255,.18)"),boxShadow:got?"0 0 10px rgba(255,211,106,.7)":"none"}}),
            React.createElement("div",{className:"absolute flex items-center justify-center gap-1 text-[12px] font-bold tabular-nums",style:{left:x-40,width:80,top:HEX_ROAD_TRACK+14,color:got?"#FFD36A":"rgba(255,255,255,.45)"}},React.createElement(HexIcon,{name:"trophy",size:12,color:got?"#FFD36A":"rgba(255,255,255,.4)"}),s.min));
    };
    return React.createElement("div",{ref:boxRef,"data-hex-road":"1",className:"overflow-x-auto overflow-y-hidden",style:{width:"100%",minWidth:0,WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}},
        React.createElement("div",{className:"relative",style:{width,height:HEX_ROAD_TRACK+44}},
            React.createElement("div",{"aria-hidden":"true",className:"absolute rounded-full",style:{left:HEX_ROAD_PAD,right:HEX_ROAD_PAD,top:HEX_ROAD_TRACK-4,height:8,background:"rgba(255,255,255,.08)"}}),
            React.createElement("div",{"aria-hidden":"true","data-hex-road-fill":"1",className:"absolute rounded-full",style:{left:HEX_ROAD_PAD,width:Math.max(0,here-HEX_ROAD_PAD),top:HEX_ROAD_TRACK-4,height:8,background:"linear-gradient(90deg,#E3A06A,#FFD36A 60%,#FFF1C2)",boxShadow:"0 0 14px rgba(255,211,106,.55)"}}),
            steps.map(node),
            React.createElement("div",{"data-hex-road-here":"1",className:"absolute flex flex-col items-center",style:{left:here-22,top:HEX_ROAD_TRACK-23,width:44,zIndex:2,pointerEvents:"none"}},
                React.createElement("div",{className:"rounded-full",style:{padding:2,background:"#FFD36A",boxShadow:"0 0 16px rgba(255,211,106,.8)"}},
                    React.createElement(HexAvatar,{name:typeof Net!=="undefined"&&Net.profile?Net.profile.name:"P",icon:st.equip.icon,size:38})))));
}
function HexTrophyScreen({back,initialView="road"}){
    const [st,setSt]=useState(()=>HexTrophies.state());
    const [view,setView]=useState(initialView);
    const [buying,setBuying]=useState("");
    const [shopMsg,setShopMsg]=useState("");
    const [slot,setSlot]=useState("icon");
    useEffect(()=>HexTrophies.subscribe(setSt),[]);
    const L=st.league,next=HexTrophies.nextLeague(st.trophies);
    const tab=(k,label)=>React.createElement("button",{key:k,role:"tab","aria-selected":view===k?"true":"false",onClick:()=>setView(k),className:"rounded-full px-4 text-[13px] font-bold",style:{minHeight:40,color:view===k?"#04121a":"rgba(255,255,255,.75)",background:view===k?"#2FE3F5":"rgba(255,255,255,.05)"}},label);
    const items=HexTrophies.ITEMS.filter(i=>i.slot===slot);
    const card=(it)=>{
        const open=HexTrophies.unlocked(it,st.best,st.owned),on=st.equip[slot]===it.id;
        return React.createElement("button",{key:it.id,disabled:!open||on,onClick:()=>HexTrophies.equip(slot,it.id),"data-hex-item":it.slot+":"+it.id,"aria-pressed":on?"true":"false",
            className:"flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center",style:{minHeight:112,background:on?"rgba(47,227,245,.10)":"rgba(255,255,255,.03)",border:"1px solid "+(on?"rgba(47,227,245,.5)":"rgba(255,255,255,.08)"),opacity:open?1:.45}},
            React.createElement(HexItemPreview,{item:it,size:44}),
            React.createElement("div",{className:"text-[12px] font-bold text-white leading-tight"},it.name),
            React.createElement("div",{className:"text-[11px] font-semibold",style:{color:on?"#2FE3F5":open?"rgba(255,255,255,.6)":"rgba(255,255,255,.45)"}},on?"装備中":open?"装備する":it.price>0?"ショップ":`${it.min} で解放`));
    };
    // The shop: items bought with points from the daily challenge.
    const buy=(it)=>{
        setShopMsg("");setBuying(it.slot+":"+it.id);
        HexTrophies.buy(it.slot,it.id).then(()=>{setShopMsg(`${it.name}を手に入れました`);HexTrophies.equip(it.slot,it.id);})
            .catch(err=>setShopMsg(err&&err.code==="points"?"ポイントが足りません":"購入できませんでした（通信を確認してください）"))
            .then(()=>setBuying(""));
    };
    const shopCard=(it)=>{
        const own=HexTrophies.unlocked(it,st.best,st.owned),busy=buying===it.slot+":"+it.id,afford=st.points>=it.price;
        return React.createElement("div",{key:it.slot+it.id,"data-hex-shop-item":it.slot+":"+it.id,className:"flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center",style:{minHeight:132,background:own?"rgba(125,255,178,.06)":"rgba(255,255,255,.03)",border:"1px solid "+(own?"rgba(125,255,178,.3)":"rgba(255,255,255,.08)")}},
            React.createElement(HexItemPreview,{item:it,size:46}),
            React.createElement("div",{className:"text-[12px] font-bold text-white leading-tight"},it.name),
            React.createElement("div",{className:"text-[10px] text-white/45"},HexTrophies.SLOTS[it.slot]),
            own?React.createElement("div",{className:"text-[11px] font-bold",style:{color:"#7DFFB2"}},"購入済み")
                :React.createElement("button",{disabled:!afford||!!buying,onClick:()=>buy(it),className:"hex-btn hex-btn-gold px-3 text-[12px] disabled:opacity-50",style:{minHeight:34}},busy?"購入中…":`${it.price} P`));
    };
    return React.createElement(HexMenuShell,{title:"トロフィー",back,wide:true},
        React.createElement("div",{className:"flex items-center gap-4 flex-wrap mb-3"},
            React.createElement("div",{className:"flex items-center gap-3"},
                React.createElement("div",{className:"shrink-0 rounded-full flex items-center justify-center",style:{width:42,height:42,background:`radial-gradient(circle at 35% 30%,#ffffffaa,${L.color} 60%)`,boxShadow:`0 0 16px ${L.color}66`}},React.createElement(HexIcon,{name:"trophy",size:20,color:"#07101a",strokeWidth:2.2})),
                React.createElement("div",null,
                    React.createElement("div",{"data-hex-trophies":"1",className:"text-[24px] font-black tabular-nums text-white leading-none"},st.trophies),
                    React.createElement("div",{className:"mt-1 text-[11px] font-bold text-white/55"},L.name+"リーグ"+(next?` · ${next.name}まで あと ${next.min-st.trophies}`:" · 最高リーグ")))),
            React.createElement("div",{"data-hex-points":String(st.points),className:"flex items-center gap-1.5 rounded-full px-3 text-[14px] font-black tabular-nums",style:{minHeight:36,color:"#FFD36A",background:"rgba(255,211,106,.1)",border:"1px solid rgba(255,211,106,.3)"}},React.createElement("span",{className:"text-[11px] font-bold text-white/60"},"ポイント"),st.points),
            React.createElement("div",{role:"tablist",className:"ml-auto flex gap-2"},tab("road","トロフィーロード"),tab("collection","コレクション"),tab("shop","ショップ"))),
        view==="shop"
            ?React.createElement(HexPanel,{className:"p-4"},
                React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}},HexTrophies.SHOP.map(shopCard)),
                shopMsg&&React.createElement("div",{role:"status",className:"mt-3 text-[12px] font-bold",style:{color:"#FFD36A"}},shopMsg),
                React.createElement("div",{className:"mt-3 text-[11px] text-white/45"},`ポイントはデイリーチャレンジで1日1回もらえます（${HexDaily.reward(0)}〜${HexDaily.reward(1e9)}、${HexDaily.STREAK_EVERY}日連続ごとに +${HexDaily.STREAK_BONUS}）`))
        :view==="road"
            ?React.createElement(HexPanel,{className:"py-3",style:{minWidth:0,overflow:"hidden"}},
                React.createElement(HexTrophyRoad,{st}),
                React.createElement("div",{className:"px-4 mt-1 text-[11px] text-white/45"},"オンライン対戦で勝つとトロフィーが増え、右へ進みます（300未満は負けても減りません）。解放した報酬はタップで装備できます。"))
            :React.createElement(HexPanel,{className:"p-4"},
                React.createElement("div",{role:"tablist",className:"flex gap-2 mb-3"},Object.keys(HexTrophies.SLOTS).map(k=>React.createElement("button",{key:k,role:"tab","aria-selected":slot===k?"true":"false",onClick:()=>setSlot(k),className:"rounded-full px-4 text-[13px] font-bold",style:{minHeight:40,color:slot===k?"#04121a":"rgba(255,255,255,.75)",background:slot===k?"rgba(255,211,106,.95)":"rgba(255,255,255,.05)"}},HexTrophies.SLOTS[k]))),
                React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(96px,1fr))",gap:8}},items.map(card)),
                React.createElement("div",{className:"mt-3 text-[11px] text-white/45"},slot==="icon"?"アイコンはランキングや対戦相手にも表示されます":slot==="ball"?"球のデザインは自分の画面に表示されます（色は変わりません）":"自分の盤面で球が消えるときの演出です")));
}
