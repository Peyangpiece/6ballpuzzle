/* Daily challenge: a score attack that is the same for everyone each day.
 *
 * - The day is counted in Japan time (a new challenge at 0:00 JST). Its seed
 *   fixes the order of the balls, so every player gets the same 20 pieces.
 * - The score is the engine's own (cleared balls x chain, technique bonus).
 *   The game ends after the 20th piece has settled, or when the board
 *   overflows. Any number of tries; the best of the day is kept and sent to
 *   the daily ranking (daily/{day}/{uid}).
 * - The first finished try of the day gives points: 30 + 1 per 20 score, up
 *   to 100, and +100 on every 7th day in a row. firebase/database.rules.json
 *   checks the same numbers (tools/trophy-rules.js). Points buy shop items
 *   (HexTrophies.buy in app-trophies-v1.js).
 */
const HexDaily=(function(){
"use strict";
const PIECES=20;
const JST=32400000,DAY=86400000;
const STREAK_EVERY=7,STREAK_BONUS=100;
const day=(t=Date.now())=>Math.floor((t+JST)/DAY);
function label(d){const x=new Date(d*DAY);return (x.getUTCMonth()+1)+"月"+x.getUTCDate()+"日";}
function seedFor(d){
    const s="drop-ball-daily-"+d;let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
}
function reward(score){return Math.min(100,30+Math.floor(Math.max(0,Number(score)||0)/20));}
const bonus=streak=>streak>0&&streak%STREAK_EVERY===0?STREAK_BONUS:0;

// This device's record of today: {day, best, plays}.
const KEY="hexdrop_daily_v1";
function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||"null");return v&&typeof v==="object"?v:{};}catch(_){return{};}}
function write(v){try{localStorage.setItem(KEY,JSON.stringify(v));}catch(_){}}
function today(){const r=read(),d=day();return r.day===d?{day:d,best:Math.max(0,Number(r.best)||0),plays:Math.max(0,Number(r.plays)||0)}:{day:d,best:0,plays:0};}
function record(score){
    const r=today();
    r.plays++;r.best=Math.max(r.best,Math.max(0,Math.floor(Number(score)||0)));
    write(r);return r;
}

// Points for today's first finished try. The profile is read again first, so
// the streak and the balance come from the server, not this device.
async function claim(score){
    if(typeof Net==="undefined")throw new Error("offline");
    await Net.connect();
    await Net.reloadProfile();
    const p=Net.profile,d=day(),last=Math.max(0,Number(p.dailyDay)||0);
    if(last===d)return{claimed:false};
    const streak=last===d-1?Math.max(0,Number(p.streak)||0)+1:1;
    const gain=reward(score)+bonus(streak),points=Math.max(0,Number(p.points)||0)+gain;
    const F=Net.fb;
    await F.update(F.ref(Net.db,"users/"+Net.uid),{points,dailyDay:d,streak,updatedAt:F.serverTimestamp()});
    Object.assign(Net.profile,{points,dailyDay:d,streak});
    Net.syncTrophies();
    return{claimed:true,gain,streak,points,bonus:bonus(streak)};
}
// Today's best on the daily ranking (a lower score than the entry is refused
// by the rules, which is fine: the entry already holds a better one).
async function submit(best){
    if(typeof Net==="undefined")return;
    await Net.connect();
    const F=Net.fb,entry=Net.leaderboardEntry();
    await F.set(F.ref(Net.db,"daily/"+day()+"/"+Net.uid),{name:entry.name,score:Math.max(0,Math.floor(Number(best)||0)),icon:entry.icon});
}
async function ranking(limit=20){
    await Net.connect();
    const F=Net.fb,ref=F.ref(Net.db,"daily/"+day());
    const snap=await F.get(F.query(ref,F.orderByChild("score"),F.limitToLast(limit)));
    const rows=[];
    snap.forEach(c=>{const v=c.val()||{};rows.push({uid:c.key,name:HexPlayerName.display(v.name),score:Math.max(0,Number(v.score)||0),icon:typeof v.icon==="string"?v.icon:"initial"});});
    rows.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    rows.forEach((r,i)=>{r.rank=i&&rows[i-1].score===r.score?rows[i-1].rank:i+1;});
    return{rows,me:Net.uid};
}

// The engine stops handing out pieces after g.pieceLimit (set by the daily
// mode in app-16.js); g.challengeDone marks the end once the board settled.
if(typeof spawn==="function"){
    const baseSpawn=spawn;
    spawn=function(g){
        if(g&&g.pieceLimit>0){
            if((g.piecesUsed||0)>=g.pieceLimit){g.challengeDone=true;return;}
            g.piecesUsed=(g.piecesUsed||0)+1;
        }
        return baseSpawn.apply(this,arguments);
    };
}
return{PIECES,STREAK_EVERY,STREAK_BONUS,day,label,seedFor,reward,bonus,today,record,claim,submit,ranking};
})();

