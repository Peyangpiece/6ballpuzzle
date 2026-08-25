function adminSide(active='dashboard'){
  const links = [
    ['dashboard','ダッシュボード','▦','/admin'],
    ['events','イベント管理','◫','/admin/events'],
    ['orders','注文・売上','≡','/admin/orders'],
    ['participants','参加者','●','/admin/participants'],
    ['checkin','入場管理','⌗','/admin/checkin'],
    ['analytics','分析','⌁','/admin/analytics']
  ];
  return `<aside class="admin-side" id="adminSide">${logo(true)}<nav class="admin-nav">${links.map(x=>`<a class="admin-link ${active===x[0]?'active':''}" href="#${x[3]}"><span style="width:18px;text-align:center">${x[2]}</span>${x[1]}</a>`).join('')}</nav><div class="admin-spacer"></div><nav class="admin-nav"><a class="admin-link" href="#/">↗ 公開サイトを見る</a><a class="admin-link" href="javascript:toast('設定画面を表示しました')">⚙ 設定</a></nav><div class="admin-profile"><div class="avatar">LG</div><div><b style="font-size:12px">Live Gate Admin</b><small>オーナー</small></div></div></aside>`;
}
function adminTop(title){
  return `<header class="admin-top"><div style="display:flex;align-items:center;gap:10px"><button class="icon-btn mobile-menu-btn" onclick="document.querySelector('#adminSide').classList.toggle('open')">☰</button><h1>${title}</h1></div><div class="admin-tools"><button class="btn btn-soft" style="min-height:40px" onclick="toast('日付フィルターを表示しました')">2026/08/26</button><button class="icon-btn" onclick="toast('管理者通知はありません')">◌</button><button class="btn btn-dark" style="min-height:40px" onclick="openCreateEvent()">＋ イベント作成</button></div></header>`;
}
function chartHtml(){ const hs=[38,55,42,66,48,78,54,92,67,80,62,86,56,72]; return `<div class="chart"><div class="bars">${hs.map(h=>`<i class="bar" style="height:${h}%"></i>`).join('')}</div><svg class="line-svg" viewBox="0 0 700 220" preserveAspectRatio="none"><polyline fill="none" stroke="#5267ff" stroke-width="3" points="0,155 55,145 108,152 160,120 214,132 268,95 322,112 375,60 430,82 484,71 538,105 592,88 646,115 700,82"/></svg></div>`; }
function orderRows(list){
  return `<div class="table-wrap"><table class="table"><thead><tr><th>注文ID</th><th>購入者</th><th>イベント</th><th>枚数</th><th>金額</th><th>ステータス</th><th>操作</th></tr></thead><tbody>${list.map(o=>`<tr><td><b>${o.id}</b></td><td>${o.buyer}<div class="mini">${o.email}</div></td><td>${getEvent(o.eventId).title}</td><td>${o.qty}枚</td><td>${money(o.amount)}</td><td><span class="status ${orderStatusClass(o.status)}">${orderStatusLabel(o.status)}</span></td><td><div class="action-pack"><button class="table-actions" onclick="viewOrder('${o.id}')">詳細</button><button class="table-actions" onclick="toast('${o.id} のメール再送を行いました')">再送</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
function adminDashboard(){
  return `<div class="admin-shell">${adminSide('dashboard')}<div class="admin-main">${adminTop('ダッシュボード')}<main class="admin-content"><section class="admin-banner"><div><h2>SUMMER LIVE 2026 は販売中です</h2><p>開催まで17日。販売率82%、現在328枚を販売済みです。各ボタンはすべて押せる仕様にしています。</p></div><div class="action-pack"><button class="btn btn-soft" onclick="go('/admin/events')">イベント管理</button><button class="btn btn-primary" onclick="go('/admin/checkin')">当日受付を確認</button></div></section><div class="kpi-grid"><div class="kpi"><label>売上</label><strong>¥1,234,567</strong><span class="delta">↑ 12.5% 前月比</span></div><div class="kpi"><label>注文数</label><strong>372件</strong><span class="delta">↑ 9.3%</span></div><div class="kpi"><label>チケット販売数</label><strong>987枚</strong><span class="delta">↑ 15.2%</span></div><div class="kpi"><label>入場済み</label><strong>${state.checkedIn?'187':'186'} / 328</strong><span class="delta">56.7%</span></div></div><div class="admin-grid"><section class="admin-card"><div class="admin-card-head"><h3>売上推移</h3><span class="mini">売上 / 注文数</span></div>${chartHtml()}</section><section class="admin-card"><div class="admin-card-head"><h3>注文ステータス</h3><span class="mini">合計372件</span></div><div class="donut-wrap"><div class="donut"></div></div><div class="participant-list"><button class="participant-item" onclick="setAdminOrderFilter('paid');go('/admin/orders')"><div><b>支払済み</b><div class="mini">252件</div></div><span>→</span></button><button class="participant-item" onclick="setAdminOrderFilter('pending');go('/admin/orders')"><div><b>支払い待ち</b><div class="mini">78件</div></div><span>→</span></button><button class="participant-item" onclick="setAdminOrderFilter('refund');go('/admin/orders')"><div><b>返金済み</b><div class="mini">10件</div></div><span>→</span></button></div></section></div><section class="admin-card" style="margin-top:16px"><div class="admin-card-head"><div><h3>最近の注文</h3><span class="mini">直近の購入・返金状況</span></div><div class="action-pack"><button class="btn btn-soft" style="min-height:38px" onclick="go('/admin/orders')">すべて見る</button><button class="btn btn-soft" style="min-height:38px" onclick="go('/admin/analytics')">分析を見る</button></div></div>${orderRows(orders.slice(0,5))}</section></main></div></div>`;
}
function filteredAdminEvents(){
  const q = state.adminEventSearch.trim().toLowerCase();
  return events.filter(e => {
    const okStatus = state.adminEventFilter==='all' ? true : e.status===state.adminEventFilter;
    const text = [e.title,e.venue,...e.performers].join(' ').toLowerCase();
    return okStatus && (!q || text.includes(q));
  });
}
function toggleEventSales(id){
  const ev = getEvent(id);
  if(ev.status === 'live'){ ev.status='upcoming'; ev.statusLabel='販売前'; ev.badgeClass='chip-blue'; }
  else if(ev.status === 'upcoming'){ ev.status='live'; ev.statusLabel='販売中'; ev.badgeClass='chip-live'; }
  else { toast('開催終了したイベントは販売再開できません'); return; }
  render();
  toast(`${ev.title} の状態を ${ev.statusLabel} に変更しました`);
}
function finishEvent(id){
  const ev = getEvent(id);
  ev.status='ended'; ev.statusLabel='開催終了'; ev.badgeClass='chip-muted'; render(); toast(`${ev.title} を開催終了にしました`);
}
function adminEvents(){
  const list = filteredAdminEvents();
  return `<div class="admin-shell">${adminSide('events')}<div class="admin-main">${adminTop('イベント管理')}<main class="admin-content"><div class="admin-section-title"><div><h2>イベント</h2><div class="mini">公開・販売・開催状況を一元管理</div></div><button class="btn btn-primary" onclick="openCreateEvent()">＋ イベント作成</button></div><div class="toolbar"><input class="searchbox" placeholder="イベント名・会場・出演者で検索" value="${escapeAttr(state.adminEventSearch)}" oninput="setAdminEventSearch(this.value)"><button class="filter ${state.adminEventFilter==='all'?'active':''}" onclick="setAdminEventFilter('all')">すべて</button><button class="filter ${state.adminEventFilter==='live'?'active':''}" onclick="setAdminEventFilter('live')">販売中</button><button class="filter ${state.adminEventFilter==='upcoming'?'active':''}" onclick="setAdminEventFilter('upcoming')">販売前</button><button class="filter ${state.adminEventFilter==='ended'?'active':''}" onclick="setAdminEventFilter('ended')">開催終了</button></div><section class="admin-card" style="padding:0;overflow:hidden"><div class="event-admin-row header"><div>イベント</div><div>ステータス</div><div>販売状況</div><div>開催日</div><div>操作</div></div>${list.map(ev=>`<div class="event-admin-row"><div class="event-admin-name"><div class="thumb"></div><div><b>${ev.title}</b><div class="mini">${ev.venue} / ${ev.performers.join('・')}</div></div></div><div><span class="status ${statusClass(ev.status)}">${ev.statusLabel}</span></div><div><b>${ev.status==='ended'?'終了': ev.status==='upcoming'?'販売前':'328/400'}</b><div class="progress"><i style="width:${ev.status==='ended'?'100%':ev.status==='upcoming'?'12%':'82%'}"></i></div></div><div>${ev.date}</div><div><div class="action-pack"><button class="table-actions" onclick="go('/admin/events/${ev.id}')">詳細</button><button class="table-actions" onclick="toggleEventSales('${ev.id}')">${ev.status==='live'?'販売停止':ev.status==='upcoming'?'販売開始':'終了済'}</button><button class="table-actions" onclick="finishEvent('${ev.id}')">開催終了</button></div></div></div>`).join('')}</section></main></div></div>`;
}
