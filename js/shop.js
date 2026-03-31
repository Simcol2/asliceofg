// ─── State ───────────────────────────────────────────────────────────────────
let cart = [];      // [{ variationId, name, priceCents, currency, quantity }]
let customer = null; // { customerId, email, givenName, familyName }
let allItems = [];
let activeCategory = 'all';
let fulfillmentType = 'PICKUP'; // 'PICKUP' or 'SHIPMENT'

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadCustomerFromStorage();
  loadCartFromStorage();
  updateCustomerBar();
  bindUI();
  await loadShop();
});

async function loadShop() {
  try {
    const [catalogRes, categoriesRes] = await Promise.all([
      fetch('/api/catalog'),
      fetch('/api/categories'),
    ]);

    if (!catalogRes.ok) throw new Error('Catalog unavailable');

    const { items } = await catalogRes.json();

    if (categoriesRes.ok) {
      const { categories } = await categoriesRes.json();

      // Filter to only the 4 A Slice of G categories
      const allowed = (categories || []).filter(cat =>
        ALLOWED_CATEGORIES.some(name => cat.name.toLowerCase().trim() === name)
      );

      const allowedIds = new Set(allowed.map(cat => cat.id));

      // Only show items that belong to an allowed category
      allItems = (items || []).filter(item => item.categoryId && allowedIds.has(item.categoryId));

      if (allowed.length > 0) renderFilterBar(allowed);
    } else {
      allItems = items || [];
    }

    renderItems(allItems);
  } catch (err) {
    console.error(err);
    document.getElementById('items-grid').innerHTML =
      '<p class="products-empty">Could not load products. Please refresh the page.</p>';
  }
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
const ALLOWED_CATEGORIES = [
  'rum infused bites',
  'dinner parties',
  'g totes',
  'gift wrap accessories',
];

function renderFilterBar(allowed) {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;

  // allowed is already filtered — just render buttons
  allowed.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat.id;
    btn.textContent = cat.name;
    btn.addEventListener('click', () => setCategory(cat.id, btn));
    bar.appendChild(btn);
  });

  bar.querySelector('[data-category="all"]')?.addEventListener('click', () => {
    setCategory('all', bar.querySelector('[data-category="all"]'));
  });
}

function setCategory(catId, clickedBtn) {
  activeCategory = catId;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  clickedBtn.classList.add('active');
  const filtered = catId === 'all'
    ? allItems
    : allItems.filter(item => item.categoryId === catId);
  renderItems(filtered);
}

// ─── Catalog ──────────────────────────────────────────────────────────────────
function renderItems(items) {
  const grid = document.getElementById('items-grid');
  grid.innerHTML = '';

  if (!items.length) {
    grid.innerHTML = '<p class="products-empty">No items available right now.</p>';
    return;
  }

  items.forEach((item, index) => {
    const defaultVar = item.variations[0];
    if (!defaultVar) return;

    const card = document.createElement('div');
    card.className = 'product-card';

    const numStr = String(index + 1).padStart(2, '0');
    const hasVariations = item.variations.length > 1;

    const imageHtml = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.name)}" loading="lazy"/>`
      : `<div class="product-card-arch-placeholder">G</div>`;

    const variationHtml = hasVariations
      ? `<select class="variation-select" aria-label="Select size">
          ${item.variations.map(v =>
            `<option value="${v.id}"
              data-price="${v.priceCents}"
              data-currency="${v.currency}"
              data-name="${escapeAttr(v.name)}">
              ${escapeHtml(v.name)} — $${(v.priceCents / 100).toFixed(2)}
            </option>`
          ).join('')}
        </select>`
      : '';

    card.innerHTML = `
      <div class="product-card-arch">${imageHtml}</div>
      <div class="product-card-body">
        <span class="product-number">No. ${numStr}</span>
        <div class="product-name">${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="product-desc">${escapeHtml(item.description)}</div>` : ''}
        <div class="product-rule"></div>
        ${variationHtml}
        <div class="product-footer">
          <div class="product-price" id="price-${item.id}">$${(defaultVar.priceCents / 100).toFixed(2)}</div>
          <button class="btn-add-cart"
            data-variation-id="${defaultVar.id}"
            data-name="${escapeAttr(item.name)}"
            data-price="${defaultVar.priceCents}"
            data-currency="${defaultVar.currency}">
            Add to Bag
          </button>
        </div>
      </div>
    `;

    // Sync variation select → button data + price display
    const select = card.querySelector('.variation-select');
    const btn = card.querySelector('.btn-add-cart');
    const priceEl = card.querySelector(`#price-${item.id}`);

    if (select) {
      select.addEventListener('change', () => {
        const opt = select.options[select.selectedIndex];
        btn.dataset.variationId = opt.value;
        btn.dataset.price = opt.dataset.price;
        btn.dataset.currency = opt.dataset.currency;
        btn.dataset.name = `${item.name}${opt.dataset.name !== 'Regular' ? ' — ' + opt.dataset.name : ''}`;
        if (priceEl) priceEl.textContent = `$${(parseInt(opt.dataset.price) / 100).toFixed(2)}`;
      });
    }

    grid.appendChild(card);
  });
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
function addToCart(variationId, name, priceCents, currency) {
  const existing = cart.find(c => c.variationId === variationId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ variationId, name, priceCents, currency, quantity: 1 });
  }
  saveCartToStorage();
  renderCart();
  updateCartCount();
}

