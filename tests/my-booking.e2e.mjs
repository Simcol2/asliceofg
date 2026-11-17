// Browser checks for the booking portal page. Supabase sign-in and the Events APIs are mocked.
// Run: node tests/my-booking.e2e.mjs
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {start} from './serve.mjs';

const {chromium}=createRequire(import.meta.url)('playwright');
const shots=process.env.SHOT_DIR||'';
const {server,url}=await start();
const browser=await chromium.launch();
let passed=0;
async function test(name,fn){try{await fn();passed++;console.log(`ok   ${name}`);}catch(e){console.error(`FAIL ${name}\n${e.stack}`);process.exitCode=1;}}

const fakeSupabase=session=>`
const listeners=[];let session=${JSON.stringify(session)};window.__auth=[];
const emit=()=>listeners.forEach(fn=>fn('SIGNED_IN',session));
export function createClient(url,key){window.__client={url,key};return {auth:{
  getSession:async()=>({data:{session}}),
  onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
  signInWithPassword:async c=>{window.__auth.push(['password',c]);if(c.password!=='correct-horse')return {error:{message:'Invalid login credentials'}};session={access_token:'tok-1',user:{id:'u1',email:c.email}};emit();return {data:{session},error:null};},
  signUp:async c=>{window.__auth.push(['signup',c]);return {data:{session:null},error:null};},
  signInWithOtp:async c=>{window.__auth.push(['otp',c]);return {error:null};},
  signInWithOAuth:async c=>{window.__auth.push(['oauth',c]);return {error:null};},
  signOut:async()=>{session=null;listeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null};},
}};}`;

const pkg={kind:'staffed',version:'g-events-packages-v1',guests:150,hours:4,attendants:2,
  lines:[{id:'slice',name:'Rum Cake Slices',quantity:75,unitCents:325,totalCents:24375},{id:'ring',name:'Rum Rings',quantity:75,unitCents:375,totalCents:28125}],
  treatCents:52500,staffCents:69000,addonsCents:121500};
const reservation={id:42,booking_number:'ASG-R-1042',status:'pending',service_style:'g_events_delivery_setup_collection_included',payment_provider:'square',
  event_date:'2027-06-12',pickup_date:'2027-06-11',pickup_at:'2027-06-11T13:00:00.000Z',venue_name:'The Great Hall',venue_address:'1087 Queen Street West, Toronto',
  rental_total_cents:166400,booking_deposit_cents:83200,balance_due_cents:83200,security_deposit_cents:30000,currency:'cad',future_payment_method:'card_on_file',
  notes:`G Events delivery-only | Postal code: L5B3C2 | Travel charge: 5000 cents | Agreement: asg-events-terms-2026-10-08 acknowledged; archived copy stored separately | Delivery/setup/collection INCLUDED in item price | Delivery and collection schedule to be coordinated with client; inventory hold dates are not appointment times. Treat package: ${JSON.stringify(pkg)}`,
  accepted_event_agreement:{reservation_id:42,agreement_version:'asg-events-terms-2026-10-08',accepted_at:'2026-11-17T15:04:00.000Z',snapshot_sha256:'abcdef0123456789abcdef',
    terms_html:'<html><body><h1>Event Rental Terms &amp; Conditions</h1><p>Archived copy.</p><script>parent.__escaped=true</script></body></html>',accessibility_html:'<html><body><h1>Accessibility</h1></body></html>'}};
const portal={customer:{id:7,name:'Test Customer',email:'test.customer@example.com'},reservations:[reservation],
  reservationItems:[{id:1,reservation_id:42,item_id:600,quantity:1,item:{id:600,name:'A Slice of G Rum Cake Cart'}}],contracts:[],transactions:[],purchases:[],purchaseItems:[],requests:[]};
const square={reservations:[{id:42,future_payment_method:'card_on_file',balance_due_at:null,security_deposit_due_at:null,pickup_at:'2027-06-11T13:00:00.000Z',pickup_date:'2027-06-11'}],
  transactions:[{id:1,reservation_id:42,kind:'booking_deposit',amount_cents:83200,status:'paid',paid_at:'2026-11-17T15:05:00.000Z'}]};

