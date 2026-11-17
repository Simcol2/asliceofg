// Browser checks for the pickup location choice in the cake cart. Run: node tests/pickup.e2e.mjs
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {start} from './serve.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const shots=process.env.SHOT_DIR||'';
const {server,url}=await start();const browser=await chromium.launch();
// Next Sunday and the Wednesday after it, as yyyy-mm-dd.
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const sunday=new Date();sunday.setDate(sunday.getDate()+((7-sunday.getDay())%7||7));
const wednesday=new Date(sunday);wednesday.setDate(sunday.getDate()+3);

const context=await browser.newContext({viewport:{width:1100,height:900}});const page=await context.newPage();
const errors=[];const calls=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('sq_cart',JSON.stringify([{variationId:'VAR1',name:'Classic Rum Cake',variationName:'Regular',priceCents:4500,quantity:1,imageUrl:null}])));
await page.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
await page.route('**/api/checkout',r=>{calls.push(r.request().postDataJSON());return r.fulfill({json:{url:url+'/confirmation.html'}});});
await page.route('**/api/reviews**',r=>r.fulfill({json:{}}));
await page.goto(url+'/');
await page.evaluate(()=>openCart());
await page.waitForSelector('#pickup-location');
const error=()=>page.locator('#pickup-location-error').innerText();

// Both locations are offered, Spadina first and selected.
assert.deepEqual(await page.locator('#pickup-location label').allInnerTexts().then(a=>a.map(s=>s.replace(/\s+/g,' ').trim())),
  ['70 Spadina Road','7270 Woodbine Avenue Cravins Caribbean Grill · Monday to Saturday, 12 to 5 pm']);
assert.equal(await page.isChecked('input[name=pickup-location][value=spadina]'),true);
// Woodbine limits the time field to 12:00 to 17:00 and moves an out-of-hours time into range.
await page.fill('#fulfillment-time','09:30');
await page.check('input[name=pickup-location][value=woodbine]');
assert.equal(await page.inputValue('#fulfillment-time'),'12:00');
assert.deepEqual([await page.getAttribute('#fulfillment-time','min'),await page.getAttribute('#fulfillment-time','max')],['12:00','17:00']);
// No date yet: checkout is held back with an explanation.
await page.click('#btn-checkout-main');
assert.ok((await error()).startsWith('Choose a pickup date.'));
assert.equal(calls.length,0);
// Sunday is refused straight away, and at checkout.
await page.fill('#fulfillment-date',iso(sunday));
assert.ok((await error()).includes('not available on Sundays'));
await page.click('#btn-checkout-main');
assert.equal(calls.length,0);
// A weekday outside 12 to 5 is refused; inside is accepted.
await page.fill('#fulfillment-date',iso(wednesday));
await page.fill('#fulfillment-time','17:30');
assert.ok((await error()).includes('between 12:00 pm and 5:00 pm'));
await page.click('#btn-checkout-main');
assert.equal(calls.length,0);
if(shots)await page.locator('#fulfillment-select').screenshot({path:`${shots}/pickup-woodbine.png`});
await page.fill('#fulfillment-time','15:00');
assert.equal(await error(),'');
// Shipping hides the location choice and sends none.
await page.click('.fulfillment-btn[data-type=SHIPMENT]');
assert.equal(await page.isVisible('#pickup-location'),false);
await page.click('.fulfillment-btn[data-type=PICKUP]');
assert.equal(await page.isVisible('#pickup-location'),true);
await page.click('#btn-checkout-main');
await page.waitForURL('**/confirmation.html');
assert.equal(calls.length,1);
assert.equal(calls[0].pickupLocation,'woodbine');assert.equal(calls[0].fulfillmentType,'PICKUP');
assert.equal(new Date(calls[0].fulfillmentDateTime).getHours(),15);
assert.deepEqual(errors,[]);

// Spadina on a Sunday morning is fine, as before.
calls.length=0;await page.goto(url+'/');await page.evaluate(()=>openCart());
await page.fill('#fulfillment-date',iso(sunday));await page.fill('#fulfillment-time','09:30');
await page.click('#btn-checkout-main');await page.waitForURL('**/confirmation.html');
assert.equal(calls[0].pickupLocation,'spadina');

// The shop and product pages load the same control.
for(const path of ['/shop.html','/product.html']){
  const p=await context.newPage();await p.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  await p.route('**/api/**',r=>r.fulfill({json:{items:[],categories:[],reviews:[]}}));
  await p.goto(url+path);await p.waitForSelector('#pickup-location',{state:'attached'});
  assert.equal(typeof await p.evaluate(()=>window.ASGPickup.check('PICKUP').id),'string',path);
  assert.deepEqual(await p.evaluate(()=>window.ASGPickup.check('SHIPMENT')),{},path);
  await p.close();
}
await browser.close();server.close();console.log('pickup choice OK');