function updateQty(variationId, delta) {
  const item = cart.find(c => c.variationId === variationId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(c => c.variationId !== variationId);
  }
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
  const countEl = document.getElementById('cart-count');
  if (!countEl) return;
  countEl.textContent = total;
  countEl.dataset.count = total;
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────
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

// ─── Checkout Flow — Square Hosted Checkout ───────────────────────────────────
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

    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Could not create checkout session');
    }

    // Show confirmation step instead of immediately redirecting
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

  // Format fulfillment summary line
  const isPickup = fulfillmentType === 'PICKUP';
  let fulfillmentLine = isPickup ? 'Pickup' : 'Shipping';
  if (fulfillmentDateTime) {
    const dt = new Date(fulfillmentDateTime);
    const dateStr = dt.toLocaleDateString('en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const timeStr = isPickup
      ? dt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
      : null;
    fulfillmentLine = isPickup
      ? `Pickup — ${dateStr} at ${timeStr}`
      : `Ship by ${dateStr}`;
  }

  // Build order summary rows
  let totalCents = 0;
  const itemRows = cart.map(c => {
    const lineCents = c.priceCents * c.quantity;
    totalCents += lineCents;
    return `
      <div class="confirm-item">
        <span class="confirm-item-name">${escapeHtml(c.name)} × ${c.quantity}</span>
        <span class="confirm-item-price">$${(lineCents / 100).toFixed(2)}</span>
      </div>`;
  }).join('');

  const currency = cart[0]?.currency || 'CAD';

  // Inject confirmation panel — replaces drawer content temporarily
  drawer.innerHTML = `
    <div class="cart-drawer-header">
      <span class="cart-drawer-title">Order Summary</span>
      <button id="confirm-back-btn" class="cart-close-btn" aria-label="Go back">←</button>
    </div>

    <div class="cart-drawer-body" style="padding: 1.5rem;">

      <div class="confirm-items">
        ${itemRows}
        <div class="confirm-divider"></div>
        <div class="confirm-item confirm-total">
          <span>Subtotal</span>
          <span>$${(totalCents / 100).toFixed(2)} ${currency}</span>
        </div>
      </div>

      <div class="confirm-fulfillment">
        <div class="confirm-fulfillment-label">Fulfillment</div>
        <div class="confirm-fulfillment-value">${fulfillmentLine}</div>
      </div>

      <p class="confirm-note">
        You'll complete payment securely on Square's checkout page.
      </p>

      <button id="confirm-pay-btn" class="btn-checkout-main">
        Continue to Payment →
      </button>

      <button id="confirm-back-btn-2" class="confirm-back-link">
        ← Edit bag
      </button>

    </div>
  `;

  // Wire up buttons
  document.getElementById('confirm-pay-btn').addEventListener('click', () => {
    window.location.href = squareUrl;
  });

  // Both back buttons restore the cart drawer
  ['confirm-back-btn', 'confirm-back-btn-2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      restoreCartDrawer();
    });
  });
}

