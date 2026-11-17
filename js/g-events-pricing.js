// Versioned G Events price book. Amounts are CAD cents; standard delivery/setup/collection included; extended GTA travel is priced separately.
// This file exists in two repositories (Events: gEventsPricing.js, cake site: js/g-events-pricing.js). The server charges
// from the Events copy, so both must stay identical from here to the end of calculateGPackage.
const G_PRICE_VERSION = 'g-events-packages-v2';
const G_TREATS = [
  {id:'slice',name:'Rum Cake Slices',retail:400,rates:[350,325,300]},
  {id:'sandwich',name:'Rum Cake Sandwiches',retail:600,rates:[525,500,475]},
  {id:'ice',name:'Rum Cake Ice Cream Sandwiches',retail:900,rates:[800,775,750]},
  {id:'ring',name:'Rum Rings',retail:450,rates:[400,375,350]},
  // Brown butter Gramma cookies with a hint of rum. Priced on the number of cookies, not the package size.
  {id:'cookie',name:'Gramma Cookies',retail:325,rates:[325,300,300],byOwnQuantity:true},
];
const G_COOKIE = {baseCents:325,volumeCents:300,volumeOver:50,chocolateDipCents:75,maxColorLength:40};
const G_CART_ITEM_ID = 600;
const G_CART_BASE_CENTS = 39900;
// Unit price for one treat line. Cookies drop to the volume price above 50 cookies; chocolate dipping adds a per-cookie upgrade.
function gTreatUnitCents(treat,tier,quantity,cookie){
  if(!treat.byOwnQuantity) return treat.rates[tier];
  return (quantity>G_COOKIE.volumeOver?G_COOKIE.volumeCents:G_COOKIE.baseCents)+(cookie&&cookie.finish==='chocolate'?G_COOKIE.chocolateDipCents:0);
}
// The default split: slices are half when combined with other treats, and the other treats share the rest evenly.
function defaultGSplit(treatIds,guests){
  const chosen=G_TREATS.filter(t=>treatIds.includes(t.id));
  const sliceSplit=chosen.length>1&&treatIds.includes('slice');
  const sliceQty=sliceSplit?guests/2:0;
  const others=sliceSplit?chosen.filter(t=>t.id!=='slice'):chosen;
  const left=guests-sliceQty;
  const split={};
  for(const t of chosen){
    const idx=others.findIndex(other=>other.id===t.id);
    split[t.id]=sliceSplit&&t.id==='slice'?sliceQty:Math.floor(left/others.length)+(idx<left%others.length?1:0);
  }
  return split;
}
function readGCookie(input){
  const finish=String((input&&input.finish)||'');
  if(!['icing','chocolate'].includes(finish)) throw new Error('Choose rum kissed icing or chocolate dipped for your Gramma cookies.');
  if(finish==='chocolate') return {finish,color:null};
  const color=String((input&&input.color)||'').replace(/\s+/g,' ').trim();
  if(!color) throw new Error('Enter one icing colour for your Gramma cookies.');
  if(color.length>G_COOKIE.maxColorLength||!/^[\p{L}\p{N} #&'\/,.()-]+$/u.test(color)) throw new Error('Describe your icing colour in a few words, for example "blush pink".');
  return {finish,color};
}
function calculateGPackage(config){
  if(!config||typeof config!=='object') throw new Error('Choose a valid cart setup.');
  const kind=String(config.kind||'');
  if(!['cart','treats','staffed'].includes(kind)) throw new Error('Invalid cart option.');
  if(kind==='cart') return {kind,version:G_PRICE_VERSION,guests:0,hours:0,attendants:0,lines:[],treatCents:0,staffCents:0,addonsCents:0,customSplit:false,cookie:null};
  const guests=Number(config.guests);
  if(!Number.isInteger(guests)||guests<50||guests>400||guests%50) throw new Error('Choose a guest count between 50 and 400 in increments of 50.');
  const selected=Array.isArray(config.treats)?config.treats:[];
  const unique=[...new Set(selected)];
  if(!unique.length||unique.length!==selected.length||unique.some(id=>!G_TREATS.some(t=>t.id===id))) throw new Error('Choose one or more valid treats.');
  const chosen=G_TREATS.filter(t=>unique.includes(t.id));
  const cookie=unique.includes('cookie')?readGCookie(config.cookie):null;
  const customSplit=config.quantities!=null;
  let split;
  if(customSplit){
    const given=config.quantities;
    if(typeof given!=='object'||Array.isArray(given)) throw new Error('Set a quantity for each treat you selected.');
    const keys=Object.keys(given);
    if(keys.length!==unique.length||keys.some(id=>!unique.includes(id))) throw new Error('Set a quantity for each treat you selected.');
    split={};
    let sum=0;
    for(const id of unique){
      const qty=given[id];
      if(typeof qty!=='number'||!Number.isInteger(qty)||qty<1) throw new Error('Each selected treat needs a whole-number quantity of at least 1.');
      split[id]=qty;sum+=qty;
    }
    if(sum!==guests) throw new Error(`Your treat quantities add up to ${sum}. They need to total ${guests}.`);
  }else split=defaultGSplit(unique,guests);
  const tier=guests===50?0:guests<=200?1:2;
  const lines=chosen.map(t=>{
    const quantity=split[t.id];
    const unitCents=gTreatUnitCents(t,tier,quantity,cookie);
    const name=t.id!=='cookie'?t.name:cookie.finish==='chocolate'?`${t.name}, chocolate dipped`:`${t.name}, rum kissed icing (white, ${cookie.color}, gold accents)`;
    return {id:t.id,name,quantity,unitCents,totalCents:quantity*unitCents};
  });
  const treatCents=lines.reduce((sum,line)=>sum+line.totalCents,0);
  const hours=kind==='staffed'?Number(config.hours):0;
  if(kind==='staffed'&&![2,4].includes(hours)) throw new Error('Choose two or four hours of staffed service.');
  const attendants=kind==='staffed'?Math.ceil(guests/100):0;
  const staffCents=attendants*(hours===2?22500:hours===4?34500:0);
  return {kind,version:G_PRICE_VERSION,guests,hours,attendants,lines,treatCents,staffCents,addonsCents:treatCents+staffCents,customSplit,cookie};
}

window.GEventsPricing={G_PRICE_VERSION,G_TREATS,G_COOKIE,G_CART_ITEM_ID,G_CART_BASE_CENTS,gTreatUnitCents,defaultGSplit,calculateGPackage};

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
