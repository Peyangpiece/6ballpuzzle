/* HEXDROP hard-drop anchor locality repair.
 *
 * app-68 ranked `noUp` before horizontal locality. Near walls / dense piles a
 * perfectly valid contact could therefore be stored two logical columns away
 * just to keep the bookkeeping anchor below the rendered contact. The first
 * pile step then had to traverse that artificial horizontal gap, which created
 * an apparent upward recoil around the supporting ball.
 *
 * Keep the exact contact pose and the same candidate set, but prefer anchors
 * whose rigid horizontal offset is local (<= 1 doubled-grid unit). Within that
 * physically local set, keep the original no-up and distance preferences.
 */
hexHardDropContactAnchor=function(g,target,pose){
    if(!g||!target||!Array.isArray(pose)||pose.length!==3)return null;
    const candidates=[];
    for(let dy=0;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
        const q={...target,x:target.x+dx,y:target.y+dy};
        if(!pieceFits(g.board,q))continue;
        const cs=pieceCells(q);
        const ox=pose[0][0]-cs[0][0],oy=pose[0][1]-cs[0][1];
        let rigid=true;
        for(let i=1;i<3;i++){
            if(Math.abs((pose[i][0]-cs[i][0])-ox)>1e-7||
               Math.abs((pose[i][1]-cs[i][1])-oy)>1e-7){rigid=false;break;}
        }
        if(!rigid)continue;
        const noUp=oy<=1e-7;
        const localX=Math.abs(ox)<=1.000001;
        const dist=Math.hypot(ox*.5,oy*HEX_ROW_H);
        candidates.push({q,ox,oy,noUp,localX,dist,dy,dx});
    }
    if(!candidates.length)return null;
    candidates.sort((a,b)=>
        Number(b.localX)-Number(a.localX)||
        Number(b.noUp)-Number(a.noUp)||
        a.dist-b.dist||
        Math.abs(a.ox)-Math.abs(b.ox)||
        a.dy-b.dy||Math.abs(a.dx)-Math.abs(b.dx)
    );
    return candidates[0];
};