function restoreCartDrawer() {
  // Re-render the full cart drawer by closing and reopening
  // The simplest approach: reload the drawer HTML from the page template
  location.reload();
}

// ─── Login Flow ───────────────────────────────────────────────────────────────
async function submitLogin() {
  const email     = document.getElementById('login-email').value.trim();
  const firstName = document.getElementById('login-first').value.trim();
  const lastName  = document.getElementById('login-last').value.trim();

  if (!email || !email.includes('@')) {
    setModalStatus('login-status', 'Please enter a valid email.', 'error');
    return;
  }

  setModalStatus('login-status', 'Looking up your account…');

  try {
    const action = firstName ? 'register' : 'lookup';
    const res = await fetch('/api/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, email, givenName: firstName, familyName: lastName }),
    });

    if (res.status === 404) {
      setModalStatus('login-status', 'No account found. Enter your name to register.', 'error');
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      setModalStatus('login-status', data.error || 'Error. Please try again.', 'error');
      return;
    }

    saveCustomer({ customerId: data.customerId, email: data.email, givenName: data.givenName, familyName: data.familyName });
    updateCustomerBar();
    closeModal('login-modal');

  } catch {
    setModalStatus('login-status', 'Something went wrong. Please try again.', 'error');
  }
}

// ─── Order History ────────────────────────────────────────────────────────────
async function loadOrderHistory() {
  if (!customer) return;
  const listEl = document.getElementById('orders-list');
  listEl.innerHTML = '<p style="color:rgba(7,20,16,0.4);font-style:italic">Loading…</p>';
  openModal('orders-modal');

  try {
    const res = await fetch(`/api/orders?customerId=${encodeURIComponent(customer.customerId)}`);
    const { orders } = await res.json();

    if (!orders.length) {
      listEl.innerHTML = '<p style="color:rgba(7,20,16,0.4);font-style:italic">No completed orders yet.</p>';
      return;
    }

    listEl.innerHTML = `<div class="orders-list">` + orders.map(o => `
      <div class="order-card">
        <div class="order-card-date">${new Date(o.createdAt).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' })}</div>
        <ul class="order-card-items">
          ${o.lineItems.map(li =>
            `<li>${escapeHtml(li.name)} × ${li.quantity} — $${(li.totalCents / 100).toFixed(2)}</li>`
          ).join('')}
        </ul>
        <div class="order-card-total">$${(o.totalCents / 100).toFixed(2)} ${o.currency}</div>
      </div>
    `).join('') + `</div>`;

  } catch {
    listEl.innerHTML = '<p style="color:var(--coral)">Could not load orders.</p>';
  }
}

// ─── Customer Session ─────────────────────────────────────────────────────────
function saveCustomer(c) {
  customer = c;
  localStorage.setItem('sq_customer', JSON.stringify(c));
  updateCustomerBar();
}

function loadCustomerFromStorage() {
  try {
    const stored = localStorage.getItem('sq_customer');
    if (stored) customer = JSON.parse(stored);
  } catch {
    localStorage.removeItem('sq_customer');
  }
}

function signOut() {
  customer = null;
  localStorage.removeItem('sq_customer');
  updateCustomerBar();
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
  // Single column when no time field showing
  if (row) row.style.gridTemplateColumns = isPickup ? '1fr 1fr' : '1fr';
}