// The panel over the opponent's board during the daily challenge: pieces
// left and the score while playing; the result, the points and today's
// ranking at the end.
function HexDailyPanel({daily,onRetry,onExit,onShop}){
    const [rank,setRank]=useState(null);
    const done=daily.status==="done";
    useEffect(()=>{
        if(!done)return;let alive=true;
        HexDaily.ranking(10).then(r=>{if(alive)setRank(r);}).catch(()=>{if(alive)setRank({rows:[],me:null,error:true});});
        return()=>{alive=false;};
    },[done,daily.submitted]);
    const btn="hex-btn px-4 text-[13px]";
    const c=daily.claim||{};
    return React.createElement("div",{className:"absolute flex flex-col overflow-y-auto",role:"region","aria-label":"デイリーチャレンジ","data-hex-daily-panel":done?"done":"play",style:{left:`${671/12.8}%`,width:`${444/12.8}%`,top:`${160/7.2}%`,height:`${450/7.2}%`,padding:"clamp(8px,1.4vw,18px)",background:"rgba(8,8,26,.82)",border:"1px solid rgba(255,211,106,.28)",borderRadius:16,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}},
        React.createElement("div",{className:"text-[11px] font-black tracking-[.18em]",style:{color:"#FFD36A"}},"DAILY · "+HexDaily.label(daily.day)),
        React.createElement("div",{className:"text-base font-black text-white mt-0.5"},"デイリーチャレンジ"),
        !done&&React.createElement(React.Fragment,null,
            React.createElement("div",{className:"mt-2 grid grid-cols-2 gap-2"},
                React.createElement("div",{className:"rounded-xl px-3 py-2",style:{background:"rgba(255,255,255,.05)"}},React.createElement("div",{className:"text-[11px] font-bold text-white/55"},"のこり"),React.createElement("div",{"data-hex-daily-left":String(daily.left),className:"text-2xl font-black tabular-nums text-white"},daily.left,React.createElement("span",{className:"text-[12px] text-white/55 ml-1"},"手"))),
                React.createElement("div",{className:"rounded-xl px-3 py-2",style:{background:"rgba(255,255,255,.05)"}},React.createElement("div",{className:"text-[11px] font-bold text-white/55"},"スコア"),React.createElement("div",{"data-hex-daily-score":String(daily.score),className:"text-2xl font-black tabular-nums",style:{color:"#FFD36A"}},daily.score))),
            React.createElement("p",{className:"mt-2 text-[12px] leading-relaxed text-white/75"},`今日は全員が同じ ${HexDaily.PIECES} 手。連鎖と技で高得点を狙おう。`),
            React.createElement("div",{className:"mt-1 text-[12px] font-bold text-white/55"},"今日のベスト ",daily.best),
            React.createElement("div",{className:"mt-auto pt-2 flex flex-wrap gap-2"},
                React.createElement("button",{onClick:onRetry,className:btn+" hex-btn-secondary",style:{minHeight:40}},"やり直す"),
                React.createElement("button",{onClick:onExit,"data-hex-back":"1",className:btn+" hex-btn-ghost",style:{minHeight:40}},"やめる"))),
        done&&React.createElement(React.Fragment,null,
            React.createElement("div",{className:"mt-1 flex items-end gap-3"},
                React.createElement("div",{"data-hex-daily-final":String(daily.score),className:"text-[34px] font-black tabular-nums leading-none",style:{color:"#FFD36A"}},daily.score),
                React.createElement("div",{className:"pb-1 text-[12px] font-bold text-white/60"},daily.overflow?"あふれて終了":"20手 完了"," · ベスト ",daily.best)),
            React.createElement("div",{"data-hex-daily-claim":c.state||"","role":"status",className:"mt-2 rounded-lg px-2.5 py-1.5 text-[12px] font-bold",style:{color:c.state==="ok"?"#061016":"rgba(255,255,255,.8)",background:c.state==="ok"?"#7DFFB2":"rgba(255,255,255,.06)"}},
                c.state==="ok"?`+${c.gain} ポイント（連続 ${c.streak} 日${c.bonus?`・ボーナス +${c.bonus}`:""}）`
                :c.state==="already"?"今日のポイントは受け取り済みです"
                :c.state==="error"?"通信できず、ポイントを受け取れませんでした（もう一度遊ぶと再挑戦します）"
                :"ポイントを受け取っています…"),
            React.createElement("div",{className:"mt-2 text-[11px] font-black tracking-[.12em] text-white/50"},"今日のランキング"),
            React.createElement("div",{"data-hex-daily-ranking":"1",className:"mt-1 grid gap-0.5"},
                !rank?React.createElement("div",{className:"text-[12px] text-white/50"},"読み込み中…")
                :rank.error?React.createElement("div",{className:"text-[12px] text-white/50"},"読み込めませんでした")
                :rank.rows.length===0?React.createElement("div",{className:"text-[12px] text-white/50"},"まだ誰もいません")
                :rank.rows.map(r=>React.createElement("div",{key:r.uid,className:"flex items-center gap-2 text-[12px]",style:{color:r.uid===rank.me?"#2FE3F5":"rgba(255,255,255,.85)"}},
                    React.createElement("div",{className:"w-5 text-right font-bold tabular-nums text-white/55"},r.rank),
                    React.createElement(HexAvatar,{name:r.name,icon:r.icon,size:18}),
                    React.createElement("div",{className:"min-w-0 flex-1 truncate font-semibold"},r.name),
                    React.createElement("div",{className:"font-bold tabular-nums"},r.score)))),
            React.createElement("div",{className:"mt-auto pt-2 flex flex-wrap gap-2"},
                React.createElement("button",{onClick:onRetry,className:btn+" hex-btn-gold",style:{minHeight:40}},"もう一度"),
                React.createElement("button",{onClick:onShop,className:btn+" hex-btn-secondary",style:{minHeight:40}},"ショップ"),
                React.createElement("button",{onClick:onExit,"data-hex-back":"1",className:btn+" hex-btn-ghost",style:{minHeight:40}},"ホームへ"))));
}
