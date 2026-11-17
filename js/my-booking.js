// Booking portal for rum cake cart rentals: accepted contract, invoice and upcoming payments.
// It signs in with the same Supabase account as the /rentals client portal (the session is shared
// because both live on asliceofg.com) and reads from the same Events APIs, so nothing is duplicated.
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.50.0/+esm';

// Browser-visible identifiers by design: the same values the /rentals app ships in its bundle.
const SUPABASE_URL='https://rsexseihtkaqoxccrylk.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzZXhzZWlodGthcW94Y2NyeWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MDM5ODksImV4cCI6MjEwMzI3OTk4OX0.3DWloZJAzylJGJ7wifQA1_GXK39UKEvwXqGqd3Ep8Zk';
const API='/rentals/api';
const FULL_PORTAL='/rentals/client';
const G_EVENTS_STYLE='g_events_delivery_setup_collection_included';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const money=cents=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(cents||0)/100);
const redirectTo=()=>`${location.origin}/my-booking`;

function el(tag,props={},...children){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(props)){
    if(value==null||value===false)continue;
    if(key==='class')node.className=value;else if(key==='text')node.textContent=value;
    else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);
    else node.setAttribute(key,value===true?'':value);
  }
  for(const child of children.flat())if(child!=null&&child!==false)node.append(child);
  return node;
}
// Date-only values (event dates) are formatted in UTC so they never shift a day.
// Timestamps (due dates, payments) are shown in Toronto time, where the business operates.
function dateLabel(value,{withYear=true}={}){
  if(!value)return '';
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value);
  const date=new Date(dateOnly?`${value}T12:00:00Z`:value);
  if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('en-CA',{weekday:'short',month:'long',day:'numeric',year:withYear?'numeric':undefined,timeZone:dateOnly?'UTC':'America/Toronto'}).format(date);
}
const pill=(text,tone)=>el('span',{class:'mb-pill','data-tone':tone,text});

// ── Booking maths ──────────────────────────────────────────────────────
function statusMeta(status){
  return ({checkout_pending:['Checkout pending','gold'],pending:['Reserved','green'],confirmed:['Confirmed','green'],payment_overdue:['Payment overdue','coral'],
    cancelled:['Cancelled','neutral'],completed:['Completed','neutral'],returned:['Completed','neutral']})[status]||[String(status||'Reserved').replace(/_/g,' '),'gold'];
}
// Mirrors the Events backend: balance is due 7 days, and the security deposit 48 hours, before the
// delivery window, which opens at 9:00 a.m. Toronto time the day before the event.
function dueDates(reservation,square){
  if(square?.balance_due_at&&square?.security_deposit_due_at)return {balance:square.balance_due_at,security:square.security_deposit_due_at};
  const anchorSource=square?.pickup_at||reservation.pickup_at||(reservation.pickup_date?`${reservation.pickup_date}T14:00:00Z`:null);
  const anchor=anchorSource?new Date(anchorSource):null;
  if(!anchor||Number.isNaN(anchor.getTime()))return {balance:null,security:null};
  return {balance:new Date(anchor.getTime()-7*864e5).toISOString(),security:new Date(anchor.getTime()-48*36e5).toISOString()};
}
function invoiceLines(reservation,items){
  const total=Number(reservation.rental_total_cents||0);
  const names=items.map(row=>`${row.item?.name||row.description||'Rental item'}${Number(row.quantity)>1?` × ${row.quantity}`:''}`);
  const base={label:names.join(', ')||'Event rental',note:'One-day rental with delivery, setup and collection'};
  const extras=[];
  const notes=String(reservation.notes||'');
  try{
    const match=notes.match(/Treat package: (\{.*\})\s*$/s);
    if(match){
      const pkg=JSON.parse(match[1]);
      for(const line of pkg.lines||[])extras.push({label:String(line.name),note:`${line.quantity} × ${money(line.unitCents)}`,cents:Number(line.totalCents)});
      if(Number(pkg.staffCents)>0)extras.push({label:'Staffed dessert service',note:`${pkg.attendants} ${pkg.attendants===1?'attendant':'attendants'} × ${pkg.hours} hours`,cents:Number(pkg.staffCents)});
    }
  }catch{extras.length=0;}
  const travel=Number((notes.match(/Travel charge: (\d+) cents/)||[])[1]||0);
  if(travel>0)extras.push({label:'Extended GTA delivery, setup & collection',note:'Once per booking',cents:travel});
  const extrasTotal=extras.reduce((sum,line)=>sum+line.cents,0);
  // The stored booking total is the source of truth. If the detail cannot be reconciled with it,
  // show one accurate line rather than an itemisation that does not add up.
  if(extras.some(line=>!Number.isFinite(line.cents)||line.cents<0)||extrasTotal>=total)return [{...base,cents:total}];
  return [{...base,cents:total-extrasTotal},...extras];
}
function paymentRows(reservation,square,transactions){
  const paid=kind=>transactions.filter(t=>t.kind===kind&&t.status==='paid');
  const paidSum=kind=>paid(kind).reduce((sum,t)=>sum+Number(t.amount_cents||0),0);
  const paidOn=kind=>paid(kind).map(t=>t.paid_at||t.created_at).filter(Boolean).sort().at(-1);
  const due=dueDates(reservation,square);
  const cardOnFile=(square?.future_payment_method||reservation.future_payment_method)==='card_on_file';
  const cancelled=reservation.status==='cancelled';
  const row=(kind,label,amount,dueAt,extra='')=>{
    const amountCents=Number(amount||0);
    if(amountCents<=0)return {kind,label,amountCents:0,when:'Not required for this booking',status:['Not required','neutral'],done:true};
    if(paidSum(kind)>=amountCents)return {kind,label,amountCents,when:`Paid ${dateLabel(paidOn(kind))}${extra}`,status:['Paid','green'],done:true};
    if(cancelled)return {kind,label,amountCents,when:'Booking cancelled',status:['Not charged','neutral'],done:true};
    const overdue=dueAt&&new Date(dueAt).getTime()<Date.now();
    const failed=square?.square_payment_failed;
    const how=cardOnFile&&!failed?'Charged automatically to your card on file':'Pay in your client portal before the due date';
    return {kind,label,amountCents,when:`${dueAt?`Due ${dateLabel(dueAt)}`:'Due date to be confirmed'} · ${how}`,
      status:failed?['Payment failed','coral']:overdue?['Overdue','coral']:cardOnFile?['Scheduled','gold']:['Upcoming','gold'],done:false};
  };
  const refunded=square?.square_security_refunded_at?` · Released ${dateLabel(square.square_security_refunded_at)}`:
    paidSum('security_deposit')>0?' · Held until collection and inspection':'';
  return [
    row('booking_deposit','Booking deposit (50%)',reservation.booking_deposit_cents,null),
    row('balance','Remaining balance',reservation.balance_due_cents,due.balance),
    row('security_deposit','Refundable security deposit',reservation.security_deposit_cents,due.security,refunded),
  ];
}

