// The Events storefront uses Supabase rental IDs and the existing /rentals cart.
const STORAGE_KEY = 'asliceofg-cart-items-v2';
const DATE_KEY = 'asliceofg-rental-dates-v2';
const G_CONFIG_KEY='asliceofg-g-events-package-v1';
let gPackage=(()=>{try{return JSON.parse(localStorage.getItem(G_CONFIG_KEY)||'null')}catch{return null}})();
const selected = new Map();
const productsById = new Map();
const list = document.getElementById('square-events-products');
const counter = document.getElementById('square-events-cart');
const checkout = document.getElementById('square-events-checkout');
const money = cents => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents / 100);
const escapeHtml = str => String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
function persistEventSelections() {
  let existing=[];
  try { const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(parsed))existing=parsed; }catch{}
  const eventIds=new Set([600,604,605,606,607]);
  const otherItems=existing.filter(x=>!(x.kind==='rental'&&eventIds.has(Number(x.id))&&x.meta==null));
  const eventItems=Array.from(selected.values()).map(x=>({id:Number(x.rentalId),kind:'rental',meta:null,quantity:Number(x.quantity)}));
  localStorage.setItem(STORAGE_KEY,JSON.stringify([...otherItems,...eventItems]));
}
function restoreEventSelections(){
  let existing=[];
  try {const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(parsed))existing=parsed;}catch{}
  selected.clear();
  for(const row of existing){
    if(row.kind!=='rental'||row.meta!=null)continue;
    const product=productsById.get(Number(row.id));
    const quantity=Math.floor(Number(row.quantity)||0);
    if(product&&quantity>0)selected.set(product.rentalId,{...product,quantity});
  }
  updateCart();
}
function updateCart() {
  let count = 0, total = 0;
  for (const item of selected.values()) { count += item.quantity; total += item.quantity * item.priceCents; }
  if(gPackage&&selected.has(600)){try{total+=GEventsPricing.calculateGPackage(gPackage).addonsCents}catch{}}
  counter.textContent = `${count} rental item${count===1?'':'s'} · ${money(total)}`;
  checkout.disabled = count === 0;
  persistEventSelections();
  refreshGPackageSummary();
  document.getElementById('ev-floating-count').textContent=String(count);
  renderEventCart();
}
function gentleScroll(id) {
  const target=document.getElementById(id);
  if (!target) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.scrollIntoView({behavior:'instant',block:'start'});
    return;
  }
  const start=window.scrollY;
  const destination=Math.max(0,Math.min(document.documentElement.scrollHeight-window.innerHeight,
    target.getBoundingClientRect().top+window.scrollY-90));
  const change=destination-start;
  if (Math.abs(change)<8) return;
  const duration=1100;
  const started=performance.now();
  function frame(now) {
    const p=Math.min(1,(now-started)/duration);
    const eased=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
    window.scrollTo(0,start+change*eased);
    if(p<1)requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function addRental(id, button) {
  const item=productsById.get(Number(id));
  if (!item?.bookable) { const feedback=document.getElementById('ev-cart-feedback'); if(feedback) feedback.textContent='The cart is temporarily unavailable. Please try again shortly.'; return false; }
  const previous=selected.get(item.rentalId);
  selected.set(item.rentalId,{...item,quantity:(previous?.quantity||0)+1});
  updateCart();
  if (button) {
    const old=button.textContent;
    button.textContent='Added ✓';
    window.setTimeout(()=>{button.textContent=old;},1200);
  }
  return true;
}
async function loadProducts() {
  try {
    const response=await fetch('/api/events-catalog',{cache:'no-store'});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||'Event products unavailable');
    for (const p of data.products||[]) productsById.set(Number(p.rentalId),p);
    restoreEventSelections();
    if (!data.products?.length) {list.textContent='Event rentals are not available yet.';return;}
    list.innerHTML=data.products.filter(p=>Number(p.rentalId)!==600).map(p=>`<article class="ev-sq-card">
      ${p.imageUrl?`<img loading="lazy" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(wallDisplayName(p))}">`:'<div class="ev-sq-no-image">A SLICE OF G</div>'}
      <div class="ev-sq-copy"><h3>${escapeHtml(wallDisplayName(p))}</h3><p>${escapeHtml(p.rentalId===605?'One feature wall, two example looks. Your own wording and floral colour are included.':p.description)}</p>
      <strong>${p.priceCents!=null?money(p.priceCents):'Price on request'}</strong><p class="ev-display-rental-terms">8-hour standalone rental · delivery, setup &amp; collection included in the standard area</p>
      <div class="ev-sq-actions"><button type="button" class="ev-wall-detail-link" data-wall-detail="${p.rentalId}">View details &amp; inclusions</button>
      <button type="button" data-rental="${p.rentalId}" ${p.bookable?'':'disabled'}>${p.bookable?'Add to Event Cart':'Unavailable'}</button></div></div>
    </article>`).join('');
    list.addEventListener('click', e=>{
      const detail=e.target.closest('button[data-wall-detail]');
      if(detail){openWallDetail(Number(detail.dataset.wallDetail),detail);return;}
      const b=e.target.closest('button[data-rental]');if(b)addRental(b.dataset.rental,b);
    });
    
  } catch(e) {list.textContent=e.message;}
}

// Product details are shown only when asked for, not in crowded cards.
// Only the white panel has an owner-confirmed exact inclusions list.
const wallDetails={
  604:{title:'The Grand Entrance',intro:'A modular entrance installation with chevron and illuminated white panels and emerald/fuchsia accents.',included:['Modular chevron and illuminated white feature panels','Contrasting emerald and fuchsia semicircle accents'],note:'Shown setup is an example. Confirm any changes to the arrangement before booking.'},
  605:{title:'Custom White Panel Photo Wall',intro:'Your words, your floral colour, your photo moment. Both shown designs are examples of the same wall.',included:['1 white feature panel','Custom wall text, included in the price','2 stuffed Bobo balloons','1 large floral arrangement','Warm white uplighting','Your choice of floral colour, included in the price'],images:[['https://rsexseihtkaqoxccrylk.supabase.co/storage/v1/object/public/Photos%20from/heygirlhey.png','Hey Girl Hey example'],['https://rsexseihtkaqoxccrylk.supabase.co/storage/v1/object/public/Photos%20from/boyohboy.png','Boy Oh Boy example']],note:'Custom wording and floral colour are included. Other changes to the standard setup can be discussed separately.'},
  606:{title:'The Pink Chevron Edit',intro:'Walnut chevron panel with a hot-pink arch and tropical floral styling.',included:['Walnut chevron feature panel','Hot-pink arch panel','Tropical floral styling'],note:'The displayed styling is the standard setup; ask us about variations.'},
  607:{title:'The Ivory Chevron Edit',intro:'Walnut chevron panel with an ivory arch and soft floral styling.',included:['Walnut chevron feature panel','Ivory arch panel','Soft floral styling'],note:'The displayed styling is the standard setup; ask us about variations.'}
};
function wallDisplayName(product){return Number(product.rentalId)===605?'Custom White Panel Photo Wall':product.name;}
let wallDetailReturnFocus=null;
const wallDetailOverlay=document.createElement('div');
wallDetailOverlay.className='ev-wall-detail-modal';wallDetailOverlay.hidden=true;
wallDetailOverlay.innerHTML='<section class="ev-wall-detail-box" role="dialog" aria-modal="true" aria-labelledby="ev-wall-detail-title"><button type="button" class="ev-wall-detail-close" aria-label="Close wall details">×</button><div id="ev-wall-detail-body"></div></section>';
document.body.appendChild(wallDetailOverlay);
function closeWallDetail(){wallDetailOverlay.hidden=true;document.body.classList.remove('ev-wall-detail-open');wallDetailReturnFocus?.focus();}
function openWallDetail(id,origin){
 const product=productsById.get(id),info=wallDetails[id];if(!product||!info)return;
 wallDetailReturnFocus=origin;
 const shots=info.images||[[product.imageUrl,wallDisplayName(product)]];
 const images=shots.filter(entry=>entry[0]).map(([url,alt])=>`<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"><figcaption>${escapeHtml(alt)}</figcaption></figure>`).join('');
 document.getElementById('ev-wall-detail-body').innerHTML=`<p class="ev-kicker">What’s included</p><h2 id="ev-wall-detail-title">${escapeHtml(info.title)}</h2><p class="ev-wall-detail-intro">${escapeHtml(info.intro)}</p><div class="ev-wall-detail-photos">${images}</div><h3>Your rental includes</h3><ul>${info.included.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><p class="ev-wall-detail-note">${escapeHtml(info.note)}</p><div class="ev-wall-detail-bottom"><strong>${product.priceCents!=null?money(product.priceCents):'Price on request'}</strong><button type="button" class="btn-gold" id="ev-wall-detail-add" ${product.bookable?'':'disabled'}>${product.bookable?'Add to Event Cart':'Unavailable'}</button></div><p class="ev-wall-detail-delivery">Delivery, setup, takedown and collection included within the standard service area. The $50 extended-area delivery fee, where applicable, appears at checkout.</p>`;
 document.getElementById('ev-wall-detail-add').addEventListener('click',()=>{if(addRental(id))closeWallDetail()});
 wallDetailOverlay.hidden=false;document.body.classList.add('ev-wall-detail-open');wallDetailOverlay.querySelector('.ev-wall-detail-close').focus();
}
wallDetailOverlay.querySelector('.ev-wall-detail-close').addEventListener('click',closeWallDetail);
wallDetailOverlay.addEventListener('click',e=>{if(e.target===wallDetailOverlay)closeWallDetail()});
wallDetailOverlay.addEventListener('keydown',e=>{if(e.key==='Escape')closeWallDetail();if(e.key==='Tab'){const focusables=[...wallDetailOverlay.querySelectorAll('button:not(:disabled),a[href]')];const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});

// Collect dates in a modal instead of jumping into the catalogue.
const dateOverlay=document.getElementById('ev-date-dialog');
const dateInput=document.getElementById('ev-date-input');

const dateError=document.getElementById('ev-date-error');
function isoShift(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function closeBookingDate(){dateOverlay.hidden=true;document.body.classList.remove('ev-date-open');checkout.focus();}
checkout?.addEventListener('click',()=>{
  if(!selected.size)return;
  const today=new Date();const localToday=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  dateInput.min=isoShift(localToday,1); // Pickup must not be in the past.
  const existing=(()=>{try{return JSON.parse(localStorage.getItem(DATE_KEY)||'{}')}catch{return {}}})();
  dateInput.value=existing.event||'';
  dateError.hidden=true;dateOverlay.hidden=false;document.body.classList.add('ev-date-open');dateInput.focus();
});
document.getElementById('ev-date-close')?.addEventListener('click',closeBookingDate);
dateOverlay?.addEventListener('click',e=>{if(e.target===dateOverlay)closeBookingDate()});
dateOverlay?.addEventListener('keydown',e=>{if(e.key==='Escape')closeBookingDate()});
document.getElementById('ev-date-continue')?.addEventListener('click',()=>{
  const event=dateInput.value;const pickupTime='09:00';
  if(!event||event<dateInput.min){dateError.textContent='Choose a future event date.';dateError.hidden=false;return;}
  const existing=(()=>{try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}})();
  const remaining=existing.filter(x=>!(x.kind==='rental'&&[600,604,605,606,607].includes(Number(x.id))));
  const saved=[...remaining,...Array.from(selected.values()).map(x=>({id:x.rentalId,kind:'rental',meta:null,quantity:x.quantity}))];
  const h=Number(pickupTime.slice(0,2))+12;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));
  localStorage.setItem(DATE_KEY,JSON.stringify({event,pickup:isoShift(event,-1),dropoff:isoShift(event,1),pickupTime,dropoffTime:`${String(h%24).padStart(2,'0')}:${pickupTime.slice(3)}`,earlyPickupDays:0,extendedReturnDays:0,extraDayFeeCents:0}));
  localStorage.setItem('asliceofg-event-date',event);
  if(gPackage&&selected.has(600))localStorage.setItem(G_CONFIG_KEY,JSON.stringify(gPackage));
  sessionStorage.setItem('asliceofg-g-events-checkout','1');
  // Open the independent G Events checkout; original rentals checkout is separate.
  window.location.assign('/rentals/g-events-checkout?gEventsCheckout=1');
});
const packageForm=document.getElementById('ev-package-config');
const packageGuests=document.getElementById('ev-package-guests');
const packageHours=document.getElementById('ev-package-hours');
let currentPackageKind='treats';
function displayPackage(){
 const chosen=[...document.querySelectorAll('.ev-package-treats input:checked')].map(e=>e.value);
 let quote;const el=document.getElementById('ev-package-breakdown');
 try{quote=GEventsPricing.calculateGPackage({kind:currentPackageKind,guests:Number(packageGuests.value),treats:chosen,hours:Number(packageHours.value)});}catch(e){el.textContent=e.message;document.getElementById('ev-add-package').disabled=true;return;}
 document.getElementById('ev-add-package').disabled=false;
 const base=productsById.get(600)?.priceCents||39900;
 const rows=[['Cart rental (delivery, setup & collection included)',base],...quote.lines.map(l=>[`${l.quantity} × ${l.name} at ${money(l.unitCents)}`,l.totalCents])];
 if(quote.staffCents)rows.push([`${quote.attendants} attendant(s), ${quote.hours} hours`,quote.staffCents]);
 rows.push(['Total package price',base+quote.addonsCents]);
 el.innerHTML=rows.map(([name,cents])=>`<div class="ev-package-breakdown-row"><span>${escapeHtml(name)}</span><strong>${money(cents)}</strong></div>`).join('');
}
function refreshGPackageSummary(){
 const elem=document.getElementById('ev-cart-package');if(!elem)return;
 let quote=null;try{if(gPackage)quote=GEventsPricing.calculateGPackage(gPackage)}catch{}
 if(!quote||!selected.has(600)){elem.textContent='';return;}
 const parts=[`<div class="ev-cart-detail-heading"><strong>Treats for ${quote.guests} guests</strong><button type="button" id="ev-cart-edit-package" class="ev-cart-edit-package">Edit selection</button></div>`];
 for(const line of quote.lines){
   parts.push(`<div class="ev-cart-detail-row"><span>${escapeHtml(line.name)}<small>${line.quantity} × ${money(line.unitCents)} each</small></span><strong>${money(line.totalCents)}</strong></div>`);
 }
 parts.push(`<div class="ev-cart-detail-row ev-cart-detail-total"><span>Treats subtotal</span><strong>${money(quote.treatCents)}</strong></div>`);
 if(quote.kind==='staffed'){
   const rate=quote.attendants ? quote.staffCents/quote.attendants : 0;
   parts.push(`<div class="ev-cart-detail-row"><span>Staffed dessert service<small>${quote.attendants} ${quote.attendants===1?'attendant':'attendants'} × ${quote.hours} hours · ${money(rate)} per attendant</small></span><strong>${money(quote.staffCents)}</strong></div>`);
 }
 parts.push(`<div class="ev-cart-detail-row ev-cart-detail-total"><span>Treats &amp; service</span><strong>${money(quote.addonsCents)}</strong></div>`);
 elem.innerHTML=parts.join('');
}
function updatePackageChoice(){displayPackage()}
packageGuests.addEventListener('change',updatePackageChoice);
packageHours.addEventListener('change',updatePackageChoice);
document.querySelectorAll('.ev-package-treats input').forEach(e=>e.addEventListener('change',updatePackageChoice));
document.querySelectorAll('[data-sweet-choice]').forEach(button=>button.addEventListener('click',()=>{
 const kind=button.dataset.sweetChoice;
 document.querySelectorAll('[data-sweet-choice]').forEach(b=>b.classList.toggle('ev-chosen',b===button));
 if(kind==='cart'){
   const previous=selected.get(600);selected.set(600,{...(productsById.get(600)||{}),quantity:previous?.quantity||1});
   gPackage=null;localStorage.removeItem(G_CONFIG_KEY);packageForm.hidden=true;updateCart();
   document.getElementById('ev-cart-feedback').textContent='Cart Only selected. Your cart is ready.';return;
 }
 currentPackageKind=kind;packageForm.hidden=false;
 document.getElementById('ev-package-title').textContent=kind==='staffed'?'Build Your Staffed Treat Cart':'Build Your Treat Cart';
 document.getElementById('ev-package-hours-wrap').hidden=kind!=='staffed';
 if(gPackage?.kind===kind){packageGuests.value=String(gPackage.guests);packageHours.value=String(gPackage.hours||2);document.querySelectorAll('.ev-package-treats input').forEach(e=>e.checked=gPackage.treats.includes(e.value));}
 displayPackage();packageForm.scrollIntoView({behavior:'smooth',block:'nearest'});
}));
document.getElementById('ev-add-package').addEventListener('click',()=>{
 const config={kind:currentPackageKind,guests:Number(packageGuests.value),hours:Number(packageHours.value),treats:[...document.querySelectorAll('.ev-package-treats input:checked')].map(e=>e.value)};
 let quote;try{quote=GEventsPricing.calculateGPackage(config)}catch(e){return;}
 const item=productsById.get(600);if(!item?.bookable)return;
 selected.set(600,{...item,quantity:1});gPackage=config;localStorage.setItem(G_CONFIG_KEY,JSON.stringify(config));
 updateCart();document.getElementById('ev-cart-feedback').textContent=`${quote.guests}-guest package added, total ${money(item.priceCents+quote.addonsCents)}. View your cart to check out.`;
});

