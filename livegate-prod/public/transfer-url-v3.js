/* Live Gate transfer URL flow v3 */
(function(){
  if(typeof trStore === 'undefined' || typeof tickets !== 'function') return;

  // Remove the v2 router listener and replace it with one route owner.
  if(window.liveGateRender){
    window.removeEventListener('hashchange', window.liveGateRender);
    window.removeEventListener('load', window.liveGateRender);
  }

  trStore.received = Array.isArray(trStore.received) ? trStore.received : [];

  const __urlBasePurchasedTickets = purchasedTickets;
  purchasedTickets = function(){
    const base = __urlBasePurchasedTickets();
    const received = trStore.received.map(x => ({
      eventId:x.eventId,
      status:'before',
      count:'譲渡で受取',
      serial:x.serial,
      qty:x.qty,
      received:true
    }));
    const seen = new Set();
    return [...received,...base].filter(t => {
      if(seen.has(t.serial)) return false;
      seen.add(t.serial);
      return true;
    });
  };

  transferFor = function(serial){
    return trStore.transfers.find(x => x.serial === serial && ['申請中','URL発行済み','受取待ち','承認済み','受取済み'].includes(x.status)) || null;
  };

  function encodePayload(value){
    const text = JSON.stringify(value);
    const bytes = new TextEncoder().encode(text);
    let binary='';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decodePayload(value){
    try{
      let raw = String(value || '').replace(/-/g,'+').replace(/_/g,'/');
      while(raw.length % 4) raw += '=';
      const binary = atob(raw);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }catch(_){ return null; }
  }
  function newToken(){
    try{
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    }catch(_){ return 'tr'+Date.now().toString(36)+Math.random().toString(36).slice(2); }
  }
  function buildClaimUrl(payload){
    const encoded = encodePayload(payload);
    return `${location.origin}${location.pathname}#/transfer/claim/${payload.token}?d=${encodeURIComponent(encoded)}`;
  }

  // Transfer and resale now have equal visual priority.
  trTicketActions = function(ticket, ev){
    if(ticket.status === 'ended') return `<button class="btn btn-soft" disabled>開催終了</button>`;
    if(ticket.received) return `<button class="btn btn-soft" onclick="toast('譲渡で受け取ったチケットです')">譲渡で受取済み</button>`;
    const transfer = transferFor(ticket.serial);
    const resale = resaleFor(ticket.serial);
    if(transfer){
      return `<button class="btn btn-soft" onclick="go('/ticket-transfer/${ticket.serial}')">チケット譲渡</button><button class="btn btn-danger" onclick="cancelTransferUrl('${ticket.serial}')">譲渡を取り消す</button>`;
    }
    if(resale){
      return `<button class="btn btn-soft" onclick="go('/ticket-resale/${ticket.serial}')">リセール出品状況</button><button class="btn btn-danger" onclick="cancelResale('${ticket.serial}')">出品を取り消す</button>`;
    }
    return `<button class="btn btn-soft" onclick="go('/ticket-transfer/${ticket.serial}')">⇄ チケットを譲渡</button><button class="btn btn-soft" onclick="go('/ticket-resale/${ticket.serial}')">↗ リセールに出品</button>`;
  };

  transferPage = function(serial){
    const ticket = findPurchasedTicket(serial);
    if(!ticket) return trMissingPage('チケットが見つかりません');
    const ev = getEvent(ticket.eventId);
    const current = transferFor(serial);
    const blocked = !!resaleFor(serial);

    if(current && current.claimUrl){
      return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><button class="btn btn-soft" onclick="go('/tickets')">← マイチケット</button><div class="tr-flow-grid"><section class="tr-flow-card"><span class="eyebrow">TICKET TRANSFER</span><h1>譲渡URL</h1><p class="section-sub">このURLをチケットを受け取る相手へ送ってください。</p><div class="tr-url-box"><input id="trClaimUrl" readonly value="${trSafe(current.claimUrl)}"><button class="btn btn-soft" onclick="copyTransferUrl('${serial}')">コピー</button></div><div class="action-row"><button class="btn btn-soft" onclick="shareTransferUrl('${serial}')">共有する</button><button class="btn btn-danger" onclick="cancelTransferUrl('${serial}')">譲渡を取り消す</button></div><div class="tr-notice">受取人はこのURLを開いて「チケットを受け取る」を押します。URLは信頼できる相手だけに共有してください。</div></section><aside class="tr-side-card"><h3>譲渡するチケット</h3><div class="tr-event-summary"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.date} ${ev.start}</div><div class="mini">${ev.venue}</div></div></div><div class="summary-line"><span>整理番号</span><b>${serial}</b></div><div class="summary-line"><span>譲渡枚数</span><b>${current.qty}枚</b></div><div class="summary-line"><span>状態</span><span class="status pending">受取待ち</span></div></aside></div></main>${userFooter()}${bottomNav('ticket')}</div>`;
    }

    return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><button class="btn btn-soft" onclick="go('/tickets')">← マイチケット</button><div class="tr-flow-grid"><section class="tr-flow-card"><span class="eyebrow">TICKET TRANSFER</span><h1>チケットを譲渡</h1><p class="section-sub">譲渡する枚数を選ぶと、受取人に送るための専用URLを発行できます。</p>${blocked?`<div class="tr-alert">このチケットはリセール出品中です。先にリセールを取り消してください。</div>`:''}<div class="field"><label>譲渡枚数</label><select id="trTransferQty" ${blocked?'disabled':''}>${Array.from({length:ticket.qty},(_,i)=>`<option value="${i+1}">${i+1}枚</option>`).join('')}</select></div><label class="tr-check"><input id="trTransferAgree" type="checkbox" ${blocked?'disabled':''}><span>発行したURLを受取人以外へ共有しないこと、受取完了後は対象チケットの利用権が移ることに同意します。</span></label><button class="btn btn-primary" style="width:100%" ${blocked?'disabled':''} onclick="issueTransferUrl('${serial}')">譲渡URLを発行する</button></section><aside class="tr-side-card"><h3>譲渡するチケット</h3><div class="tr-event-summary"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.date} ${ev.start}</div><div class="mini">${ev.venue}</div></div></div><div class="summary-line"><span>整理番号</span><b>${serial}</b></div><div class="summary-line"><span>保有枚数</span><b>${ticket.qty}枚</b></div><div class="summary-line"><span>券種</span><b>一般チケット</b></div></aside></div></main>${userFooter()}${bottomNav('ticket')}</div>`;
  };

  window.issueTransferUrl = function(serial){
    const ticket = findPurchasedTicket(serial);
    if(!ticket || resaleFor(serial)){ toast('このチケットは現在譲渡できません'); return; }
    if(transferFor(serial)){ go('/ticket-transfer/'+serial); return; }
    const agreed = document.querySelector('#trTransferAgree')?.checked;
    if(!agreed){ toast('譲渡条件への同意が必要です'); return; }
    const qty = Number(document.querySelector('#trTransferQty')?.value || 1);
    const token = newToken();
    const payload = {v:3,token,serial,eventId:ticket.eventId,qty,issuedAt:Date.now()};
    const claimUrl = buildClaimUrl(payload);
    trStore.transfers.unshift({
      id:trId('TR'),serial,eventId:ticket.eventId,qty,token,claimUrl,
      status:'受取待ち',createdAt:trNow(),mode:'url'
    });
    saveTrStore();
    toast('譲渡URLを発行しました');
    urlRender();
  };

  window.copyTransferUrl = async function(serial){
    const item = transferFor(serial);
    if(!item?.claimUrl){ toast('譲渡URLがありません'); return; }
    try{ await navigator.clipboard.writeText(item.claimUrl); toast('譲渡URLをコピーしました'); }
    catch(_){
      const input=document.querySelector('#trClaimUrl');
      if(input){ input.select(); document.execCommand('copy'); toast('譲渡URLをコピーしました'); }
    }
  };

  window.shareTransferUrl = async function(serial){
    const item=transferFor(serial);
    if(!item?.claimUrl){ toast('譲渡URLがありません'); return; }
    const ev=getEvent(item.eventId);
    if(navigator.share){
      try{ await navigator.share({title:`${ev.title} チケット譲渡`,text:'Live Gateのチケットを譲渡します。以下のURLから受け取ってください。',url:item.claimUrl}); }
      catch(_){ /* user cancelled */ }
    }else{
      await copyTransferUrl(serial);
    }
  };

  window.cancelTransferUrl = function(serial){
    const item=transferFor(serial);
    if(!item){ toast('取消できる譲渡はありません'); return; }
    item.status='取消済み'; item.updatedAt=trNow();
    saveTrStore();
    toast('譲渡を取り消しました');
    go('/tickets');
  };

  function claimPage(token, encoded){
    const payload=decodePayload(encoded);
    if(!payload || payload.token !== token || !payload.serial || !payload.eventId){
      return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><section class="tr-flow-card"><span class="eyebrow">TICKET TRANSFER</span><h1>この譲渡URLは利用できません</h1><p class="section-sub">URLが正しいか確認してください。</p><button class="btn btn-primary" onclick="go('/')">ホームへ戻る</button></section></main>${userFooter()}${bottomNav('home')}</div>`;
    }
    const ev=getEvent(payload.eventId);
    const received=trStore.received.find(x=>x.token===token);
    return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><section class="tr-flow-card tr-claim-card"><span class="eyebrow">TICKET TRANSFER</span><h1>${received?'チケットを受け取りました':'チケットが届いています'}</h1><div class="tr-event-summary"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.date} ${ev.start}</div><div class="mini">${ev.venue}</div></div></div><div class="summary-line"><span>券種</span><b>一般チケット</b></div><div class="summary-line"><span>枚数</span><b>${payload.qty}枚</b></div><div class="summary-line"><span>整理番号</span><b>${payload.serial}</b></div>${received?`<div class="tr-status-box"><span class="status paid">受取済み</span><h3>マイチケットに追加されました</h3></div><button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="go('/tickets')">マイチケットを見る</button>`:`<div class="tr-notice">受け取ると、このチケットがあなたのマイチケットへ追加されます。</div><button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="acceptTransferUrl('${token}','${trSafe(encoded)}')">チケットを受け取る</button>`}</section></main>${userFooter()}${bottomNav('ticket')}</div>`;
  }

  window.acceptTransferUrl = function(token, encoded){
    const payload=decodePayload(encoded);
    if(!payload || payload.token!==token){ toast('譲渡URLを確認できませんでした'); return; }
    if(!trStore.received.some(x=>x.token===token)){
      trStore.received.unshift({token,serial:payload.serial,eventId:payload.eventId,qty:payload.qty,receivedAt:trNow()});
      const local=trStore.transfers.find(x=>x.token===token);
      if(local){ local.status='受取済み'; local.updatedAt=trNow(); }
      saveTrStore();
    }
    toast('チケットを受け取りました');
    urlRender();
  };

  const __urlBaseTickets = tickets;
  tickets = function(){
    // v2 inserted a promotional transfer banner. Keep the function but hide that
    // banner with CSS so transfer has the same visual priority as other actions.
    return __urlBaseTickets();
  };

  function urlRender(){
    const r=route();
    let html=null;
    const path=r.split('?')[0];
    const query=r.includes('?') ? r.slice(r.indexOf('?')+1) : '';
    const params=new URLSearchParams(query);
    if(path.startsWith('/transfer/claim/')) html=claimPage(path.split('/').pop(),params.get('d')||'');
    else if(path.startsWith('/ticket-transfer/')) html=transferPage(path.split('/').pop());
    else if(path.startsWith('/ticket-resale/')) html=resalePageForTicket(path.split('/').pop());
    else if(path==='/resale') html=publicResalePage();
    else if(path==='/ticket-operations') html=ticketOperationsPage();
    else if(path==='/admin/transfers') html=adminTransfersPage();
    else if(path==='/admin/resales') html=adminResalesPage();

    if(html!==null){
      document.querySelector('#app').innerHTML=html;
      window.scrollTo(0,0);
      return;
    }
    parityRender();
  }

  render=urlRender;
  window.render=urlRender;
  window.liveGateRenderV3=urlRender;
  window.addEventListener('hashchange',urlRender);
  window.addEventListener('load',urlRender);
  document.documentElement.dataset.transferFeature='url-v3';
})();