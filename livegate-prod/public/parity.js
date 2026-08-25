/* Live Gate legacy-feature parity layer */
const __legacyRender = render;
window.removeEventListener('hashchange', __legacyRender);
window.removeEventListener('load', __legacyRender);

// Enrich current demo data without changing existing event behavior.
const __categoryById = {
  'summer-live-2026':'ライブ',
  'rock-special-night':'ライブ',
  'acoustic-night':'フェス',
  'jazz-night-2026':'クラブ'
};
events.forEach(ev => { ev.category = __categoryById[ev.id] || 'その他'; });

let paritySearchQuery = '';
let parityCategory = 'すべて';
let parityStatus = '受付中';
let parityAdminUserQuery = '';

const parityUsers = [
  {id:'U-1001',name:'山田 太郎',email:'taro@example.com',orders:4,spent:24880,status:'active'},
  {id:'U-1002',name:'佐藤 花子',email:'hanako@example.com',orders:2,spent:8500,status:'active'},
  {id:'U-1003',name:'鈴木 一郎',email:'ichiro@example.com',orders:1,spent:4000,status:'active'},
  {id:'U-1004',name:'田中 美咲',email:'misaki@example.com',orders:3,spent:19640,status:'active'},
  {id:'U-1005',name:'伊藤 翼',email:'tsubasa@example.com',orders:1,spent:4200,status:'suspended'}
];

const paritySettlements = [
  {eventId:'summer-live-2026',gross:1234567,fees:72400,refunds:7440,status:'未精算'},
  {eventId:'rock-special-night',gross:486000,fees:28300,refunds:0,status:'未精算'},
  {eventId:'jazz-night-2026',gross:328400,fees:19120,refunds:4200,status:'精算済み'}
];

function isAdminAuthed(){ return sessionStorage.getItem('livegate-admin-session-v1') === '1'; }
function adminSignIn(){
  const firebaseReady = document.documentElement.dataset.firebase === 'authenticated' || !!window.liveGateFirebase?.connected;
  if(!firebaseReady){ toast('Firebase認証を確認中です。数秒後にもう一度お試しください'); return; }
  sessionStorage.setItem('livegate-admin-session-v1','1');
  toast('管理者認証が完了しました');
  go('/admin');
}
function adminSignOut(){
  sessionStorage.removeItem('livegate-admin-session-v1');
  toast('管理者セッションを終了しました');
  go('/login');
}
function adminLogin(){
  return `<div class="parity-admin-login"><section class="login-card">${logo(true)}<span class="eyebrow" style="display:block;margin-top:24px">ADMIN ACCESS</span><h1>管理者ログイン</h1><p class="section-sub">元サイトにあった管理者ログイン境界を復元しました。Firebase Authentication の認証セッションを確認して管理画面へ進みます。</p><div class="parity-auth-state"><span class="parity-auth-dot"></span><span>Firebase Authentication 接続状態を確認してアクセス</span></div><button class="btn btn-primary" style="width:100%" onclick="adminSignIn()">管理者としてログイン</button><button class="btn btn-soft" style="width:100%;margin-top:10px" onclick="go('/')">公開サイトへ戻る</button><p class="mini" style="margin-top:16px">※ 現在のFirebase構成は匿名認証ベースです。本番の役割制御は管理者UID/Claimsの登録でさらに強化できます。</p></section></div>`;
}

userHeader = function(){
  return `<header class="user-header">${logo()}<div class="user-actions"><button class="btn btn-soft" onclick="go('/search')">イベントを探す</button><button class="btn btn-soft" onclick="go('/tickets')">マイチケット</button><button class="btn btn-soft" onclick="go('/profile')">プロフィール</button><button class="icon-btn" aria-label="検索" onclick="go('/search')">⌕</button><button class="icon-btn" aria-label="お知らせ" onclick="go('/notifications')">◌</button></div></header>`;
};

