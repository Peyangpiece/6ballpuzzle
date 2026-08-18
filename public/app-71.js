/* HEXDROP quiescent hard-drop contact parity.
 * app-68 intentionally preserves a physically stable contact pose between
 * lattice centres until a real fallPath exists.  The legacy settle gate only
 * compared visuals with bookkeeping lattice centres, so such a correct held
 * contact could wait forever.  A held pose is quiescent iff it has no path and
 * its visual is still at that exact physical contact.
 */
const __hex71NearlySettledBeforeHeldContact=nearlySettled;
nearlySettled=function(g,tol){
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;if(!cell)continue;
        const v=g.vis.get(cell.id);
        if(Array.isArray(cell.fallPath)&&cell.fallPath.length)return false;
        const hold=cell.hardDropContactHold;
        if(hold){
            if(!v||Math.abs(v.y-hold.y)>tol||Math.abs(v.x-hold.x)>tol)return false;
            continue;
        }
        if(v&&(Math.abs(v.y-y)>tol||Math.abs(v.x-x)>tol))return false;
    }
    return true;
};