// ── Rendering ──────────────────────────────────────────────────────────
function paymentsSection(rows){
  const body=rows.map(r=>el('tr',{},el('td',{},r.label,el('small',{text:r.when})),el('td',{},pill(r.status[0],r.status[1])),el('td',{text:money(r.amountCents)})));
  const next=rows.find(r=>!r.done);
  return el('section',{'aria-label':'Payments'},
    el('h3',{text:'Upcoming payments'}),
    el('p',{class:'mb-meta',text:next?`Next: ${next.label.toLowerCase()} of ${money(next.amountCents)}. ${next.when}.`:'There is nothing left to pay on this booking.'}),
    el('table',{class:'mb-table'},el('thead',{},el('tr',{},el('th',{scope:'col',text:'Payment'}),el('th',{scope:'col',text:'Status'}),el('th',{scope:'col',text:'Amount'}))),el('tbody',{},body)));
}
function invoiceSection(reservation,items,rows,customer,card){
  const lines=invoiceLines(reservation,items);
  const total=Number(reservation.rental_total_cents||0);
  const paidTowardTotal=rows.filter(r=>r.kind!=='security_deposit'&&r.status[0]==='Paid').reduce((sum,r)=>sum+r.amountCents,0);
  const security=rows.find(r=>r.kind==='security_deposit');
  const print=()=>{
    document.body.classList.add('mb-printing-invoice');card.classList.add('mb-print-target');
    const done=()=>{document.body.classList.remove('mb-printing-invoice');card.classList.remove('mb-print-target');window.removeEventListener('afterprint',done);};
    window.addEventListener('afterprint',done);window.print();
  };
  return el('section',{'aria-label':'Invoice'},
    el('h3',{text:'Invoice'}),
    el('div',{class:'mb-invoice-head'},
      el('div',{},el('div',{class:'mb-invoice-brand',text:'A Slice of G'}),el('p',{text:'Toronto, Ontario · order@asliceofg.com'})),
      el('div',{},el('p',{},el('strong',{text:`Invoice ${reservation.booking_number||reservation.id}`})),
        el('p',{text:`Billed to ${customer.name||''} · ${customer.email||''}`}),
        el('p',{text:`Event ${dateLabel(reservation.event_date)}`}),
        reservation.venue_address&&el('p',{text:[reservation.venue_name,reservation.venue_address].filter(Boolean).join(', ')}))),
    el('table',{class:'mb-table'},
      el('thead',{},el('tr',{},el('th',{scope:'col',text:'Description'}),el('th',{scope:'col',text:'Amount'}))),
      el('tbody',{},lines.map(line=>el('tr',{},el('td',{},line.label,el('small',{text:line.note})),el('td',{text:money(line.cents)})))),
      el('tfoot',{},
        el('tr',{},el('td',{text:'Booking total'}),el('td',{text:money(total)})),
        el('tr',{},el('td',{text:'Payments received'}),el('td',{text:`− ${money(paidTowardTotal)}`})),
        el('tr',{},el('td',{text:'Balance outstanding'}),el('td',{text:money(Math.max(0,total-paidTowardTotal))})))),
    security&&security.amountCents>0&&el('p',{class:'co-hint',text:`A refundable security deposit of ${money(security.amountCents)} is collected separately and is not part of the booking total. ${security.when}.`}),
    el('p',{class:'co-hint',text:'Amounts are in Canadian dollars.'}),
    el('div',{class:'mb-actions'},el('button',{type:'button',class:'co-button-outline',onclick:print,text:'Print or save invoice'}),
      reservation.square_invoice_url&&el('a',{class:'co-button-outline',href:reservation.square_invoice_url,target:'_blank',rel:'noopener',text:'Open Square invoice'})));
}
function contractSection(reservation){
  const agreement=reservation.accepted_event_agreement;
  if(!agreement)return el('section',{'aria-label':'Contract'},el('h3',{text:'Contract'}),
    el('p',{},'Your booking follows the A Slice of G ',el('a',{href:'/terms.html',target:'_blank',rel:'noopener',text:'Event Rental Terms & Conditions'}),'. An archived copy was not found for this booking; email order@asliceofg.com if you need one.'));
  const holder=el('div',{hidden:true});
  const frame=(title,html)=>html&&el('iframe',{class:'mb-contract-frame',title,sandbox:'',srcdoc:html,loading:'lazy'});
  const toggle=el('button',{type:'button',class:'co-button-outline','aria-expanded':'false',text:'View my accepted contract',onclick:()=>{
    if(!holder.childElementCount)holder.append(...[frame('Your accepted Event Rental Terms & Conditions',agreement.terms_html),
      agreement.accessibility_html&&el('h3',{text:'Accessibility & Inclusion commitments'}),frame('Your accepted Accessibility & Inclusion commitments',agreement.accessibility_html)].filter(Boolean));
    holder.hidden=!holder.hidden;toggle.setAttribute('aria-expanded',String(!holder.hidden));
    toggle.textContent=holder.hidden?'View my accepted contract':'Hide contract';
  }});
  return el('section',{'aria-label':'Contract',class:'mb-no-print'},el('h3',{text:'Contract'}),
    el('p',{},pill('Accepted','green'),` Event Rental Terms & Conditions, accepted ${dateLabel(agreement.accepted_at)}.`),
    el('p',{class:'co-hint',text:`This is the exact version you agreed to at checkout (${agreement.agreement_version}${agreement.snapshot_sha256?`, record ${String(agreement.snapshot_sha256).slice(0,12)}`:''}).`}),
    el('div',{class:'mb-actions'},toggle),holder);
}
function bookingCard(reservation,items,square,transactions,customer){
  const [label,tone]=statusMeta(reservation.status);
  const rows=paymentRows(reservation,square,transactions);
  const card=el('article',{class:'mb-card','aria-label':`Booking ${reservation.booking_number||reservation.id}`});
  card.append(
    el('div',{class:'mb-topline'},
      el('div',{},pill(label,tone),el('p',{class:'mb-number',text:reservation.booking_number||`Booking ${reservation.id}`}),
        el('h2',{text:'Rum Cake Cart & Event Rentals'}),
        el('p',{class:'mb-meta',text:`Event ${dateLabel(reservation.event_date)} · Delivery, setup and collection included`}),
        (reservation.venue_name||reservation.venue_address)&&el('p',{class:'mb-meta',text:`Venue: ${[reservation.venue_name,reservation.venue_address].filter(Boolean).join(', ')}`})),
      el('div',{},el('p',{class:'mb-meta',text:'Booking total'}),el('p',{class:'mb-number',text:money(reservation.rental_total_cents)}))),
    paymentsSection(rows),
    rows.some(r=>!r.done)&&el('div',{class:'mb-actions'},el('a',{class:'co-button',href:FULL_PORTAL,text:'Pay or manage payments'})),
    invoiceSection(reservation,items,rows,customer,card),
    contractSection(reservation));
  return card;
}

