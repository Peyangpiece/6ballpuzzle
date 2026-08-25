/* Live Gate ticket transfer + resale restoration layer */
const TR_STORE_KEY = 'livegate-transfer-resale-v1';
let trStore = loadTrStore();

function loadTrStore(){
  try{
    const parsed = JSON.parse(localStorage.getItem(TR_STORE_KEY) || '{}');
    return {
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
      resales: Array.isArray(parsed.resales) ? parsed.resales : []
    };
  }catch(_){ return {transfers:[],resales:[]}; }
}
function saveTrStore(){
  localStorage.setItem(TR_STORE_KEY, JSON.stringify(trStore));
  if(typeof persistFirebasePreference === 'function') persistFirebasePreference('ticketOperations', trStore);
}
function trNow(){ return new Date().toISOString(); }
function trId(prefix){ return prefix + '-' + Date.now().toString(36).toUpperCase(); }
function findPurchasedTicket(serial){ return purchasedTickets().find(t => t.serial === serial) || null; }
function transferFor(serial){ return trStore.transfers.find(x => x.serial === serial && ['申請中','承認済み'].includes(x.status)) || null; }
function resaleFor(serial){ return trStore.resales.find(x => x.serial === serial && ['出品中','審査中'].includes(x.status)) || null; }
function trSafe(v){ return String(v || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

const __trOriginalFooter = userFooter;
userFooter = function(){
  return `<footer class="user-footer"><div class="footer-inner"><div>${logo()}<p class="footer-note">チケットの購入から管理、譲渡・リセール、入場まで。ライブ体験を、もっとスマートに。</p></div><div><b>サービス</b><div class="footer-links"><a href="#/search">イベントを探す</a><a href="#/tickets">マイチケット</a><a href="#/resale">公式リセール</a><a href="#/ticket-operations">譲渡・リセール履歴</a><a href="#/favorites">お気に入り</a><a href="#/admin">主催者向け管理画面</a></div></div><div><b>サポート・法務</b><div class="footer-links"><a href="#/help">ヘルプ・お問い合わせ</a><a href="#/legal/terms">利用規約</a><a href="#/legal/privacy">プライバシーポリシー</a><a href="#/legal/tokushoho">特定商取引法に基づく表記</a><a href="#/legal/cancellation">キャンセルポリシー</a></div></div></div></footer>`;
};

const __trOriginalProfile = profile;
profile = function(){
  return `<div class="user-shell">${userHeader()}<main class="user-main"><div class="ticket-page"><span class="eyebrow">PROFILE</span><h1 style="font-size:32px;letter-spacing:-.04em;margin:5px 0 18px">プロフィール</h1><div class="panel"><div style="display:flex;align-items:center;gap:16px;margin-bottom:20px"><div class="avatar" style="width:64px;height:64px">山</div><div><b>山田 太郎</b><div class="section-sub">taro@example.com</div></div></div><div class="parity-menu-grid"><button class="parity-menu-item" onclick="go('/tickets')"><span>購入履歴・マイチケット</span><span>→</span></button><button class="parity-menu-item" onclick="go('/ticket-operations')"><span>チケット譲渡・リセール履歴</span><span>→</span></button><button class="parity-menu-item" onclick="go('/resale')"><span>公式リセールを探す</span><span>→</span></button><button class="parity-menu-item" onclick="go('/favorites')"><span>お気に入り</span><span>→</span></button><button class="parity-menu-item" onclick="go('/notifications')"><span>お知らせ</span><span>→</span></button><button class="parity-menu-item" onclick="toast('支払い方法の管理を表示しました')"><span>支払い方法</span><span>→</span></button><button class="parity-menu-item" onclick="go('/help')"><span>ヘルプ・お問い合わせ</span><span>→</span></button><button class="parity-menu-item" onclick="go('/settings')"><span>設定</span><span>→</span></button></div></div></div></main>${userFooter()}${bottomNav('profile')}</div>`;
};

function trOperationBadge(serial){
  const transfer = transferFor(serial);
  const resale = resaleFor(serial);
  if(transfer) return `<span class="tr-op-badge tr-transfer">譲渡 ${transfer.status}</span>`;
  if(resale) return `<span class="tr-op-badge tr-resale">リセール ${resale.status}</span>`;
  return '';
}
function trTicketActions(ticket, ev){
  if(ticket.status === 'ended') return `<button class="btn btn-soft" disabled>開催終了</button>`;
  const transfer = transferFor(ticket.serial);
  const resale = resaleFor(ticket.serial);
  if(transfer){
    return `<button class="btn btn-soft" onclick="go('/ticket-transfer/${ticket.serial}')">譲渡状況</button><button class="btn btn-danger" onclick="cancelTransfer('${ticket.serial}')">譲渡を取り消す</button>`;
  }
  if(resale){
    return `<button class="btn btn-soft" onclick="go('/ticket-resale/${ticket.serial}')">出品状況</button><button class="btn btn-danger" onclick="cancelResale('${ticket.serial}')">出品を取り消す</button>`;
  }
  return `<button class="btn btn-soft" onclick="go('/ticket-transfer/${ticket.serial}')">⇄ チケットを譲渡</button><button class="btn btn-soft" onclick="go('/ticket-resale/${ticket.serial}')">↗ リセールに出品</button>`;
}

tickets = function(){
  const items = purchasedTickets().filter(ticketFilterMatch);
  return `<div class="user-shell">${userHeader()}<main class="user-main"><div class="ticket-page"><div class="tr-ticket-page-head"><div><span class="eyebrow">MY TICKETS</span><h1>マイチケット</h1></div><div class="action-pack"><button class="btn btn-soft" onclick="go('/ticket-operations')">譲渡・リセール履歴</button><button class="btn btn-soft" onclick="go('/resale')">公式リセール</button></div></div><div class="tabs"><button class="tab ${state.ticketTab==='all'?'active':''}" onclick="setTicketsTab('all')">すべて</button><button class="tab ${state.ticketTab==='before'?'active':''}" onclick="setTicketsTab('before')">開催前</button><button class="tab ${state.ticketTab==='live'?'active':''}" onclick="setTicketsTab('live')">開催中</button><button class="tab ${state.ticketTab==='ended'?'active':''}" onclick="setTicketsTab('ended')">終了</button></div>${items.length ? items.map(ticket => { const ev=getEvent(ticket.eventId); return `<article class="my-ticket"><div class="ticket-cover"><div class="countdown">${ticket.count}</div><h2>${ev.title}</h2><div style="font-size:12px;color:#d9d7e6">${ev.date} ${ev.start} · ${ev.venue}</div></div><div class="ticket-body"><div class="tr-ticket-status-row"><div class="chip ${ev.badgeClass}">${state.selectedTicket || '一般チケット'}</div>${trOperationBadge(ticket.serial)}</div><div class="ticket-code"><div class="serial"><small>整理番号</small><strong>${ticket.serial}</strong><small>${ticket.qty}枚</small></div><div class="qr">${qrHtml()}</div></div><p style="text-align:center;color:var(--pink);font-size:13px;font-weight:900">🔒 入場時にスタッフへこの画面を提示してください</p><div class="tr-ticket-actions">${trTicketActions(ticket,ev)}<button class="btn btn-soft" onclick="toast('画面の明るさを上げてください')">☀ 画面を明るくする</button><button class="btn btn-soft" onclick="showOrganizerInfo('${ev.id}')">主催者情報</button><button class="btn btn-soft" onclick="shareOnX('${ev.id}')">𝕏で共有</button><button class="btn btn-soft" onclick="openEvent('${ev.id}')">イベント詳細</button></div></div></article>`; }).join('') : `<div class="empty"><div class="empty-art"></div><b>表示できるチケットはありません</b><small>タブを切り替えるか、イベントを購入してください。</small><div style="margin-top:16px"><button class="btn btn-primary" onclick="go('/search')">イベントを探す</button></div></div>`}</div></main>${userFooter()}${bottomNav('ticket')}</div>`;
};

function transferPage(serial){
  const ticket = findPurchasedTicket(serial);
  if(!ticket) return trMissingPage('チケットが見つかりません');
  const ev = getEvent(ticket.eventId);
  const current = transferFor(serial);
  const blocked = !!resaleFor(serial);
  if(current){
    return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><button class="btn btn-soft" onclick="go('/tickets')">← マイチケット</button><section class="tr-flow-card"><span class="eyebrow">TICKET TRANSFER</span><h1>譲渡状況</h1><div class="tr-event-summary"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.date} ${ev.start} · ${ev.venue}</div><div class="mini">整理番号 ${serial}</div></div></div><div class="tr-status-box"><span class="tr-op-badge tr-transfer">${current.status}</span><h3>${trSafe(current.recipientName)} さんへ ${current.qty}枚を譲渡</h3><p>${trSafe(current.recipientEmail)}</p><small>申請ID ${current.id}</small></div><div class="tr-notice">受取人が受領するまで、または管理処理が完了するまで取消できます。譲渡完了後は元のQRは無効になります。</div><div class="action-row"><button class="btn btn-danger" onclick="cancelTransfer('${serial}')">譲渡を取り消す</button><button class="btn btn-soft" onclick="go('/ticket-operations')">履歴を見る</button></div></section></main>${userFooter()}${bottomNav('ticket')}</div>`;
  }
  return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><button class="btn btn-soft" onclick="go('/tickets')">← マイチケット</button><div class="tr-flow-grid"><section class="tr-flow-card"><span class="eyebrow">TICKET TRANSFER</span><h1>チケットを譲渡</h1><p class="section-sub">友人・知人へチケットを安全に引き渡します。受取人情報と譲渡枚数を確認してください。</p>${blocked?`<div class="tr-alert">このチケットはリセール出品中です。先にリセールを取り消してください。</div>`:''}<div class="field"><label>受取人のお名前</label><input id="trRecipientName" placeholder="例：佐藤 花子" ${blocked?'disabled':''}></div><div class="field"><label>受取人のメールアドレス</label><input id="trRecipientEmail" type="email" placeholder="example@email.com" ${blocked?'disabled':''}></div><div class="field"><label>譲渡枚数</label><select id="trTransferQty" ${blocked?'disabled':''}>${Array.from({length:ticket.qty},(_,i)=>`<option value="${i+1}">${i+1}枚</option>`).join('')}</select></div><label class="tr-check"><input id="trTransferAgree" type="checkbox" ${blocked?'disabled':''}><span>受取人とチケット情報を確認し、譲渡後は対象チケットの利用権が移ることに同意します。</span></label><button class="btn btn-primary" style="width:100%" ${blocked?'disabled':''} onclick="submitTransfer('${serial}')">譲渡を申し込む</button></section><aside class="tr-side-card"><h3>譲渡するチケット</h3><div class="tr-event-summary"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.date} ${ev.start}</div><div class="mini">${ev.venue}</div></div></div><div class="summary-line"><span>整理番号</span><b>${serial}</b></div><div class="summary-line"><span>保有枚数</span><b>${ticket.qty}枚</b></div><div class="summary-line"><span>券種</span><b>一般チケット</b></div><div class="tr-notice">譲渡可否・期限・手数料は各公演の主催者設定に従います。</div></aside></div></main>${userFooter()}${bottomNav('ticket')}</div>`;
}
function submitTransfer(serial){
  const ticket=findPurchasedTicket(serial);
  if(!ticket || resaleFor(serial)){ toast('このチケットは現在譲渡できません'); return; }
  const name=document.querySelector('#trRecipientName')?.value.trim();
  const email=document.querySelector('#trRecipientEmail')?.value.trim();
  const qty=Number(document.querySelector('#trTransferQty')?.value || 1);
  const agreed=document.querySelector('#trTransferAgree')?.checked;
  if(!name || !email || !email.includes('@')){ toast('受取人のお名前とメールアドレスを確認してください'); return; }
  if(!agreed){ toast('譲渡条件への同意が必要です'); return; }
  trStore.transfers.unshift({id:trId('TR'),serial,eventId:ticket.eventId,recipientName:name,recipientEmail:email,qty,status:'申請中',createdAt:trNow()});
  saveTrStore(); toast('譲渡申請を受け付けました'); go('/ticket-transfer/'+serial);
}
function cancelTransfer(serial){
  const item=transferFor(serial); if(!item){ toast('取消できる譲渡申請はありません'); return; }
  item.status='取消済み'; item.updatedAt=trNow(); saveTrStore(); toast('譲渡を取り消しました'); go('/tickets');
}

function resalePageForTicket(serial){
  const ticket=findPurchasedTicket(serial);
  if(!ticket) return trMissingPage('チケットが見つかりません');
  const ev=getEvent(ticket.eventId);
  const current=resaleFor(serial);
  const blocked=!!transferFor(serial);
  const faceValue=ev.priceFrom;
  if(current){
    return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><button class="btn btn-soft" onclick="go('/tickets')">← マイチケット</button><section class="tr-flow-card"><span class="eyebrow">OFFICIAL RESALE</span><h1>リセール出品状況</h1><div class="tr-event-summary"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.date} ${ev.start} · ${ev.venue}</div><div class="mini">整理番号 ${serial}</div></div></div><div class="tr-status-box"><span class="tr-op-badge tr-resale">${current.status}</span><h3>${current.qty}枚を ${money(current.price)} / 枚で出品</h3><p>出品ID ${current.id}</p></div><div class="tr-notice">成立前であれば出品を取り消せます。成立後は対象チケットが購入者へ移転し、元のQRは無効になります。</div><div class="action-row"><button class="btn btn-danger" onclick="cancelResale('${serial}')">出品を取り消す</button><button class="btn btn-soft" onclick="go('/resale')">リセール一覧を見る</button></div></section></main>${userFooter()}${bottomNav('ticket')}</div>`;
  }
  return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><button class="btn btn-soft" onclick="go('/tickets')">← マイチケット</button><div class="tr-flow-grid"><section class="tr-flow-card"><span class="eyebrow">OFFICIAL RESALE</span><h1>公式リセールに出品</h1><p class="section-sub">行けなくなった公演のチケットを、Live Gate内の公式リセールへ出品します。</p>${blocked?`<div class="tr-alert">このチケットは譲渡申請中です。先に譲渡を取り消してください。</div>`:''}<div class="field"><label>出品枚数</label><select id="trResaleQty" ${blocked?'disabled':''}>${Array.from({length:ticket.qty},(_,i)=>`<option value="${i+1}">${i+1}枚</option>`).join('')}</select></div><div class="field"><label>1枚あたりの出品価格</label><input id="trResalePrice" type="number" min="1" max="${faceValue}" value="${faceValue}" ${blocked?'disabled':''}></div><div class="tr-price-help">このプロトタイプでは購入価格 ${money(faceValue)} を上限として出品できます。</div><label class="tr-check"><input id="trResaleAgree" type="checkbox" ${blocked?'disabled':''}><span>成立時にチケット利用権が購入者へ移り、元のQRが無効になることに同意します。</span></label><button class="btn btn-primary" style="width:100%" ${blocked?'disabled':''} onclick="submitResale('${serial}')">リセールに出品する</button></section><aside class="tr-side-card"><h3>出品するチケット</h3><div class="tr-event-summary"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.date} ${ev.start}</div><div class="mini">${ev.venue}</div></div></div><div class="summary-line"><span>整理番号</span><b>${serial}</b></div><div class="summary-line"><span>保有枚数</span><b>${ticket.qty}枚</b></div><div class="summary-line"><span>購入価格</span><b>${money(faceValue)} / 枚</b></div><div class="tr-notice">対象公演がリセールを許可している場合のみ利用できます。実運用時の販売期間・手数料・払戻方法は主催者設定と連動させます。</div></aside></div></main>${userFooter()}${bottomNav('ticket')}</div>`;
}
function submitResale(serial){
  const ticket=findPurchasedTicket(serial); if(!ticket || transferFor(serial)){ toast('このチケットは現在出品できません'); return; }
  const ev=getEvent(ticket.eventId); const qty=Number(document.querySelector('#trResaleQty')?.value || 1); const price=Number(document.querySelector('#trResalePrice')?.value || 0); const agreed=document.querySelector('#trResaleAgree')?.checked;
  if(price<=0 || price>ev.priceFrom){ toast('出品価格を確認してください'); return; }
  if(!agreed){ toast('リセール条件への同意が必要です'); return; }
  trStore.resales.unshift({id:trId('RS'),serial,eventId:ticket.eventId,qty,price,status:'出品中',seller:'山田 太郎',createdAt:trNow()}); saveTrStore(); toast('リセールに出品しました'); go('/ticket-resale/'+serial);
}
function cancelResale(serial){ const item=resaleFor(serial); if(!item){ toast('取消できる出品はありません'); return; } item.status='取消済み'; item.updatedAt=trNow(); saveTrStore(); toast('リセール出品を取り消しました'); go('/tickets'); }

function publicResalePage(){
  const list=trStore.resales.filter(x=>x.status==='出品中');
  const seeded=list.length?list:[{id:'RS-DEMO01',serial:'B-118',eventId:'rock-special-night',qty:1,price:3000,status:'出品中',seller:'出品者',createdAt:trNow()}];
  return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><div class="tr-ticket-page-head"><div><span class="eyebrow">OFFICIAL RESALE</span><h1>公式リセール</h1><p class="section-sub">Live Gate内で出品された対象チケットを確認できます。</p></div><button class="btn btn-soft" onclick="go('/tickets')">自分のチケットを出品</button></div><div class="tr-market-grid">${seeded.map(item=>{const ev=getEvent(item.eventId);return `<article class="tr-market-card"><div class="event-art" style="height:150px"></div><div class="tr-market-body"><span class="chip chip-green">公式リセール</span><h3>${ev.title}</h3><div class="meta">◷ ${ev.displayDate} · ${ev.start}</div><div class="meta">⌖ ${ev.venue}</div><div class="summary-line"><span>枚数</span><b>${item.qty}枚</b></div><div class="summary-line"><span>販売価格</span><b class="price">${money(item.price)}</b></div><button class="btn btn-primary" style="width:100%" onclick="buyResale('${item.id}')">このチケットを購入</button></div></article>`}).join('')}</div></main>${userFooter()}${bottomNav('search')}</div>`;
}
function buyResale(id){
  const item=trStore.resales.find(x=>x.id===id);
  if(!item){ toast('デモ出品のため購入フローのみ確認できます'); return; }
  if(item.status!=='出品中'){ toast('このチケットはすでに販売終了しています'); return; }
  openModal(`<span class="eyebrow">RESALE CHECKOUT</span><h2>リセール購入の確認</h2><p>公式リセールのチケットを購入します。</p><div class="summary-line"><span>イベント</span><b>${getEvent(item.eventId).title}</b></div><div class="summary-line"><span>枚数</span><b>${item.qty}枚</b></div><div class="summary-line total"><span>合計</span><b>${money(item.price*item.qty)}</b></div>`,[{label:'キャンセル',type:'soft'},{label:'購入する',type:'primary',onClick:`completeResalePurchase('${id}')`}]);
}
function completeResalePurchase(id){ const item=trStore.resales.find(x=>x.id===id); if(!item)return; item.status='成立済み'; item.updatedAt=trNow(); saveTrStore(); toast('リセール購入が成立しました'); setTimeout(()=>go('/ticket-operations'),400); }

function ticketOperationsPage(){
  const all=[...trStore.transfers.map(x=>({...x,type:'譲渡'})),...trStore.resales.map(x=>({...x,type:'リセール'}))].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><div class="tr-ticket-page-head"><div><span class="eyebrow">TICKET OPERATIONS</span><h1>譲渡・リセール履歴</h1><p class="section-sub">申請・出品・成立・取消の状態をまとめて確認できます。</p></div><button class="btn btn-soft" onclick="go('/tickets')">マイチケット</button></div>${all.length?`<div class="tr-history-list">${all.map(x=>{const ev=getEvent(x.eventId);return `<div class="tr-history-row"><div><span class="tr-op-badge ${x.type==='譲渡'?'tr-transfer':'tr-resale'}">${x.type}</span><b>${ev.title}</b><div class="mini">${x.serial} · ${x.id}</div></div><div><b>${x.status}</b><div class="mini">${x.qty}枚 ${x.type==='リセール'?money(x.price)+'/枚':''}</div></div><button class="table-actions" onclick="go('${x.type==='譲渡'?'/ticket-transfer/':'/ticket-resale/'}${x.serial}')">詳細</button></div>`}).join('')}</div>`:`<div class="empty"><div class="empty-art"></div><b>譲渡・リセール履歴はありません</b><small>マイチケットから譲渡またはリセールを開始できます。</small><div style="margin-top:16px"><button class="btn btn-primary" onclick="go('/tickets')">マイチケットへ</button></div></div>`}</main>${userFooter()}${bottomNav('profile')}</div>`;
}
function trMissingPage(message){ return `<div class="user-shell">${userHeader()}<main class="tr-flow-page"><div class="empty"><div class="empty-art"></div><b>${message}</b><div style="margin-top:16px"><button class="btn btn-primary" onclick="go('/tickets')">マイチケットへ戻る</button></div></div></main>${userFooter()}${bottomNav('ticket')}</div>`; }

const __trOriginalAdminSide = adminSide;
adminSide = function(active='dashboard'){
  const links=[['dashboard','ダッシュボード','▦','/admin'],['events','イベント管理','◫','/admin/events'],['tickets','チケット管理','▣','/admin/tickets'],['orders','注文・売上','≡','/admin/orders'],['transfers','譲渡管理','⇄','/admin/transfers'],['resales','リセール管理','↗','/admin/resales'],['users','ユーザー管理','●','/admin/users'],['participants','参加者','◉','/admin/participants'],['checkin','入場管理','⌗','/admin/checkin'],['accounting','会計管理','¥','/admin/accounting'],['analytics','分析','⌁','/admin/analytics']];
  return `<aside class="admin-side" id="adminSide">${logo(true)}<nav class="admin-nav">${links.map(x=>`<a class="admin-link ${active===x[0]?'active':''}" href="#${x[3]}"><span style="width:18px;text-align:center">${x[2]}</span>${x[1]}</a>`).join('')}</nav><div class="admin-spacer"></div><nav class="admin-nav"><a class="admin-link" href="#/">↗ 公開サイトを見る</a><a class="admin-link" href="javascript:adminSignOut()">⇥ ログアウト</a></nav><div class="admin-profile"><div class="avatar">LG</div><div><b style="font-size:12px">Live Gate Admin</b><small>オーナー</small></div></div></aside>`;
};
function adminTransfersPage(){
  if(!isAdminAuthed()) return adminLogin();
  const rows=trStore.transfers;
  return `<div class="admin-shell">${adminSide('transfers')}<div class="admin-main">${adminTop('譲渡管理')}<main class="admin-content"><div class="admin-section-title"><div><h2>チケット譲渡管理</h2><div class="mini">譲渡申請、受取人、状態、取消を管理</div></div></div><section class="admin-card">${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>申請ID</th><th>イベント</th><th>整理番号</th><th>受取人</th><th>枚数</th><th>状態</th><th>操作</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.id}</td><td>${getEvent(x.eventId).title}</td><td>${x.serial}</td><td>${trSafe(x.recipientName)}<div class="mini">${trSafe(x.recipientEmail)}</div></td><td>${x.qty}</td><td><span class="status ${x.status==='申請中'?'pending':x.status==='承認済み'?'paid':'ended'}">${x.status}</span></td><td><div class="action-pack"><button class="table-actions" onclick="adminSetTransfer('${x.id}','承認済み')">承認</button><button class="table-actions" onclick="adminSetTransfer('${x.id}','取消済み')">取消</button></div></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty"><b>譲渡申請はありません</b></div>`}</section></main></div></div>`;
}
function adminSetTransfer(id,status){ const item=trStore.transfers.find(x=>x.id===id); if(!item)return; item.status=status; item.updatedAt=trNow(); saveTrStore(); toast('譲渡状態を更新しました'); trRouteRender(); }
function adminResalesPage(){
  if(!isAdminAuthed()) return adminLogin();
  const rows=trStore.resales;
  return `<div class="admin-shell">${adminSide('resales')}<div class="admin-main">${adminTop('リセール管理')}<main class="admin-content"><div class="admin-section-title"><div><h2>公式リセール管理</h2><div class="mini">出品、価格、成立、取消状態を管理</div></div></div><section class="admin-card">${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>出品ID</th><th>イベント</th><th>整理番号</th><th>枚数</th><th>価格</th><th>状態</th><th>操作</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.id}</td><td>${getEvent(x.eventId).title}</td><td>${x.serial}</td><td>${x.qty}</td><td>${money(x.price)}</td><td><span class="status ${x.status==='出品中'?'paid':x.status==='成立済み'?'upcoming':'ended'}">${x.status}</span></td><td><div class="action-pack"><button class="table-actions" onclick="adminSetResale('${x.id}','出品中')">公開</button><button class="table-actions" onclick="adminSetResale('${x.id}','停止済み')">停止</button></div></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty"><b>リセール出品はありません</b></div>`}</section></main></div></div>`;
}
function adminSetResale(id,status){ const item=trStore.resales.find(x=>x.id===id); if(!item)return; item.status=status; item.updatedAt=trNow(); saveTrStore(); toast('リセール状態を更新しました'); trRouteRender(); }

function trRouteRender(){
  const r=route(); let html=null;
  if(r.startsWith('/ticket-transfer/')) html=transferPage(r.split('/').pop());
  else if(r.startsWith('/ticket-resale/')) html=resalePageForTicket(r.split('/').pop());
  else if(r==='/resale') html=publicResalePage();
  else if(r==='/ticket-operations') html=ticketOperationsPage();
  else if(r==='/admin/transfers') html=adminTransfersPage();
  else if(r==='/admin/resales') html=adminResalesPage();
  if(html!==null){ document.querySelector('#app').innerHTML=html; window.scrollTo(0,0); }
}
window.addEventListener('hashchange', trRouteRender);
window.addEventListener('load', trRouteRender);