bottomNav = function(active='home'){
  return `<nav class="bottom-nav"><button class="bottom-link ${active==='home'?'active':''}" onclick="go('/')"><b style="font-size:21px">⌂</b>ホーム</button><button class="bottom-link ${active==='search'?'active':''}" onclick="go('/search')"><b style="font-size:21px">⌕</b>検索</button><button class="bottom-link ${active==='ticket'?'active':''}" onclick="go('/tickets')"><b style="font-size:20px">▣</b>チケット</button><button class="bottom-link ${active==='profile'?'active':''}" onclick="go('/profile')"><b style="font-size:20px">○</b>プロフィール</button></nav>`;
};

userFooter = function(){
  return `<footer class="user-footer"><div class="footer-inner"><div>${logo()}<p class="footer-note">チケットの購入から管理、入場まで。ライブ体験を、もっとスマートに。</p></div><div><b>サービス</b><div class="footer-links"><a href="#/search">イベントを探す</a><a href="#/tickets">マイチケット</a><a href="#/favorites">お気に入り</a><a href="#/admin">主催者向け管理画面</a></div></div><div><b>サポート・法務</b><div class="footer-links"><a href="#/help">ヘルプ・お問い合わせ</a><a href="#/legal/terms">利用規約</a><a href="#/legal/privacy">プライバシーポリシー</a><a href="#/legal/tokushoho">特定商取引法に基づく表記</a><a href="#/legal/cancellation">キャンセルポリシー</a></div></div></div></footer>`;
};

function setParitySearch(v){ paritySearchQuery = v; parityRender(); }
function setParityCategory(v){ parityCategory = v; parityRender(); }
function setParityStatus(v){ parityStatus = v; parityRender(); }
function paritySearchResults(){
  const q = paritySearchQuery.trim().toLowerCase();
  return events.filter(ev => {
    const text = [ev.title,ev.venue,ev.area,ev.category,...ev.performers,ev.organizer.name].join(' ').toLowerCase();
    const qOk = !q || text.includes(q);
    const catOk = parityCategory === 'すべて' || ev.category === parityCategory;
    const statusOk = parityStatus === 'すべて' || (parityStatus === '受付中' ? ev.status !== 'ended' : ev.status === 'ended');
    return qOk && catOk && statusOk;
  });
}
function searchPage(){
  const list = paritySearchResults();
  return `<div class="user-shell">${userHeader()}<main class="parity-page"><div class="parity-head"><div><span class="eyebrow">SEARCH</span><h1>イベントを探す</h1><div class="section-sub">イベント名・会場・出演者・主催者から検索できます。</div></div></div><div class="parity-search-grid"><input class="search-input" value="${escapeAttr(paritySearchQuery)}" placeholder="イベント名 / 会場 / 出演者 / 主催者" oninput="setParitySearch(this.value)"><div class="filters"><button class="filter ${parityStatus==='受付中'?'active':''}" onclick="setParityStatus('受付中')">受付中</button><button class="filter ${parityStatus==='受付終了'?'active':''}" onclick="setParityStatus('受付終了')">受付終了</button><button class="filter ${parityStatus==='すべて'?'active':''}" onclick="setParityStatus('すべて')">すべて</button></div></div><div><b style="font-size:13px">カテゴリから探す</b><div class="parity-category-row">${['すべて','ライブ','フェス','クラブ','その他'].map(cat=>`<button class="filter ${parityCategory===cat?'active':''}" onclick="setParityCategory('${cat}')">${cat}</button>`).join('')}</div></div>${list.length?`<div class="event-grid">${list.map(eventCard).join('')}</div>`:`<div class="empty"><div class="empty-art"></div><b>該当するイベントがありません</b><small>検索条件を変更してもう一度お試しください。</small></div>`}</main>${userFooter()}${bottomNav('search')}</div>`;
}