// ── Data ───────────────────────────────────────────────────────────────
async function api(path,token){
  const response=await fetch(`${API}${path}`,{headers:{Authorization:`Bearer ${token}`}});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw Object.assign(new Error(data?.error||'Could not load your booking.'),{status:response.status});
  return data||{};
}
async function showBookings(session){
  $('mb-auth').hidden=true;$('mb-loading').hidden=false;$('mb-loading').textContent='Loading your booking…';
  $('mb-error').hidden=true;
  try{
    const portal=await api('/client-portal',session.access_token);
    // The Square status feed adds due dates and payment records. The page still works without it.
    const squareFeed=await api('/square?resource=portal',session.access_token).catch(()=>({reservations:[],transactions:[],unavailable:true}));
    const squareById=new Map((squareFeed.reservations||[]).map(r=>[r.id,r]));
    const all=portal.reservations||[];
    const events=all.filter(r=>r.service_style===G_EVENTS_STYLE);
    const list=$('mb-bookings');list.textContent='';
    for(const reservation of events){
      list.append(bookingCard(reservation,(portal.reservationItems||[]).filter(i=>i.reservation_id===reservation.id),squareById.get(reservation.id),
        (squareFeed.transactions||[]).filter(t=>t.reservation_id===reservation.id),portal.customer||{}));
    }
    $('mb-empty').hidden=events.length>0;
    $('mb-other').hidden=!(events.length&&(all.length>events.length||(portal.purchases||[]).length));
    $('mb-signed-in').textContent=`Signed in as ${portal.customer?.email||session.user?.email||''}`;
    if(squareFeed.unavailable&&events.length){$('mb-error').textContent='Live payment status is temporarily unavailable, so paid amounts may not show yet. Your booking is unaffected.';$('mb-error').hidden=false;}
    $('mb-content').hidden=false;
  }catch(error){
    if(error.status===401){pendingAuthMessage='Your sign-in has expired. Please sign in again.';await supabase.auth.signOut().catch(()=>{});handleSession(null);return;}
    $('mb-content').hidden=false;$('mb-bookings').textContent='';$('mb-empty').hidden=true;
    $('mb-error').textContent=`${error.message} Please refresh, or email order@asliceofg.com.`;$('mb-error').hidden=false;
  }finally{$('mb-loading').hidden=true;}
}

