function adminEventDetail(id){
  const ev = getEvent(id);
  return `<div class="admin-shell">${adminSide('events')}<div class="admin-main">${adminTop('イベント詳細')}<main class="admin-content"><div class="admin-section-title"><div><h2>${ev.title}</h2><div class="mini">${ev.venue} / ${ev.date}</div></div><div class="action-pack"><button class="btn btn-soft" onclick="go('/admin/events')">一覧へ戻る</button><button class="btn btn-soft" onclick="toggleEventSales('${ev.id}')">${ev.status==='live'?'販売停止':'販売開始'}</button><button class="btn btn-danger" onclick="finishEvent('${ev.id}')">開催終了</button></div></div><div class="admin-grid"><section class="admin-card info-stack"><div><h3>基本情報</h3><div class="summary-line"><span>ステータス</span><span class="status ${statusClass(ev.status)}">${ev.statusLabel}</span></div><div class="summary-line"><span>出演者</span><span>${ev.performers.join(' / ')}</span></div><div class="summary-line"><span>主催者</span><span>${ev.organizer.name}</span></div></div><div><h3>券種</h3>${ev.ticketTypes.map(t=>`<div class="participant-item"><div><b>${t.name}</b><div class="mini">${t.note} / ${t.stock}</div></div><div class="action-pack"><span class="price">${money(t.price)}</span><button class="table-actions" onclick="toast('${t.name} を編集しました')">編集</button></div></div>`).join('')}</div></section><section class="admin-card"><div class="admin-card-head"><h3>公開中ページ</h3><button class="btn btn-soft" style="min-height:38px" onclick="openEvent('${ev.id}')">ユーザー画面で確認</button></div><p class="section-sub">従来機能として、出演者表示・お目当て演者選択・X共有・主催者情報表示を維持しています。</p><div class="participant-list"><button class="participant-item" onclick="toast('リンクをコピーしました')"><div><b>公開URL</b><div class="mini">#/event/${ev.id}</div></div><span>コピー</span></button><button class="participant-item" onclick="showOrganizerInfo('${ev.id}')"><div><b>主催者情報</b><div class="mini">${ev.organizer.email}</div></div><span>表示</span></button><button class="participant-item" onclick="shareOnX('${ev.id}')"><div><b>Xで共有</b><div class="mini">告知文を作成</div></div><span>共有</span></button></div></section></div></main></div></div>`;
}
function filteredOrders(){
  const q = state.adminOrderSearch.trim().toLowerCase();
  return orders.filter(o => {
    const okStatus = state.adminOrderFilter==='all' ? true : o.status===state.adminOrderFilter;
    const text = [o.id,o.buyer,o.email,getEvent(o.eventId).title].join(' ').toLowerCase();
    return okStatus && (!q || text.includes(q));
  });
}
function viewOrder(id){
  const o = orders.find(x=>x.id===id);
  if(!o){ toast('注文が見つかりません'); return; }
  openModal(`<span class="eyebrow">ORDER DETAIL</span><h2>${o.id}</h2><div class="participant-list" style="margin-top:16px"><div class="participant-item"><div><b>購入者</b><div class="mini">${o.buyer} / ${o.email}</div></div><span>${orderStatusLabel(o.status)}</span></div><div class="participant-item"><div><b>イベント</b><div class="mini">${getEvent(o.eventId).title}</div></div><span>${o.qty}枚</span></div><div class="participant-item"><div><b>金額</b><div class="mini">${o.ticketType}</div></div><span>${money(o.amount)}</span></div></div>`,[{label:'閉じる',type:'soft'},{label:'返金処理',type:'danger',onClick:`toast('${o.id} の返金確認を開きました')`}]);
}
function adminOrders(){
  const list = filteredOrders();
  return `<div class="admin-shell">${adminSide('orders')}<div class="admin-main">${adminTop('注文・売上')}<main class="admin-content"><div class="admin-section-title"><div><h2>注文管理</h2><div class="mini">購入・決済・返金を検索して確認</div></div><button class="btn btn-soft" onclick="toast('CSVをエクスポートしました')">⇩ CSVエクスポート</button></div><div class="kpi-grid" style="margin-bottom:16px"><div class="kpi"><label>総注文</label><strong>372</strong></div><div class="kpi"><label>支払済み</label><strong>252</strong></div><div class="kpi"><label>支払い待ち</label><strong>78</strong></div><div class="kpi"><label>返金済み</label><strong>10</strong></div></div><div class="toolbar"><input class="searchbox" placeholder="注文ID・氏名・メールで検索" value="${escapeAttr(state.adminOrderSearch)}" oninput="setAdminOrderSearch(this.value)"><button class="filter ${state.adminOrderFilter==='all'?'active':''}" onclick="setAdminOrderFilter('all')">すべて</button><button class="filter ${state.adminOrderFilter==='paid'?'active':''}" onclick="setAdminOrderFilter('paid')">支払済み</button><button class="filter ${state.adminOrderFilter==='pending'?'active':''}" onclick="setAdminOrderFilter('pending')">支払い待ち</button><button class="filter ${state.adminOrderFilter==='refund'?'active':''}" onclick="setAdminOrderFilter('refund')">返金済み</button></div><section class="admin-card">${orderRows(list)}</section></main></div></div>`;
}
function filteredParticipants(){
  const q = state.adminParticipantSearch.trim().toLowerCase();
  return participants.filter(p => {
    const okStatus = state.adminParticipantFilter==='all' ? true : (state.adminParticipantFilter==='checkedin' ? p.status==='checkedin' : p.status!=='checkedin');
    const text = [p.name,p.number,getEvent(p.eventId).title].join(' ').toLowerCase();
    return okStatus && (!q || text.includes(q));
  });
}
function adminParticipants(){
  const list = filteredParticipants();
  return `<div class="admin-shell">${adminSide('participants')}<div class="admin-main">${adminTop('参加者')}<main class="admin-content"><div class="admin-section-title"><div><h2>参加者管理</h2><div class="mini">氏名検索・整理番号検索・受付状況確認</div></div><div class="action-pack"><button class="btn btn-soft" onclick="toast('CSVを出力しました')">CSV出力</button><button class="btn btn-primary" onclick="go('/admin/checkin')">QR受付へ</button></div></div><div class="toolbar"><input class="searchbox" placeholder="氏名・整理番号・イベントで検索" value="${escapeAttr(state.adminParticipantSearch)}" oninput="setAdminParticipantSearch(this.value)"><button class="filter ${state.adminParticipantFilter==='all'?'active':''}" onclick="setAdminParticipantFilter('all')">すべて</button><button class="filter ${state.adminParticipantFilter==='checkedin'?'active':''}" onclick="setAdminParticipantFilter('checkedin')">入場済み</button><button class="filter ${state.adminParticipantFilter==='waiting'?'active':''}" onclick="setAdminParticipantFilter('waiting')">未入場</button></div><div class="participant-list">${list.map(p=>`<div class="participant-item"><div><b>${p.name}</b><div class="mini">${getEvent(p.eventId).title} / ${p.number}</div></div><div class="action-pack"><span class="status ${p.status==='checkedin'?'paid':'pending'}">${p.status==='checkedin'?'入場済み':'未入場'}</span><button class="table-actions" onclick="toast('${p.name} の詳細を表示しました')">詳細</button></div></div>`).join('')}</div></main></div></div>`;
}
function adminAnalytics(){
  return `<div class="admin-shell">${adminSide('analytics')}<div class="admin-main">${adminTop('分析')}<main class="admin-content"><div class="admin-section-title"><div><h2>分析ダッシュボード</h2><div class="mini">売上・販売率・流入・公演別比較</div></div><div class="action-pack"><button class="btn btn-soft" onclick="toast('月次レポートをダウンロードしました')">月次レポート</button><button class="btn btn-soft" onclick="toast('週次表示に切り替えました')">週次</button><button class="btn btn-soft" onclick="toast('月次表示に切り替えました')">月次</button></div></div><div class="analytics-grid"><section class="admin-card"><div class="admin-card-head"><h3>売上推移</h3><span class="mini">イベント全体</span></div>${chartHtml()}</section><section class="admin-card"><div class="admin-card-head"><h3>販売比率</h3><span class="mini">券種別</span></div><div class="donut-wrap"><div class="donut"></div></div></section><section class="admin-card"><div class="admin-card-head"><h3>主な改善ポイント</h3></div><div class="participant-list"><div class="participant-item"><div><b>検索導線</b><div class="mini">出演者・会場で検索可能</div></div><span>OK</span></div><div class="participant-item"><div><b>X共有</b><div class="mini">詳細・チケット画面から共有</div></div><span>OK</span></div><div class="participant-item"><div><b>ボタン操作</b><div class="mini">開催終了など全ボタン操作可能</div></div><span>OK</span></div></div></section></div></main></div></div>`;
}
function adminCheckin(){
  return `<div class="admin-shell">${adminSide('checkin')}<div class="admin-main">${adminTop('入場管理')}<main class="admin-content"><div class="admin-section-title"><div><h2>本日の受付</h2><div class="mini">SUMMER LIVE 2026 · DIAMOND HALL</div></div><span class="chip chip-green">受付中</span></div><div class="kpi-grid" style="margin-bottom:16px"><div class="kpi"><label>販売済み</label><strong>328</strong></div><div class="kpi"><label>入場済み</label><strong id="checkCount">${state.checkedIn?'187':'186'}</strong></div><div class="kpi"><label>未入場</label><strong id="remainCount">${state.checkedIn?'141':'142'}</strong></div><div class="kpi"><label>入場率</label><strong id="rate">${state.checkedIn?'57.0':'56.7'}%</strong></div></div><div class="checkin-grid"><section class="scanner"><div class="scanner-title"><b>QRコードを枠内に合わせてください</b><div style="font-size:12px;color:#aeb2c2">カメラ受付モード</div></div><div class="scanner-ui"><button class="btn btn-primary" onclick="simulateScan()">テストQRを読み取る</button><button class="btn btn-soft" onclick="toast('氏名検索を開きました')">氏名で検索</button><button class="btn btn-soft" onclick="go('/admin/participants')">参加者一覧</button></div></section><aside class="admin-card"><div class="admin-card-head"><h3>読み取り結果</h3><span class="mini">リアルタイム</span></div><div class="checkin-result ${state.checkedIn?'success':''}" id="resultBox">${state.checkedIn?'<div><div class="big">✓</div><h3>受付完了</h3><b>山田 太郎</b><div class="mini">一般チケット · A-042</div></div>':'<div><div class="big">⌗</div><h3>待機中</h3><div class="mini">QRコードを読み取るとここに結果が表示されます</div></div>'}</div><div style="margin-top:14px"><b style="font-size:13px">最近の入場</b><div class="summary-line"><span>佐藤 花子</span><span class="chip chip-green">18:04</span></div><div class="summary-line"><span>鈴木 一郎</span><span class="chip chip-green">18:03</span></div><div class="summary-line"><span>高橋 健</span><span class="chip chip-green">18:02</span></div></div></aside></div></main></div></div>`;
}
function simulateScan(){
  if(state.checkedIn){ toast('このチケットはすでに入場済みです'); return; }
  state.checkedIn = true;
  render();
  toast('受付完了：A-042');
}
function openCreateEvent(){
  openModal(`<span class="eyebrow">NEW EVENT</span><h2>新しいイベントを作成</h2><p class="section-sub">基本情報・日程・公開状態を設定します。</p><div class="field"><label>イベント名</label><input value="NEW LIVE EVENT 2026"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label>開催日</label><input type="date" value="2026-10-24"></div><div class="field"><label>会場</label><input value="DIAMOND HALL"></div></div><div class="field"><label>公開状態</label><select><option>下書き</option><option>公開予約</option><option>販売中</option></select></div>`,[{label:'キャンセル',type:'soft'},{label:'下書きを保存',type:'primary',onClick:`toast('下書きを保存しました')`}]);
}
function openModal(content, actions=[{label:'閉じる',type:'soft'}]){
  closeModal();
  const actionHtml = actions.map(action => {
    const cls = action.type === 'primary' ? 'btn-primary' : action.type === 'danger' ? 'btn-danger' : 'btn-soft';
    const onclick = action.onClick ? `${action.onClick};closeModal()` : 'closeModal()';
    return `<button class="btn ${cls}" onclick="${onclick}">${action.label}</button>`;
  }).join('');
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-back" id="modal"><div class="modal">${content}<div class="modal-actions">${actionHtml}</div></div></div>`);
}
function closeModal(){ document.querySelector('#modal')?.remove(); }

