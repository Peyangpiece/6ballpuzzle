/* Final visual-contact recoil tolerance.
 *
 * The production movement-fidelity frame performs resolveVisualContacts() after
 * updateGarbagePacks/updateVisuals. That final resolver can leave a pathless
 * garbage ball ~1e-7 rows above its previous frame even though app-54/55 have
 * already completed their frame-wide clamp. Apply the same net-noise rule at
 * this final contact boundary. Genuine upward contact >1e-6 remains untouched.
 */
const __hexResolveVisualContactsBeforeFinalRecoilClamp=resolveVisualContacts;
resolveVisualContacts=function(g){
    const before=hexSnapshotSettledGarbageY(g);
    const result=__hexResolveVisualContactsBeforeFinalRecoilClamp(g);
    hexClampSettledGarbageBoundaryNoise(g,before);
    return result;
};