// ── Sign-in ────────────────────────────────────────────────────────────
let mode='password';
let shownFor=null;
let pendingAuthMessage='';
function showAuth(message=''){
  $('mb-loading').hidden=true;$('mb-content').hidden=true;$('mb-auth').hidden=false;
  authError(message);
}
function authError(message){const node=$('mb-auth-error');node.textContent=message;node.hidden=!message;}
function setMode(next){
  mode=next;
  document.querySelectorAll('.mb-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('mb-password-wrap').hidden=mode==='magic';
  $('mb-password').autocomplete=mode==='create'?'new-password':'current-password';
  $('mb-auth-submit').textContent=mode==='password'?'Sign in':mode==='create'?'Create my account':'Email my sign-in link';
  authError('');$('mb-auth-sent').hidden=true;
}
async function submitAuth(event){
  event.preventDefault();
  const email=$('mb-email').value.trim();const password=$('mb-password').value;const button=$('mb-auth-submit');
  authError('');$('mb-auth-sent').hidden=true;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return authError('Enter a valid email address.');
  if(mode!=='magic'&&password.length<8)return authError(mode==='create'?'Use at least 8 characters for your password.':'Enter your password.');
  button.disabled=true;
  try{
    let sent=false;
    if(mode==='password'){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
    else if(mode==='create'){const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectTo()}});if(error)throw error;sent=!data.session;}
    else{const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo(),shouldCreateUser:true}});if(error)throw error;sent=true;}
    if(sent){const note=$('mb-auth-sent');note.textContent=`Check your inbox. We sent a secure link to ${email}.`;note.hidden=false;}
  }catch(error){authError(error.message||'Could not sign in.');}
  finally{button.disabled=false;}
}

document.querySelectorAll('.mb-tabs button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('mb-auth-form').addEventListener('submit',submitAuth);
$('mb-google').addEventListener('click',async()=>{
  const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo()}});
  if(error)authError(error.message||'Could not continue with Google.');
});
$('mb-signout').addEventListener('click',async()=>{await supabase.auth.signOut();});

function handleSession(session){
  // Signing out fires an auth event of its own, so the reason is kept until the form is next shown.
  if(!session){shownFor=null;showAuth(pendingAuthMessage);return;}
  pendingAuthMessage='';
  if(shownFor===session.user?.id)return;
  shownFor=session.user?.id||'user';
  showBookings(session);
}
supabase.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleSession(session),0);});
supabase.auth.getSession().then(({data})=>handleSession(data.session)).catch(()=>showAuth());
