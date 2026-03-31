// ─── Home page cart drawer ────────────────────────────────────────────────────
// Standalone: reads/writes cart from localStorage, handles drawer + checkout.
// No catalog loading — items are added on shop.html.

let cart = [];
let fulfillmentType = 'PICKUP';

document.addEventListener('DOMContentLoaded', () => {
  loadCartFromStorage();
  bindCartUI();
  updateFulfillmentUI();
});

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadCartFromStorage() {
  try {
    const stored = localStorage.getItem('sq_cart');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        cart = parsed;
        renderCart();
        updateCartCount();
      }
    }
  } catch {
    localStorage.removeItem('sq_cart');
  }
}

function saveCartToStorage() {
  try { localStorage.setItem('sq_cart', JSON.stringify(cart)); } catch {}
}

// ─── Cart render ──────────────────────────────────────────────────────────────
function renderCart() {
  const itemsEl  = document.getElementById('cart-items');
  const totalEl  = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('btn-checkout-main');
  const fulfillmentEl = document.getElementById('fulfillment-select');

  if (!itemsEl) return;

  if (!cart.length) {
    itemsEl.innerHTML = '<p class="cart-empty">Your bag is empty.</p>';
    if (totalEl) totalEl.textContent = '$0.00';
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
        <button class="cart-item-remove" data-id="${c.variationId}" aria-label="Remove">✕</button>
      </div>`;
  }).join('');

  const currency = cart[0]?.currency || 'CAD';
  if (totalEl) totalEl.textContent = `$${(totalCents / 100).toFixed(2)} ${currency}`;
}

function updateCartCount() {
  const total = cart.reduce((sum, c) => sum + c.quantity, 0);
  const el = document.getElementById('cart-count');
  if (!el) return;
  el.textContent = total;
  el.dataset.count = total;
}

// ─── Fulfillment ──────────────────────────────────────────────────────────────
function updateFulfillmentUI() {
  const isPickup   = fulfillmentType === 'PICKUP';
  const timeField  = document.getElementById('fulfillment-time-field');
  const shippingNote = document.getElementById('fulfillment-shipping-note');
  const dateLabel  = document.getElementById('fulfillment-date-label');
  const row        = document.getElementById('fulfillment-datetime-row');

  if (timeField)     timeField.style.display = isPickup ? 'flex' : 'none';
  if (shippingNote)  shippingNote.style.display = isPickup ? 'none' : 'block';
  if (dateLabel)     dateLabel.textContent = isPickup ? 'Pickup date' : 'Ship date';
  if (row)           row.style.gridTemplateColumns = isPickup ? '1fr 1fr' : '1fr';
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

// ─── Checkout ─────────────────────────────────────────────────────────────────
async function startCheckout() {
  if (!cart.length) return;
  const btn = document.getElementById('btn-checkout-main');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing checkout…';

  try {
    const fulfillmentDateTime = buildFulfillmentDateTime();
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartItems: cart.map(c => ({ variationId: c.variationId, quantity: c.quantity })),
        fulfillmentType,
        fulfillmentDateTime,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');
    window.location.href = data.url;
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
      footer?.appendChild(errEl);
    }
    errEl.textContent = 'Something went wrong. Please try again.';
    setTimeout(() => { if (errEl) errEl.textContent = ''; }, 4000);
  }
}

// ─── Drawer open/close ────────────────────────────────────────────────────────
function openCart() {
  document.getElementById('cart-overlay')?.classList.add('open');
  document.getElementById('cart-drawer')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-overlay')?.classList.remove('open');
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Bindings ─────────────────────────────────────────────────────────────────
function bindCartUI() {
  document.getElementById('btn-open-cart')?.addEventListener('click', openCart);
  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
  document.getElementById('cart-close-btn')?.addEventListener('click', closeCart);
  document.getElementById('btn-checkout-main')?.addEventListener('click', startCheckout);

  document.getElementById('cart-items')?.addEventListener('click', e => {
    const qtyBtn = e.target.closest('.qty-btn');
    if (qtyBtn) {
      const item = cart.find(c => c.variationId === qtyBtn.dataset.id);
      if (!item) return;
      item.quantity += parseInt(qtyBtn.dataset.delta, 10);
      if (item.quantity <= 0) cart = cart.filter(c => c.variationId !== qtyBtn.dataset.id);
      saveCartToStorage();
      renderCart();
      updateCartCount();
      return;
    }
    const removeBtn = e.target.closest('.cart-item-remove');
    if (removeBtn) {
      cart = cart.filter(c => c.variationId !== removeBtn.dataset.id);
      saveCartToStorage();
      renderCart();
      updateCartCount();
    }
  });

  // Fulfillment toggle
  document.querySelectorAll('.fulfillment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      fulfillmentType = btn.dataset.type;
      document.querySelectorAll('.fulfillment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateFulfillmentUI();
    });
  });

  // Date min = tomorrow
  const dateInput = document.getElementById('fulfillment-date');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = tomorrow.toISOString().split('T')[0];
  }

  // Escape closes cart
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCart();
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