function favoritesPage(){
  const list = events.filter(ev => state.likedEvents[ev.id]);
  return `<div class="user-shell">${userHeader()}<main class="parity-page"><div class="parity-head"><div><span class="eyebrow">FAVORITES</span><h1>お気に入り</h1><div class="section-sub">気になる公演をまとめて確認できます。</div></div></div>${list.length?`<div class="event-grid">${list.map(eventCard).join('')}</div>`:`<div class="empty"><div class="empty-art"></div><b>お気に入りはまだありません</b><small>イベント詳細の♡から追加できます。</small><div style="margin-top:16px"><button class="btn btn-primary" onclick="go('/search')">イベントを探す</button></div></div>`}</main>${userFooter()}${bottomNav('profile')}</div>`;
}

function notificationsPage(){
  return `<div class="user-shell">${userHeader()}<main class="parity-page"><div class="parity-head"><div><span class="eyebrow">NOTIFICATIONS</span><h1>お知らせ</h1></div></div><div class="participant-list"><div class="participant-item"><div><b>SUMMER LIVE 2026 開催まで17日</b><div class="mini">チケットと会場情報を確認しておきましょう。</div></div><span class="chip chip-blue">NEW</span></div><div class="participant-item"><div><b>チケット購入が完了しました</b><div class="mini">マイチケットからQRコードを表示できます。</div></div><span class="mini">8/20</span></div></div></main>${userFooter()}${bottomNav('profile')}</div>`;
}

function helpPage(){
  return `<div class="user-shell">${userHeader()}<main class="parity-page"><div class="parity-head"><div><span class="eyebrow">SUPPORT</span><h1>ヘルプ・お問い合わせ</h1><div class="section-sub">よくある質問と問い合わせ窓口</div></div></div><div class="info-grid"><div class="panel"><b>購入したチケットはどこ？</b><p class="section-sub">「マイチケット」からQRコード・整理番号・開催情報を確認できます。</p></div><div class="panel"><b>QRが読み取れない</b><p class="section-sub">画面の明るさを上げるか、受付スタッフに氏名・整理番号をお伝えください。</p></div><div class="panel"><b>キャンセルについて</b><p class="section-sub">公演ごとのキャンセル規定に従います。購入前に最終確認画面で確認できます。</p></div></div><div class="panel" style="margin-top:18px"><h2 style="margin-top:0">お問い合わせ</h2><div class="field"><label>メールアドレス</label><input value="taro@example.com"></div><div class="field"><label>お問い合わせ内容</label><textarea placeholder="お問い合わせ内容を入力してください"></textarea></div><button class="btn btn-primary" onclick="toast('お問い合わせを受け付けました')">送信する</button></div></main>${userFooter()}${bottomNav('profile')}</div>`;
}

function settingsPage(){
  return `<div class="user-shell">${userHeader()}<main class="parity-page"><div class="parity-head"><div><span class="eyebrow">SETTINGS</span><h1>設定</h1></div></div><div class="panel"><div class="participant-list"><button class="participant-item" onclick="toast('通知設定を更新しました')"><div><b>通知設定</b><div class="mini">販売開始・購入・開催前通知</div></div><span>→</span></button><button class="participant-item" onclick="toast('表示設定を更新しました')"><div><b>表示設定</b><div class="mini">アクセシビリティ・アニメーション</div></div><span>→</span></button><button class="participant-item" onclick="go('/legal/privacy')"><div><b>プライバシー</b><div class="mini">データの取り扱いを確認</div></div><span>→</span></button></div></div></main>${userFooter()}${bottomNav('profile')}</div>`;
}

