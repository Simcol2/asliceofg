// Server-side checks for pickup locations and the checkout request sent to Square (Square is stubbed).
// Run: node tests/pickup.test.mjs   (needs `npm ci` for the square package)
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const square=require('square');
let sent=null;
// Replace the client's checkout API so no request ever leaves this machine.
Object.defineProperty(square.SquareClient.prototype,'checkout',{configurable:true,get(){return {paymentLinks:{create:async body=>{sent=body;return {paymentLink:{url:'https://square.link/u/test'}};}}};}});
const {default:handler,resolvePickupLocation,PICKUP_LOCATIONS}=await import('../api/checkout.js');

// A fixed week in January 2027, Toronto on standard time (UTC-5): the 4th is a Monday, the 10th a Sunday.
const at=(day,time)=>new Date(`2027-01-${String(day).padStart(2,'0')}T${time}:00-05:00`).toISOString();
const NOW=new Date('2027-01-01T09:00:00-05:00').getTime();
const ok=(id,dt,now=NOW)=>{const r=resolvePickupLocation(id,dt,now);assert.equal(r.error,undefined,`${id} ${dt}: ${r.error}`);return r.location;};
const bad=(id,dt,pattern,now=NOW)=>{const r=resolvePickupLocation(id,dt,now);assert.match(r.error||'',pattern,`${id} ${dt} should be rejected`);};

// Spadina: every day, 12 to 7 pm. A request with no location is treated as Spadina.
for(const day of [4,5,6,7,8,9,10])for(const time of ['12:00','15:45','19:00'])ok('spadina',at(day,time));
for(const time of ['09:00','11:59','19:01','21:00'])bad('spadina',at(10,time),/every day between 12:00 pm and 7:00 pm/);
assert.equal(ok(undefined,at(10,'18:30')),PICKUP_LOCATIONS.spadina);
bad(undefined,at(10,'09:00'),/70 Spadina Road pickup is only available/);
// Woodbine: Monday to Saturday, 12 to 5 pm.
for(const day of [4,5,6,7,8,9])for(const time of ['12:00','14:30','17:00'])ok('woodbine',at(day,time));
for(const time of ['12:00','14:30','17:00'])bad('woodbine',at(10,time),/Monday to Saturday/);
for(const time of ['00:00','11:59','17:01','18:30'])bad('woodbine',at(6,time),/12:00 pm and 5:00 pm/);
// Both: a date and time are required, and the location must be one we offer.
for(const id of ['spadina','woodbine',undefined]){bad(id,null,/Choose a pickup date and time/);bad(id,'not-a-date',/Choose a pickup date and time/);}
bad('elsewhere',at(6,'13:00'),/valid pickup location/);
bad('constructor',at(6,'13:00'),/valid pickup location/);
// 24 hours' notice at both locations, to the minute.
const noticeNow=new Date(at(6,'13:30')).getTime()-24*36e5; // exactly 24 hours before Wednesday 1:30 pm
for(const id of ['spadina','woodbine']){
  ok(id,at(6,'13:30'),noticeNow);
  bad(id,at(6,'13:29'),/at least 24 hours' notice/,noticeNow);
  bad(id,at(6,'13:30'),/at least 24 hours' notice/,noticeNow+60000);
}
// Daylight time is handled: on a July Monday Toronto is UTC-4, so 12:00 local is 16:00 UTC.
ok('woodbine','2027-07-05T16:00:00.000Z');bad('woodbine','2027-07-05T15:59:00.000Z',/12:00 pm/);
ok('spadina','2027-07-04T23:00:00.000Z');bad('spadina','2027-07-04T23:01:00.000Z',/7:00 pm/);

async function call(body){
  sent=null;const res={code:200,status(c){this.code=c;return this;},json(d){this.body=d;return this;}};
  await handler({method:'POST',body},res);return res;
}
const cartItems=[{variationId:'VAR1',quantity:2}];
let res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(6,'13:30'),pickupLocation:'woodbine'});
assert.equal(res.code,200);assert.equal(res.body.url,'https://square.link/u/test');
assert.equal(sent.order.fulfillments[0].pickupDetails.note,'Pickup location: 7270 Woodbine Avenue (Cravins Caribbean Grill)');
assert.equal(sent.order.lineItems.at(-1).name,'Pickup at 7270 Woodbine Avenue (Cravins Caribbean Grill): Wednesday, January 6, 2027 at 1:30 p.m.');
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(10,'13:30'),pickupLocation:'woodbine'});
assert.equal(res.code,400);assert.match(res.body.error,/only available Monday to Saturday/);assert.equal(sent,null,'Square must not be called for a rejected pickup');
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(10,'18:30'),pickupLocation:'spadina'});
assert.equal(res.code,200);assert.match(sent.order.lineItems.at(-1).name,/^Pickup at 70 Spadina Road: Sunday, January 10, 2027 at 6:30 p.m.$/);
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(10,'09:00'),pickupLocation:'spadina'});
assert.equal(res.code,400);assert.equal(sent,null);
// Within 24 hours of the real clock is refused before Square is contacted.
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:new Date(Date.now()+2*36e5).toISOString(),pickupLocation:'spadina'});
assert.equal(res.code,400);assert.equal(sent,null);
// No date at all is now refused for pickup (previously it silently defaulted to tomorrow at noon).
res=await call({cartItems,fulfillmentType:'PICKUP',pickupLocation:'spadina'});
assert.equal(res.code,400);assert.match(res.body.error,/Choose a pickup date and time/);assert.equal(sent,null);
// A page from before the location choice existed is treated as Spadina.
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(6,'13:30')});
assert.equal(res.code,200);assert.equal(sent.order.fulfillments[0].pickupDetails.note,'Pickup location: 70 Spadina Road');
// Shipping is unchanged: no hours, no notice rule, no location.
res=await call({cartItems,fulfillmentType:'SHIPMENT',fulfillmentDateTime:new Date(Date.now()+36e5).toISOString(),pickupLocation:'woodbine'});
assert.equal(res.code,200);assert.equal(sent.order.fulfillments[0].type,'SHIPMENT');assert.match(sent.order.lineItems.at(-1).name,/^Ships by:/);
console.log('pickup rules OK');
