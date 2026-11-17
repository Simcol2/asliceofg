// Confirms the browser price book in js/g-events-pricing.js matches the Events app
// modules the server charges from. Run: node tests/pricing-parity.test.mjs <path-to-events-repo> [path-to-previous-events-checkout]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const eventsRepo=process.argv[2];
if(!eventsRepo){console.error('Usage: node tests/pricing-parity.test.mjs <path-to-events-repo>');process.exit(2);}
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../js/g-events-pricing.js',import.meta.url),'utf8'),sandbox);
const local=sandbox.window.GEventsPricing;
const load=file=>import(pathToFileURL(path.resolve(eventsRepo,file)).href);
const [pricing,delivery,tiers]=await Promise.all([load('gEventsPricing.js'),load('gEventDelivery.js'),load('depositTiers.js')]);
const plain=value=>JSON.parse(JSON.stringify(value));
let checks=0;

// Every valid and invalid package configuration, with and without cookie options and custom splits.
const treatIds=pricing.G_TREATS.map(t=>t.id);
const subsets=[];
for(let mask=0;mask<1<<treatIds.length;mask++)subsets.push(treatIds.filter((_,i)=>mask&(1<<i)));
let seed=20261117;const random=()=>(seed=(seed*1664525+1013904223)%4294967296)/4294967296;
const cookieOptions=[undefined,{finish:'icing',color:'Blush pink'},{finish:'chocolate'},{finish:'icing',color:''},{finish:'sprinkles'},{finish:'icing',color:'<script>'}];
function compare(config){
  let expected,actual,expectedError=null,actualError=null;
  try{expected=pricing.calculateGPackage(config)}catch(e){expectedError=e.message}
  try{actual=local.calculateGPackage(config)}catch(e){actualError=e.message}
  assert.equal(actualError,expectedError,`error mismatch for ${JSON.stringify(config)}`);
  if(!expectedError){
    assert.deepEqual(plain(actual),plain(expected),`quote mismatch for ${JSON.stringify(config)}`);
    // Independent arithmetic checks on every accepted quote.
    assert.equal(actual.lines.reduce((sum,l)=>sum+l.quantity,0),config.kind==='cart'?0:config.guests,'quantities must total the package size');
    assert.equal(actual.treatCents,actual.lines.reduce((sum,l)=>sum+l.quantity*l.unitCents,0));
    assert.equal(actual.addonsCents,actual.treatCents+actual.staffCents);
  }
  checks++;
  return expectedError?null:expected;
}
for(const kind of ['cart','treats','staffed','bogus'])for(const guests of [0,25,50,75,100,150,200,250,300,350,400,450])for(const hours of [0,2,3,4])for(const treats of subsets)for(const cookie of cookieOptions){
  const base={kind,guests,hours,treats,...(cookie?{cookie}:{})};
  compare(base);
  if(!treats.length||guests<50)continue;
  // A valid custom split, then the same split broken in several ways.
  const quantities={};let left=guests;
  treats.forEach((id,i)=>{const q=i===treats.length-1?left:1+Math.floor(random()*Math.max(1,left-(treats.length-i)));quantities[id]=q;left-=q;});
  compare({...base,quantities});
  compare({...base,quantities:{...quantities,[treats[0]]:quantities[treats[0]]+1}});
  compare({...base,quantities:{...quantities,[treats[0]]:0}});
  compare({...base,quantities:{...quantities,[treats[0]]:String(quantities[treats[0]])}});
  compare({...base,quantities:{...quantities,extra:1}});
  compare({...base,quantities:[]});
}
// Cookie pricing at the volume boundary, with and without the chocolate upgrade.
const cookieLine=(quantity,cookie)=>compare({kind:'treats',guests:100,treats:['slice','cookie'],quantities:{slice:100-quantity,cookie:quantity},cookie}).lines.find(l=>l.id==='cookie');
assert.equal(cookieLine(50,{finish:'icing',color:'Sage'}).unitCents,325);
assert.equal(cookieLine(51,{finish:'icing',color:'Sage'}).unitCents,300);
assert.equal(cookieLine(50,{finish:'chocolate'}).unitCents,400);
assert.equal(cookieLine(51,{finish:'chocolate'}).unitCents,375);
assert.equal(cookieLine(51,{finish:'icing',color:'  Sage   green '}).name,'Gramma Cookies, rum kissed icing (white, Sage green, gold accents)');
assert.equal(cookieLine(51,{finish:'chocolate',color:'ignored'}).name,'Gramma Cookies, chocolate dipped');
// Bookings made the previous way (no quantities, no cookie) must price exactly as before.
const legacyRepo=process.argv[3];
if(legacyRepo){
  const legacy=await import(pathToFileURL(path.resolve(legacyRepo,'gEventsPricing.js')).href);
  const legacyIds=legacy.G_TREATS.map(t=>t.id);let legacyChecks=0;
  for(const kind of ['cart','treats','staffed'])for(const guests of [50,100,150,200,250,300,350,400])for(const hours of [2,4])for(let mask=1;mask<1<<legacyIds.length;mask++){
    const config={kind,guests,hours,treats:legacyIds.filter((_,i)=>mask&(1<<i))};
    const before=legacy.calculateGPackage(config),after=local.calculateGPackage(config);
    for(const key of ['guests','hours','attendants','lines','treatCents','staffCents','addonsCents'])assert.deepEqual(plain(after[key]),plain(before[key]),`legacy ${key} changed for ${JSON.stringify(config)}`);
    legacyChecks++;
  }
  console.log(`legacy pricing unchanged: ${legacyChecks} checks`);
}
// Every forward sortation area plus malformed input.
const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
for(const a of letters)for(let d=0;d<10;d++)for(const c of letters){
  const postal=`${a}${d}${c} 1A1`;
  assert.deepEqual(plain(local.gEventDeliveryZone(postal)),plain(delivery.gEventDeliveryZone(postal)),`zone mismatch for ${postal}`);
  checks++;
}
for(const odd of ['','m5v2t6',' M5V 2T6 ','M5V','12345','L9T-1A1',null,undefined]){
  assert.deepEqual(plain(local.gEventDeliveryZone(odd)),plain(delivery.gEventDeliveryZone(odd)));checks++;
}
// Deposit tiers at every dollar from $0 to $12,000 and one cent either side of each boundary.
for(let cents=0;cents<=1200000;cents+=100)for(const delta of [-1,0,1]){
  const total=Math.max(0,cents+delta);
  assert.equal(local.estimateBookingDepositCents(total),tiers.estimateBookingDepositCents(total));
  assert.equal(local.estimateSecurityDepositCents(total),tiers.estimateSecurityDepositCents(total));
  checks++;
}
// Spot values that the order form shows by default.
assert.equal(local.G_CART_BASE_CENTS,39900);
assert.equal(local.estimateBookingDepositCents(39900),19950);
assert.equal(local.estimateSecurityDepositCents(39900),15000);
console.log(`pricing parity OK: ${checks} checks`);
