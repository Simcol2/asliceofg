// The Events storefront uses Supabase rental IDs and the existing /rentals cart.
const STORAGE_KEY = 'asliceofg-cart-items-v2';
const DATE_KEY = 'asliceofg-rental-dates-v2';
const selected = new Map();
const productsById = new Map();
const list = document.getElementById('square-events-products');
const counter = document.getElementById('square-events-cart');
const checkout = document.getElementById('square-events-checkout');
const money = cents => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents / 100);
const escapeHtml = str => String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
function updateCart() {
  let count = 0, total = 0;
  for (const item of selected.values()) { count += item.quantity; total += item.quantity * item.priceCents; }
  counter.textContent = `${count} rental item${count===1?'':'s'} · ${money(total)}`;
  checkout.disabled = count === 0;
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
    if (!data.products?.length) {list.textContent='Event rentals are not available yet.';return;}
    list.innerHTML=data.products.filter(p=>Number(p.rentalId)!==600).map(p=>`<article class="ev-sq-card">
      ${p.imageUrl?`<img loading="lazy" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}">`:'<div class="ev-sq-no-image">A SLICE OF G</div>'}
      <div class="ev-sq-copy"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p>
      <strong>${p.priceCents!=null?money(p.priceCents):'Price on request'}</strong>
      <button type="button" data-rental="${p.rentalId}" ${p.bookable?'':'disabled'}>${p.bookable?'Add to Event Cart':'Unavailable'}</button></div>
    </article>`).join('');
    list.addEventListener('click', e=>{const b=e.target.closest('button[data-rental]');if(b)addRental(b.dataset.rental,b);});
    
  } catch(e) {list.textContent=e.message;}
}
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
  for(const item of selected.values()){
    const old=existing.find(x=>x.kind==='rental'&&Number(x.id)===item.rentalId&&x.meta==null);
    if(old)old.quantity=Number(old.quantity||0)+item.quantity;
    else existing.push({id:item.rentalId,kind:'rental',meta:null,quantity:item.quantity});
  }
  const h=Number(pickupTime.slice(0,2))+12;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(existing));
  localStorage.setItem(DATE_KEY,JSON.stringify({event,pickup:isoShift(event,-1),dropoff:isoShift(event,1),pickupTime,dropoffTime:`${String(h%24).padStart(2,'0')}:${pickupTime.slice(3)}`,earlyPickupDays:0,extendedReturnDays:0,extraDayFeeCents:0}));
  localStorage.setItem('asliceofg-event-date',event);
  sessionStorage.setItem('asliceofg-g-events-checkout','1');
  // The existing rental app opens its real checkout modal with the saved cart.
  window.location.assign('/rentals/decor?gEventsCheckout=1');
});
document.querySelectorAll('[data-sweet-choice]').forEach(button=>button.addEventListener('click',()=>{
  const choice=button.dataset.sweetChoice;
  const added=addRental(600);
  const feedback=document.getElementById('ev-cart-feedback');
  if(!added) return;
  const messages={
    cart:'Cart Only added. Your cart is ready below.',
    treats:'Cart added. A Slice of G treats will be quoted separately based on your event.',
    staffed:'Cart added. Treats and staffing require a separate quote before your booking is final.'
  };
  if(feedback) feedback.textContent=messages[choice]||messages.cart;
  document.querySelectorAll('[data-sweet-choice]').forEach(b=>b.classList.toggle('ev-chosen',b===button));
}));
loadProducts();
