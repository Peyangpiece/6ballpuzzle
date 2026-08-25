(() => {
  const DATA = {
    performers: ['Echoes','Night Traveler','LUMINA'],
    organizer: { name:'Live Gate Entertainment', manager:'山田 花音', x:'@livegate_jp', email:'info@livegate.jp' }
  };
  const prefs = { favoritePerformer: localStorage.getItem('livegate.favoritePerformer') || 'LUMINA' };

  const lgToast = (text) => {
    if (typeof window.toast === 'function') return window.toast(text);
    let el = document.querySelector('#toast');
    if (!el) { el = document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
    el.textContent=text; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200);
  };
  const openSheet = (title, body) => {
    document.querySelector('#lgEnhanceModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-back" id="lgEnhanceModal"><div class="modal"><span class="eyebrow">LIVE GATE</span><h2>${title}</h2>${body}<div class="modal-actions"><button class="btn btn-primary" id="lgEnhanceClose">閉じる</button></div></div></div>`);
    document.querySelector('#lgEnhanceClose').onclick=()=>document.querySelector('#lgEnhanceModal')?.remove();
  };
  const shareX = () => {
    const text=encodeURIComponent('SUMMER LIVE 2026 を Live Gate でチェック！ Echoes / Night Traveler / LUMINA #LiveGate');
    const url=encodeURIComponent(location.href);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`,'_blank','noopener');
    lgToast('X共有画面を開きました');
  };
  const persist = (key,value) => {
    localStorage.setItem(`livegate.${key}`, typeof value==='string'?value:JSON.stringify(value));
    if (window.liveGateFirebase?.savePreference) window.liveGateFirebase.savePreference(key,value).catch(()=>{});
  };
  window.applyFirebaseProfile = (profile) => {
    if (profile?.favoritePerformer) {
      prefs.favoritePerformer=profile.favoritePerformer;
      localStorage.setItem('livegate.favoritePerformer',profile.favoritePerformer);
      patchPage();
    }
  };

  function patchHome(){
    const grid=document.querySelector('.event-grid');
    if(!grid || document.querySelector('#lgSearchWrap')) return;
    const section=grid.closest('.section');
    if(!section) return;
    const wrap=document.createElement('div');
    wrap.id='lgSearchWrap';
    wrap.className='lg-search-wrap';
    wrap.innerHTML=`<input id="lgEventSearch" class="searchbox" placeholder="イベント名・会場・出演者で検索"><div class="lg-quick-filters"><button class="filter active" data-lg-filter="all">すべて</button><button class="filter" data-lg-filter="live">販売中</button><button class="filter" data-lg-filter="upcoming">販売前</button><button class="filter" data-lg-filter="ended">開催終了</button></div>`;
    grid.before(wrap);
    const cards=[...grid.querySelectorAll('.event-card')];
    const performerSets=[['Echoes','Night Traveler','LUMINA'],['Riot Club','ASTER','Moon Chaser'],['Astera','Yui Sato','Haru']];
    cards.forEach((card,i)=>{
      card.dataset.status=i===2?'upcoming':'live';
      card.dataset.performers=(performerSets[i]||[]).join(' ');
      const body=card.querySelector('.event-body');
      if(body && !body.querySelector('.lg-lineup')) body.insertAdjacentHTML('beforeend',`<div class="lg-lineup">${(performerSets[i]||[]).map(x=>`<span>${x}</span>`).join('')}</div>`);
    });
    let filter='all';
    const apply=()=>{
      const q=(document.querySelector('#lgEventSearch')?.value||'').trim().toLowerCase();
      cards.forEach(card=>{
        const text=(card.textContent+' '+card.dataset.performers).toLowerCase();
        card.style.display=((!q||text.includes(q))&&(filter==='all'||card.dataset.status===filter))?'':'none';
      });
    };
    document.querySelector('#lgEventSearch').addEventListener('input',apply);
    wrap.querySelectorAll('[data-lg-filter]').forEach(btn=>btn.onclick=()=>{
      wrap.querySelectorAll('[data-lg-filter]').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); filter=btn.dataset.lgFilter; apply();
    });
    section.querySelectorAll('.filters .filter').forEach((btn,i)=>btn.onclick=()=>{
      const map=['all','live','upcoming','ended']; filter=map[i]||'all'; apply(); lgToast(`${btn.textContent.trim()}を表示しました`);
    });
  }

  function patchDetail(){
    const card=document.querySelector('.detail-card');
    if(!card || card.querySelector('#lgPerformerSection')) return;
    const ticketHeading=[...card.querySelectorAll('h2')].find(x=>x.textContent.includes('チケット'));
    const performer=document.createElement('section'); performer.id='lgPerformerSection'; performer.className='lg-enhance-section';
    performer.innerHTML=`<h2>出演者</h2><p class="section-sub">お目当ての演者を選択すると購入情報に保存されます。</p><div class="lg-performers">${DATA.performers.map(name=>`<button class="lg-performer ${prefs.favoritePerformer===name?'active':''}" data-performer="${name}"><b>${name}</b><span>${prefs.favoritePerformer===name?'選択中':'お目当てにする'}</span></button>`).join('')}</div><div class="lg-action-row"><button class="btn btn-soft" id="lgShareX">𝕏 で共有</button><button class="btn btn-soft" id="lgOrganizer">主催者情報</button></div><div class="lg-organizer-card"><b>${DATA.organizer.name}</b><span>担当：${DATA.organizer.manager}</span><span>X：${DATA.organizer.x}</span><span>${DATA.organizer.email}</span></div>`;
    (ticketHeading||card.lastElementChild)?.before(performer);
    performer.querySelectorAll('[data-performer]').forEach(btn=>btn.onclick=()=>{
      prefs.favoritePerformer=btn.dataset.performer; persist('favoritePerformer',prefs.favoritePerformer); patchPage(true); lgToast(`お目当て演者を「${prefs.favoritePerformer}」に設定しました`);
    });
    performer.querySelector('#lgShareX').onclick=shareX;
    performer.querySelector('#lgOrganizer').onclick=()=>openSheet('主催者情報',`<div class="lg-organizer-modal"><b>${DATA.organizer.name}</b><p>担当：${DATA.organizer.manager}</p><p>X：${DATA.organizer.x}</p><p>メール：${DATA.organizer.email}</p><p>イベント運営・払い戻し・入場方法に関するお問い合わせ先です。</p></div>`);
    const sticky=document.querySelector('.sticky-purchase');
    if(sticky && !sticky.querySelector('#lgStickyShare')){
      const btn=document.createElement('button'); btn.id='lgStickyShare'; btn.className='btn btn-soft'; btn.textContent='𝕏で共有'; btn.onclick=shareX; sticky.appendChild(btn);
    }
  }

  function patchCheckout(){
    const panel=document.querySelector('.checkout-wrap .panel');
    if(!panel || panel.querySelector('#lgFavoriteCheckout')) return;
    const target=panel.querySelector('h2:nth-of-type(2)')||panel.querySelector('h2');
    const field=document.createElement('div'); field.id='lgFavoriteCheckout'; field.className='field';
    field.innerHTML=`<label>お目当て演者</label><select>${DATA.performers.map(x=>`<option ${x===prefs.favoritePerformer?'selected':''}>${x}</option>`).join('')}</select>`;
    target?.before(field); field.querySelector('select').onchange=e=>{ prefs.favoritePerformer=e.target.value; persist('favoritePerformer',prefs.favoritePerformer); lgToast('お目当て演者を更新しました'); };
    const aside=document.querySelector('.checkout-wrap aside');
    if(aside && !aside.querySelector('#lgShareCheckout')){ const b=document.createElement('button'); b.id='lgShareCheckout'; b.className='btn btn-soft'; b.style.width='100%'; b.style.marginTop='8px'; b.textContent='𝕏で共有して友達を誘う'; b.onclick=shareX; aside.appendChild(b); }
  }

  function patchTickets(){
    document.querySelectorAll('.tabs .tab').forEach((tab,i)=>{
      tab.style.cursor='pointer'; tab.onclick=()=>{ document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('active')); tab.classList.add('active'); const labels=['すべて','開催前','開催中','終了']; lgToast(`${labels[i]||tab.textContent}のチケットを表示しました`); if(i===3){ document.querySelector('.my-ticket')?.classList.add('lg-ended-ticket'); } else { document.querySelector('.my-ticket')?.classList.remove('lg-ended-ticket'); } };
    });
    const body=document.querySelector('.ticket-body'); if(body && !body.querySelector('#lgTicketExtras')) body.insertAdjacentHTML('beforeend',`<div id="lgTicketExtras" class="lg-action-row"><button class="btn btn-soft" id="lgTicketShare">𝕏で共有</button><button class="btn btn-soft" id="lgTicketOrganizer">主催者情報</button></div>`);
    document.querySelector('#lgTicketShare')?.addEventListener('click',shareX);
    document.querySelector('#lgTicketOrganizer')?.addEventListener('click',()=>openSheet('主催者情報',`<p><b>${DATA.organizer.name}</b></p><p>担当：${DATA.organizer.manager}</p><p>${DATA.organizer.email}</p>`));
  }

  function patchAdminSide(){
    const side=document.querySelector('.admin-side'); if(!side) return;
    const links=[...side.querySelectorAll('.admin-link')];
    links.forEach(link=>{
      const t=link.textContent.trim();
      if(t.includes('参加者')){ link.href='#/admin/participants'; link.removeAttribute('onclick'); }
      if(t.includes('分析')){ link.href='#/admin/analytics'; link.removeAttribute('onclick'); }
      if(t.includes('設定')){ link.href='javascript:void(0)'; link.onclick=()=>openSheet('設定','<p>通知・スタッフ権限・販売設定・決済設定を管理できます。</p>'); }
    });
  }

  function patchAdminEvents(){
    document.querySelectorAll('.event-admin-row:not(.header)').forEach((row,index)=>{
      const cells=[...row.children]; const action=cells[cells.length-1]; if(!action || action.dataset.lgDone) return; action.dataset.lgDone='1';
      action.innerHTML=`<div class="lg-admin-actions"><button data-a="detail">詳細</button><button data-a="sales">${index===3?'販売開始':'販売停止'}</button><button data-a="finish">開催終了</button></div>`;
      action.querySelector('[data-a="detail"]').onclick=()=>openSheet('イベント詳細',`<p><b>${row.querySelector('b')?.textContent||'イベント'}</b></p><p>出演者・券種・主催者・販売状況を編集できます。</p>`);
      action.querySelector('[data-a="sales"]').onclick=e=>{ e.currentTarget.textContent=e.currentTarget.textContent==='販売停止'?'販売開始':'販売停止'; lgToast('販売状態を変更しました'); };
      action.querySelector('[data-a="finish"]').onclick=()=>{ const st=row.querySelector('.status'); if(st){ st.textContent='開催終了'; st.className='status refund'; } lgToast('イベントを開催終了にしました'); };
    });
    document.querySelectorAll('.toolbar .searchbox').forEach(input=>{ if(input.dataset.lgSearch) return; input.dataset.lgSearch='1'; input.oninput=()=>{ const q=input.value.toLowerCase(); document.querySelectorAll('.event-admin-row:not(.header)').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none'); }; });
  }

  function renderParticipants(){
    document.querySelector('#app').innerHTML=`<div class="admin-shell">${typeof adminSide==='function'?adminSide('users'):''}<div class="admin-main">${typeof adminTop==='function'?adminTop('参加者'):''}<main class="admin-content"><div class="admin-section-title"><div><h2>参加者管理</h2><div class="mini">氏名・整理番号・イベントで検索</div></div><button class="btn btn-primary" onclick="location.hash='/admin/checkin'">QR受付へ</button></div><div class="toolbar"><input id="lgParticipantSearch" class="searchbox" placeholder="氏名・整理番号で検索"><button class="filter active">すべて</button><button class="filter">入場済み</button><button class="filter">未入場</button></div><section class="admin-card"><div id="lgParticipantList">${[['山田 太郎','A-042','入場済み'],['佐藤 花子','B-011','未入場'],['鈴木 一郎','A-109','未入場'],['高橋 健','A-033','入場済み']].map(p=>`<div class="lg-participant"><div><b>${p[0]}</b><span>SUMMER LIVE 2026 / ${p[1]}</span></div><button class="${p[2]==='入場済み'?'ok':'wait'}">${p[2]}</button></div>`).join('')}</div></section></main></div></div>`;
    document.querySelector('#lgParticipantSearch').oninput=e=>{ const q=e.target.value.toLowerCase(); document.querySelectorAll('.lg-participant').forEach(x=>x.style.display=x.textContent.toLowerCase().includes(q)?'flex':'none'); };
    patchAdminSide();
  }
  function renderAnalytics(){
    document.querySelector('#app').innerHTML=`<div class="admin-shell">${typeof adminSide==='function'?adminSide('analytics'):''}<div class="admin-main">${typeof adminTop==='function'?adminTop('分析'):''}<main class="admin-content"><div class="admin-section-title"><div><h2>分析ダッシュボード</h2><div class="mini">売上・注文・入場状況を横断分析</div></div><button class="btn btn-soft" onclick="toast('月次レポートを出力しました')">月次レポート</button></div><div class="kpi-grid"><div class="kpi"><label>売上</label><strong>¥1,234,567</strong><span class="delta">↑12.5%</span></div><div class="kpi"><label>注文</label><strong>372件</strong><span class="delta">↑9.3%</span></div><div class="kpi"><label>販売枚数</label><strong>987枚</strong><span class="delta">↑15.2%</span></div><div class="kpi"><label>入場率</label><strong>56.7%</strong></div></div><div class="admin-grid"><section class="admin-card"><div class="admin-card-head"><h3>売上推移</h3><span class="mini">過去14日</span></div>${typeof chartHtml==='function'?chartHtml():''}</section><section class="admin-card"><div class="admin-card-head"><h3>注文ステータス</h3><span class="mini">372件</span></div><div class="donut-wrap"><div class="donut"></div></div></section></div></main></div></div>`;
    patchAdminSide();
  }

  function makeInactiveButtonsUseful(){
    document.querySelectorAll('button').forEach(btn=>{
      if(btn.dataset.lgBound) return;
      btn.dataset.lgBound='1';
      const hasInline=!!btn.getAttribute('onclick');
      if(!hasInline && !btn.onclick && !btn.closest('#lgSearchWrap') && !btn.closest('.lg-performers')) btn.addEventListener('click',()=>lgToast(`${btn.textContent.trim()||'操作'}を実行しました`));
    });
  }

  function patchPage(force=false){
    const r=location.hash.slice(1)||'/';
    if(r==='/admin/participants'){ renderParticipants(); makeInactiveButtonsUseful(); return; }
    if(r==='/admin/analytics'){ renderAnalytics(); makeInactiveButtonsUseful(); return; }
    patchAdminSide();
    if(r==='/') patchHome();
    if(r.startsWith('/event/')) { if(force) document.querySelector('#lgPerformerSection')?.remove(); patchDetail(); }
    if(r==='/checkout') patchCheckout();
    if(r==='/tickets') patchTickets();
    if(r==='/admin/events') patchAdminEvents();
    makeInactiveButtonsUseful();
  }

  window.addEventListener('load',()=>setTimeout(patchPage,0));
  window.addEventListener('hashchange',()=>setTimeout(patchPage,0));
  const observer=new MutationObserver(()=>{ clearTimeout(window.__lgPatchTimer); window.__lgPatchTimer=setTimeout(patchPage,20); });
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
