/* Live Gate venue URL support */
(function(){
  if(typeof getEvent!=='function') return;
  openMap = function(id){
    const ev=getEvent(id);
    const configured=(ev?.venueUrl||ev?.mapUrl||ev?.originalForm?.venueUrl||'').trim();
    if(configured){
      try{
        const url=new URL(configured,location.origin);
        if(url.protocol==='http:'||url.protocol==='https:'){
          window.open(url.href,'_blank','noopener');
          return;
        }
      }catch(_){ /* fall back to address search */ }
    }
    const query=encodeURIComponent(`${ev?.venue||''} ${ev?.area||''}`.trim());
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`,'_blank','noopener');
  };
  window.openMap=openMap;
  document.documentElement.dataset.venueUrl='v1';
})();
