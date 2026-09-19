// ─── State ───────────────────────────────────────────────────────────────────
let cart = [];
let fulfillmentType = 'PICKUP';
let currentItem = null;
let selectedVariation = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadCartFromStorage();
  bindUI();
  await loadProduct();
});

async function loadProduct() {
  const itemId = new URLSearchParams(window.location.search).get('id');
  if (!itemId) { showError(); return; }

  try {
    const res = await fetch('/api/catalog');
    if (!res.ok) throw new Error('Catalog unavailable');
    const { items } = await res.json();

    const item = items.find(i => i.id === itemId);
    if (!item) { showError(); return; }

    currentItem = item;
    selectedVariation = item.variations[0];
    renderProduct(item);
    document.title = `${item.name} | A Slice of G`;

  } catch (err) {
    console.error(err);
    showError();
  }
}

function showError() {
  document.getElementById('pdp-loading').style.display = 'none';
  document.getElementById('pdp-error').style.display = 'block';
}

function renderProduct(item) {
  document.getElementById('pdp-loading').style.display = 'none';
  document.getElementById('pdp-inner').style.display = 'block';

  const archEl = document.getElementById('pdp-arch');
  archEl.innerHTML = item.imageUrl
    ? `<img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.name)}" />`
    : `<div class="pdp-arch-placeholder">G</div>`;

  document.getElementById('pdp-name').textContent = item.name;

  const descEl = document.getElementById('pdp-desc');
  if (item.description) {
    descEl.textContent = item.description;
  } else {
    descEl.style.display = 'none';
  }

  updatePriceDisplay();

  const varWrap = document.getElementById('pdp-variations');
  if (item.variations.length > 1) {
    varWrap.innerHTML = `
      <label class="pdp-var-label">Size</label>
      <select class="variation-select pdp-select" id="pdp-select">
        ${item.variations.map(v => `
          <option value="${escapeAttr(v.id)}"
            data-price="${v.priceCents}"
            data-currency="${escapeAttr(v.currency)}"
            data-name="${escapeAttr(v.name)}">
            ${escapeHtml(v.name)} — $${(v.priceCents / 100).toFixed(2)}
          </option>
        `).join('')}
      </select>
    `;
    document.getElementById('pdp-select').addEventListener('change', e => {
      const opt = e.target.options[e.target.selectedIndex];
      selectedVariation = {
        id: opt.value,
        name: opt.dataset.name,
        priceCents: parseInt(opt.dataset.price, 10),
        currency: opt.dataset.currency,
      };
      updatePriceDisplay();
    });
  }
}

function updatePriceDisplay() {
  if (!selectedVariation) return;
  const el = document.getElementById('pdp-price');
  if (el) el.textContent = `$${(selectedVariation.priceCents / 100).toFixed(2)}`;
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
function addToCart() {
  if (!currentItem || !selectedVariation) return;

  const name = (currentItem.variations.length > 1 && selectedVariation.name !== 'Regular')
    ? `${currentItem.name} ${selectedVariation.name}`
    : currentItem.name;

  const existing = cart.find(c => c.variationId === selectedVariation.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ variationId: selectedVariation.id, name, priceCents: selectedVariation.priceCents, currency: selectedVariation.currency, quantity: 1 });
  }
  saveCartToStorage();
  renderCart();
  updateCartCount();
  openCart();
}

