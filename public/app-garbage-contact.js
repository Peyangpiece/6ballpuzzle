/* HEXDROP reference garbage pile contact hand-off.
 *
 * Reference behaviour: the airborne part is continuous. At the first physical
 * contact with the accumulated pile/floor, the rendered centre must stay on
 * that contact surface and may only continue through a collision-free straight
 * path or a tangent arc around its support. Logical lattice registration is an
 * implementation detail and must never make a garbage ball visually tunnel
 * through an already accumulated ball.
 */
(function installReferenceGarbagePileContact(){
    if(typeof window==="undefined"||window.__hexGarbagePileContactV2)return;
    window.__hexGarbagePileContactV2=true;

    const HANDOFF_EPS=1e-7;
    const PIVOT_TOL=0.04;
    const ARC_SAMPLES=72;
    const PATH_SAMPLES=64;

    function physDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
    function normAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}

    function boardBallEntries(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball)continue;
            const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    function pointSafeExcept(g,ignoreId,x,y,skipId=0,minDist=HEX_MIN_DIST){
        const maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        if(y>maxY+1e-7)return false;
        for(const {ball,v} of boardBallEntries(g)){
            if(ball.id===ignoreId||ball.id===skipId)continue;
            if(hexPhysDist(x,y,v.x,v.y)<minDist)return false;
        }
        return true;
    }

    function segmentSafeExcept(g,ignoreId,from,to,minDist=HEX_MIN_DIST){
        for(let i=1;i<=PATH_SAMPLES;i++){
            const q=i/PATH_SAMPLES;
            const x=from[0]+(to[0]-from[0])*q;
            const y=from[1]+(to[1]-from[1])*q;
            if(!pointSafeExcept(g,ignoreId,x,y,0,minDist))return false;
        }
        return true;
    }

    function tangentArc(g,ignoreId,from,to){
        let best=null;
        for(const {ball,v} of boardBallEntries(g)){
            if(ball.id===ignoreId)continue;
            const pivot=[v.x,v.y];
            const d0=physDist(from,pivot),d1=physDist(to,pivot);
            if(Math.abs(d0-1)>PIVOT_TOL||Math.abs(d1-1)>PIVOT_TOL)continue;
            const a0=Math.atan2((from[1]-pivot[1])*HEX_ROW_H,(from[0]-pivot[0])*.5);
            const a1=Math.atan2((to[1]-pivot[1])*HEX_ROW_H,(to[0]-pivot[0])*.5);
            const short=normAngle(a1-a0);
            const deltas=[short,short>=0?short-Math.PI*2:short+Math.PI*2];
            for(const da of deltas){
                let safe=true,prevY=from[1];
                for(let i=1;i<=ARC_SAMPLES;i++){
                    const q=i/ARC_SAMPLES,a=a0+da*q;
                    const radius=d0+(d1-d0)*q;
                    const x=pivot[0]+Math.cos(a)*radius/.5;
                    const y=pivot[1]+Math.sin(a)*radius/HEX_ROW_H;
                    if(y<prevY-2e-5||!pointSafeExcept(g,ignoreId,x,y,ball.id,HEX_MIN_DIST)){
                        safe=false;break;
                    }
                    prevY=y;
                }
                if(!safe)continue;
                const score=Math.abs(da)+Math.abs(d0-1)+Math.abs(d1-1);
                if(!best||score<best.score)best={pivot:[...pivot],supportId:ball.id,score};
            }
        }
        return best;
    }

    function collisionSafeRoute(g,ignoreId,from,to){
        if(physDist(from,to)<=HANDOFF_EPS)return{kind:"none"};
        if(segmentSafeExcept(g,ignoreId,from,to))return{kind:"straight"};
        const arc=tangentArc(g,ignoreId,from,to);
        return arc?{kind:"arc",...arc}:null;
    }

    // A hand-off cell is legal only when the physical centre can actually reach
    // it without crossing the accumulated pile. Destination-only checks caused
    // the reported pass-through after the otherwise-correct initial freefall.
    hexGarbageSingleLogicalCell=function(g,x,visualY){
        if(!g||!Number.isFinite(x)||!Number.isFinite(visualY))return null;
        const from=[x,visualY];
        const firstY=Math.max(BOARD_MIN_ROW,Math.ceil(visualY-1e-7));
        const lastY=Math.min(ROWS-1,firstY+3);
        let best=null;
        for(let y=firstY;y<=lastY;y++){
            if(y+1e-7<visualY)continue;
            for(let dx=-2;dx<=2;dx++){
                const cx=x+dx;
                if(!valid(cx,y)||g.board[y][cx])continue;
                const to=[cx,y],d=physDist(from,to);
                if(d>1.000001)continue;
                if(!visualPointSafe(g,-1,cx,y,HEX_MIN_DIST))continue;
                const route=collisionSafeRoute(g,-1,from,to);
                if(!route)continue;
                const score=d+Math.abs(dx)*1e-5+(y-visualY)*1e-6+(route.kind==="arc"?1e-7:0);
                if(!best||score<best.score-1e-12||(Math.abs(score-best.score)<=1e-12&&cx<best.x))best={x:cx,y,score};
            }
        }
        return best?{x:best.x,y:best.y}:null;
    };

    function prepareContinuousGarbagePath(g,ball,entry,from){
        if(!ball||!entry||!Array.isArray(from))return false;
        const v=g.vis.get(ball.id);if(!v)return false;
        const oldPath=Array.isArray(ball.fallPath)?ball.fallPath.filter(s=>s?.from&&s?.to):[];
        const firstLogical=oldPath[0]?.from?[...oldPath[0].from]:[entry.x,entry.y];
        const route=collisionSafeRoute(g,ball.id,from,firstLogical);
        if(!route)return false;
        const path=[];

        if(route.kind!=="none"){
            const seg={from:[...from],to:[...firstLogical],kind:"GARBAGE_PILE_CONTACT_HANDOFF",pileFlow:true,pileFlowEntry:true,pileFlowReason:"garbage_pile_contact",motionSeq:0};
            if(route.kind==="arc"){
                seg.pivot=[...route.pivot];
                const support=hexGarbageBoardBallById(g,route.supportId);
                if(support&&Array.isArray(support.fallPath)&&support.fallPath.length){
                    seg.followSupportIds=[route.supportId];seg.movingSupportId=route.supportId;
                }
            }
            path.push(seg);
        }
        for(const seg of oldPath)path.push(seg);

        if(!path.length){
            v.x=entry.x;v.y=entry.y;v.vy=0;v.motionSpeed=0;v.pileFlow=false;
            ball.fallPath=[];return true;
        }

        let firstSeq=Infinity;
        for(const seg of path){const s=Number(seg?.pileFlowOriginalSeq??seg?.motionSeq);if(Number.isFinite(s)&&s>0)firstSeq=Math.min(firstSeq,s);}
        if(!Number.isFinite(firstSeq))firstSeq=1;
        let ordered=firstSeq-1;
        const fresh=[];
        for(let i=0;i<path.length;i++){
            const seg=path[i];
            delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;
            delete seg._hexGravityProfile;delete seg._hexGravityLinear;
            if(i>0)repairPileFlowSegmentGeometry(g,ball,seg,"garbage_pile_contact");
            const original=Number(seg.pileFlowOriginalSeq??seg.motionSeq);
            if(i===0&&seg.kind==="GARBAGE_PILE_CONTACT_HANDOFF")ordered=firstSeq-1;
            else ordered=Math.max(ordered+1,Number.isFinite(original)&&original>0?original:ordered+1);
            seg.pileFlowOriginalSeq=ordered;seg.motionSeq=0;seg.pileFlow=true;seg.pileFlowEntry=i===0;seg.pileFlowReason="garbage_pile_contact";seg._pileFlowBall=ball;
            fresh.push({ball,seg,seq:ordered});
        }
        ball.fallPath=path;
        g._pileFlowBallById=new Map();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)g._pileFlowBallById.set(b.id,b);}
        scheduleFreshPileFlow(g,fresh,"garbage_pile_contact");
        for(const {seg} of fresh){delete seg._pileNominalDuration;delete seg._pileFlowBall;}
        v.pileFlow=true;v.vy=Math.max(0,v.vy||0);v.motionSpeed=Math.max(v.motionSpeed||0,Math.max(0,v.vy||0)*HEX_ROW_H,0.0001);
        return true;
    }

    const baseMaterialize=materializeGarbageBallAtContact;
    materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){
        const slot=pack?.pat?.[index];if(!slot)return false;
        const exactX=pack.ax+slot[0],exactY=contactAnchorY+slot[1];
        const before=Array.isArray(pack.entryBalls)?pack.entryBalls.length:0;
        const ok=baseMaterialize(g,pack,index,contactAnchorY);
        if(!ok)return false;
        const entry=pack.entryBalls?.[before]||pack.entryBalls?.[pack.entryBalls.length-1];
        const ball=entry?hexGarbageBoardBallById(g,entry.id):null;
        const v=ball?g.vis.get(ball.id):null;
        if(!entry||!ball||!v)return ok;

        v.x=exactX;v.y=exactY;
        v.vy=Math.max(0,(pack.vy||0)/HEX_ROW_H);
        v.motionSpeed=Math.max(RELEASE_INITIAL_VY,pack.vy||0);
        v.garbageFreeFlightHandoff=true;
        entry.contactX=exactX;entry.contactY=exactY;entry.handoffX=exactX;entry.handoffY=exactY;

        if(!prepareContinuousGarbagePath(g,ball,entry,[exactX,exactY])){
            // Never animate a route known to cross a pile ball.
            ball.fallPath=[];v.vy=0;v.motionSpeed=0;v.pileFlow=false;
        }
        return ok;
    };

    // Several members can reach independent contacts inside one 120 Hz frame.
    // Recompute after every successful hand-off so a newly accumulated garbage
    // ball immediately becomes a support for the remaining airborne members.
    materializeGarbageContactsThrough=function(g,pack,desiredY){
        if(!pack?.pat?.length)return 0;
        let released=0,guard=Math.max(4,pack.pat.length*3);
        while(pack.pat.length&&guard-->0){
            const candidates=[];
            for(let i=0;i<pack.pat.length;i++){const cy=hexGarbageBallContactY(g,pack,i);if(desiredY+HEX_GARBAGE_CONTACT_EPS>=cy)candidates.push({index:i,cy});}
            if(!candidates.length)break;
            candidates.sort((a,b)=>a.cy-b.cy||b.index-a.index);
            let progressed=false;
            for(const hit of candidates){
                if(hit.index>=pack.pat.length)continue;
                const cy=hexGarbageBallContactY(g,pack,hit.index);
                if(desiredY+HEX_GARBAGE_CONTACT_EPS<cy)continue;
                if(materializeGarbageBallAtContact(g,pack,hit.index,cy)){released++;progressed=true;break;}
            }
            if(!progressed)break;
        }
        return released;
    };
})();