profile = function(){
  return `<div class="user-shell">${userHeader()}<main class="user-main"><div class="ticket-page"><span class="eyebrow">PROFILE</span><h1 style="font-size:32px;letter-spacing:-.04em;margin:5px 0 18px">プロフィール</h1><div class="panel"><div style="display:flex;align-items:center;gap:16px;margin-bottom:20px"><div class="avatar" style="width:64px;height:64px">山</div><div><b>山田 太郎</b><div class="section-sub">taro@example.com</div></div></div><div class="parity-menu-grid"><button class="parity-menu-item" onclick="go('/tickets')"><span>購入履歴・マイチケット</span><span>→</span></button><button class="parity-menu-item" onclick="go('/favorites')"><span>お気に入り</span><span>→</span></button><button class="parity-menu-item" onclick="go('/notifications')"><span>お知らせ</span><span>→</span></button><button class="parity-menu-item" onclick="toast('支払い方法の管理を表示しました')"><span>支払い方法</span><span>→</span></button><button class="parity-menu-item" onclick="go('/help')"><span>ヘルプ・お問い合わせ</span><span>→</span></button><button class="parity-menu-item" onclick="go('/settings')"><span>設定</span><span>→</span></button></div></div></div></main>${userFooter()}${bottomNav('profile')}</div>`;
};

function legalShell(title,subtitle,body){
  return `<div class="user-shell">${userHeader()}<main class="parity-page parity-legal"><button class="btn btn-soft" onclick="history.back()">← 戻る</button><div class="parity-head" style="margin-top:22px"><div><span class="eyebrow">LEGAL</span><h1>${title}</h1><div class="section-sub">${subtitle}</div></div></div>${body}</main>${userFooter()}${bottomNav('profile')}</div>`;
}
function tokushohoPage(){
  return legalShell('特定商取引法に基づく表記','チケット販売に関する表示',`<div class="panel"><div class="parity-note">このCloudflare版は検証環境です。運営者の正式な住所・電話番号など、公開に法的確認が必要な情報は実運用情報の登録後に差し替えてください。</div><dl><div class="legal-row"><dt>サービス名</dt><dd>Live Gate</dd></div><div class="legal-row"><dt>運営責任者</dt><dd>杉山 純一</dd></div><div class="legal-row"><dt>所在地</dt><dd>本番運用情報の登録後に表示</dd></div><div class="legal-row"><dt>電話番号</dt><dd>本番運用情報の登録後に表示</dd></div><div class="legal-row"><dt>メールアドレス</dt><dd>本番運用情報の登録後に表示</dd></div><div class="legal-row"><dt>支払方法</dt><dd>クレジットカード等。購入画面で利用可能な方法を表示します。</dd></div><div class="legal-row"><dt>商品の引き渡し時期</dt><dd>決済完了後、マイチケットに電子チケットを表示します。</dd></div><div class="legal-row"><dt>返品・キャンセル</dt><dd>公演・主催者ごとのキャンセル規定に従います。</dd></div></dl></div>`);
}
function termsPage(){ return legalShell('利用規約','Live Gateの利用条件',`<div class="panel"><h2>サービス利用について</h2><p class="section-sub">ユーザーは公演情報、販売条件、注意事項を確認したうえでチケットを購入します。不正利用、QRコードの不正複製、第三者への不正転売は禁止します。</p><h2>チケット・決済</h2><p class="section-sub">購入確定前に券種、枚数、料金、手数料、支払方法、キャンセル条件を表示します。</p></div>`); }
function privacyPage(){ return legalShell('プライバシーポリシー','個人情報の取り扱い',`<div class="panel"><h2>取得する情報</h2><p class="section-sub">チケット購入・管理・入場に必要な氏名、連絡先、購入履歴、選択したお目当て演者等を取り扱います。</p><h2>利用目的</h2><p class="section-sub">チケット提供、本人確認、入場管理、問い合わせ対応、サービス改善のために利用します。</p></div>`); }
function cancellationPage(){ return legalShell('キャンセルポリシー','購入前に必ずご確認ください',`<div class="panel"><h2>基本方針</h2><p class="section-sub">購入後のキャンセル可否・返金条件はイベントごとの主催者規定に従います。公演中止・延期の場合は主催者からの案内を優先します。</p><button class="btn btn-soft" onclick="go('/tickets')">購入済みチケットを確認</button></div>`); }