function persistFirebasePreference(key,value){
  if(window.liveGateFirebase && typeof window.liveGateFirebase.savePreference==='function'){
    window.liveGateFirebase.savePreference(key,value).catch(()=>{});
  }
}
function applyFirebaseProfile(profile){
  if(!profile || typeof profile!=='object') return;
  if(profile.favoritePerformer) state.favoritePerformer = profile.favoritePerformer;
  if(profile.likedEvents && typeof profile.likedEvents==='object') state.likedEvents = profile.likedEvents;
  render();
}
window.applyFirebaseProfile = applyFirebaseProfile;

function render(){
  const r = route();
  let html = '';
  if(r === '/') html = home();
  else if(r.startsWith('/event/')){ state.selectedEventId = r.split('/').pop(); html = detail(); }
  else if(r === '/checkout') html = checkout();
  else if(r === '/tickets') html = tickets();
  else if(r === '/profile') html = profile();
  else if(r === '/admin') html = adminDashboard();
  else if(r === '/admin/events') html = adminEvents();
  else if(r.startsWith('/admin/events/')) html = adminEventDetail(r.split('/').pop());
  else if(r === '/admin/orders') html = adminOrders();
  else if(r === '/admin/participants') html = adminParticipants();
  else if(r === '/admin/analytics') html = adminAnalytics();
  else if(r === '/admin/checkin') html = adminCheckin();
  else html = home();
  document.querySelector('#app').innerHTML = html;
  window.scrollTo(0,0);
}
window.addEventListener('hashchange', render);
window.addEventListener('load', render);
