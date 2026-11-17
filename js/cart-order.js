// Rum cake cart order form. One-day event rental, 50% booking deposit through Square.
// Bookings are created by the existing Events backend (/rentals/api/square?resource=g-events-booking),
// so reservations, the accepted contract and every payment appear in the client portal automatically.
(function(){
'use strict';

// Browser-visible identifiers by design: the same values the /rentals checkout ships in its bundle.
const CONFIG={
  squareApplicationId:'sq0idp-Gcdk075dVK6KiWrqZFTOGA',
  squareLocationId:'LAJ0T04RDKRS7',
  squareScript:'https://web.squarecdn.com/v1/square.js',
  supabaseUrl:'https://rsexseihtkaqoxccrylk.supabase.co',
  supabaseAnonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzZXhzZWlodGthcW94Y2NyeWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MDM5ODksImV4cCI6MjEwMzI3OTk4OX0.3DWloZJAzylJGJ7wifQA1_GXK39UKEvwXqGqd3Ep8Zk',
  bookingEndpoint:'/rentals/api/square?resource=g-events-booking',
  catalogEndpoint:'/api/events-catalog',
  agreementVersion:'asg-events-terms-2026-10-08',
  cartItemId:600,
};
const P=window.GEventsPricing;
const $=id=>document.getElementById(id);
const money=cents=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
const form=$('co-form');
if(!form||!P)return;

const state={customSplit:false,cartCents:P.G_CART_BASE_CENTS,bookable:true,availability:null,availabilityDate:'',reviewed:false,cardReady:false,busy:false,contractLoaded:false};
let tokenizeCard=null;

// ── Dates ──────────────────────────────────────────────────────────────
const pad=n=>String(n).padStart(2,'0');
const localIso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayIso=()=>localIso(new Date());
function shiftIso(iso,days){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
const validIso=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&!Number.isNaN(new Date(v+'T12:00:00Z').getTime());
const longDate=iso=>new Intl.DateTimeFormat('en-CA',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
// The inventory hold starts the day before the event at 9:00 a.m. That is the delivery window the
// contract refers to: the balance is due 7 days before it and the security deposit 48 hours before it.
function dueDates(eventIso){return {balance:shiftIso(eventIso,-8),security:shiftIso(eventIso,-3)};}

// ── Quote ──────────────────────────────────────────────────────────────
function selectedTreats(){return [...document.querySelectorAll('#co-treats input[type=checkbox]:checked')].map(el=>el.value);}
function readPackage(){
  const kind=form.elements.kind.value;
  if(kind==='cart')return null;
  const treats=selectedTreats();
  const config={kind,guests:Number($('co-guests').value),hours:kind==='staffed'?Number(form.elements.hours.value):0,treats};
  // Quantities are only sent once the customer has changed the suggested split.
  if(state.customSplit){config.quantities={};for(const id of treats){const raw=qtyInput(id).value.trim();config.quantities[id]=/^\d+$/.test(raw)?Number(raw):NaN;}}
  if(treats.includes('cookie')){const finish=form.elements.cookieFinish.value;config.cookie=finish==='chocolate'?{finish}:{finish,color:$('co-cookie-color').value.replace(/\s+/g,' ').trim()};}
  return config;
}
function quote(){
  const config=readPackage();
  let pkg=null,packageError='',colourError='';
  if(config){
    try{pkg=P.calculateGPackage(config);}
    catch(e){
      if(/icing colour/.test(e.message)){
        // The colour does not change the price, so keep showing the total while it is still to be entered.
        colourError=e.message;
        try{pkg=P.calculateGPackage({...config,cookie:{finish:'icing',color:'your colour'}});}catch(e2){packageError=e2.message;}
      }else packageError=e.message;
    }
  }
  const zone=P.gEventDeliveryZone($('co-postal').value);
  const total=state.cartCents+(pkg?pkg.addonsCents:0)+(zone?zone.feeCents:0);
  const deposit=P.estimateBookingDepositCents(total);
  return {config,pkg,packageError,colourError,zone,total,deposit,balance:Math.max(0,total-deposit),security:P.estimateSecurityDepositCents(total)};
}
function scheduleRows(q,eventIso,paid){
  const due=validIso(eventIso)?dueDates(eventIso):null;
  const when=(iso,rule)=>!due?rule:iso<=todayIso()?'Due right away because your event is close':`Due ${longDate(iso)}`;
  return [
    {label:'Booking deposit (50%)',note:paid?'Paid today':'Charged today to reserve your date',cents:q.deposit,now:true},
    {label:'Remaining balance',note:when(due&&due.balance,'Due 7 days before your delivery window'),cents:q.balance},
    {label:'Refundable security deposit',note:q.security?when(due&&due.security,'Due 48 hours before your delivery window'):'Not required for this booking',cents:q.security},
  ];
}
function render(){
  const q=quote();
  const lines=[['A Slice of G Rum Cake Cart','One-day rental, up to 8 event hours',state.cartCents]];
  if(q.pkg){
    for(const l of q.pkg.lines)lines.push([l.name,`${l.quantity} × ${money(l.unitCents)}`,l.totalCents]);
    if(q.pkg.staffCents)lines.push(['Staffed dessert service',`${q.pkg.attendants} ${q.pkg.attendants===1?'attendant':'attendants'} × ${q.pkg.hours} hours`,q.pkg.staffCents]);
  }
  lines.push(['Delivery, setup & collection',q.zone?q.zone.feeCents?'Extended GTA area':'Standard service area':'Enter your postal code',q.zone?q.zone.feeCents:null]);
  const box=$('co-summary-lines');box.textContent='';
  for(const [name,note,cents] of lines){
    const row=document.createElement('div');row.className='co-summary-line';
    const left=document.createElement('span');left.textContent=name;
    const small=document.createElement('small');small.textContent=note;left.appendChild(small);
    const right=document.createElement('strong');right.textContent=cents==null?'':cents===0?'Included':money(cents);
    row.append(left,right);box.appendChild(row);
  }
  $('co-total').textContent=money(q.total);
  $('co-due-today').textContent=money(q.deposit);
  $('co-sum-balance').textContent=money(q.balance);
  $('co-sum-security').textContent=q.security?money(q.security):'Not required';
  const rows=scheduleRows(q,$('co-date').value,false);
  $('co-sched-deposit').textContent=money(rows[0].cents);
  $('co-sched-balance').textContent=money(rows[1].cents);$('co-sched-balance-when').textContent=rows[1].note;
  $('co-sched-security').textContent=q.security?money(rows[2].cents):'$0.00';$('co-sched-security-when').textContent=rows[2].note;
  $('co-price-cart').textContent=money(state.cartCents);
  if(q.config)updateTreatRows(q);
  const err=$('co-package-error');err.hidden=!q.packageError;err.textContent=q.packageError;
  if(!state.busy)$('co-pay').textContent=`Pay ${money(q.deposit)} booking deposit`;
  return q;
}

// ── Setup choices ──────────────────────────────────────────────────────
const qtyInput=id=>$(`co-qty-${id}`);
function buildTreats(){
  const box=$('co-treats');
  for(const treat of P.G_TREATS){
    const row=document.createElement('div');row.className='co-treat';row.dataset.treatRow=treat.id;
    const label=document.createElement('label');label.className='co-inline';
    const input=document.createElement('input');input.type='checkbox';input.name='treats';input.value=treat.id;input.checked=treat.id==='slice';
    const name=document.createElement('span');name.textContent=treat.name;
    if(treat.id==='cookie'){const note=document.createElement('small');note.textContent='Brown butter cookies with a hint of rum, finished with rum kissed icing or dipped in chocolate';name.appendChild(note);}
    label.append(input,name);
    const qty=document.createElement('div');qty.className='co-treat-qty';
    const qtyLabel=document.createElement('label');qtyLabel.htmlFor=`co-qty-${treat.id}`;qtyLabel.textContent='Quantity';
    const sr=document.createElement('span');sr.className='co-sr';sr.textContent=` of ${treat.name}`;qtyLabel.appendChild(sr);
    const number=document.createElement('input');number.type='number';number.id=`co-qty-${treat.id}`;number.min='1';number.step='1';number.inputMode='numeric';number.dataset.qty=treat.id;
    qty.append(qtyLabel,number);
    const line=document.createElement('p');line.className='co-treat-line';line.dataset.treatLine=treat.id;
    row.append(label,qty,line);box.appendChild(row);
  }
}
// Puts the suggested split back into the quantity boxes (after a treat or total change, or on request).
function applySuggestedSplit(){
  state.customSplit=false;
  const treats=selectedTreats();const split=treats.length?P.defaultGSplit(treats,Number($('co-guests').value)):{};
  for(const treat of P.G_TREATS){const input=qtyInput(treat.id);input.value=split[treat.id]!=null?String(split[treat.id]):'';}
}
function onQuantityInput(event){
  const id=event.target.dataset.qty;if(!id)return;
  state.customSplit=true;
  const treats=selectedTreats();const guests=Number($('co-guests').value);
  // With exactly two treats the other one follows automatically, so the total always holds.
  if(treats.length===2){
    const other=treats.find(t=>t!==id);const value=Number(event.target.value);
    if(Number.isInteger(value)&&value>=1&&value<=guests-1)qtyInput(other).value=String(guests-value);
  }
  render();
}
function updateTreatRows(q){
  const treats=selectedTreats();const guests=Number($('co-guests').value);const tier=guests===50?0:guests<=200?1:2;
  const cookie=q.config&&q.config.cookie;
  let allocated=0;
  for(const treat of P.G_TREATS){
    const on=treats.includes(treat.id);const row=document.querySelector(`[data-treat-row="${treat.id}"]`);
    row.classList.toggle('is-off',!on);
    const input=qtyInput(treat.id);input.max=String(guests);
    // A single treat always takes the whole order, so there is nothing to adjust.
    input.readOnly=treats.length===1;
    const quantity=/^\d+$/.test(input.value.trim())?Number(input.value):0;
    if(on)allocated+=quantity;
    const unit=P.gTreatUnitCents(treat,tier,quantity,cookie);
    let text=on?`${quantity} × ${money(unit)} = ${money(quantity*unit)}`:`${money(P.gTreatUnitCents(treat,tier,0,null))} each`;
    if(treat.id==='cookie'&&!on)text+=`, or ${money(P.G_COOKIE.volumeCents)} each when you order more than ${P.G_COOKIE.volumeOver}`;
    else if(treat.id==='cookie')text+=quantity>P.G_COOKIE.volumeOver?` · volume price for more than ${P.G_COOKIE.volumeOver} cookies`:` · ${money(P.G_COOKIE.volumeCents+(cookie&&cookie.finish==='chocolate'?P.G_COOKIE.chocolateDipCents:0))} each when you order more than ${P.G_COOKIE.volumeOver}`;
    document.querySelector(`[data-treat-line="${treat.id}"]`).textContent=text;
  }
  const status=$('co-split-status');const difference=guests-allocated;
  if(!treats.length)setStatus(status,'Choose at least one treat.','bad');
  else if(difference===0)setStatus(status,`${allocated} of ${guests} treats allocated.`,'ok');
  else if(difference>0)setStatus(status,`${allocated} of ${guests} treats allocated. Add ${difference} more.`,'bad');
  else setStatus(status,`${allocated} of ${guests} treats allocated. Remove ${-difference}.`,'bad');
  $('co-split-reset').hidden=!state.customSplit;
  const hasCookie=treats.includes('cookie');
  $('co-cookie').hidden=!hasCookie;
  $('co-cookie-color-wrap').hidden=form.elements.cookieFinish.value==='chocolate';
  $('co-cookie-upgrade').textContent=`Adds ${money(P.G_COOKIE.chocolateDipCents)} per cookie.`;
}
function syncKind(){
  const kind=form.elements.kind.value;
  $('co-package').hidden=kind==='cart';
  $('co-hours-wrap').hidden=kind!=='staffed';
  render();
}

// ── Availability ───────────────────────────────────────────────────────
let availabilityRun=0;
function setStatus(el,text,stateName){el.textContent=text;if(stateName)el.dataset.state=stateName;else delete el.dataset.state;}
async function checkAvailability(){
  const date=$('co-date').value;const status=$('co-date-status');const run=++availabilityRun;
  state.availability=null;state.availabilityDate=date;
  if(!validIso(date)){setStatus(status,'Choose your date to check availability.');return;}
  if(date<$('co-date').min){setStatus(status,'Choose a future event date.','bad');state.availability=false;return;}
  if(!state.bookable){setStatus(status,'The cart is temporarily unavailable for online booking. Please email order@asliceofg.com.','bad');state.availability=false;return;}
  setStatus(status,'Checking availability…');
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/get_reservation_item_availability`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:CONFIG.supabaseAnonKey,Authorization:`Bearer ${CONFIG.supabaseAnonKey}`},
      body:JSON.stringify({p_item_id:CONFIG.cartItemId,p_pickup:shiftIso(date,-1),p_dropoff:shiftIso(date,1)}),
    });
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const available=Number(await response.json());
    if(run!==availabilityRun)return;
    state.availability=available>=1;
    queueMicrotask(refreshProblems);
    setStatus(status,state.availability?`The cart is available on ${longDate(date)}.`:`The cart is already reserved around ${longDate(date)}. Please choose another date.`,state.availability?'ok':'bad');
  }catch(e){
    if(run!==availabilityRun)return;
    // Unknown is not the same as unavailable. The server checks again before any charge.
    state.availability='unknown';
    setStatus(status,'We could not check availability just now. You can continue: it is confirmed again before any payment is taken.');
  }
}
function updatePostal(){
  const value=$('co-postal').value.trim();const status=$('co-postal-status');
  const zone=P.gEventDeliveryZone(value);
  if(!value)setStatus(status,'Enter the venue postal code to confirm delivery.');
  else if(zone)setStatus(status,zone.feeCents?`Extended GTA delivery, setup and collection: ${money(zone.feeCents)} per booking.`:'Delivery, setup and collection are included at no extra charge.','ok');
  else if(value.replace(/\s/g,'').length>=6)setStatus(status,'This postal code is outside our online booking area. Email order@asliceofg.com and we will see what we can arrange.','bad');
  else setStatus(status,'Keep typing your full postal code, for example M5V 2T6.');
  render();
}

// ── Contract ───────────────────────────────────────────────────────────
const dialog=$('co-contract-dialog');
async function loadContract(){
  if(state.contractLoaded)return;
  const body=$('co-contract-body');
  try{
    const response=await fetch('/terms.html',{headers:{Accept:'text/html'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const source=doc.querySelector('main')||doc.querySelector('.policy-wrap')||doc.body;
    source.querySelectorAll('script,style,link,iframe,object,embed,form,nav').forEach(el=>el.remove());
    source.querySelectorAll('*').forEach(el=>{
      for(const attr of [...el.attributes]){
        const name=attr.name.toLowerCase();
        if(name.startsWith('on')||name==='style'||name==='class'||name==='id')el.removeAttribute(attr.name);
        else if((name==='href'||name==='src')&&/^\s*javascript:/i.test(attr.value))el.removeAttribute(attr.name);
      }
      if(el.tagName==='A'){
        const href=el.getAttribute('href')||'';
        if(href.startsWith('#'))el.replaceWith(...el.childNodes,document.createTextNode(' '));
        else{el.target='_blank';el.rel='noopener';}
      }
    });
    if((source.textContent||'').trim().length<500)throw new Error('Contract text incomplete');
    body.replaceChildren(...source.childNodes);
    state.contractLoaded=true;
  }catch(e){
    body.innerHTML='<p><strong>We could not display the contract here.</strong> Please open the full <a href="/terms.html" target="_blank" rel="noopener">Terms &amp; Conditions</a> and <a href="/accessibility.html" target="_blank" rel="noopener">Accessibility &amp; Inclusion</a> pages in a new tab, read them, then return to confirm.</p>';
  }
}
function openContract(){
  loadContract();
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  $('co-contract-body').scrollTop=0;
}
function closeContract(){if(dialog.open)dialog.close();$('co-open-contract').focus();}
function markReviewed(){
  state.reviewed=true;
  const accept=$('co-accept');accept.disabled=false;
  $('co-accept-hint').textContent='Thank you. Tick the box to accept the contract.';
  $('co-open-contract').textContent='Review contract again';
  if(dialog.open)dialog.close();
  accept.focus();
  refreshProblems();
}

// ── Square card ────────────────────────────────────────────────────────
function loadSquare(){
  if(window.Square)return Promise.resolve(window.Square);
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=CONFIG.squareScript;script.async=true;
    script.onload=()=>window.Square?resolve(window.Square):reject(new Error('Could not load secure card entry.'));
    script.onerror=()=>reject(new Error('Could not load secure card entry.'));
    document.head.appendChild(script);
  });
}
function splitName(name){const parts=String(name||'').trim().split(/\s+/).filter(Boolean);return {givenName:parts[0]||'',familyName:parts.slice(1).join(' ')};}
async function setupCard(){
  const status=$('co-card-status');
  try{
    const Square=await loadSquare();
    const payments=Square.payments(CONFIG.squareApplicationId,CONFIG.squareLocationId);
    const card=await payments.card();
    await card.attach('#co-card');
    tokenizeCard=async({amountCents,saveCard,name,email,phone})=>{
      const {givenName,familyName}=splitName(name);
      const result=await card.tokenize({
        amount:(amountCents/100).toFixed(2),currencyCode:'CAD',
        intent:saveCard?'CHARGE_AND_STORE':'CHARGE',customerInitiated:true,sellerKeyedIn:false,
        billingContact:{givenName,familyName,email:email||undefined,phone:phone||undefined,countryCode:'CA'},
      });
      if(result.status!=='OK'||!result.token)throw new Error((result.errors||[]).map(e=>e.message).filter(Boolean).join(' ')||'Card details could not be verified.');
      return result.token;
    };
    state.cardReady=true;setStatus(status,'');status.hidden=true;
  }catch(e){
    state.cardReady=false;
    setStatus(status,`${e.message||'Could not load secure card entry.'} Please refresh the page or email order@asliceofg.com.`,'bad');
  }
}

// ── Validation and submit ──────────────────────────────────────────────
function fieldError(inputId,errorId,message){
  const input=$(inputId);const error=errorId&&$(errorId);
  if(message){input.setAttribute('aria-invalid','true');if(error){error.textContent=message;error.hidden=false;}}
  else{input.removeAttribute('aria-invalid');if(error){error.hidden=true;error.textContent='';}}
}
function validate(q){
  const problems=[];const add=(message,focusId)=>problems.push({message,focusId});
  const v=id=>$(id).value.trim();
  if(q.packageError)add(q.packageError,/quantit/.test(q.packageError)?`co-qty-${(q.config.treats||[])[0]}`:'co-guests');
  fieldError('co-cookie-color','co-cookie-color-error',q.colourError);
  if(q.colourError)add(q.colourError,'co-cookie-color');
  const date=v('co-date');
  if(!validIso(date)||date<$('co-date').min){add('Choose a future event date.','co-date');$('co-date').setAttribute('aria-invalid','true');}
  else if(state.availability===false&&state.availabilityDate===date){add('The cart is not available on that date. Choose another date.','co-date');$('co-date').setAttribute('aria-invalid','true');}
  else if(state.availability===null){add('Please wait a moment while we check availability for your date.','co-date');}
  else $('co-date').removeAttribute('aria-invalid');
  const address=v('co-address');
  const addressMessage=address.length<10?'Enter the complete event delivery address.':'';
  fieldError('co-address','co-address-error',addressMessage);if(addressMessage)add(addressMessage,'co-address');
  if(!q.zone){add('Enter an eligible Toronto or GTA postal code.','co-postal');$('co-postal').setAttribute('aria-invalid','true');}else $('co-postal').removeAttribute('aria-invalid');
  const nameMessage=v('co-name')?'':'Enter your full name.';
  fieldError('co-name','co-name-error',nameMessage);if(nameMessage)add(nameMessage,'co-name');
  const emailMessage=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('co-email'))?'':'Enter a valid email address.';
  fieldError('co-email','co-email-error',emailMessage);if(emailMessage)add(emailMessage,'co-email');
  if(!state.reviewed)add('Open and review the contract.','co-open-contract');
  else if(!$('co-accept').checked)add('Tick the box to accept the contract.','co-accept');
  if(!state.cardReady||!tokenizeCard)add('Secure card entry is not ready yet.','co-card');
  return problems;
}
function showProblems(problems,moveFocus=true){
  const list=$('co-missing');list.textContent='';list.hidden=!problems.length;
  for(const p of problems){const li=document.createElement('li');li.textContent=p.message;list.appendChild(li);}
  if(problems.length&&moveFocus){
    list.setAttribute('role','alert');
    const target=$(problems[0].focusId);
    if(target){target.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});if(typeof target.focus==='function')target.focus({preventScroll:true});}
  }
}
function setBusy(busy,q){
  state.busy=busy;const button=$('co-pay');
  button.setAttribute('aria-disabled',busy?'true':'false');
  button.textContent=busy?'Processing your deposit…':`Pay ${money(q.deposit)} booking deposit`;
}
function showFormError(message){const el=$('co-form-error');el.textContent=message;el.hidden=!message;}

async function submit(event){
  event.preventDefault();
  if(state.busy)return;
  const q=render();
  showFormError('');
  const problems=validate(q);
  showProblems(problems);
  if(problems.length)return;
  const v=id=>$(id).value.trim();
  const date=v('co-date');
  const saveCard=form.elements.future.value==='card';
  const customer={name:v('co-name'),email:v('co-email'),phone:v('co-phone')||null};
  setBusy(true,q);
  let sent=false;
  try{
    const paymentToken=await tokenizeCard({amountCents:q.deposit,saveCard,name:customer.name,email:customer.email,phone:customer.phone});
    sent=true;
    const response=await fetch(CONFIG.bookingEndpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        customer,
        rentalDates:{event:date,pickup:shiftIso(date,-1),dropoff:shiftIso(date,1),pickupTime:'09:00',dropoffTime:'21:00',earlyPickupDays:0,extendedReturnDays:0,extraDayFeeCents:0},
        items:[{id:CONFIG.cartItemId,kind:'rental',meta:null,quantity:1}],
        gEvents:{venueName:v('co-venue'),venueAddress:v('co-address'),postalCode:v('co-postal').toUpperCase(),agreementAccepted:true,agreementReviewed:true,agreementVersion:CONFIG.agreementVersion,package:q.config},
        paymentToken,saveCardOnFile:saveCard,manualPaymentAcknowledged:!saveCard,
      }),
    });
    let result=null;try{result=await response.json();}catch{}
    if(!response.ok)throw Object.assign(new Error((result&&result.error)||'Could not complete the reservation.'),{fromServer:true});
    if(!result||!result.bookingNumber)throw new Error('unconfirmed');
    showConfirmation(q,date,customer,result,saveCard);
  }catch(e){
    setBusy(false,q);
    if(sent&&!e.fromServer){
      // The request left the browser but no clear answer came back, so a charge may have gone through.
      showFormError('We could not confirm whether your booking went through. Please do not pay again yet. Check your email and your client portal, or contact order@asliceofg.com and we will confirm right away.');
    }else showFormError(`${e.message||'Unable to complete your booking.'} If this keeps happening, email order@asliceofg.com.`);
    $('co-form-error').scrollIntoView({block:'center'});
  }
}

function showConfirmation(q,date,customer,result,saveCard){
  try{
    sessionStorage.setItem('asliceofg-pending-booking-number',result.bookingNumber);
    const key='asliceofg-cart-items-v2';const rows=JSON.parse(localStorage.getItem(key)||'[]');
    if(Array.isArray(rows))localStorage.setItem(key,JSON.stringify(rows.filter(r=>!(r&&r.kind==='rental'&&Number(r.id)===CONFIG.cartItemId))));
    localStorage.removeItem('asliceofg-g-events-package-v1');
  }catch{}
  $('co-booking').hidden=true;
  document.querySelector('.co-hero').hidden=true;
  $('co-confirm-number').textContent=result.bookingNumber;
  $('co-confirm-email').textContent=customer.email;
  const cardSaved=saveCard&&!result.cardSaveWarning;
  $('co-confirm-intro').textContent=`Thank you, ${splitName(customer.name).givenName}. Your ${money(q.deposit)} booking deposit is paid and the cart is reserved for ${longDate(date)}. ${cardSaved?'Your card is on file, so the remaining amounts below are charged automatically on their due dates.':'Please pay the remaining amounts below in your client portal before their due dates.'}`;
  const warning=$('co-confirm-card-warning');
  warning.hidden=!result.cardSaveWarning;warning.textContent=result.cardSaveWarning||'';
  const schedule=$('co-confirm-schedule');schedule.textContent='';
  for(const row of scheduleRows(q,date,true)){
    const el=document.createElement('div');el.className='co-schedule-row'+(row.now?' co-schedule-now':'');
    const left=document.createElement('div');const title=document.createElement('strong');title.textContent=row.label;const note=document.createElement('span');note.textContent=row.note;left.append(title,note);
    const amount=document.createElement('strong');amount.textContent=money(row.cents);
    el.append(left,amount);schedule.appendChild(el);
  }
  const section=$('co-confirmation');section.hidden=false;
  window.scrollTo(0,0);section.focus();
}

// ── Start ──────────────────────────────────────────────────────────────
async function loadCatalog(){
  try{
    const response=await fetch(CONFIG.catalogEndpoint,{cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json();
    const cart=(data.products||[]).find(p=>Number(p.rentalId)===CONFIG.cartItemId);
    if(!cart)return;
    if(Number.isInteger(cart.priceCents)&&cart.priceCents>0)state.cartCents=cart.priceCents;
    state.bookable=cart.bookable!==false;
    render();
    if(!state.bookable||$('co-date').value)checkAvailability();
  }catch{}
}
function prefill(){
  const dateInput=$('co-date');dateInput.min=shiftIso(todayIso(),1);
  let date=new URLSearchParams(location.search).get('date')||'';
  try{
    if(!date)date=(JSON.parse(localStorage.getItem('asliceofg-rental-dates-v2')||'{}')||{}).event||'';
    const saved=JSON.parse(localStorage.getItem('asliceofg-g-events-package-v1')||'null');
    if(saved&&['treats','staffed'].includes(saved.kind)){
      P.calculateGPackage(saved);
      form.elements.kind.value=saved.kind;$('co-guests').value=String(saved.guests);
      if(saved.kind==='staffed')form.elements.hours.value=String(saved.hours);
      document.querySelectorAll('#co-treats input[type=checkbox]').forEach(el=>{el.checked=saved.treats.includes(el.value);});
    }
  }catch{}
  if(validIso(date)&&date>=dateInput.min)dateInput.value=date;
}

buildTreats();
prefill();
applySuggestedSplit();
syncKind();
form.addEventListener('submit',submit);
// Once a submit attempt has listed problems, keep that list and the field errors current as they are fixed.
function refreshProblems(){if(!$('co-missing').hidden&&!state.busy)showProblems(validate(render()),false);}
form.addEventListener('input',refreshProblems);
form.addEventListener('change',refreshProblems);
form.querySelectorAll('input[name=kind]').forEach(el=>el.addEventListener('change',syncKind));
$('co-guests').addEventListener('change',()=>{applySuggestedSplit();render();});
$('co-treats').addEventListener('change',event=>{if(event.target.type==='checkbox'){applySuggestedSplit();render();}});
$('co-treats').addEventListener('input',onQuantityInput);
$('co-split-reset').addEventListener('click',()=>{applySuggestedSplit();render();$('co-split-status').focus?.();});
form.querySelectorAll('input[name=cookieFinish]').forEach(el=>el.addEventListener('change',render));
$('co-cookie-color').addEventListener('input',render);
form.querySelectorAll('input[name=hours]').forEach(el=>el.addEventListener('change',render));
$('co-date').addEventListener('change',()=>{render();checkAvailability();});
$('co-postal').addEventListener('input',updatePostal);
$('co-open-contract').addEventListener('click',openContract);
$('co-contract-close').addEventListener('click',closeContract);
$('co-contract-reviewed').addEventListener('click',markReviewed);
dialog.addEventListener('click',e=>{if(e.target===dialog)closeContract();});
if($('co-date').value)checkAvailability();
loadCatalog();
setupCard();
})();
