/* CPU AI worker: computes CPU moves off the main thread with the same
 * physics code as the game (app-ai-core.js aiDecide). Development loads the
 * layers below one by one; tools/build.js bundles this file followed by the
 * same layers into one hashed worker script for production.
 *
 * AI_WORKER_FILES: the physics/AI subset of index.html, in index.html order
 * (tests/ai-core.js keeps the two lists in step).
 */
var AI_WORKER_FILES=[
  "app-01.js",
  "app-02.js",
  "app-03.js",
  "app-04.js",
  "app-05.js",
  "app-06.js",
  "app-07.js",
  "app-pile-arc.js",
  "app-clear-gap-collapse.js",
  "app-floor-gap-invariant.js",
  "app-clear-vacancy-priority.js",
  "app-release-parity-settle.js",
  "app-08.js",
  "app-09.js",
  "app-10.js",
  "app-14.js",
  "app-17.js",
  "app-garbage-normal-physics.js",
  "app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js",
  "app-garbage-deep-settle.js",
  "app-garbage-simultaneous-motion.js",
  "app-garbage-render-overlap-guard.js",
  "app-ai-core.js",
  "app-runtime-performance.js",
  "app-physics-safety-invariants.js",
  "app-mass-motion-safety.js",
  "app-gravity-priority-v1.js",
  "app-garbage-performance-v1.js",
  "app-post-clear-two-stage-v1.js",
  "app-garbage-continuous-v1.js",
  "app-contact-separation-v1.js",
  "app-floor-bridge-collapse-v1.js",
  "app-lattice-finalize-v2.js",
  "app-coherent-collapse-v1.js",
  "app-wall-boundary-authoritative-v1.js",
  "app-slope-upconvex-authoritative-v3.js",
  "app-intentional-hexagon-stability-v1.js",
  "app-rigidity-resolver-authoritative-v3.js",
  "app-collapse-vertical-merge-v1.js",
  "app-pile-motion-authority-v2.js",
  "app-runtime-performance-v3.js",
  "app-runtime-performance-v4.js",
  "app-rigidity-final-authority-v1.js",
  "app-reference-upconvex-authority-v1.js",
  "app-reference-first-contact-sweep-v3.js",
  "app-reference-inverted-flat-split-v1.js",
  "app-rigidity-nintendo-authority-v1.js",
  "app-rigidity-release-bounce-authority-v1.js",
  "app-motion-smoothness-authority-v1.js",
  "app-no-upward-bounce-split-authority-v1.js",
  "app-even-row-split-continuity-v1.js",
  "app-split-visual-smoothness-v1.js",
  "app-settle-watchdog-v1.js"
];
(function(){
  // The layers are browser scripts: give them the globals they test for.
  var noop=function(){};
  self.window=self;
  if(typeof self.React==="undefined")self.React={useRef:function(i){return{current:i};},useEffect:noop,useState:function(i){return[typeof i==="function"?i():i,noop];},useCallback:function(f){return f;},useMemo:function(f){return f();},memo:function(v){return v;},createElement:function(){return null;},Fragment:{}};
  if(typeof self.ReactDOM==="undefined")self.ReactDOM={createRoot:function(){return{render:noop};}};
  if(typeof self.document==="undefined")self.document={addEventListener:noop,removeEventListener:noop,getElementById:function(){return null;},querySelector:function(){return null;},querySelectorAll:function(){return[];},createElement:function(){return{style:{},addEventListener:noop,removeEventListener:noop,getContext:function(){return null;}};}};
  if(typeof self.localStorage==="undefined")self.localStorage={getItem:function(){return null;},setItem:noop,removeItem:noop};
  if(typeof self.requestAnimationFrame==="undefined")self.requestAnimationFrame=function(){return 0;};
  if(typeof self.cancelAnimationFrame==="undefined")self.cancelAnimationFrame=noop;
  if(!self.__sixBallAiWorkerBundled){var v="?v="+Date.now().toString(36);importScripts.apply(self,AI_WORKER_FILES.map(function(f){return f+v;}));}
  self.onmessage=function(e){
    var d=e.data||{},out={id:d.id};
    try{var r=self.__sixBallAiDecide(d.req);out.move=r.move;out.stats=r.stats;if(r.sig!==undefined)out.sig=r.sig;}
    catch(err){out.error=String(err&&err.message||err);}
    self.postMessage(out);
  };
})();