async function open({session=null,portalResponse={json:portal},squareResponse={json:square},viewport={width:1180,height:900}}={}){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  const errors=[];const seen=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin===url)return route.continue();
    if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:fakeSupabase(session)});
    return route.abort();
  });
  await page.route('**/rentals/api/client-portal',route=>{seen.push(['portal',route.request().headers().authorization]);return route.fulfill(portalResponse);});
  await page.route('**/rentals/api/square?resource=portal',route=>{seen.push(['square',route.request().headers().authorization]);return squareResponse==='drop'?route.abort():route.fulfill(squareResponse);});
  await page.goto(`${url}/my-booking`);
  return {page,errors,seen,context};
}
const signedIn={access_token:'tok-1',user:{id:'u1',email:'test.customer@example.com'}};
const text=(page,sel)=>page.locator(sel).innerText();

await test('signed-out visitor sees sign-in, bad password is reported, good password loads the booking',async()=>{
  const {page,errors,seen,context}=await open();
  await page.waitForSelector('#mb-auth:not([hidden])');
  assert.equal(await page.isVisible('#mb-content'),false);
  assert.equal((await page.evaluate(()=>window.__client)).url,'https://rsexseihtkaqoxccrylk.supabase.co');
  await page.fill('#mb-email','test.customer@example.com');await page.fill('#mb-password','wrong-password');
  await page.click('#mb-auth-submit');
  await page.waitForSelector('#mb-auth-error:not([hidden])');
  assert.equal(await text(page,'#mb-auth-error'),'Invalid login credentials');
  await page.click('.mb-tabs [data-mode=magic]');
  assert.equal(await page.isVisible('#mb-password'),false);
  await page.click('#mb-auth-submit');
  await page.waitForSelector('#mb-auth-sent:not([hidden])');
  assert.deepEqual((await page.evaluate(()=>window.__auth)).at(-1),['otp',{email:'test.customer@example.com',options:{emailRedirectTo:`${url}/my-booking`,shouldCreateUser:true}}]);
  if(shots)await page.screenshot({path:`${shots}/portal-signin.png`});
  await page.click('.mb-tabs [data-mode=password]');
  await page.fill('#mb-password','correct-horse');await page.click('#mb-auth-submit');
  await page.waitForSelector('.mb-card[aria-label="Booking ASG-R-1042"]');
  assert.deepEqual(seen,[['portal','Bearer tok-1'],['square','Bearer tok-1']]);
  assert.deepEqual(errors,[]);
  await context.close();
});