loadProducts();

// Persistent cart review, independent of the date picker.
const cartOverlay=document.getElementById('ev-cart-drawer');
const cartLines=document.getElementById('ev-cart-lines');
function renderEventCart(){
  if(!cartLines)return;
  let total=0;
  cartLines.innerHTML=Array.from(selected.values()).map(x=>{
    const line=x.quantity*x.priceCents;total+=line;
    return `<div class="ev-cart-line"><div><div class="ev-cart-line-title">${escapeHtml(x.name)}</div><div class="ev-cart-line-price">${money(line)}</div><button type="button" class="ev-cart-remove" data-remove="${x.rentalId}">Remove</button></div><div class="ev-cart-qty"><button type="button" data-minus="${x.rentalId}" aria-label="Decrease ${escapeHtml(x.name)} quantity">−</button><span>${x.quantity}</span><button type="button" data-plus="${x.rentalId}" aria-label="Increase ${escapeHtml(x.name)} quantity">+</button></div></div>`;
  }).join('')||'<p>Your cart is empty. Explore the rentals and add your favourites.</p>';
  if(gPackage&&selected.has(600)){try{total+=GEventsPricing.calculateGPackage(gPackage).addonsCents;}catch{}}
  document.getElementById('ev-cart-subtotal').textContent=money(total);
  document.getElementById('ev-cart-proceed').disabled=selected.size===0;
}
function closeEventCart(){cartOverlay.hidden=true;document.body.classList.remove('ev-cart-open')}
function openEventCart(){renderEventCart();cartOverlay.hidden=false;document.body.classList.add('ev-cart-open')}
document.getElementById('ev-view-cart').addEventListener('click',openEventCart);
document.getElementById('ev-cart-close').addEventListener('click',closeEventCart);
cartOverlay.addEventListener('click',e=>{if(e.target===cartOverlay)closeEventCart()});
cartOverlay.addEventListener('keydown',e=>{if(e.key==='Escape')closeEventCart()});
cartLines.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const id=Number(b.dataset.remove||b.dataset.minus||b.dataset.plus);const item=selected.get(id);if(!item)return;
  if(b.dataset.remove){selected.delete(id);if(id===600){gPackage=null;localStorage.removeItem(G_CONFIG_KEY)}}
  else if(b.dataset.minus){if(item.quantity<=1){selected.delete(id);if(id===600){gPackage=null;localStorage.removeItem(G_CONFIG_KEY)}}else item.quantity--}
  else if(b.dataset.plus){if(!(id===600&&gPackage))item.quantity++}
  updateCart();
});
document.getElementById('ev-cart-package')?.addEventListener('click',e=>{
 if(!e.target.closest('#ev-cart-edit-package')||!gPackage)return;
 closeEventCart();
 const chosen=document.querySelector(`[data-sweet-choice="${gPackage.kind}"]`);
 chosen?.click();
 packageForm.scrollIntoView({behavior:'smooth',block:'center'});
});
document.getElementById('ev-cart-proceed').addEventListener('click',()=>{if(!selected.size)return;closeEventCart();checkout.click()});

