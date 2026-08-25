
const events = [
  {
    id:'summer-live-2026',
    title:'SUMMER LIVE 2026',
    status:'live',
    statusLabel:'販売中',
    badgeClass:'chip-live',
    date:'2026-09-12',
    displayDate:'9.12 SAT',
    open:'17:30',
    start:'18:00',
    venue:'DIAMOND HALL',
    area:'愛知県名古屋市中区新栄2-1-9',
    priceFrom:3500,
    description:'今夜の夏を最高に熱くする一夜限りのライブ。ライブハウスならではの距離感と臨場感を楽しめます。',
    performers:['Echoes','Night Traveler','LUMINA'],
    organizer:{name:'Live Gate Entertainment', manager:'山田 花音', x:'@livegate_jp', email:'info@livegate.jp', note:'主催者からの注意事項、入場案内、払い戻しポリシーを掲載します。'},
    ticketTypes:[
      {name:'一般チケット', price:3500, stock:'残り32枚', note:'スタンディング / 整理番号付き', status:'販売中'},
      {name:'前方エリア', price:5500, stock:'残りわずか', note:'前方優先エリア / 整理番号付き', status:'残りわずか'}
    ]
  },
  {
    id:'rock-special-night',
    title:'ROCK SPECIAL NIGHT',
    status:'live',
    statusLabel:'残りわずか',
    badgeClass:'chip-orange',
    date:'2026-09-20',
    displayDate:'9.20 SUN',
    open:'17:30',
    start:'18:30',
    venue:'STUDIO Z',
    area:'愛知県名古屋市中区錦3-8-5',
    priceFrom:3000,
    description:'アッパーなロックサウンドで盛り上がる一夜。',
    performers:['Riot Club','ASTER','Moon Chaser'],
    organizer:{name:'Z Music Works', manager:'今井 大地', x:'@zmusicworks', email:'contact@zmusic.jp', note:'ドリンク代は別途必要です。'},
    ticketTypes:[
      {name:'一般チケット', price:3000, stock:'残り18枚', note:'スタンディング', status:'販売中'},
      {name:'U-22', price:2500, stock:'残り12枚', note:'学生証確認あり', status:'販売中'}
    ]
  },
  {
    id:'acoustic-night',
    title:'Acoustic Night',
    status:'upcoming',
    statusLabel:'販売前',
    badgeClass:'chip-blue',
    date:'2026-10-04',
    displayDate:'10.4 SUN',
    open:'18:00',
    start:'18:30',
    venue:'BLUE NOTE ROOM',
    area:'愛知県名古屋市千種区池下1-4-7',
    priceFrom:4000,
    description:'落ち着いたアコースティックライブ。静かな夜に寄り添う公演です。',
    performers:['Astera','Yui Sato','Haru'],
    organizer:{name:'Blue Label', manager:'佐伯 直人', x:'@bluelabel_live', email:'hello@bluelabel.jp', note:'販売開始は2026年9月2日 20:00です。'},
    ticketTypes:[
      {name:'一般チケット', price:4000, stock:'販売開始前', note:'全席自由', status:'販売前'}
    ]
  },
  {
    id:'jazz-night-2026',
    title:'JAZZ NIGHT 2026',
    status:'ended',
    statusLabel:'開催終了',
    badgeClass:'chip-muted',
    date:'2026-07-18',
    displayDate:'7.18 SAT',
    open:'18:30',
    start:'19:00',
    venue:'SWING HALL',
    area:'愛知県名古屋市東区泉2-11-6',
    priceFrom:4200,
    description:'開催終了したジャズイベントのアーカイブ用ページです。',
    performers:['Mellow Five','Jin Quartet'],
    organizer:{name:'Swing Hall', manager:'小林 健司', x:'@swinghall', email:'info@swinghall.jp', note:'この公演は開催終了しています。'},
    ticketTypes:[
      {name:'一般チケット', price:4200, stock:'受付終了', note:'指定席', status:'終了'}
    ]
  }
];

const orders = [
  {id:'#LG-12345', buyer:'山田 太郎', email:'taro@example.com', eventId:'summer-live-2026', qty:2, amount:7440, status:'paid', ticketType:'一般チケット'},
  {id:'#LG-12344', buyer:'佐藤 花子', email:'hanako@example.com', eventId:'rock-special-night', qty:1, amount:3000, status:'paid', ticketType:'一般チケット'},
  {id:'#LG-12343', buyer:'鈴木 一郎', email:'ichiro@example.com', eventId:'acoustic-night', qty:1, amount:4000, status:'pending', ticketType:'一般チケット'},
  {id:'#LG-12342', buyer:'田中 美咲', email:'misaki@example.com', eventId:'summer-live-2026', qty:2, amount:7440, status:'refund', ticketType:'一般チケット'},
  {id:'#LG-12341', buyer:'伊藤 翼', email:'tsubasa@example.com', eventId:'jazz-night-2026', qty:1, amount:4200, status:'paid', ticketType:'一般チケット'}
];

