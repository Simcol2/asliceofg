// Browser checks for the rum cake cart order form. Square, Supabase and the booking API are mocked,
// so no card is charged and no reservation is created. Run: node tests/order-form.e2e.mjs
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {start} from './serve.mjs';

// Resolved with require so a globally installed Playwright works as well as a local one.
const {chromium}=createRequire(import.meta.url)('playwright');
const shots=process.env.SHOT_DIR||'';
const {server,url}=await start();
const browser=await chromium.launch();
const iso=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const shift=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const long=date=>new Intl.DateTimeFormat('en-CA',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const fakeSquare=`window.Square={payments(appId,locationId){window.__squareInit={appId,locationId};return {card:async()=>({attach:async sel=>{document.querySelector(sel).innerHTML='<input aria-label="Card number (test)">';},tokenize:async opts=>{window.__tokenize=opts;return {status:'OK',token:'cnon:test-token'};}})};}};`;
let passed=0;

async function open({viewport={width:1280,height:900},available=1,booking,catalog}={}){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const calls={booking:[],availability:[]};const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin===url)return route.continue();
    if(u.hostname==='web.squarecdn.com')return route.fulfill({contentType:'text/javascript',body:fakeSquare});
    if(u.pathname.endsWith('/rpc/get_reservation_item_availability')){calls.availability.push(route.request().postDataJSON());return available==='fail'?route.abort():route.fulfill({json:available});}
    return route.abort();
  });
  await page.route('**/api/events-catalog',route=>route.fulfill({json:catalog||{products:[{rentalId:600,name:'A Slice of G Rum Cake Cart',priceCents:39900,bookable:true}]}}));
  await page.route('**/rentals/api/square?resource=g-events-booking',route=>{
    calls.booking.push(route.request().postDataJSON());
    if(booking==='drop')return route.abort();
    return route.fulfill(booking||{json:{ok:true,bookingNumber:'ASG-R-1042',reservationId:42,depositPaid:true,redirectUrl:'/checkout-success?square_deposit_paid=1&booking=ASG-R-1042'}});
  });
  await page.goto(`${url}/book-rum-cake-cart`);
  await page.waitForFunction(()=>window.__squareInit);
  return {page,calls,errors,context};
}
async function fillBasics(page,{date,postal='M5V 2T6'}){
  await page.fill('#co-date',date);
  await page.fill('#co-venue','The Great Hall');
  await page.fill('#co-address','1087 Queen Street West, Toronto');
  await page.fill('#co-postal',postal);
  await page.fill('#co-name','Test Customer');
  await page.fill('#co-email','test.customer@example.com');
  await page.fill('#co-phone','416-555-0100');
}
async function acceptContract(page){
  await page.click('#co-open-contract');
  await page.waitForSelector('#co-contract-dialog[open]');
  await page.click('#co-contract-reviewed');
  await page.check('#co-accept');
}
async function test(name,fn){try{await fn();passed++;console.log(`ok   ${name}`);}catch(e){console.error(`FAIL ${name}\n${e.stack}`);process.exitCode=1;}}
const text=(page,sel)=>page.locator(sel).innerText();

