// Populate the EXACT same-origin Events cart used by CartContext.jsx.
// /events is reverse-proxied to the Events repository by cake-site vercel.json.
const STORAGE_KEY = 'asliceofg-cart-items-v2';
const DATE_KEY = 'asliceofg-rental-dates-v2';
const selected = new Map();
const list = document.getElementById('square-events-products');
const cart = document.getElementById('square-events-cart');
const money = cents => new Intl.NumberFormat('en-CA', {style:'currency', currency:'CAD'}).format(cents / 100);
function escapeHtml(v) {return String(v ?? '').replace(/[&<>"']/g, a => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]));}
function updateCart() {
  let count = 0, total = 0;
  selected.forEach(v => { count += v.quantity; total += v.quantity * v.priceCents; });
  cart.textContent = `${count} rental item${count === 1 ? '' : 's'} Ã‚Â· ${money(total)}`;
  document.getElementById('square-events-checkout').disabled = count === 0;
}
async function loadProducts() {
  try {
    const response = await fetch('/api/events-catalog', {cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Event products are unavailable');
    if (!data.products?.length) {list.textContent = 'No event rental products are listed in Square yet.';return;}
    list.innerHTML = data.products.map((p, i) => `<article class="ev-sq-card">
      ${p.imageUrl ? `<img loading="lazy" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}">` : '<div class="ev-sq-no-image">A SLICE OF G</div>'}
      <div class="ev-sq-copy"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p>
      <strong>${p.priceCents !== null ? money(p.priceCents) : 'Price on request'}</strong>
      <button type="button" data-i="${i}" ${p.bookable ? '' : 'disabled'}>${p.bookable ? 'Add to Event Cart' : 'Booking unavailable'}</button>
      </div></article>`).join('');
    list.querySelectorAll('button[data-i]').forEach(button => button.addEventListener('click', () => {
      const p = data.products[Number(button.dataset.i)];
      if (!p.bookable || !Number.isSafeInteger(p.rentalId) || p.rentalId <= 0) return;
      const previous = selected.get(p.rentalId);
      selected.set(p.rentalId, {...p, quantity: (previous?.quantity || 0) + 1});
      updateCart();
    }));
  } catch (e) {list.textContent = e.message;}
}
document.getElementById('square-events-checkout').addEventListener('click', () => {
  if (!selected.size) return;
  const existing = (() => {try {const x = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');return Array.isArray(x)?x:[];} catch{return [];}})();
  const incoming = [...selected.values()].map(({rentalId,quantity}) => ({id: rentalId,kind:'rental',meta:null,quantity}));
  incoming.forEach(item => {
    const old = existing.find(v => v.kind === 'rental' && Number(v.id) === item.id && (v.meta == null));
    if (old) old.quantity = Number(old.quantity || 0) + item.quantity;
    else existing.push(item);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  // Intentionally do NOT invent dates: the Events calendar validates them.
  if (!localStorage.getItem(DATE_KEY)) localStorage.setItem(DATE_KEY, JSON.stringify({}));
  window.location.assign('/rentals/decor');
});
loadProducts();
