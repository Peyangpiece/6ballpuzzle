/* ============================================================
 * 6ball GARBAGE DEEP CONTACT HOLD v1
 *
 * Last-resort GARBAGE-only contact projection for dense staggered landings.
 * The ordinary horizontal contact solver and persistent one-frame hold run
 * first.  This layer activates only if an overlap still survives afterwards.
 *
 * Physics rule: an incoming live garbage ball may lose downward progress when
 * another ball blocks it.  A contact chain can therefore hold several live
 * balls upward together.  This layer never moves the frozen/existing pile,
 * never changes logical cells, fallPath data, pivots/supports or X, and never
 * pushes a ball farther downward than its authored trajectory.
 * ============================================================ */
(function installGarbageDeepContactHoldV1(){
    if(typeof window==="undefined"||window.__sixBallGarbageDeepContactHoldV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageDeepContactHoldV1=true;

    const baseResolve=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const LEGAL_DIST=.9995;
    const TARGET_DIST=.9998;
    const EPS=1e-9;
    const MAX_PASSES=96;
    const MAX_TOTAL_HOLD_ROWS=2.25;

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }

    function frozenIds(board){
        const out=new Set();
        const cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }

    function hasLivePath(ball){
        return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;
    }

    function entries(g){
        const out=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;
            seen.add(ball);
            const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    function liveSet(g,all){
        const frozen=frozenIds(g.board),ids=new Set();
        for(const q of all){
            if(q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&hasLivePath(q.ball))ids.add(q.ball.id);
        }
        return ids;
    }

    function distance(a,b){
        return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);
    }

    function worstIncoming(all,liveIds){
        let worst=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            const a=all[i],b=all[j];
            if(!liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))continue;
            const d=distance(a,b);
            if(d<LEGAL_DIST-EPS&&(!worst||d<worst.d))worst={a,b,d};
        }
        return worst;
    }

    function requiredRowSeparation(a,b){
        const dx=Math.abs((a.v.x-b.v.x)*.5);
        if(dx>=TARGET_DIST-EPS)return 0;
        return Math.sqrt(Math.max(0,TARGET_DIST*TARGET_DIST-dx*dx))/H;
    }

    function chooseUpper(pair,liveIds){
        const {a,b}=pair;
        const dy=a.v.y-b.v.y;
        if(Math.abs(dy)<=1e-8)return null;
        const upper=dy<0?a:b;
        const lower=dy<0?b:a;
        if(!liveIds.has(upper.ball.id))return null;
        return{upper,lower};
    }

    function holdForPair(pair,liveIds,heldRows){
        const chosen=chooseUpper(pair,liveIds);
        if(!chosen)return{ok:false,reason:"horizontal_or_fixed_required"};

        const {upper,lower}=chosen;
        const req=requiredRowSeparation(upper,lower);
        if(req<=EPS)return{ok:true,changed:false};
        const current=Math.max(0,lower.v.y-upper.v.y);
        let need=req-current;
        if(need<=EPS)return{ok:true,changed:false};

        // Tiny margin avoids exact floating-point re-entry below .9995.
        need+=2e-6;
        const used=heldRows.get(upper.ball.id)||0;
        const remaining=Math.max(0,MAX_TOTAL_HOLD_ROWS-used);
        if(remaining<=EPS)return{ok:false,reason:"deep_hold_budget_exhausted",id:upper.ball.id};
        const shift=Math.min(need,remaining);
        upper.v.y-=shift;
        if(Number.isFinite(upper.v.vy))upper.v.vy=0;
        heldRows.set(upper.ball.id,used+shift);
        return{ok:shift+EPS>=need,changed:shift>EPS,id:upper.ball.id,shift};
    }

    function solve(g){
        let all=entries(g);
        const liveIds=liveSet(g,all);
        if(!liveIds.size)return{ok:true,changed:0,passes:0,min:null,pair:null,held:[]};

        const heldRows=new Map();
        let changed=0,passes=0,failure=null;
        for(;passes<MAX_PASSES;passes++){
            all=entries(g);
            const worst=worstIncoming(all,liveIds);
            if(!worst)break;
            const r=holdForPair(worst,liveIds,heldRows);
            if(!r.ok){failure={reason:r.reason,pair:[worst.a.ball.id,worst.b.ball.id],distance:worst.d,id:r.id||null};break;}
            if(!r.changed){failure={reason:"no_vertical_progress",pair:[worst.a.ball.id,worst.b.ball.id],distance:worst.d};break;}
            changed++;
        }

        all=entries(g);
        const final=worstIncoming(all,liveIds);
        return{
            ok:!final,
            changed,
            passes,
            min:final?final.d:null,
            pair:final?[final.a.ball.id,final.b.ball.id]:null,
            failure,
            held:[...heldRows].map(([id,rows])=>({id,rows}))
        };
    }

    resolveVisualContacts=function(g){
        const result=baseResolve(g);
        if(!garbagePhase(g))return result;

        const all=entries(g),liveIds=liveSet(g,all),before=worstIncoming(all,liveIds);
        if(!before){
            window.__sixBallLastGarbageDeepContactHoldV1={active:false,ok:true,at:Date.now()};
            return result;
        }

        const info=solve(g);
        window.__sixBallLastGarbageDeepContactHoldV1={
            active:true,
            before:before.d,
            beforePair:[before.a.ball.id,before.b.ball.id],
            ...info,
            at:Date.now()
        };
        if(info.changed)window.__sixBallGarbageDeepContactCorrections=(window.__sixBallGarbageDeepContactCorrections||0)+info.changed;
        return result;
    };

    window.__sixBallGarbageDeepContactHoldVersion="garbage-deep-contact-hold-v1";
})();
