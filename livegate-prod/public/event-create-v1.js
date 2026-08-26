/* Live Gate event creation form parity with original /admin/events/new */
(function(){
  if(typeof adminSide!=='function' || typeof adminTop!=='function') return;

  let performerSeq=1;
  let ticketSeq=1;

  function field(label,id,type='text',required=true,placeholder='',extra=''){
    const req=required?'<span class="ec-required"> *</span>':'';
    if(type==='textarea') return `<div class="ec-field"><label for="${id}">${label}${req}</label><textarea id="${id}" ${required?'required':''} placeholder="${placeholder}"></textarea>${extra}</div>`;
    return `<div class="ec-field"><label for="${id}">${label}${req}</label><input id="${id}" type="${type}" ${required?'required':''} placeholder="${placeholder}" ${type==='number'?'min="0"':''}>${extra}</div>`;
  }

  function performerCard(index){
    return `<div class="ec-repeat ec-performer" data-index="${index}"><div class="ec-repeat-head"><b>出演者 #${index}</b>${index>1?`<button type="button" class="ec-remove" onclick="this.closest('.ec-repeat').remove();renumberEventCreate()">削除</button>`:''}</div>${field('出演者名',`performer-name-${index}`,'text',true,'出演者名')}${field('出演者画像（任意）',`performer-image-${index}`,'file',false,'','')}<label class="ec-inline-check"><input type="checkbox" class="ec-target-performer" checked>お目当て選択の対象にする</label></div>`;
  }

  function ticketCard(index){
    return `<div class="ec-repeat ec-ticket" data-index="${index}"><div class="ec-repeat-head"><b>チケット種別 #${index}</b>${index>1?`<button type="button" class="ec-remove" onclick="this.closest('.ec-repeat').remove();renumberEventCreate()">削除</button>`:''}</div>${field('チケット名',`ticket-name-${index}`,'text',true,'チケット名')}<div class="ec-grid-2">${field('価格（円）',`ticket-price-${index}`,'number',true,'')}${field('販売枚数',`ticket-stock-${index}`,'number',true,'')}</div></div>`;
  }

  function eventCreatePage(){
    if(typeof isAdminAuthed==='function' && !isAdminAuthed()) return adminLogin();
    return `<div class="admin-shell">${adminSide('events')}<div class="admin-main">${adminTop('イベント作成')}<main class="admin-content"><div class="ec-wrap"><div class="ec-head"><div><h2>イベント作成</h2><div class="mini">本家と同じ必要情報でイベントを登録します</div></div><button class="btn btn-soft" onclick="go('/admin/events')">← イベント一覧へ</button></div><form id="eventCreateForm" class="ec-form" onsubmit="submitEventCreate(event)">

<section class="ec-section"><h3>基本情報</h3>${field('イベント名','ec-name','text',true,'イベント名')}${field('イベント概要','ec-summary','textarea',true,'イベントの概要')}${field('主催者名','ec-organizer','text',true,'主催者名')}${field('主催者連絡先（任意）','ec-organizer-contact','text',false,'メールアドレス・電話番号・Xアカウント等')}</section>

<section class="ec-section"><h3>会場情報</h3>${field('会場名','ec-venue','text',true,'会場名')}${field('会場住所','ec-address','text',true,'会場住所')}</section>

<section class="ec-section"><h3>開催日時</h3>${field('開場日時','ec-open','datetime-local',true,'')}${field('開演日時','ec-start','datetime-local',true,'')}${field('終演予定日時（任意）','ec-end','datetime-local',false,'')}</section>

<section class="ec-section"><h3>出演者</h3><div id="ecPerformers">${performerCard(1)}</div><button type="button" class="btn btn-soft ec-add" onclick="addEventPerformer()">＋ 出演者を追加</button></section>

<section class="ec-section"><h3>販売期間</h3>${field('販売開始日時','ec-sale-start','datetime-local',true,'')}${field('販売終了日時','ec-sale-end','datetime-local',true,'')}</section>

<section class="ec-section"><h3>購入制限</h3>${field('1ユーザーあたり購入上限','ec-purchase-limit','number',true,'','<div class="ec-help">販売可能枚数の最大値が上限です</div>')}</section>

<section class="ec-section"><h3>チケット</h3><div id="ecTickets">${ticketCard(1)}</div><button type="button" class="btn btn-soft ec-add" onclick="addEventTicketType()">＋ チケット種別を追加</button></section>

<section class="ec-section"><h3>販売設定</h3><div class="ec-field"><label>販売方法<span class="ec-required"> *</span></label><div class="ec-radio-list"><label class="ec-radio"><input type="radio" name="ec-sale-method" value="先着販売" checked><span><b>先着販売</b><span>在庫がある限り購入できます。</span></span></label><label class="ec-radio"><input type="radio" name="ec-sale-method" value="抽選販売"><span><b>抽選販売</b><span>申込期間終了後に抽選を実施します。</span></span></label></div></div></section>

<section class="ec-section"><h3>リセール設定</h3><label class="ec-inline-check"><input id="ec-resale-enabled" type="checkbox" onchange="toggleEventResaleFee()">リセールを許可する</label><div id="ecResaleFeeWrap" class="ec-disabled">${field('リセール手数料率（%）','ec-resale-fee','number',false,'','<div class="ec-help">0〜100の範囲で設定してください</div>')}</div></section>

<section class="ec-section"><h3>支払い設定</h3><div class="ec-field"><label>支払い方法<span class="ec-required"> *</span></label><div class="ec-radio-list"><label class="ec-radio"><input type="radio" name="ec-payment" value="stripe" checked><span><b>Stripe（クレジットカード）</b></span></label></div></div></section>

<div class="ec-footer"><button type="button" class="btn btn-soft" onclick="go('/admin/events')">キャンセル</button><button type="submit" class="btn btn-primary">イベントを作成</button></div>
</form></div></main></div></div>`;
  }

  window.addEventPerformer=function(){
    performerSeq++;
    document.querySelector('#ecPerformers')?.insertAdjacentHTML('beforeend',performerCard(performerSeq));
    renumberEventCreate();
  };
  window.addEventTicketType=function(){
    ticketSeq++;
    document.querySelector('#ecTickets')?.insertAdjacentHTML('beforeend',ticketCard(ticketSeq));
    renumberEventCreate();
  };
  window.renumberEventCreate=function(){
    document.querySelectorAll('.ec-performer').forEach((el,i)=>{ const b=el.querySelector('.ec-repeat-head b'); if(b)b.textContent=`出演者 #${i+1}`; });
    document.querySelectorAll('.ec-ticket').forEach((el,i)=>{ const b=el.querySelector('.ec-repeat-head b'); if(b)b.textContent=`チケット種別 #${i+1}`; });
  };
  window.toggleEventResaleFee=function(){
    const enabled=document.querySelector('#ec-resale-enabled')?.checked;
    const wrap=document.querySelector('#ecResaleFeeWrap');
    const input=document.querySelector('#ec-resale-fee');
    if(wrap) wrap.classList.toggle('ec-disabled',!enabled);
    if(input){ input.disabled=!enabled; if(enabled && !input.value) input.value='10'; }
  };
  window.openCreateEvent=function(){ go('/admin/events/new'); };

  function value(id){ return (document.querySelector('#'+id)?.value||'').trim(); }
  function localDateTimeParts(v){
    if(!v) return {date:'',time:''};
    const [date,time='']=v.split('T');
    return {date,time:time.slice(0,5)};
  }
  function slugify(s){ return (s||'event').toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]+/g,'-').replace(/^-|-$/g,'')+'-'+Date.now().toString(36); }

  window.submitEventCreate=function(ev){
    ev.preventDefault();
    const form=ev.currentTarget;
    if(!form.reportValidity()) return;

    const saleStart=value('ec-sale-start'), saleEnd=value('ec-sale-end'), open=value('ec-open'), start=value('ec-start'), end=value('ec-end');
    if(new Date(start)<new Date(open)){ toast('開演日時は開場日時以降に設定してください'); return; }
    if(end && new Date(end)<new Date(start)){ toast('終演予定日時は開演日時以降に設定してください'); return; }
    if(new Date(saleEnd)<=new Date(saleStart)){ toast('販売終了日時は販売開始日時より後に設定してください'); return; }

    const performerEls=[...document.querySelectorAll('.ec-performer')];
    const performers=performerEls.map(el=>({
      name:(el.querySelector('input[type="text"]')?.value||'').trim(),
      target:!!el.querySelector('.ec-target-performer')?.checked,
      imageName:el.querySelector('input[type="file"]')?.files?.[0]?.name||''
    }));
    if(performers.some(x=>!x.name)){ toast('出演者名を入力してください'); return; }

    const ticketEls=[...document.querySelectorAll('.ec-ticket')];
    const ticketTypes=ticketEls.map(el=>{
      const inputs=el.querySelectorAll('input');
      return {name:(inputs[0]?.value||'').trim(),price:Number(inputs[1]?.value||0),stock:Number(inputs[2]?.value||0)};
    });
    if(ticketTypes.some(x=>!x.name||x.price<0||x.stock<=0)){ toast('チケット情報を正しく入力してください'); return; }

    const purchaseLimit=Number(value('ec-purchase-limit'));
    const maxStock=Math.max(...ticketTypes.map(x=>x.stock));
    if(purchaseLimit<1 || purchaseLimit>maxStock){ toast('購入上限は1以上、販売可能枚数以下に設定してください'); return; }

    const resaleEnabled=!!document.querySelector('#ec-resale-enabled')?.checked;
    const resaleFee=resaleEnabled?Number(value('ec-resale-fee')||10):0;
    if(resaleEnabled && (resaleFee<0||resaleFee>100)){ toast('リセール手数料率は0〜100で設定してください'); return; }

    const p=localDateTimeParts(start);
    const id=slugify(value('ec-name'));
    const newEvent={
      id,
      title:value('ec-name'),
      status:'upcoming',statusLabel:'販売前',badgeClass:'chip-blue',
      date:p.date,displayDate:p.date,open:localDateTimeParts(open).time,start:p.time,
      venue:value('ec-venue'),area:value('ec-address'),priceFrom:Math.min(...ticketTypes.map(x=>x.price)),
      description:value('ec-summary'),performers:performers.map(x=>x.name),
      organizer:{name:value('ec-organizer'),manager:value('ec-organizer'),x:value('ec-organizer-contact'),email:value('ec-organizer-contact'),note:value('ec-organizer-contact')||'主催者連絡先は未登録です。'},
      ticketTypes:ticketTypes.map(x=>({name:x.name,price:x.price,stock:`残り${x.stock}枚`,note:'',status:'販売前'})),
      originalForm:{
        organizerContact:value('ec-organizer-contact'),venueAddress:value('ec-address'),openAt:open,startAt:start,endAt:end,
        saleStartAt:saleStart,saleEndAt:saleEnd,purchaseLimit,
        performers,tickets:ticketTypes,saleMethod:document.querySelector('input[name="ec-sale-method"]:checked')?.value||'先着販売',
        resaleEnabled,resaleFee,paymentMethod:'Stripe（クレジットカード）'
      }
    };
    events.unshift(newEvent);
    state.selectedEventId=id;
    toast('イベントを作成しました');
    go('/admin/events/'+id);
  };

  const baseRouter=window.liveGateRenderV3 || window.liveGateRender || window.render || render;
  if(window.liveGateRenderV3){
    window.removeEventListener('hashchange',window.liveGateRenderV3);
    window.removeEventListener('load',window.liveGateRenderV3);
  }
  function eventCreateRouter(){
    const path=route().split('?')[0];
    if(path==='/admin/events/new'){
      document.querySelector('#app').innerHTML=eventCreatePage();
      window.scrollTo(0,0);
      setTimeout(toggleEventResaleFee,0);
      return;
    }
    baseRouter();
  }
  render=eventCreateRouter;
  window.render=eventCreateRouter;
  window.liveGateRenderEventCreate=eventCreateRouter;
  window.addEventListener('hashchange',eventCreateRouter);
  window.addEventListener('load',eventCreateRouter);
  document.documentElement.dataset.eventCreate='original-parity-v1';
})();
