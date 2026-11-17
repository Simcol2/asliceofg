// Confirms the browser price book in js/g-events-pricing.js matches the Events app
// modules the server charges from. Run: node tests/pricing-parity.test.mjs <path-to-events-repo>
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

// Every valid and invalid package configuration.
const treatIds=pricing.G_TREATS.map(t=>t.id);
const subsets=[];
for(let mask=0;mask<1<<treatIds.length;mask++)subsets.push(treatIds.filter((_,i)=>mask&(1<<i)));
for(const kind of ['cart','treats','staffed','bogus'])for(const guests of [0,25,50,75,100,150,200,250,300,350,400,450])for(const hours of [0,2,3,4])for(const treats of subsets){
  const config={kind,guests,hours,treats};
  let expected,actual,expectedError=null,actualError=null;
  try{expected=pricing.calculateGPackage(config)}catch(e){expectedError=e.message}
  try{actual=local.calculateGPackage(config)}catch(e){actualError=e.message}
  assert.equal(actualError,expectedError,`error mismatch for ${JSON.stringify(config)}`);
  if(!expectedError)assert.deepEqual(plain(actual),plain(expected),`quote mismatch for ${JSON.stringify(config)}`);
  checks++;
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