function openMap(id){
  const ev = getEvent(id);
  const query = encodeURIComponent(`${ev.venue} ${ev.area}`);
  window.open(`https://www.google.com/maps/search/?api=1&query=${query}`,'_blank','noopener');
}
function enhanceRenderedPage(r){
  if(r.startsWith('/event/')){
    const ev = currentEvent();
    const actionRow = document.querySelector('.detail-card .action-row');
    if(actionRow && !document.querySelector('[data-parity-map]')){
      actionRow.insertAdjacentHTML('beforeend',`<button data-parity-map class="btn btn-soft parity-map-btn" onclick="openMap('${ev.id}')">⌖ Google Maps</button>`);
    }
    const title = document.querySelector('.detail-card h1');
    if(title && !document.querySelector('[data-parity-category]')){
      title.insertAdjacentHTML('afterend',`<span data-parity-category class="tag" style="margin:6px 0 4px">${ev.category}</span>`);
    }
  }
}

adminSide = function(active='dashboard'){
  const links = [
    ['dashboard','ダッシュボード','▦','/admin'],
    ['events','イベント管理','◫','/admin/events'],
    ['tickets','チケット管理','▣','/admin/tickets'],
    ['orders','注文管理','≡','/admin/orders'],
    ['users','ユーザー管理','●','/admin/users'],
    ['accounting','会計管理','¥','/admin/accounting'],
    ['participants','参加者・受付','◎','/admin/participants'],
    ['checkin','QR入場管理','⌗','/admin/checkin'],
    ['analytics','分析','⌁','/admin/analytics']
  ];
  return `<aside class="admin-side" id="adminSide">${logo(true)}<nav class="admin-nav">${links.map(x=>`<a class="admin-link ${active===x[0]?'active':''}" href="#${x[3]}"><span style="width:18px;text-align:center">${x[2]}</span>${x[1]}</a>`).join('')}</nav><div class="admin-spacer"></div><nav class="admin-nav"><a class="admin-link" href="#/">↗ 公開サイトを見る</a><a class="admin-link" href="javascript:toast('設定画面を表示しました')">⚙ 設定</a><a class="admin-link" href="javascript:adminSignOut()">⇥ ログアウト</a></nav><div class="admin-profile"><div class="avatar">LG</div><div><b style="font-size:12px">Live Gate Admin</b><small>オーナー / Firebase認証</small></div></div></aside>`;
};