function buildFulfillmentDateTime() {
  const dateVal = document.getElementById('fulfillment-date')?.value;
  if (!dateVal) return null;
  // For shipping, use noon as a neutral time — only the date matters
  const timeVal = fulfillmentType === 'PICKUP'
    ? (document.getElementById('fulfillment-time')?.value || '12:00')
    : '12:00';
  // Parse in local time so the ISO string carries the correct UTC offset
  const dt = new Date(`${dateVal}T${timeVal}:00`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ─── Cart Persistence ─────────────────────────────────────────────────────────
function saveCartToStorage() {
  try {
    localStorage.setItem('sq_cart', JSON.stringify(cart));
  } catch {}
}

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

function updateCustomerBar() {
  const greetingEl = document.getElementById('customer-greeting');
  const loginBtn   = document.getElementById('btn-login');
  const ordersBtn  = document.getElementById('btn-orders');
  const signoutBtn = document.getElementById('btn-signout');
  if (!greetingEl) return;

  if (customer) {
    greetingEl.innerHTML = `Welcome back, <span>${escapeHtml(customer.givenName || customer.email)}</span>`;
    loginBtn.style.display  = 'none';
    ordersBtn.style.display = 'inline-block';
    signoutBtn.style.display = 'inline-block';
  } else {
    greetingEl.textContent = 'Sign in to track your orders';
    loginBtn.style.display  = 'inline-block';
    ordersBtn.style.display = 'none';
    signoutBtn.style.display = 'none';
  }
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

function setModalStatus(id, message, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = 'modal-status' + (type ? ' ' + type : '');
}

// ─── Sanitization Helpers ─────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Event Bindings ───────────────────────────────────────────────────────────
function bindUI() {
  // Add to cart (event delegation)
  document.getElementById('items-grid').addEventListener('click', e => {
    const btn = e.target.closest('.btn-add-cart');
    if (!btn) return;
    addToCart(
      btn.dataset.variationId,
      btn.dataset.name,
      parseInt(btn.dataset.price, 10),
      btn.dataset.currency
    );
    // Brief visual feedback
    btn.textContent = 'Added ✓';
    setTimeout(() => { btn.textContent = 'Add to Bag'; }, 1200);
  });

  // Cart qty / remove (event delegation on drawer)
  document.getElementById('cart-items').addEventListener('click', e => {
    const qtyBtn = e.target.closest('.qty-btn');
    if (qtyBtn) {
      updateQty(qtyBtn.dataset.id, parseInt(qtyBtn.dataset.delta, 10));
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

  // Cart open/close
  document.getElementById('btn-open-cart').addEventListener('click', openCart);
  document.getElementById('cart-overlay').addEventListener('click', closeCart);
  document.getElementById('cart-close-btn').addEventListener('click', closeCart);

  // Checkout — redirects to Square hosted checkout
  document.getElementById('btn-checkout-main').addEventListener('click', startCheckout);

  // Fulfillment type toggle
  document.querySelectorAll('.fulfillment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      fulfillmentType = btn.dataset.type;
      document.querySelectorAll('.fulfillment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateFulfillmentUI();
    });
  });

  // Date picker — minimum is tomorrow
  const dateInput = document.getElementById('fulfillment-date');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = tomorrow.toISOString().split('T')[0];
  }

  updateFulfillmentUI();

  // Login
  document.getElementById('btn-login')?.addEventListener('click', () => openModal('login-modal'));
  document.getElementById('btn-submit-login').addEventListener('click', submitLogin);
  document.getElementById('btn-close-login').addEventListener('click', () => closeModal('login-modal'));
  document.getElementById('login-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('login-modal');
  });
  document.getElementById('login-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitLogin();
  });

  // Orders
  document.getElementById('btn-orders')?.addEventListener('click', loadOrderHistory);
  document.getElementById('btn-close-orders').addEventListener('click', () => closeModal('orders-modal'));
  document.getElementById('orders-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('orders-modal');
  });

  // Sign out
  document.getElementById('btn-signout')?.addEventListener('click', signOut);

  // Escape key closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['login-modal', 'orders-modal'].forEach(closeModal);
    closeCart();
  });
}
