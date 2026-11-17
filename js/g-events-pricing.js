// Versioned G Events price book. Amounts are CAD cents; standard delivery/setup/collection included; extended GTA travel is priced separately.
const G_PRICE_VERSION = 'g-events-packages-v1';
const G_TREATS = [
  {id:'slice',name:'Rum Cake Slices',retail:400,rates:[350,325,300]},
  {id:'sandwich',name:'Rum Cake Sandwiches',retail:600,rates:[525,500,475]},
  {id:'ice',name:'Rum Cake Ice Cream Sandwiches',retail:900,rates:[800,775,750]},
  {id:'ring',name:'Rum Rings',retail:450,rates:[400,375,350]},
];
const G_CART_ITEM_ID = 600;
const G_CART_BASE_CENTS = 39900;
function calculateGPackage(config){
  if(!config||typeof config!=='object') throw new Error('Choose a valid cart setup.');
  const kind=String(config.kind||'');
  if(!['cart','treats','staffed'].includes(kind)) throw new Error('Invalid cart option.');
  if(kind==='cart') return {kind,version:G_PRICE_VERSION,guests:0,hours:0,attendants:0,lines:[],treatCents:0,staffCents:0,addonsCents:0};
  const guests=Number(config.guests);
  if(!Number.isInteger(guests)||guests<50||guests>400||guests%50) throw new Error('Choose a guest count between 50 and 400 in increments of 50.');
  const selected=Array.isArray(config.treats)?config.treats:[];
  const unique=[...new Set(selected)];
  if(!unique.length||unique.length!==selected.length||unique.some(id=>!G_TREATS.some(t=>t.id===id))) throw new Error('Choose one or more valid treats.');
  const chosen=G_TREATS.filter(t=>unique.includes(t.id));
  const sliceSplit=chosen.length>1&&unique.includes('slice');
  const sliceQty=sliceSplit?guests/2:0;
  const others=sliceSplit?chosen.filter(t=>t.id!=='slice'):chosen;
  const left=guests-sliceQty;
  const tier=guests===50?0:guests<=200?1:2;
  const lines=chosen.map(t=>{
    const idx=others.findIndex(other=>other.id===t.id);
    const qty=sliceSplit&&t.id==='slice'?sliceQty:Math.floor(left/others.length)+(idx<left%others.length?1:0);
    return {id:t.id,name:t.name,quantity:qty,unitCents:t.rates[tier],totalCents:qty*t.rates[tier]};
  });
  const treatCents=lines.reduce((sum,line)=>sum+line.totalCents,0);
  const hours=kind==='staffed'?Number(config.hours):0;
  if(kind==='staffed'&&![2,4].includes(hours)) throw new Error('Choose two or four hours of staffed service.');
  const attendants=kind==='staffed'?Math.ceil(guests/100):0;
  const staffCents=attendants*(hours===2?22500:hours===4?34500:0);
  return {kind,version:G_PRICE_VERSION,guests,hours,attendants,lines,treatCents,staffCents,addonsCents:treatCents+staffCents};
}

window.GEventsPricing={G_PRICE_VERSION,G_TREATS,G_CART_ITEM_ID,G_CART_BASE_CENTS,calculateGPackage};

// Delivery pricing for the order form. Mirrors gEventDelivery.js in the Events app,
// which is the version the server charges from. Amounts are CAD cents, once per booking.
function gEventDeliveryZone(postalInput){
  const postal=String(postalInput||'').replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)||/[DFIOQU]/.test(postal))return null;
  const fsa=postal.slice(0,3);
  if(postal[0]==='M'||['L1S','L1T','L1V','L1W','L1X','L1Z'].includes(fsa))return {feeCents:0,label:'Included delivery, setup & collection'};
  if(/^L[134567]/.test(fsa)||['L9T','L9E'].includes(fsa))return {feeCents:5000,label:'Extended GTA delivery, setup & collection'};
  return null;
}
// Display estimates only. The server recomputes both amounts from the same tiers before charging.
function estimateBookingDepositCents(totalCents){return Math.ceil(totalCents*0.5);}
function estimateSecurityDepositCents(totalCents){
  if(totalCents>=100000)return 30000;
  if(totalCents>=75000)return 25000;
  if(totalCents>=50000)return 20000;
  if(totalCents>=30000)return 15000;
  if(totalCents>=15000)return 10000;
  if(totalCents>=5000)return 5000;
  return 0;
}
Object.assign(window.GEventsPricing,{gEventDeliveryZone,estimateBookingDepositCents,estimateSecurityDepositCents});