function allTicketRows(){
  return events.flatMap(ev => ev.ticketTypes.map((t,index)=>({ev,t,index})));
}
function editTicketPrice(eventId,index){
  const ev = getEvent(eventId); const t = ev.ticketTypes[index];
  openModal(`<span class="eyebrow">TICKET EDIT</span><h2>${t.name}</h2><div class="field"><label>販売価格</label><input id="parity-price-input" type="number" min="0" value="${t.price}"></div><div class="field"><label>販売状態</label><select id="parity-ticket-status"><option ${t.status==='販売中'?'selected':''}>販売中</option><option ${t.status==='残りわずか'?'selected':''}>残りわずか</option><option ${t.status==='販売前'?'selected':''}>販売前</option><option ${t.status==='停止中'?'selected':''}>停止中</option><option ${t.status==='終了'?'selected':''}>終了</option></select></div>`,[{label:'キャンセル',type:'soft'},{label:'保存',type:'primary',onClick:`saveTicketEdit('${eventId}',${index})`}]);
}
function saveTicketEdit(eventId,index){
  const ev=getEvent(eventId); const t=ev.ticketTypes[index];
  const price=Number(document.querySelector('#parity-price-input')?.value || t.price);
  const status=document.querySelector('#parity-ticket-status')?.value || t.status;
  t.price=Math.max(0,price); t.status=status;
  if(index===0) ev.priceFrom=t.price;
  toast(`${t.name}を更新しました`);
  setTimeout(parityRender,0);
}
function toggleTicketSale(eventId,index){
  const t=getEvent(eventId).ticketTypes[index];
  t.status = t.status==='停止中' ? '販売中' : '停止中';
  toast(`${t.name}を${t.status==='停止中'?'販売停止':'販売再開'}しました`); parityRender();
}
function adminTickets(){
  const rows=allTicketRows();
  return `<div class="admin-shell">${adminSide('tickets')}<div class="admin-main">${adminTop('チケット管理')}<main class="admin-content"><div class="admin-section-title"><div><h2>チケット管理</h2><div class="mini">券種・価格・販売状態・在庫をイベント横断で管理</div></div><button class="btn btn-soft" onclick="toast('チケット一覧CSVを出力しました')">CSV出力</button></div><div class="parity-ticket-grid">${rows.map(({ev,t,index})=>`<article class="parity-admin-ticket"><div class="admin-card-head"><div><span class="status ${statusClass(ev.status)}">${ev.statusLabel}</span><h3 style="margin-top:8px">${t.name}</h3><div class="mini">${ev.title}</div></div><b class="price">${money(t.price)}</b></div><div class="ticket-kpis"><div><small>販売状態</small><b>${t.status}</b></div><div><small>在庫</small><b>${t.stock}</b></div><div><small>券種</small><b>${t.note.includes('指定')?'指定':'自由/立見'}</b></div></div><div class="action-pack"><button class="table-actions" onclick="editTicketPrice('${ev.id}',${index})">編集</button><button class="table-actions" onclick="toggleTicketSale('${ev.id}',${index})">${t.status==='停止中'?'販売再開':'販売停止'}</button><button class="table-actions" onclick="openEvent('${ev.id}')">販売ページ</button></div></article>`).join('')}</div></main></div></div>`;
}

function setParityAdminUserQuery(v){ parityAdminUserQuery=v; parityRender(); }
function filteredParityUsers(){
  const q=parityAdminUserQuery.trim().toLowerCase();
  return parityUsers.filter(u=>!q || [u.id,u.name,u.email].join(' ').toLowerCase().includes(q));
}
function toggleParityUser(index){
  parityUsers[index].status = parityUsers[index].status==='active'?'suspended':'active';
  toast(`${parityUsers[index].name}の状態を更新しました`); parityRender();
}
function viewParityUser(index){
  const u=parityUsers[index];
  openModal(`<span class="eyebrow">USER DETAIL</span><h2>${u.name}</h2><div class="participant-list"><div class="participant-item"><div><b>ユーザーID</b><div class="mini">${u.id}</div></div><span>${u.status==='active'?'利用中':'停止中'}</span></div><div class="participant-item"><div><b>メール</b><div class="mini">${u.email}</div></div><span>${u.orders}注文</span></div><div class="participant-item"><div><b>累計購入額</b></div><span>${money(u.spent)}</span></div></div>`,[{label:'閉じる',type:'soft'}]);
}
function adminUsers(){
  const list=filteredParityUsers();
  return `<div class="admin-shell">${adminSide('users')}<div class="admin-main">${adminTop('ユーザー管理')}<main class="admin-content"><div class="admin-section-title"><div><h2>ユーザー管理</h2><div class="mini">購入者アカウント・利用状況・購入履歴を確認</div></div><button class="btn btn-soft" onclick="toast('ユーザーCSVを出力しました')">CSV出力</button></div><div class="toolbar"><input class="searchbox" value="${escapeAttr(parityAdminUserQuery)}" placeholder="氏名・メール・ユーザーIDで検索" oninput="setParityAdminUserQuery(this.value)"></div><section class="admin-card" style="padding:0;overflow:hidden"><div class="parity-user-row header"><div>ユーザー</div><div>注文数</div><div>累計購入</div><div>状態</div><div>操作</div></div>${list.map(u=>{const idx=parityUsers.indexOf(u);return `<div class="parity-user-row"><div class="parity-user-cell"><b>${u.name}</b><span class="mini">${u.email} · ${u.id}</span></div><div>${u.orders}件</div><div>${money(u.spent)}</div><div><span class="status ${u.status==='active'?'paid':'refund'}">${u.status==='active'?'利用中':'停止中'}</span></div><div class="action-pack"><button class="table-actions" onclick="viewParityUser(${idx})">詳細</button><button class="table-actions" onclick="toggleParityUser(${idx})">${u.status==='active'?'停止':'再開'}</button></div></div>`}).join('')}</section></main></div></div>`;
}