function updateQty(variationId, delta) {
  const item = cart.find(c => c.variationId === variationId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(c => c.variationId !== variationId);
  saveCartToStorage();
  renderCart();
  updateCartCount();
}

function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('btn-checkout-main');
  const fulfillmentEl = document.getElementById('fulfillment-select');

  if (!cart.length) {
    itemsEl.innerHTML = '<p class="cart-empty">Your bag is empty.</p>';
    totalEl.textContent = '$0.00';
    if (checkoutBtn) checkoutBtn.disabled = true;
    if (fulfillmentEl) fulfillmentEl.style.display = 'none';
    return;
  }

  if (fulfillmentEl) fulfillmentEl.style.display = 'block';
  if (checkoutBtn) checkoutBtn.disabled = false;

  let totalCents = 0;
  itemsEl.innerHTML = cart.map(c => {
    const lineCents = c.priceCents * c.quantity;
    totalCents += lineCents;
    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(c.name)}</div>
          <div class="cart-item-price">$${(lineCents / 100).toFixed(2)} ${c.currency}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-id="${c.variationId}" data-delta="-1">−</button>
          <span class="qty-display">${c.quantity}</span>
          <button class="qty-btn" data-id="${c.variationId}" data-delta="1">+</button>
        </div>
        <button class="cart-item-remove" data-id="${c.variationId}" aria-label="Remove item">✕</button>
      </div>
    `;
  }).join('');

  const currency = cart[0]?.currency || 'CAD';
  totalEl.textContent = `$${(totalCents / 100).toFixed(2)} ${currency}`;
}

function updateCartCount() {
  const total = cart.reduce((sum, c) => sum + c.quantity, 0);
  const el = document.getElementById('cart-count');
  if (!el) return;
  el.textContent = total;
  el.dataset.count = total;
}

function openCart() {
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-drawer').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Checkout ─────────────────────────────────────────────────────────────────
async function startCheckout() {
  if (!cart.length) return;

  const btn = document.getElementById('btn-checkout-main');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing checkout…';

  try {
    const fulfillmentDateTime = buildFulfillmentDateTime();
    const orderNote = (document.getElementById('order-note')?.value || '').trim();

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartItems: cart.map(c => ({ variationId: c.variationId, quantity: c.quantity })),
        fulfillmentType,
        fulfillmentDateTime,
        ...(orderNote ? { orderNote } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'Could not create checkout');

    showOrderConfirmation(data.url, fulfillmentDateTime);

  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = originalText;
    const footer = document.querySelector('.cart-drawer-footer');
    let errEl = document.getElementById('checkout-error');
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.id = 'checkout-error';
      errEl.style.cssText = 'color:var(--coral);font-size:12px;margin-top:10px;text-align:center;';
      footer.appendChild(errEl);
    }
    errEl.textContent = 'Something went wrong. Please try again.';
    setTimeout(() => { if (errEl) errEl.textContent = ''; }, 4000);
  }
}

function showOrderConfirmation(squareUrl, fulfillmentDateTime) {
  const drawer = document.getElementById('cart-drawer');
  const isPickup = fulfillmentType === 'PICKUP';
  let fulfillmentLine = isPickup ? 'Pickup' : 'Shipping';

  if (fulfillmentDateTime) {
    const dt = new Date(fulfillmentDateTime);
    const dateStr = dt.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = isPickup ? dt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : null;
    fulfillmentLine = isPickup ? `Pickup ${dateStr} at ${timeStr}` : `Ship by ${dateStr}`;
  }

  let totalCents = 0;
  const itemRows = cart.map(c => {
    const lineCents = c.priceCents * c.quantity;
    totalCents += lineCents;
    return `<div class="confirm-item-row"><span>${escapeHtml(c.name)} × ${c.quantity}</span><span>$${(lineCents / 100).toFixed(2)}</span></div>`;
  }).join('');

  const currency = cart[0]?.currency || 'CAD';

  drawer.innerHTML = `
    <div class="cart-drawer-header">
      <span class="cart-drawer-title">Order Summary</span>
      <button id="confirm-back-btn" class="cart-close-btn">←</button>
    </div>
    <div class="cart-drawer-body">
      ${itemRows}
      <div class="confirm-subtotal-row"><span>Subtotal</span><span>$${(totalCents / 100).toFixed(2)} ${currency}</span></div>
      <div class="confirm-fulfillment-box">
        <div class="confirm-fulfillment-label">Fulfillment</div>
        <div class="confirm-fulfillment-value">${fulfillmentLine}</div>
      </div>
      <p class="confirm-note">Payment completed securely on Square's checkout page.</p>
      <button id="confirm-pay-btn" class="btn-checkout-main">Continue to Payment →</button>
      <button id="confirm-back-btn-2" class="confirm-edit-btn">← Edit Bag</button>
    </div>
  `;

  document.getElementById('confirm-pay-btn').addEventListener('click', () => { window.location.href = squareUrl; });
  ['confirm-back-btn', 'confirm-back-btn-2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => location.reload());
  });
}

// ─── Fulfillment Helpers ──────────────────────────────────────────────────────
function updateFulfillmentUI() {
  const isPickup = fulfillmentType === 'PICKUP';
  const timeField = document.getElementById('fulfillment-time-field');
  const shippingNote = document.getElementById('fulfillment-shipping-note');
  const dateLabel = document.getElementById('fulfillment-date-label');
  const row = document.getElementById('fulfillment-datetime-row');

  if (timeField) timeField.style.display = isPickup ? 'flex' : 'none';
  if (shippingNote) shippingNote.style.display = isPickup ? 'none' : 'block';
  if (dateLabel) dateLabel.textContent = isPickup ? 'Pickup date' : 'Ship date';
  if (row) row.style.gridTemplateColumns = isPickup ? '1fr 1fr' : '1fr';
}

function buildFulfillmentDateTime() {
  const dateVal = document.getElementById('fulfillment-date')?.value;
  if (!dateVal) return null;
  const timeVal = fulfillmentType === 'PICKUP'
    ? (document.getElementById('fulfillment-time')?.value || '12:00')
    : '12:00';
  const dt = new Date(`${dateVal}T${timeVal}:00`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function saveCartToStorage() {
  try { localStorage.setItem('sq_cart', JSON.stringify(cart)); } catch {}
}

function loadCartFromStorage() {
  try {
    const stored = localStorage.getItem('sq_cart');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) { cart = parsed; renderCart(); updateCartCount(); }
    }
  } catch { localStorage.removeItem('sq_cart'); }
}

// ─── Event Bindings ───────────────────────────────────────────────────────────
function bindUI() {
  document.getElementById('btn-open-cart').addEventListener('click', openCart);
  document.getElementById('cart-overlay').addEventListener('click', closeCart);
  document.getElementById('cart-close-btn').addEventListener('click', closeCart);
  document.getElementById('btn-checkout-main').addEventListener('click', startCheckout);

  document.getElementById('pdp-add-btn').addEventListener('click', () => {
    addToCart();
    const btn = document.getElementById('pdp-add-btn');
    btn.textContent = 'Added ✓';
    setTimeout(() => { btn.textContent = 'Add to Bag'; }, 1400);
  });

  document.getElementById('cart-items').addEventListener('click', e => {
    const qtyBtn = e.target.closest('.qty-btn');
    if (qtyBtn) { updateQty(qtyBtn.dataset.id, parseInt(qtyBtn.dataset.delta, 10)); return; }
    const removeBtn = e.target.closest('.cart-item-remove');
    if (removeBtn) {
      cart = cart.filter(c => c.variationId !== removeBtn.dataset.id);
      saveCartToStorage(); renderCart(); updateCartCount();
    }
  });

  document.querySelectorAll('.fulfillment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      fulfillmentType = btn.dataset.type;
      document.querySelectorAll('.fulfillment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateFulfillmentUI();
    });
  });

  const dateInput = document.getElementById('fulfillment-date');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = tomorrow.toISOString().split('T')[0];
  }

  updateFulfillmentUI();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
}

// ─── Sanitization ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
