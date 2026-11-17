// Pickup location choice for the cake checkout (shop, product and home page cart drawers).
// The same rules are enforced again on the server in api/checkout.js.
(function(){
  'use strict';
  const LOCATIONS={
    spadina:{label:'70 Spadina Road'},
    woodbine:{label:'7270 Woodbine Avenue (Cravins Caribbean Grill)',short:'7270 Woodbine Avenue',detail:'Cravins Caribbean Grill · Monday to Saturday, 12 to 5 pm',
      closedDays:[0],open:'12:00',close:'17:00',hoursText:'Monday to Saturday, between 12:00 pm and 5:00 pm'},
  };
  const holder=document.getElementById('fulfillment-select');
  const options=holder&&holder.querySelector('.fulfillment-options');
  if(!holder||!options)return;

  const style=document.createElement('style');
  style.textContent='.pickup-loc[hidden]{display:none!important}.pickup-loc{border:0;padding:0;margin:14px 0 4px;min-width:0}.pickup-loc legend{padding:0;margin-bottom:8px}'+
    '.pickup-loc label{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;margin-bottom:6px;border:1px solid rgba(201,169,110,.3);color:rgba(255,255,255,.85);font-size:13px;line-height:1.45;cursor:pointer}'+
    '.pickup-loc label:has(input:checked){border-color:var(--gold,#C9A96E);background:rgba(201,169,110,.1)}'+
    '.pickup-loc input{margin:2px 0 0;width:18px;height:18px;accent-color:var(--gold,#C9A96E);flex:none}'+
    '.pickup-loc small{display:block;color:rgba(255,255,255,.6);font-size:12px}'+
    '.pickup-loc input:focus-visible{outline:2px solid var(--gold-light,#E0C48A);outline-offset:2px}'+
    '.pickup-loc-error{color:var(--coral-light,#EC8870);font-size:12px;line-height:1.45;margin:6px 0 0}.pickup-loc-error:empty{display:none}';
  document.head.appendChild(style);

  const field=document.createElement('fieldset');field.className='pickup-loc';field.id='pickup-location';
  const legend=document.createElement('legend');legend.className='fulfillment-date-label';legend.textContent='Pickup location';field.appendChild(legend);
  for(const [id,loc] of Object.entries(LOCATIONS)){
    const label=document.createElement('label');
    const input=document.createElement('input');input.type='radio';input.name='pickup-location';input.value=id;input.checked=id==='spadina';
    const text=document.createElement('span');text.textContent=loc.short||loc.label;
    if(loc.detail){const small=document.createElement('small');small.textContent=loc.detail;text.appendChild(small);}
    label.append(input,text);field.appendChild(label);
  }
  const error=document.createElement('p');error.className='pickup-loc-error';error.id='pickup-location-error';error.setAttribute('role','alert');field.appendChild(error);
  options.insertAdjacentElement('afterend',field);

  const dateInput=()=>document.getElementById('fulfillment-date');
  const timeInput=()=>document.getElementById('fulfillment-time');
  const selectedId=()=>(field.querySelector('input:checked')||{}).value||'spadina';
  const isPickup=()=>{const active=holder.querySelector('.fulfillment-btn.active');return !active||active.dataset.type==='PICKUP';};

  // Returns a message when the chosen date and time do not suit the chosen location, otherwise ''.
  function problem(requireDate){
    const loc=LOCATIONS[selectedId()];
    if(!loc.closedDays)return '';
    const date=(dateInput()||{}).value||'';const time=(timeInput()||{}).value||'';
    if(!date)return requireDate?`Choose a pickup date. ${loc.short} pickup is available ${loc.hoursText}.`:'';
    const [y,m,d]=date.split('-').map(Number);
    if(loc.closedDays.includes(new Date(y,m-1,d).getDay()))return `${loc.short} pickup is not available on Sundays. Choose a day from Monday to Saturday, or pick up at ${LOCATIONS.spadina.label}.`;
    if(!time)return requireDate?`Choose a pickup time between 12:00 pm and 5:00 pm.`:'';
    if(time<loc.open||time>loc.close)return `${loc.short} pickup is available between 12:00 pm and 5:00 pm. Choose a time in that window.`;
    return '';
  }
  function sync(){
    field.hidden=!isPickup();
    const loc=LOCATIONS[selectedId()];const time=timeInput();
    if(time){
      if(loc.open&&isPickup()){time.min=loc.open;time.max=loc.close;}
      else{time.removeAttribute('min');time.removeAttribute('max');}
    }
    error.textContent=isPickup()?problem(false):'';
  }
  field.addEventListener('change',()=>{
    const loc=LOCATIONS[selectedId()];const time=timeInput();
    // Moving to a location with set hours starts from a valid time rather than an error.
    if(time&&loc.open&&(!time.value||time.value<loc.open||time.value>loc.close))time.value=loc.open;
    sync();
  });
  holder.addEventListener('input',e=>{if(e.target===dateInput()||e.target===timeInput())sync();});
  // The page's own button handler runs first (it is on the button itself), so the active state is already updated here.
  holder.addEventListener('click',e=>{if(e.target.closest('.fulfillment-btn'))sync();});

  window.ASGPickup={
    // Called by each checkout before it contacts the server.
    check(fulfillmentType){
      if(fulfillmentType!=='PICKUP')return {};
      const message=problem(true);error.textContent=message;
      if(message){field.scrollIntoView({block:'nearest'});return {error:message};}
      return {id:selectedId()};
    },
    summary(){return ` · ${LOCATIONS[selectedId()].label}`;},
  };
  sync();
})();
