/* ============================================================
 * 6ball COLLAPSE VERTICAL MERGE v1
 *
 * VISUAL PATH ONLY.
 *
 * Keeps the one unique responsibility that used to be mixed into
 * app-collapse-timing-authoritative-v2.js:
 * - merge consecutive contiguous pure downward segments of one ball
 * - never merge arc/roll/pivot/slide/split/contact geometry
 * - never change logical board physics, rigidity or split decisions
 * ============================================================ */
(function(){
    if(typeof window==="undefined" || window.__sixBallCollapseVerticalMergeV1)return;
    window.__sixBallCollapseVerticalMergeV1=true;

    const processed=new WeakMap();

    function num(v){
        const n=Number(v);
        return Number.isFinite(n)?n:null;
    }

    function point(seg,side){
        if(!seg||typeof seg!=="object")return null;
        const q=seg[side];
        if(Array.isArray(q)&&q.length>=2){
            const x=num(q[0]),y=num(q[1]);
            if(x!==null&&y!==null)return{x,y};
        }
        if(q&&typeof q==="object"){
            const x=num(q.x),y=num(q.y);
            if(x!==null&&y!==null)return{x,y};
        }
        if(side==="from"){
            const x=num(seg.x)??num(seg.fromX);
            const y=num(seg.y)??num(seg.fromY);
            return x!==null&&y!==null?{x,y}:null;
        }
        const x=num(seg.tx)??num(seg.toX);
        const y=num(seg.ty)??num(seg.toY);
        return x!==null&&y!==null?{x,y}:null;
    }

    function writeEnd(seg,end){
        if(!seg||!end)return;
        if(Array.isArray(seg.to)){
            seg.to=seg.to.slice();
            seg.to[0]=end.x;
            seg.to[1]=end.y;
        }else if(seg.to&&typeof seg.to==="object"){
            seg.to={...seg.to,x:end.x,y:end.y};
        }
        if(num(seg.tx)!==null)seg.tx=end.x;
        if(num(seg.ty)!==null)seg.ty=end.y;
        if(num(seg.toX)!==null)seg.toX=end.x;
        if(num(seg.toY)!==null)seg.toY=end.y;
    }

    function hasRealPivot(seg){
        return !!(
            seg&&(
                seg.pivot||seg.topPivot||seg.virtualPivot||seg.movingSupportId||
                (Array.isArray(seg.followSupportIds)&&seg.followSupportIds.length)
            )
        );
    }

    function pureVertical(seg){
        if(!seg||hasRealPivot(seg))return false;
        const kind=String(seg.kind??seg.type??"").toUpperCase();
        if(/ROLL|ARC|PIVOT|SLIDE|SPLIT|CONTACT/.test(kind))return false;
        const a=point(seg,"from"),b=point(seg,"to");
        return !!a&&!!b&&Math.abs(a.x-b.x)<1e-7&&b.y>a.y;
    }

    function contiguous(a,b){
        const ae=point(a,"to"),bs=point(b,"from");
        return !!ae&&!!bs&&Math.abs(ae.x-bs.x)<1e-7&&Math.abs(ae.y-bs.y)<1e-7;
    }

    function durationOf(seg){
        const pf=num(seg?.pileFlowDuration);
        if(pf!==null&&pf>0)return pf;
        const d=num(seg?.duration);
        return d!==null&&d>0?d:0;
    }

    function pathToken(path){
        if(!Array.isArray(path))return "";
        return path.map(seg=>{
            const a=point(seg,"from"),b=point(seg,"to");
            return [seg?.kind||seg?.type||"",a?.x,a?.y,b?.x,b?.y,!!seg?.pivot,!!seg?.topPivot].join(":");
        }).join("|");
    }

    function compressPath(path){
        if(!Array.isArray(path)||path.length<2)return 0;
        const token=pathToken(path);
        if(processed.get(path)===token)return 0;

        const out=[];
        let merged=0;
        for(let i=0;i<path.length;){
            const first=path[i];
            if(!pureVertical(first)){
                out.push(first);
                i++;
                continue;
            }

            let j=i;
            let total=durationOf(first);
            while(j+1<path.length&&pureVertical(path[j+1])&&contiguous(path[j],path[j+1])){
                j++;
                total+=durationOf(path[j]);
            }

            if(j===i){
                out.push(first);
                i++;
                continue;
            }

            const combined={...first};
            writeEnd(combined,point(path[j],"to"));
            const duration=Math.max(0.050,total>0?total*0.78:0.050);
            if("duration" in combined)combined.duration=duration;
            if(combined.pileFlow||"pileFlowDuration" in combined)combined.pileFlowDuration=duration;
            combined._verticalMergedV1=j-i+1;
            out.push(combined);
            merged+=j-i;
            i=j+1;
        }

        if(!merged){
            processed.set(path,token);
            return 0;
        }

        path.splice(0,path.length,...out);
        processed.set(path,pathToken(path));
        return merged;
    }

    function compressEngine(g){
        if(!g||!Array.isArray(g.board))return 0;
        const seen=new Set();
        let balls=0,mergedSegments=0;
        for(const row of g.board){
            if(!Array.isArray(row))continue;
            for(const ball of row){
                if(!ball||typeof ball!=="object"||seen.has(ball)||!Array.isArray(ball.fallPath))continue;
                seen.add(ball);
                const n=compressPath(ball.fallPath);
                if(n){balls++;mergedSegments+=n;}
            }
        }
        if(mergedSegments){
            window.__sixBallLastCollapseVerticalMergeV1={balls,mergedSegments,at:Date.now()};
        }
        return mergedSegments;
    }

    function engineFromArgs(args){
        return args.find(q=>q&&typeof q==="object"&&Array.isArray(q.board))||null;
    }

    function wrap(name){
        if(typeof window[name]!=="function")return;
        const base=window[name];
        window[name]=function(...args){
            const out=base.apply(this,args);
            const g=engineFromArgs(args);
            if(g)compressEngine(g);
            return out;
        };
    }

    wrap("markPileFlowPaths");
    wrap("scheduleFreshPileFlow");
    wrap("scheduleFreshPileFlowWave");
    wrap("scheduleFreshPileFlowPerBall");

    window.__sixBallCollapseVerticalMergeVersion="collapse-vertical-merge-v1";
    window.__sixBallCollapseVerticalSegmentsMerged=true;
    window.__sixBallCollapseArtificialSegmentGap=0;
    window.__sixBallCollapseLogicalPhysicsChanged=false;

    /* legacy marker kept only for regression probes, not as an active old layer */
    window.__sixBallCollapseVerticalMergeV21=true;
})();
