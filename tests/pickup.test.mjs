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

// November 2026, Toronto on standard time (UTC-5): the 21st is a Saturday, the 22nd a Sunday.
const at=(day,time)=>new Date(`2026-11-${day}T${time}:00-05:00`).toISOString();
const ok=(id,dt)=>{const r=resolvePickupLocation(id,dt);assert.equal(r.error,undefined,`${id} ${dt}: ${r.error}`);return r.location;};
const bad=(id,dt,pattern)=>{const r=resolvePickupLocation(id,dt);assert.match(r.error||'',pattern,`${id} ${dt} should be rejected`);};
assert.equal(ok(undefined,null),null);
assert.equal(ok('spadina',null),PICKUP_LOCATIONS.spadina);
assert.equal(ok('spadina',at(22,'09:00')),PICKUP_LOCATIONS.spadina); // Spadina has no set hours
for(const day of [16,17,18,19,20,21])for(const time of ['12:00','14:30','17:00'])ok('woodbine',at(day,time)); // Monday to Saturday
for(const time of ['12:00','14:30','17:00'])bad('woodbine',at(22,time),/Monday to Saturday/); // Sunday
for(const time of ['00:00','11:59','17:01','20:00'])bad('woodbine',at(18,time),/12:00 pm and 5:00 pm/);
bad('woodbine',null,/Choose a pickup date and time/);
bad('woodbine','not-a-date',/Choose a pickup date and time/);
bad('elsewhere',at(18,'13:00'),/valid pickup location/);
bad('constructor',at(18,'13:00'),/valid pickup location/);
// Daylight time is handled: 12:00 on a July Monday in Toronto is UTC-4.
ok('woodbine','2027-07-05T16:00:00.000Z');bad('woodbine','2027-07-05T15:59:00.000Z',/12:00 pm/);

async function call(body){
  sent=null;const res={code:200,status(c){this.code=c;return this;},json(d){this.body=d;return this;}};
  await handler({method:'POST',body},res);return res;
}
const cartItems=[{variationId:'VAR1',quantity:2}];
let res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(18,'13:30'),pickupLocation:'woodbine'});
assert.equal(res.code,200);assert.equal(res.body.url,'https://square.link/u/test');
assert.equal(sent.order.fulfillments[0].pickupDetails.note,'Pickup location: 7270 Woodbine Avenue (Cravins Caribbean Grill)');
assert.equal(sent.order.lineItems.at(-1).name,'Pickup at 7270 Woodbine Avenue (Cravins Caribbean Grill): Wednesday, November 18, 2026 at 1:30 p.m.');
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(22,'13:30'),pickupLocation:'woodbine'});
assert.equal(res.code,400);assert.match(res.body.error,/only available Monday to Saturday/);assert.equal(sent,null,'Square must not be called for a rejected pickup');
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(22,'09:00'),pickupLocation:'spadina'});
assert.equal(res.code,200);assert.match(sent.order.lineItems.at(-1).name,/^Pickup at 70 Spadina Road: Sunday, November 22, 2026/);
// Orders from before this option existed, and shipping orders, behave as they did.
res=await call({cartItems,fulfillmentType:'PICKUP',fulfillmentDateTime:at(18,'13:30')});
assert.equal(res.code,200);assert.equal(sent.order.fulfillments[0].pickupDetails.note,undefined);assert.match(sent.order.lineItems.at(-1).name,/^Pickup: Wednesday/);
res=await call({cartItems,fulfillmentType:'SHIPMENT',fulfillmentDateTime:at(22,'12:00'),pickupLocation:'woodbine'});
assert.equal(res.code,200);assert.equal(sent.order.fulfillments[0].type,'SHIPMENT');assert.match(sent.order.lineItems.at(-1).name,/^Ships by:/);
console.log('pickup rules OK');