// Genuine existing product photographs; rotate gently and permit manual navigation.
const treatSlides=Array.from(document.querySelectorAll('.ev-treat-slide'));let slideIndex=0;let slideTimer;
function showTreatSlide(n){if(!treatSlides.length)return;slideIndex=(n+treatSlides.length)%treatSlides.length;treatSlides.forEach((el,i)=>el.classList.toggle('is-active',i===slideIndex));document.getElementById('ev-slide-count').textContent=`${slideIndex+1} / ${treatSlides.length}`}
function startTreatRotation(){clearInterval(slideTimer);if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)slideTimer=setInterval(()=>showTreatSlide(slideIndex+1),5000)}
document.getElementById('ev-slide-prev')?.addEventListener('click',()=>{showTreatSlide(slideIndex-1);startTreatRotation()});
document.getElementById('ev-slide-next')?.addEventListener('click',()=>{showTreatSlide(slideIndex+1);startTreatRotation()});
// Slideshow continues automatically; hovering does not stop the rotation.
// Manual controls are optional, not required for auto-transition.
startTreatRotation();

// Portion planner only recommends a package: it never changes a customer's cart automatically.
const earlyDateInput=document.getElementById('ev-early-date-input');
if(earlyDateInput){
 const today=new Date();const nextDay=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
 const pad=v=>String(v).padStart(2,'0');const iso=[nextDay.getFullYear(),pad(nextDay.getMonth()+1),pad(nextDay.getDate())].join('-');
 earlyDateInput.min=iso;
 try{const saved=JSON.parse(localStorage.getItem(DATE_KEY)||'{}');if(saved.event&&saved.event>=iso){earlyDateInput.value=saved.event;}}catch{}
 earlyDateInput.addEventListener('change',()=>{
  const event=earlyDateInput.value;if(!event||event<earlyDateInput.min)return;
  const shift=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
  const saved={event,pickup:shift(event,-1),dropoff:shift(event,1),pickupTime:'09:00',dropoffTime:'21:00',earlyPickupDays:0,extendedReturnDays:0,extraDayFeeCents:0};
  localStorage.setItem(DATE_KEY,JSON.stringify(saved));
  document.getElementById('ev-date-input').value=event;
 });
}
const evPlannerGuests=document.getElementById('ev-planner-guests');
const evPlannerPortions=document.getElementById('ev-planner-portions');
const evPlannerUse=document.getElementById('ev-planner-use');
function updateEvTreatPlanner(){
 const guests=Math.max(0,Math.floor(Number(evPlannerGuests?.value)||0));
 const portions=Number(evPlannerPortions?.value ?? 1);
 const portionsNeeded=Math.ceil(guests*portions);
 const recommended=Math.max(50,Math.ceil(portionsNeeded/50)*50);
 const available=guests>0&&recommended<=400;
 document.getElementById('ev-planner-result').textContent=guests?available?`${recommended} treats`:'Custom quantity':'Enter guests';
 document.getElementById('ev-planner-detail').textContent=guests?available?`${portionsNeeded} whole treats needed · ${recommended}-treat package is the smallest package that covers this amount`:'Over the 400-treat package maximum; please contact us':'Enter the number of expected guests';
 evPlannerUse.disabled=!available;
 evPlannerUse.textContent=available?`Use ${recommended}-treat package`:'Choose another amount';
 evPlannerUse.dataset.guests=String(recommended);
}
evPlannerGuests?.addEventListener('input',updateEvTreatPlanner);
evPlannerPortions?.addEventListener('change',updateEvTreatPlanner);
evPlannerUse?.addEventListener('click',()=>{
 const recommended=Number(evPlannerUse.dataset.guests);
 if(!Number.isInteger(recommended)||recommended<50||recommended>400)return;
 document.getElementById('ev-package-guests').value=String(recommended);
 document.querySelector('[data-sweet-choice="treats"]')?.click();
 document.getElementById('ev-package-guests').value=String(recommended);
 displayPackage();
 document.getElementById('ev-package-config').scrollIntoView({behavior:'smooth',block:'start'});
});
updateEvTreatPlanner();