const participants = [
  {name:'山田 太郎', number:'A-042', eventId:'summer-live-2026', status:'checkedin', memo:'2枚購入'},
  {name:'佐藤 花子', number:'B-011', eventId:'summer-live-2026', status:'waiting', memo:'1枚購入'},
  {name:'鈴木 一郎', number:'A-109', eventId:'rock-special-night', status:'waiting', memo:'当日受付予定'},
  {name:'高橋 健', number:'A-033', eventId:'summer-live-2026', status:'checkedin', memo:'受付完了 18:02'}
];

const state = {
  homeSearch:'',
  homeFilter:'all',
  selectedEventId:'summer-live-2026',
  selectedTicket:'一般チケット',
  selectedPrice:3500,
  qty:2,
  fee:440,
  favoritePerformer:'LUMINA',
  likedEvents:{},
  ticketTab:'all',
  adminEventSearch:'',
  adminEventFilter:'all',
  adminOrderSearch:'',
  adminOrderFilter:'all',
  adminParticipantSearch:'',
  adminParticipantFilter:'all',
  checkedIn:false
};

function money(n){ return '¥' + Number(n).toLocaleString('ja-JP'); }
function route(){ return location.hash.slice(1) || '/'; }
function go(path){ location.hash = path; }
function currentEvent(){ return events.find(e => e.id === state.selectedEventId) || events[0]; }
function getEvent(id){ return events.find(e => e.id === id) || events[0]; }
function statusLabel(status){ return ({live:'販売中', upcoming:'販売前', ended:'開催終了'})[status] || status; }
function statusClass(status){ return ({live:'live', upcoming:'upcoming', ended:'ended'})[status] || 'ended'; }
function orderStatusLabel(status){ return ({paid:'支払済み', pending:'支払い待ち', refund:'返金済み'})[status] || status; }
function orderStatusClass(status){ return ({paid:'paid', pending:'pending', refund:'refund'})[status] || 'pending'; }
function toast(text){ const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(window.__livegateToastTimer); window.__livegateToastTimer = setTimeout(()=>el.classList.remove('show'),2200); }
function logo(admin=false){ return `<div class="logo"><span class="mark"></span><span>Live Gate${admin?'<small>ADMIN</small>':''}</span></div>`; }
function toggleLike(id){ state.likedEvents[id] = !state.likedEvents[id]; persistFirebasePreference('likedEvents', state.likedEvents); render(); toast(state.likedEvents[id] ? 'お気に入りに追加しました' : 'お気に入りを解除しました'); }
function setHomeSearch(v){ state.homeSearch = v; render(); }
function setHomeFilter(v){ state.homeFilter = v; render(); }
function setTicketsTab(v){ state.ticketTab = v; render(); }
function setAdminEventSearch(v){ state.adminEventSearch = v; render(); }
function setAdminEventFilter(v){ state.adminEventFilter = v; render(); }
function setAdminOrderSearch(v){ state.adminOrderSearch = v; render(); }
function setAdminOrderFilter(v){ state.adminOrderFilter = v; render(); }
function setAdminParticipantSearch(v){ state.adminParticipantSearch = v; render(); }
function setAdminParticipantFilter(v){ state.adminParticipantFilter = v; render(); }
function userHeader(){
  return `<header class="user-header">${logo()}<div class="user-actions"><button class="btn btn-soft" onclick="go('/tickets')">マイチケット</button><button class="btn btn-soft" onclick="go('/profile')">プロフィール</button><button class="icon-btn" aria-label="検索" onclick="document.querySelector('[data-home-search]')?.focus()">⌕</button><button class="icon-btn" aria-label="お知らせ" onclick="toast('お知らせはありません')">◌</button></div></header>`;
}
function bottomNav(active='home'){
  return `<nav class="bottom-nav"><button class="bottom-link ${active==='home'?'active':''}" onclick="go('/')"><b style="font-size:22px">⌂</b>ホーム</button><button class="bottom-link ${active==='ticket'?'active':''}" onclick="go('/tickets')"><b style="font-size:21px">▣</b>チケット</button></nav>`;
}
function userFooter(){
  return `<footer class="user-footer"><div class="footer-inner"><div>${logo()}<p class="footer-note">チケットの購入から管理、入場まで。ライブ体験を、もっとスマートに。</p></div><div><b>サービス</b><div class="footer-links"><a href="#/">イベントを探す</a><a href="#/tickets">マイチケット</a><a href="#/admin">主催者向け管理画面</a><a href="javascript:toast('共有ページを開きました')">Xで共有</a></div></div><div><b>サポート</b><div class="footer-links"><a href="javascript:toast('利用規約を表示しました')">利用規約</a><a href="javascript:toast('プライバシーポリシーを表示しました')">プライバシーポリシー</a><a href="javascript:toast('特定商取引法ページを表示しました')">特定商取引法に基づく表記</a><a href="javascript:toast('お問い合わせフォームを表示しました')">お問い合わせ</a></div></div></div></footer>`;
}
function filteredEvents(){
  const q = state.homeSearch.trim().toLowerCase();
  return events.filter(e => {
    const byStatus = state.homeFilter === 'all' ? true : e.status === state.homeFilter;
    const text = [e.title,e.venue,e.area,...e.performers].join(' ').toLowerCase();
    const byText = !q || text.includes(q);
    return byStatus && byText;
  });
}
function eventCard(event){
  const liked = !!state.likedEvents[event.id];
  return `<article class="event-card"><div class="event-art"><span class="chip ${event.badgeClass}">${event.statusLabel}</span><button class="wish" onclick="event.stopPropagation();toggleLike('${event.id}')">${liked?'♥':'♡'}</button></div><div class="event-body" onclick="openEvent('${event.id}')"><div class="event-title">${event.title}</div><div class="meta">◷ ${event.displayDate} ・ OPEN ${event.open} / START ${event.start}</div><div class="meta">⌖ ${event.venue}</div><div class="lineup-mini">${event.performers.slice(0,3).map(name=>`<span class="tag">${name}</span>`).join('')}</div><div class="price-row"><span class="price">${money(event.priceFrom)}〜</span><span class="small-link">詳細を見る →</span></div></div></article>`;
}
function home(){
  const list = filteredEvents();
  return `<div class="user-shell">${userHeader()}<main class="user-main"><section class="hero"><div class="hero-content"><span class="eyebrow" style="color:#ff8aad">LIVE GATE</span><h1>ライブへ、<br>最短で。</h1><p>チケット購入から入場まで、スマホひとつ。従来の検索・出演者確認・推し演者選択も残したまま、もっと使いやすくしました。</p><div class="hero-cta"><button class="btn btn-primary" onclick="document.querySelector('#events').scrollIntoView({behavior:'smooth'})">イベントを探す</button><button class="btn btn-soft" onclick="go('/tickets')">マイチケットを見る</button></div></div></section><section class="section" id="events"><div class="section-head"><div><span class="eyebrow">DISCOVER</span><h2>受付中の公演</h2><div class="section-sub">イベント名・会場・出演者名で検索できます</div></div></div><div class="toolbar-search"><input data-home-search class="search-input" value="${escapeAttr(state.homeSearch)}" placeholder="イベント名 / 会場 / 出演者で検索" oninput="setHomeSearch(this.value)" /><div class="filters"><button class="filter ${state.homeFilter==='all'?'active':''}" onclick="setHomeFilter('all')">すべて</button><button class="filter ${state.homeFilter==='live'?'active':''}" onclick="setHomeFilter('live')">販売中</button><button class="filter ${state.homeFilter==='upcoming'?'active':''}" onclick="setHomeFilter('upcoming')">販売前</button><button class="filter ${state.homeFilter==='ended'?'active':''}" onclick="setHomeFilter('ended')">開催終了</button></div></div><div style="margin-top:18px">${list.length ? `<div class="event-grid">${list.map(eventCard).join('')}</div>` : `<div class="empty"><div class="empty-art"></div><b>条件に一致するイベントがありません</b><small>検索ワードやフィルターを変更してください。</small><div style="margin-top:16px"><button class="btn btn-primary" onclick="resetHomeFilters()">条件をリセット</button></div></div>`}</div></section><section class="section"><div class="section-head"><div><span class="eyebrow">WHY LIVE GATE</span><h2>購入から入場まで、ひとつ。</h2></div></div><div class="info-grid"><div class="panel"><b>01　出演者が見やすい</b><p class="section-sub">イベント詳細で出演者一覧を確認し、そのままお目当て演者を選択できます。</p></div><div class="panel"><b>02　迷わず買える</b><p class="section-sub">券種比較、X共有、主催者情報、最終確認までをひとつの流れに整理しました。</p></div><div class="panel"><b>03　当日もスムーズ</b><p class="section-sub">マイチケットからQR提示、会場確認、主催者情報チェックまで1画面で対応。</p></div></div></section></main>${userFooter()}${bottomNav('home')}</div>`;
}
function escapeAttr(v){ return String(v).replace(/"/g,'&quot;'); }
function resetHomeFilters(){ state.homeSearch=''; state.homeFilter='all'; render(); }
