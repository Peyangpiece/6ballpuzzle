/* Live Gate transfer visibility + router hotfix v2 */
(function(){
  if (typeof parityRender !== 'function' || typeof trRouteRender !== 'function') return;

  // Remove competing route listeners. A single router prevents a later listener
  // from repainting the screen after transfer/resale pages are rendered.
  window.removeEventListener('hashchange', parityRender);
  window.removeEventListener('load', parityRender);
  window.removeEventListener('hashchange', trRouteRender);
  window.removeEventListener('load', trRouteRender);

  // Make transfer the primary ticket-management action so it is unmistakable.
  trTicketActions = function(ticket, ev){
    if(ticket.status === 'ended') return `<button class="btn btn-soft" disabled>開催終了</button>`;
    const transfer = transferFor(ticket.serial);
    const resale = resaleFor(ticket.serial);
    if(transfer){
      return `<button class="btn btn-primary tr-transfer-primary" onclick="go('/ticket-transfer/${ticket.serial}')">⇄ 譲渡状況を確認</button><button class="btn btn-danger" onclick="cancelTransfer('${ticket.serial}')">譲渡を取り消す</button>`;
    }
    if(resale){
      return `<button class="btn btn-soft" onclick="go('/ticket-resale/${ticket.serial}')">リセール出品状況</button><button class="btn btn-danger" onclick="cancelResale('${ticket.serial}')">出品を取り消す</button>`;
    }
    return `<button class="btn btn-primary tr-transfer-primary" onclick="go('/ticket-transfer/${ticket.serial}')">⇄ チケットを譲渡する</button><button class="btn btn-soft" onclick="go('/ticket-resale/${ticket.serial}')">↗ リセールに出品する</button>`;
  };

  const baseTickets = tickets;
  tickets = function(){
    let html = baseTickets();
    const transferable = purchasedTickets().find(t => t.status !== 'ended' && !transferFor(t.serial) && !resaleFor(t.serial));
    if(transferable){
      const banner = `<div class="tr-transfer-callout"><div><span class="eyebrow">TICKET TRANSFER</span><b>チケットを友人・知人へ譲渡できます</b><small>開催前のチケットを選び、受取人の情報を入力して譲渡します。</small></div><button class="btn btn-primary" onclick="go('/ticket-transfer/${transferable.serial}')">チケットを譲渡する</button></div>`;
      html = html.replace('<div class="tabs">', banner + '<div class="tabs">');
    }
    return html;
  };

  function unifiedRender(){
    const r = route();
    let html = null;
    if(r.startsWith('/ticket-transfer/')) html = transferPage(r.split('/').pop());
    else if(r.startsWith('/ticket-resale/')) html = resalePageForTicket(r.split('/').pop());
    else if(r === '/resale') html = publicResalePage();
    else if(r === '/ticket-operations') html = ticketOperationsPage();
    else if(r === '/admin/transfers') html = adminTransfersPage();
    else if(r === '/admin/resales') html = adminResalesPage();

    if(html !== null){
      document.querySelector('#app').innerHTML = html;
      window.scrollTo(0,0);
      return;
    }
    parityRender();
  }

  render = unifiedRender;
  window.render = unifiedRender;
  window.liveGateRender = unifiedRender;
  window.addEventListener('hashchange', unifiedRender);
  window.addEventListener('load', unifiedRender);
  document.documentElement.dataset.transferFeature = 'v2-ready';
})();