await test('cart only: totals, validation, contract gate, payload and confirmation',async()=>{
  const {page,calls,errors,context}=await open();
  const date=iso(45);
  assert.deepEqual(await page.evaluate(()=>window.__squareInit),{appId:'sq0idp-Gcdk075dVK6KiWrqZFTOGA',locationId:'LAJ0T04RDKRS7'});
  assert.equal(await text(page,'#co-total'),'$399.00');
  assert.equal(await text(page,'#co-due-today'),'$199.50');
  assert.equal(await text(page,'#co-sum-balance'),'$199.50');
  assert.equal(await text(page,'#co-sum-security'),'$150.00');
  // Submitting an empty form lists what is missing and charges nothing.
  await page.click('#co-pay');
  const missing=await text(page,'#co-missing');
  for(const expected of ['Choose a future event date.','complete event delivery address','eligible Toronto or GTA postal code','Enter your full name.','valid email','review the contract'])assert.ok(missing.includes(expected),`missing list lacks "${expected}"`);
  assert.equal(calls.booking.length,0);
  // The acceptance checkbox stays locked until the contract has been opened and reviewed.
  assert.equal(await page.isDisabled('#co-accept'),true);
  await page.click('#co-open-contract');
  await page.waitForFunction(()=>document.querySelector('#co-contract-body').innerText.length>3000);
  const contract=await text(page,'#co-contract-body');
  for(const expected of ['Event Rental Terms & Conditions','Booking & payments','Cancellations, changes & rescheduling','Refundable equipment security deposit'])assert.ok(contract.includes(expected),`contract lacks "${expected}"`);
  assert.equal(await page.locator('#co-contract-body script, #co-contract-body style, #co-contract-body nav').count(),0);
  if(shots)await page.screenshot({path:`${shots}/contract-dialog.png`});
  await page.click('#co-contract-reviewed');
  assert.equal(await page.isDisabled('#co-accept'),false);
  await page.check('#co-accept');
  await fillBasics(page,{date});
  await page.waitForSelector('#co-date-status[data-state=ok]');
  assert.deepEqual(calls.availability.at(-1),{p_item_id:600,p_pickup:shift(date,-1),p_dropoff:shift(date,1)});
  assert.ok((await text(page,'#co-postal-status')).includes('included at no extra charge'));
  assert.equal(await text(page,'#co-sched-balance-when'),`Due ${long(shift(date,-8))}`);
  assert.equal(await text(page,'#co-sched-security-when'),`Due ${long(shift(date,-3))}`);
  assert.equal(await text(page,'#co-pay'),'PAY $199.50 BOOKING DEPOSIT');
  // Errors from the earlier empty submit clear as each field is corrected.
  assert.equal(await page.locator('#co-form [aria-invalid=true]').count(),0);
  assert.equal(await page.isVisible('#co-missing'),false);
  if(shots)await page.screenshot({path:`${shots}/form-desktop.png`,fullPage:true});
  await page.click('#co-pay');
  await page.waitForSelector('#co-confirmation:not([hidden])');
  assert.equal(calls.booking.length,1);
  assert.deepEqual(calls.booking[0],{
    customer:{name:'Test Customer',email:'test.customer@example.com',phone:'416-555-0100'},
    rentalDates:{event:date,pickup:shift(date,-1),dropoff:shift(date,1),pickupTime:'09:00',dropoffTime:'21:00',earlyPickupDays:0,extendedReturnDays:0,extraDayFeeCents:0},
    items:[{id:600,kind:'rental',meta:null,quantity:1}],
    gEvents:{venueName:'The Great Hall',venueAddress:'1087 Queen Street West, Toronto',postalCode:'M5V 2T6',agreementAccepted:true,agreementReviewed:true,agreementVersion:'asg-events-terms-2026-10-08',package:null},
    paymentToken:'cnon:test-token',saveCardOnFile:true,manualPaymentAcknowledged:false,
  });
  const tokenize=await page.evaluate(()=>window.__tokenize);
  assert.equal(tokenize.amount,'199.50');assert.equal(tokenize.intent,'CHARGE_AND_STORE');assert.equal(tokenize.currencyCode,'CAD');
  assert.deepEqual(tokenize.billingContact,{givenName:'Test',familyName:'Customer',email:'test.customer@example.com',phone:'416-555-0100',countryCode:'CA'});
  assert.equal(await text(page,'#co-confirm-number'),'ASG-R-1042');
  const confirmation=await text(page,'#co-confirmation');
  for(const expected of ['$199.50','$150.00',long(date),long(shift(date,-8)),long(shift(date,-3)),'test.customer@example.com','Paid today','card is on file'])assert.ok(confirmation.includes(expected),`confirmation lacks "${expected}"`);
  assert.equal(await page.isVisible('#co-form'),false);
  if(shots)await page.screenshot({path:`${shots}/confirmation.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  await context.close();
});

await test('staffed package in the extended area with manual later payments',async()=>{
  const {page,calls,errors,context}=await open();
  const date=iso(60);
  await page.check('input[name=kind][value=staffed]');
  await page.selectOption('#co-guests','150');
  await page.check('#co-treats input[value=ring]');
  await page.check('input[name=hours][value="4"]');
  await fillBasics(page,{date,postal:'l5b 3c2'});
  // 39900 cart + 75 x 325 slices + 75 x 375 rings + 2 attendants x 34500 + 5000 delivery = 166400
  assert.equal(await text(page,'#co-total'),'$1,664.00');
  assert.equal(await text(page,'#co-due-today'),'$832.00');
  assert.equal(await text(page,'#co-sum-balance'),'$832.00');
  assert.equal(await text(page,'#co-sum-security'),'$300.00');
  const summary=await text(page,'#co-summary-lines');
  for(const expected of ['75 × $3.25','$243.75','75 × $3.75','$281.25','2 attendants × 4 hours','$690.00','Extended GTA area','$50.00'])assert.ok(summary.includes(expected),`summary lacks "${expected}"`);
  await page.check('input[name=future][value=manual]');
  await acceptContract(page);
  await page.waitForSelector('#co-date-status[data-state=ok]');
  await page.click('#co-pay');
  await page.waitForSelector('#co-confirmation:not([hidden])');
  const sent=calls.booking[0];
  assert.deepEqual(sent.gEvents.package,{kind:'staffed',guests:150,hours:4,treats:['slice','ring']});
  assert.equal(sent.gEvents.postalCode,'L5B 3C2');
  assert.equal(sent.saveCardOnFile,false);assert.equal(sent.manualPaymentAcknowledged,true);
  assert.equal((await page.evaluate(()=>window.__tokenize)).intent,'CHARGE');
  assert.equal((await page.evaluate(()=>window.__tokenize)).amount,'832.00');
  assert.ok((await text(page,'#co-confirm-intro')).includes('pay the remaining amounts below in your client portal'));
  assert.deepEqual(errors,[]);
  await context.close();
});

await test('dessert split is shown, adjustable and validated; Gramma cookies take a colour or a chocolate upgrade',async()=>{
  const {page,calls,errors,context}=await open();
  const qty=id=>page.inputValue(`#co-qty-${id}`);
  await page.check('input[name=kind][value=treats]');
  await page.selectOption('#co-guests','50');
  // One treat takes the whole order and cannot be edited.
  assert.equal(await qty('slice'),'50');
  assert.equal(await page.getAttribute('#co-qty-slice','readonly'),'');
  await page.check('#co-treats input[value=ring]');
  assert.deepEqual([await qty('slice'),await qty('ring')],['25','25']);
  assert.equal(await text(page,'#co-split-status'),'50 of 50 treats allocated.');
  assert.equal(await text(page,'[data-treat-line=slice]'),'25 × $3.50 = $87.50');
  assert.equal(await page.isVisible('#co-split-reset'),false);
  // With two treats, changing one rebalances the other.
  await page.fill('#co-qty-slice','30');
  assert.equal(await qty('ring'),'20');
  assert.equal(await text(page,'#co-total'),'$584.00'); // 39900 + 30 x 350 + 20 x 400
  assert.equal(await page.isVisible('#co-split-reset'),true);
  // Adding cookies restarts from the suggested split and reveals the cookie options.
  assert.equal(await page.isVisible('#co-cookie'),false);
  await page.check('#co-treats input[value=cookie]');
  assert.deepEqual([await qty('slice'),await qty('ring'),await qty('cookie')],['25','13','12']);
  assert.equal(await page.isVisible('#co-cookie'),true);
  assert.ok((await text(page,'#co-cookie')).includes('white and one colour of your choice'));
  assert.ok((await text(page,'[data-treat-line=cookie]')).startsWith('12 × $3.25 = $39.00'));
  // A split that does not add up is explained and blocks payment.
  await page.fill('#co-qty-slice','10');await page.fill('#co-qty-ring','10');await page.fill('#co-qty-cookie','20');
  assert.equal(await text(page,'#co-split-status'),'40 of 50 treats allocated. Add 10 more.');
  assert.equal(await text(page,'#co-package-error'),'Your treat quantities add up to 40. They need to total 50.');
  await page.fill('#co-qty-cookie','45');
  assert.equal(await text(page,'#co-split-status'),'65 of 50 treats allocated. Remove 15.');
  await page.fill('#co-qty-cookie','30');
  assert.equal(await text(page,'#co-split-status'),'50 of 50 treats allocated.');
  await fillBasics(page,{date:iso(40)});
  await acceptContract(page);
  await page.waitForSelector('#co-date-status[data-state=ok]');
  // Icing needs one colour before payment.
  await page.click('#co-pay');
  assert.ok((await text(page,'#co-missing')).includes('Enter one icing colour for your Gramma cookies.'));
  assert.equal(await text(page,'#co-cookie-color-error'),'Enter one icing colour for your Gramma cookies.');
  assert.equal(calls.booking.length,0);
  // Chocolate dipped: 75 cents more per cookie, and no colour needed.
  await page.check('input[name=cookieFinish][value=chocolate]');
  assert.equal(await page.isVisible('#co-cookie-color'),false);
  assert.ok((await text(page,'#co-cookie-upgrade')).includes('$0.75 per cookie'));
  assert.equal(await text(page,'#co-total'),'$594.00'); // 39900 + 3500 + 4000 + 30 x 400
  assert.equal(await page.isVisible('#co-missing'),false);
  // Back to icing with a colour: 30 cookies at the standard $3.25.
  await page.check('input[name=cookieFinish][value=icing]');
  await page.fill('#co-cookie-color','  Blush   pink ');
  assert.equal(await text(page,'#co-total'),'$571.50'); // 39900 + 3500 + 4000 + 30 x 325
  assert.equal(await text(page,'#co-due-today'),'$285.75');
  assert.ok((await text(page,'#co-summary-lines')).includes('Gramma Cookies, rum kissed icing (white, Blush pink, gold accents)'));
  if(shots)await page.locator('#co-package').screenshot({path:`${shots}/split-desktop.png`});
  await page.click('#co-pay');
  await page.waitForSelector('#co-confirmation:not([hidden])');
  assert.deepEqual(calls.booking[0].gEvents.package,{kind:'treats',guests:50,hours:0,treats:['slice','ring','cookie'],quantities:{slice:10,ring:10,cookie:30},cookie:{finish:'icing',color:'Blush pink'}});
  assert.equal((await page.evaluate(()=>window.__tokenize)).amount,'285.75');
  assert.deepEqual(errors,[]);
  await context.close();
});

await test('reset returns to the suggested split and volume cookie pricing applies above 50',async()=>{
  const {page,context}=await open({viewport:{width:375,height:740}});
  await page.check('input[name=kind][value=treats]');
  await page.check('#co-treats input[value=cookie]');
  assert.deepEqual([await page.inputValue('#co-qty-slice'),await page.inputValue('#co-qty-cookie')],['50','50']);
  await page.fill('#co-qty-cookie','51');
  assert.equal(await page.inputValue('#co-qty-slice'),'49');
  assert.ok((await text(page,'[data-treat-line=cookie]')).startsWith('51 × $3.00 = $153.00'));
  await page.check('input[name=cookieFinish][value=chocolate]');
  assert.ok((await text(page,'[data-treat-line=cookie]')).startsWith('51 × $3.75 = $191.25'));
  await page.click('#co-split-reset');
  assert.deepEqual([await page.inputValue('#co-qty-slice'),await page.inputValue('#co-qty-cookie')],['50','50']);
  assert.equal(await page.isVisible('#co-split-reset'),false);
  // Changing the total restarts the suggested split for the new size.
  await page.fill('#co-qty-cookie','60');
  await page.selectOption('#co-guests','200');
  assert.deepEqual([await page.inputValue('#co-qty-slice'),await page.inputValue('#co-qty-cookie')],['100','100']);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,`horizontal overflow of ${overflow}px`);
  if(shots)await page.locator('#co-package').screenshot({path:`${shots}/split-mobile.png`});
  await context.close();
});

await test('unavailable date and out-of-area postal code block payment',async()=>{
  const {page,calls,context}=await open({available:0});
  await fillBasics(page,{date:iso(20),postal:'K1A 0B1'});
  await page.waitForSelector('#co-date-status[data-state=bad]');
  assert.ok((await text(page,'#co-postal-status')).includes('outside our online booking area'));
  await acceptContract(page);
  await page.click('#co-pay');
  const missing=await text(page,'#co-missing');
  assert.ok(missing.includes('not available on that date'));assert.ok(missing.includes('eligible Toronto or GTA postal code'));
  assert.equal(calls.booking.length,0);
  assert.equal(await page.evaluate(()=>window.__tokenize),undefined);
  await context.close();
});

await test('server rejection shows the reason and keeps the form usable',async()=>{
  const {page,calls,context}=await open({booking:{status:500,json:{error:'A Slice of G Rum Cake Cart is no longer available for those dates.'}}});
  await fillBasics(page,{date:iso(30)});
  await acceptContract(page);
  await page.waitForSelector('#co-date-status[data-state=ok]');
  await page.click('#co-pay');
  await page.waitForSelector('#co-form-error:not([hidden])');
  assert.ok((await text(page,'#co-form-error')).includes('no longer available for those dates'));
  assert.equal(await page.isVisible('#co-confirmation'),false);
  assert.equal(await page.getAttribute('#co-pay','aria-disabled'),'false');
  assert.equal(calls.booking.length,1);
  await context.close();
});

await test('lost connection after sending warns against paying twice',async()=>{
  const {page,context}=await open({booking:'drop'});
  await fillBasics(page,{date:iso(30)});
  await acceptContract(page);
  await page.waitForSelector('#co-date-status[data-state=ok]');
  await page.click('#co-pay');
  await page.waitForSelector('#co-form-error:not([hidden])');
  assert.ok((await text(page,'#co-form-error')).includes('Please do not pay again yet'));
  await context.close();
});

await test('availability check failure does not block, close events show immediate due dates',async()=>{
  const {page,calls,context}=await open({available:'fail'});
  await fillBasics(page,{date:iso(2)});
  await page.waitForFunction(()=>document.querySelector('#co-date-status').innerText.includes('could not check availability'));
  assert.equal(await text(page,'#co-sched-balance-when'),'Due right away because your event is close');
  assert.equal(await text(page,'#co-sched-security-when'),'Due right away because your event is close');
  await acceptContract(page);
  await page.click('#co-pay');
  await page.waitForSelector('#co-confirmation:not([hidden])');
  assert.equal(calls.booking.length,1);
  await context.close();
});

await test('live catalog price is used and an unbookable cart blocks checkout',async()=>{
  const {page,calls,context}=await open({catalog:{products:[{rentalId:600,priceCents:45000,bookable:false}]}});
  await page.waitForFunction(()=>document.querySelector('#co-total').innerText==='$450.00');
  assert.equal(await text(page,'#co-due-today'),'$225.00');
  await fillBasics(page,{date:iso(30)});
  await page.waitForSelector('#co-date-status[data-state=bad]');
  await acceptContract(page);
  await page.click('#co-pay');
  assert.equal(calls.booking.length,0);
  await context.close();
});

await test('mobile layout has no horizontal overflow and keyboard reaches the pay button',async()=>{
  const {page,context}=await open({viewport:{width:375,height:740}});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,`horizontal overflow of ${overflow}px`);
  const unlabeled=await page.evaluate(()=>[...document.querySelectorAll('#co-form input:not([type=radio]):not([type=checkbox]),#co-form select,#co-form textarea')].filter(el=>el.id&&!document.querySelector(`label[for="${el.id}"]`)).map(el=>el.id));
  assert.deepEqual(unlabeled,[]);
  if(shots)await page.screenshot({path:`${shots}/form-mobile.png`,fullPage:true});
  await context.close();
});

await browser.close();server.close();
console.log(`${passed} passed`);