function markSettlementPaid(index){ paritySettlements[index].status='精算済み'; toast('精算済みに更新しました'); parityRender(); }
function adminAccounting(){
  const gross=paritySettlements.reduce((s,x)=>s+x.gross,0); const fees=paritySettlements.reduce((s,x)=>s+x.fees,0); const refunds=paritySettlements.reduce((s,x)=>s+x.refunds,0); const payout=gross-fees-refunds;
  return `<div class="admin-shell">${adminSide('accounting')}<div class="admin-main">${adminTop('会計管理')}<main class="admin-content"><div class="admin-section-title"><div><h2>会計管理</h2><div class="mini">売上・手数料・返金・主催者精算を管理</div></div><button class="btn btn-soft" onclick="toast('会計CSVをエクスポートしました')">会計CSV</button></div><div class="parity-account-grid"><div class="parity-account-card"><small>総売上</small><strong>${money(gross)}</strong></div><div class="parity-account-card"><small>手数料</small><strong>${money(fees)}</strong></div><div class="parity-account-card"><small>返金</small><strong>${money(refunds)}</strong></div><div class="parity-account-card"><small>精算対象額</small><strong>${money(payout)}</strong></div></div><section class="admin-card" style="padding:0;overflow:hidden"><div class="parity-settlement-row header"><b>イベント</b><b>売上</b><b>手数料</b><b>精算額</b><b>操作</b></div>${paritySettlements.map((s,index)=>{const net=s.gross-s.fees-s.refunds; return `<div class="parity-settlement-row"><div><b>${getEvent(s.eventId).title}</b><div class="mini">${getEvent(s.eventId).date}</div></div><div>${money(s.gross)}</div><div>${money(s.fees+s.refunds)}</div><div><b>${money(net)}</b><div class="mini">${s.status}</div></div><div><button class="table-actions" onclick="${s.status==='精算済み'?`toast('精算明細を表示しました')`:`markSettlementPaid(${index})`}">${s.status==='精算済み'?'明細':'精算済みにする'}</button></div></div>`}).join('')}</section></main></div></div>`;
}

function parityRender(){
  const r=route();
  let html=null;
  if(r==='/search') html=searchPage();
  else if(r==='/favorites') html=favoritesPage();
  else if(r==='/notifications') html=notificationsPage();
  else if(r==='/help') html=helpPage();
  else if(r==='/settings') html=settingsPage();
  else if(r==='/legal/tokushoho') html=tokushohoPage();
  else if(r==='/legal/terms') html=termsPage();
  else if(r==='/legal/privacy') html=privacyPage();
  else if(r==='/legal/cancellation') html=cancellationPage();
  else if(r==='/login') html=adminLogin();
  else if(r.startsWith('/admin') && !isAdminAuthed()) html=adminLogin();
  else if(r==='/admin/tickets') html=adminTickets();
  else if(r==='/admin/users') html=adminUsers();
  else if(r==='/admin/accounting') html=adminAccounting();
  if(html!==null){
    document.querySelector('#app').innerHTML=html;
    window.scrollTo(0,0);
    return;
  }
  __legacyRender();
  enhanceRenderedPage(r);
}
render = parityRender;
window.render = parityRender;
window.addEventListener('hashchange', parityRender);
window.addEventListener('load', parityRender);
