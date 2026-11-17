// Browser checks for the pickup location choice in the cake cart. Run: node tests/pickup.e2e.mjs
// The browser clock is pinned to Wednesday 6 January 2027, 3:00 pm Toronto time.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {start} from './serve.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const shots=process.env.SHOT_DIR||'';
const {server,url}=await start();const browser=await chromium.launch();
const NOW=new Date('2027-01-06T15:00:00-05:00');
const THURSDAY='2027-01-07',SUNDAY='2027-01-10',WEDNESDAY='2027-01-13';

const context=await browser.newContext({viewport:{width:1100,height:900},timezoneId:'America/Toronto'});
const errors=[];const calls=[];
await context.addInitScript(()=>localStorage.setItem('sq_cart',JSON.stringify([{variationId:'VAR1',name:'Classic Rum Cake',variationName:'Regular',priceCents:4500,quantity:1,imageUrl:null}])));
async function cartPage(path='/'){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(NOW);
  await page.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  // Playwright tries the most recently added route first, so the specific checkout route goes last.
  await page.route('**/api/**',r=>r.fulfill({json:{items:[],categories:[],reviews:[]}}));
  await page.route('**/api/checkout',r=>{calls.push(r.request().postDataJSON());return r.fulfill({json:{url:url+'/confirmation.html'}});});
  await page.goto(url+path);
  return page;
}
let page=await cartPage();
await page.evaluate(()=>openCart());
await page.waitForSelector('#pickup-location');
const error=()=>page.locator('#pickup-location-error').innerText();
const pay=async()=>{const before=calls.length;await page.click('#btn-checkout-main');await page.waitForTimeout(150);return calls.length>before;};

// Both locations are offered with their hours; Spadina is selected first.
assert.deepEqual(await page.locator('#pickup-location label').allInnerTexts().then(a=>a.map(s=>s.replace(/\s+/g,' ').trim())),
  ['70 Spadina Road Every day, 12 to 7 pm','7270 Woodbine Avenue Cravins Caribbean Grill · Monday to Saturday, 12 to 5 pm']);
assert.equal(await page.isChecked('input[name=pickup-location][value=spadina]'),true);
assert.deepEqual([await page.getAttribute('#fulfillment-time','min'),await page.getAttribute('#fulfillment-time','max')],['12:00','19:00']);

// No date yet: checkout is held back with an explanation.
assert.equal(await pay(),false);
assert.ok((await error()).startsWith('Choose a pickup date. 70 Spadina Road pickup is available every day, between 12:00 pm and 7:00 pm.'));

// Spadina: Sunday is fine inside 12 to 7, refused outside it.
await page.fill('#fulfillment-date',SUNDAY);
await page.fill('#fulfillment-time','09:30');
assert.ok((await error()).includes('between 12:00 pm and 7:00 pm'));
assert.equal(await pay(),false);
await page.fill('#fulfillment-time','19:30');
assert.ok((await error()).includes('between 12:00 pm and 7:00 pm'));

// 24 hours' notice: it is Wednesday 3:00 pm, so Thursday 2:30 pm is too soon and Thursday 3:00 pm is fine.
await page.fill('#fulfillment-date',THURSDAY);
await page.fill('#fulfillment-time','14:30');
assert.equal(await error(),"Pickups need at least 24 hours' notice. Choose a time after Thursday, January 7 at 3:00 p.m.");
assert.equal(await pay(),false);
if(shots)await page.locator('#fulfillment-select').screenshot({path:`${shots}/pickup-notice.png`});
await page.fill('#fulfillment-time','15:00');
assert.equal(await error(),'');

// Woodbine: switching moves an out-of-hours time into range and narrows the time field to 12 to 5.
await page.fill('#fulfillment-date',WEDNESDAY);
await page.fill('#fulfillment-time','18:30');
await page.check('input[name=pickup-location][value=woodbine]');
assert.equal(await page.inputValue('#fulfillment-time'),'12:00');
assert.deepEqual([await page.getAttribute('#fulfillment-time','min'),await page.getAttribute('#fulfillment-time','max')],['12:00','17:00']);
await page.fill('#fulfillment-date',SUNDAY);
assert.ok((await error()).includes('not available on Sundays'));
assert.equal(await pay(),false);
await page.fill('#fulfillment-date',WEDNESDAY);
await page.fill('#fulfillment-time','17:30');
assert.ok((await error()).includes('between 12:00 pm and 5:00 pm'));
assert.equal(await pay(),false);
if(shots)await page.locator('#fulfillment-select').screenshot({path:`${shots}/pickup-woodbine.png`});
await page.fill('#fulfillment-time','15:00');
assert.equal(await error(),'');
// Shipping hides the choice and skips the pickup rules.
await page.click('.fulfillment-btn[data-type=SHIPMENT]');
assert.equal(await page.isVisible('#pickup-location'),false);
await page.click('.fulfillment-btn[data-type=PICKUP]');
assert.equal(await page.isVisible('#pickup-location'),true);
assert.equal(calls.length,0,'nothing should have reached checkout yet');
await page.click('#btn-checkout-main');
await page.waitForURL('**/confirmation.html');
assert.equal(calls.length,1);
assert.equal(calls[0].pickupLocation,'woodbine');assert.equal(calls[0].fulfillmentType,'PICKUP');
assert.equal(calls[0].fulfillmentDateTime,new Date('2027-01-13T15:00:00-05:00').toISOString());
await page.close();

// Spadina on a Sunday evening goes through.
page=await cartPage();await page.evaluate(()=>openCart());
await page.fill('#fulfillment-date',SUNDAY);await page.fill('#fulfillment-time','18:30');
await page.click('#btn-checkout-main');await page.waitForURL('**/confirmation.html');
assert.equal(calls.at(-1).pickupLocation,'spadina');
assert.equal(calls.at(-1).fulfillmentDateTime,new Date('2027-01-10T18:30:00-05:00').toISOString());
await page.close();

// The shop and product pages load the same control and rules.
for(const path of ['/shop.html','/product.html']){
  const p=await cartPage(path);
  await p.waitForSelector('#pickup-location',{state:'attached'});
  assert.match(await p.evaluate(()=>window.ASGPickup.check('PICKUP').error),/^Choose a pickup date/,path);
  assert.deepEqual(await p.evaluate(()=>window.ASGPickup.check('SHIPMENT')),{},path);
  await p.close();
}
assert.deepEqual(errors,[]);
await browser.close();server.close();console.log('pickup choice OK');