await test('booking shows payments, an invoice that adds up, and the accepted contract',async()=>{
  const {page,errors,context}=await open({session:signedIn});
  await page.waitForSelector('.mb-card[aria-label="Booking ASG-R-1042"]');
  const card=await text(page,'.mb-card[aria-label="Booking ASG-R-1042"]');
  for(const expected of ['RESERVED','ASG-R-1042','Sat, June 12, 2027','The Great Hall, 1087 Queen Street West, Toronto','$1,664.00'])assert.ok(card.includes(expected),`card lacks "${expected}"`);
  // Payments: deposit paid, balance 7 days and security deposit 48 hours before the 9 a.m. delivery window on June 11.
  const payments=await page.locator('section[aria-label=Payments] tbody tr').allInnerTexts();
  assert.equal(payments.length,3);
  assert.ok(/Booking deposit \(50%\)[\s\S]*Paid Tue, November 17, 2026[\s\S]*PAID[\s\S]*\$832\.00/.test(payments[0]),payments[0]);
  assert.ok(/Remaining balance[\s\S]*Due Fri, June 4, 2027 · Charged automatically to your card on file[\s\S]*SCHEDULED[\s\S]*\$832\.00/.test(payments[1]),payments[1]);
  assert.ok(/Refundable security deposit[\s\S]*Due Wed, June 9, 2027 · Charged automatically[\s\S]*SCHEDULED[\s\S]*\$300\.00/.test(payments[2]),payments[2]);
  assert.ok((await text(page,'section[aria-label=Payments] .mb-meta')).startsWith('Next: remaining balance of $832.00.'));
  // Invoice: line amounts must sum to the stored booking total.
  const amounts=await page.locator('section[aria-label=Invoice] tbody tr td:last-child').allInnerTexts();
  assert.deepEqual(amounts,['$399.00','$243.75','$281.25','$690.00','$50.00']);
  assert.equal(amounts.reduce((sum,a)=>sum+Math.round(Number(a.replace(/[$,]/g,''))*100),0),166400);
  const foot=await page.locator('section[aria-label=Invoice] tfoot tr').allInnerTexts();
  assert.ok(foot[0].includes('$1,664.00'));assert.ok(foot[1].includes('− $832.00'));assert.ok(foot[2].includes('$832.00'));
  assert.ok((await text(page,'section[aria-label=Invoice]')).includes('Billed to Test Customer · test.customer@example.com'));
  // Contract: the archived copy opens in a sandbox that cannot run scripts.
  assert.ok((await text(page,'section[aria-label=Contract]')).includes('accepted Tue, November 17, 2026'));
  await page.click('text=View my accepted contract');
  const frame=page.frameLocator('iframe[title="Your accepted Event Rental Terms & Conditions"]');
  await frame.locator('h1').waitFor();
  assert.equal(await frame.locator('h1').innerText(),'Event Rental Terms & Conditions');
  assert.equal(await page.getAttribute('iframe.mb-contract-frame','sandbox'),'');
  assert.equal(await page.evaluate(()=>window.__escaped),undefined);
  assert.equal(await page.getAttribute('.mb-card .mb-actions a.co-button','href'),'/rentals/client');
  if(shots)await page.screenshot({path:`${shots}/portal-booking.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  await context.close();
});

await test('paid-in-full booking, unparseable notes and manual payer are handled',async()=>{
  const r={...reservation,notes:'Treat package: {broken',future_payment_method:'manual'};
  const sq={reservations:[{id:42,future_payment_method:'manual',balance_due_at:'2027-06-04T13:00:00.000Z',security_deposit_due_at:'2027-06-09T13:00:00.000Z'}],
    transactions:[{reservation_id:42,kind:'booking_deposit',amount_cents:83200,status:'paid',paid_at:'2026-11-17T15:05:00.000Z'},{reservation_id:42,kind:'balance',amount_cents:83200,status:'paid',paid_at:'2027-06-01T15:05:00.000Z'}]};
  const {page,context}=await open({session:signedIn,portalResponse:{json:{...portal,reservations:[r]}},squareResponse:{json:sq}});
  await page.waitForSelector('.mb-card[aria-label="Booking ASG-R-1042"]');
  assert.deepEqual(await page.locator('section[aria-label=Invoice] tbody tr td:last-child').allInnerTexts(),['$1,664.00']);
  const foot=await page.locator('section[aria-label=Invoice] tfoot tr').allInnerTexts();
  assert.ok(foot[1].includes('− $1,664.00'));assert.ok(foot[2].includes('$0.00'));
  const payments=await page.locator('section[aria-label=Payments] tbody tr').allInnerTexts();
  assert.ok(payments[1].includes('PAID'));
  assert.ok(/Due Wed, June 9, 2027 · Pay in your client portal before the due date[\s\S]*UPCOMING/.test(payments[2]),payments[2]);
  await context.close();
});

await test('no bookings, expired sign-in and payment feed outage each show a clear state',async()=>{
  let run=await open({session:signedIn,portalResponse:{json:{...portal,reservations:[],reservationItems:[]}}});
  await run.page.waitForSelector('#mb-empty:not([hidden])');
  assert.equal(await run.page.locator('.mb-card[aria-label^=Booking]').count(),0);
  await run.context.close();
  run=await open({session:signedIn,portalResponse:{status:401,json:{error:'Your sign-in has expired. Please sign in again.'}}});
  await run.page.waitForSelector('#mb-auth:not([hidden])');
  assert.ok((await text(run.page,'#mb-auth-error')).includes('sign-in has expired'));
  await run.context.close();
  run=await open({session:signedIn,squareResponse:'drop'});
  await run.page.waitForSelector('.mb-card[aria-label="Booking ASG-R-1042"]');
  assert.ok((await text(run.page,'#mb-error')).includes('Live payment status is temporarily unavailable'));
  assert.equal(await run.page.locator('section[aria-label=Invoice] tbody tr').count(),5);
  await run.context.close();
});

await test('mobile layout has no horizontal overflow',async()=>{
  const {page,context}=await open({session:signedIn,viewport:{width:375,height:740}});
  await page.waitForSelector('.mb-card[aria-label="Booking ASG-R-1042"]');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,`horizontal overflow of ${overflow}px`);
  if(shots)await page.screenshot({path:`${shots}/portal-mobile.png`,fullPage:true});
  await context.close();
});

await browser.close();server.close();
console.log(`${passed} passed`);
