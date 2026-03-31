# Square API Storefront — Full Implementation Plan
### Stack: HTML/CSS/JS frontend · Vercel Serverless Functions · Square API

---

## BEFORE YOU START — Environment Setup

### 1. Create your `.env` file (root of project)
```
SQUARE_ACCESS_TOKEN=your_new_token_after_rotating
SQUARE_APP_ID=sq0idp-Gcdk075dVK6KiWrqZFTOGA
SQUARE_LOCATION_ID=LAJ0T04RDKRS7
SQUARE_ENVIRONMENT=production
```

### 2. Create `.gitignore` (if not already present)
```
.env
node_modules/
.vercel/
```

### 3. Install dependencies
```bash
npm init -y
npm install square dotenv
```

### 4. Project folder structure to create
```
/
├── .env
├── .gitignore
├── package.json
├── vercel.json
├── index.html           ← your existing main page
├── shop.html            ← shop all (categories + filter)
├── about.html           ← about us + bio
├── catering.html        ← catering packages + payment links
├── contact.html         ← contact form
├── gifting.html         ← corporate gifting / realtor page
├── brochure.pdf         ← downloadable gifting brochure (you provide)
├── css/
│   └── main.css         ← shared across ALL pages
├── js/
│   ├── shop.js
│   ├── gifting.js
│   └── nav.js           ← shared nav logic
└── api/
    ├── catalog.js       ← GET all items from Square
    ├── categories.js    ← GET Square categories for filtering
    ├── create-order.js  ← POST cart → Square Order
    ├── pay.js           ← POST payment token → charge
    ├── customer.js      ← POST register/login
    └── orders.js        ← GET customer order history
```

---

## PHASE 1 — Vercel Configuration

### Step 1: Create `vercel.json`
This tells Vercel to treat `/api/` files as serverless functions.

```json
{
  "functions": {
    "api/*.js": {
      "memory": 256,
      "maxDuration": 10
    }
  },
  "env": {
    "SQUARE_ACCESS_TOKEN": "@square_access_token",
    "SQUARE_APP_ID": "@square_app_id",
    "SQUARE_LOCATION_ID": "@square_location_id",
    "SQUARE_ENVIRONMENT": "@square_environment"
  }
}
```

### Step 2: Add environment variables in Vercel dashboard
- Go to your Vercel project → Settings → Environment Variables
- Add all four variables from your `.env` file
- These are what the live functions will use (never exposed to browser)

---

## PHASE 2 — Backend: Vercel API Functions

### Step 3: `api/catalog.js` — Load your Square items

This function fetches all active catalog items and returns clean JSON to your frontend.

```javascript
import { Client, Environment } from 'square';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

export default async function handler(req, res) {
  // Allow only GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all catalog items with images and variations
    const { result } = await client.catalogApi.listCatalog(
      undefined,
      'ITEM,IMAGE'
    );

    const objects = result.objects || [];

    // Build a lookup map of images
    const imageMap = {};
    objects
      .filter(o => o.type === 'IMAGE')
      .forEach(img => {
        imageMap[img.id] = img.imageData?.url;
      });

    // Build clean item list
    const items = objects
      .filter(o => o.type === 'ITEM' && !o.isDeleted)
      .map(item => {
        const data = item.itemData;
        return {
          id: item.id,
          name: data.name,
          description: data.description || '',
          imageUrl: data.imageIds?.length
            ? imageMap[data.imageIds[0]]
            : null,
          variations: (data.variations || []).map(v => ({
            id: v.id,
            name: v.itemVariationData?.name || 'Regular',
            priceCents: Number(
              v.itemVariationData?.priceMoney?.amount ?? 0
            ),
            currency: v.itemVariationData?.priceMoney?.currency || 'CAD',
          })),
        };
      });

    res.setHeader('Cache-Control', 's-maxage=60'); // cache 60s on Vercel edge
    return res.status(200).json({ items });

  } catch (error) {
    console.error('Catalog error:', error);
    return res.status(500).json({ error: 'Failed to load catalog' });
  }
}
```

---

### Step 4: `api/create-order.js` — Build a Square Order from cart contents

Cart is sent from the browser as an array of `{ variationId, quantity }`.

```javascript
import { Client, Environment } from 'square';
import crypto from 'crypto';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cartItems, customerId } = req.body;
  // cartItems: [{ variationId: 'xxx', quantity: 2 }, ...]
  // customerId: optional, if customer is logged in

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  try {
    const { result } = await client.ordersApi.createOrder({
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        customerId: customerId || undefined,
        lineItems: cartItems.map(item => ({
          catalogObjectId: item.variationId,
          quantity: String(item.quantity),
        })),
      },
      idempotencyKey: crypto.randomUUID(),
    });

    const order = result.order;
    return res.status(200).json({
      orderId: order.id,
      totalCents: Number(order.totalMoney?.amount ?? 0),
      currency: order.totalMoney?.currency || 'CAD',
      lineItems: order.lineItems,
    });

  } catch (error) {
    console.error('Order error:', error);
    return res.status(500).json({ error: 'Failed to create order' });
  }
}
```

---

### Step 5: `api/pay.js` — Charge the card using Square's payment token

The browser sends a `sourceId` (payment token from Square Web Payments SDK) plus the `orderId` from Step 4.

```javascript
import { Client, Environment } from 'square';
import crypto from 'crypto';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sourceId, orderId, amountCents, currency, customerId, email } = req.body;

  if (!sourceId || !orderId || !amountCents) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { result } = await client.paymentsApi.createPayment({
      sourceId,
      orderId,
      amountMoney: {
        amount: BigInt(amountCents),
        currency: currency || 'CAD',
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      customerId: customerId || undefined,
      buyerEmailAddress: email || undefined,
      idempotencyKey: crypto.randomUUID(),
    });

    const payment = result.payment;
    return res.status(200).json({
      paymentId: payment.id,
      status: payment.status,        // 'COMPLETED'
      receiptUrl: payment.receiptUrl,
    });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({ error: 'Payment failed' });
  }
}
```

---

### Step 6: `api/customer.js` — Register or retrieve a customer

Handles both registration and lookup by email (Square deduplicates by email).

```javascript
import { Client, Environment } from 'square';
import crypto from 'crypto';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, email, givenName, familyName } = req.body;

  // action: 'lookup' or 'register'

  try {
    if (action === 'lookup' || action === 'register') {
      // Search for existing customer by email
      const { result: searchResult } = await client.customersApi.searchCustomers({
        query: {
          filter: {
            emailAddress: {
              exact: email,
            },
          },
        },
      });

      const existing = searchResult.customers?.[0];

      if (existing) {
        return res.status(200).json({
          customerId: existing.id,
          givenName: existing.givenName,
          familyName: existing.familyName,
          email: existing.emailAddress,
          isNew: false,
        });
      }

      if (action === 'lookup') {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Register new customer
      const { result: createResult } = await client.customersApi.createCustomer({
        emailAddress: email,
        givenName: givenName || '',
        familyName: familyName || '',
        idempotencyKey: crypto.randomUUID(),
      });

      const customer = createResult.customer;
      return res.status(201).json({
        customerId: customer.id,
        givenName: customer.givenName,
        familyName: customer.familyName,
        email: customer.emailAddress,
        isNew: true,
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Customer error:', error);
    return res.status(500).json({ error: 'Customer operation failed' });
  }
}
```

---

### Step 7: `api/orders.js` — Get order history for a customer

```javascript
import { Client, Environment } from 'square';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customerId } = req.query;

  if (!customerId) {
    return res.status(400).json({ error: 'customerId required' });
  }

  try {
    const { result } = await client.ordersApi.searchOrders({
      locationIds: [process.env.SQUARE_LOCATION_ID],
      query: {
        filter: {
          customerFilter: {
            customerIds: [customerId],
          },
          stateFilter: {
            states: ['COMPLETED'],
          },
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'DESC',
        },
      },
    });

    const orders = (result.orders || []).map(o => ({
      orderId: o.id,
      createdAt: o.createdAt,
      totalCents: Number(o.totalMoney?.amount ?? 0),
      currency: o.totalMoney?.currency || 'CAD',
      lineItems: (o.lineItems || []).map(li => ({
        name: li.name,
        quantity: li.quantity,
        totalCents: Number(li.totalMoney?.amount ?? 0),
      })),
    }));

    return res.status(200).json({ orders });

  } catch (error) {
    console.error('Orders error:', error);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
}
```

---

## PHASE 3 — Frontend

### Step 8: Add Square Web Payments SDK to `shop.html`

Add this in the `<head>`:

```html
<!-- Square Web Payments SDK (production) -->
<script src="https://web.squarecdn.com/v1/square.js"></script>
```

Add this data attribute to your `<body>` tag so JS can read it:

```html
<body data-square-app-id="sq0idp-Gcdk075dVK6KiWrqZFTOGA"
      data-square-location-id="LAJ0T04RDKRS7">
```

> Note: App ID and Location ID are safe to expose in the browser. Only the Access Token must stay server-side.

---

### Step 9: `shop.html` — Basic structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shop — A Slice of G</title>
  <link rel="stylesheet" href="css/shop.css" />
  <script src="https://web.squarecdn.com/v1/square.js"></script>
</head>
<body
  data-square-app-id="sq0idp-Gcdk075dVK6KiWrqZFTOGA"
  data-square-location-id="LAJ0T04RDKRS7"
>

  <!-- CUSTOMER BAR -->
  <div id="customer-bar">
    <span id="customer-greeting">Not signed in</span>
    <button id="btn-login">Sign In / Register</button>
    <button id="btn-orders" style="display:none">My Orders</button>
    <button id="btn-signout" style="display:none">Sign Out</button>
  </div>

  <!-- CATALOG -->
  <section id="catalog">
    <div id="items-grid">
      <!-- Populated by JS -->
      <p id="loading-msg">Loading items...</p>
    </div>
  </section>

  <!-- CART SIDEBAR -->
  <div id="cart-sidebar">
    <h2>Your Cart</h2>
    <div id="cart-items"></div>
    <div id="cart-total">Total: $0.00</div>
    <button id="btn-checkout">Checkout</button>
  </div>

  <!-- CHECKOUT MODAL -->
  <div id="checkout-modal" style="display:none">
    <div id="checkout-inner">
      <h2>Checkout</h2>
      <div id="checkout-customer-fields">
        <input type="email" id="checkout-email" placeholder="Email address" />
        <input type="text" id="checkout-first-name" placeholder="First name" />
        <input type="text" id="checkout-last-name" placeholder="Last name" />
      </div>
      <!-- Square injects card UI here -->
      <div id="card-container"></div>
      <button id="btn-pay">Pay Now</button>
      <p id="payment-status"></p>
      <button id="btn-close-modal">Cancel</button>
    </div>
  </div>

  <!-- LOGIN MODAL -->
  <div id="login-modal" style="display:none">
    <div id="login-inner">
      <h2>Sign In / Register</h2>
      <input type="email" id="login-email" placeholder="Email address" />
      <input type="text" id="login-first" placeholder="First name (new customers)" />
      <input type="text" id="login-last" placeholder="Last name (new customers)" />
      <button id="btn-submit-login">Continue</button>
      <p id="login-status"></p>
      <button id="btn-close-login">Cancel</button>
    </div>
  </div>

  <!-- ORDERS MODAL -->
  <div id="orders-modal" style="display:none">
    <div id="orders-inner">
      <h2>My Orders</h2>
      <div id="orders-list"></div>
      <button id="btn-close-orders">Close</button>
    </div>
  </div>

  <script src="js/shop.js"></script>
</body>
</html>
```

---

### Step 10: `js/shop.js` — Full frontend logic

```javascript
// ─── State ───────────────────────────────────────────────
let cart = []; // [{ variationId, name, priceCents, currency, quantity }]
let customer = null; // { customerId, email, givenName }
let squareCard = null; // Square card widget instance
let currentOrderId = null;
let currentOrderTotal = 0;

const APP_ID = document.body.dataset.squareAppId;
const LOCATION_ID = document.body.dataset.squareLocationId;

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadCustomerFromStorage();
  await loadCatalog();
  renderCart();
  bindUI();
});

// ─── Catalog ──────────────────────────────────────────────
async function loadCatalog() {
  try {
    const res = await fetch('/api/catalog');
    const { items } = await res.json();
    renderItems(items);
  } catch (err) {
    document.getElementById('loading-msg').textContent =
      'Could not load items. Please refresh.';
  }
}

function renderItems(items) {
  const grid = document.getElementById('items-grid');
  grid.innerHTML = '';

  if (!items.length) {
    grid.innerHTML = '<p>No items available right now.</p>';
    return;
  }

  items.forEach(item => {
    const defaultVariation = item.variations[0];
    const price = (defaultVariation.priceCents / 100).toFixed(2);

    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" />` : ''}
      <h3>${item.name}</h3>
      <p class="item-description">${item.description}</p>
      ${item.variations.length > 1 ? `
        <select class="variation-select" data-item-id="${item.id}">
          ${item.variations.map(v =>
            `<option value="${v.id}" data-price="${v.priceCents}" data-currency="${v.currency}">
              ${v.name} — $${(v.priceCents / 100).toFixed(2)}
            </option>`
          ).join('')}
        </select>
      ` : `<p class="item-price">$${price} ${defaultVariation.currency}</p>`}
      <button class="btn-add-to-cart"
        data-variation-id="${defaultVariation.id}"
        data-name="${item.name} ${defaultVariation.name !== 'Regular' ? '— ' + defaultVariation.name : ''}"
        data-price="${defaultVariation.priceCents}"
        data-currency="${defaultVariation.currency}">
        Add to Cart
      </button>
    `;

    // Update button data when variation changes
    const select = card.querySelector('.variation-select');
    const btn = card.querySelector('.btn-add-to-cart');
    if (select) {
      select.addEventListener('change', () => {
        const opt = select.options[select.selectedIndex];
        btn.dataset.variationId = opt.value;
        btn.dataset.price = opt.dataset.price;
        btn.dataset.currency = opt.dataset.currency;
        btn.dataset.name = `${item.name} — ${opt.textContent.split('—')[0].trim()}`;
      });
    }

    grid.appendChild(card);
  });
}

// ─── Cart ─────────────────────────────────────────────────
function addToCart(variationId, name, priceCents, currency) {
  const existing = cart.find(c => c.variationId === variationId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ variationId, name, priceCents, currency, quantity: 1 });
  }
  renderCart();
}

function removeFromCart(variationId) {
  cart = cart.filter(c => c.variationId !== variationId);
  renderCart();
}

function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');

  if (!cart.length) {
    itemsEl.innerHTML = '<p>Your cart is empty.</p>';
    totalEl.textContent = 'Total: $0.00';
    return;
  }

  let totalCents = 0;
  itemsEl.innerHTML = cart.map(c => {
    const lineCents = c.priceCents * c.quantity;
    totalCents += lineCents;
    return `
      <div class="cart-item">
        <span>${c.name}</span>
        <span>x${c.quantity}</span>
        <span>$${(lineCents / 100).toFixed(2)}</span>
        <button class="btn-remove" data-id="${c.variationId}">✕</button>
      </div>
    `;
  }).join('');

  totalEl.textContent = `Total: $${(totalCents / 100).toFixed(2)} ${cart[0]?.currency || 'CAD'}`;
}

// ─── Checkout Flow ────────────────────────────────────────
async function startCheckout() {
  if (!cart.length) return;

  // Pre-fill email if customer logged in
  if (customer) {
    document.getElementById('checkout-email').value = customer.email;
    document.getElementById('checkout-first-name').value = customer.givenName || '';
    document.getElementById('checkout-last-name').value = customer.familyName || '';
  }

  document.getElementById('checkout-modal').style.display = 'flex';
  await initSquareCard();
}

async function initSquareCard() {
  if (squareCard) {
    squareCard.destroy();
    squareCard = null;
  }

  const payments = Square.payments(APP_ID, LOCATION_ID);
  squareCard = await payments.card();
  await squareCard.attach('#card-container');
}

async function processPayment() {
  const statusEl = document.getElementById('payment-status');
  const email = document.getElementById('checkout-email').value.trim();
  const firstName = document.getElementById('checkout-first-name').value.trim();
  const lastName = document.getElementById('checkout-last-name').value.trim();

  if (!email) {
    statusEl.textContent = 'Please enter your email.';
    return;
  }

  statusEl.textContent = 'Creating order...';

  try {
    // Step 1: create or find customer
    let customerId = customer?.customerId;
    if (!customerId) {
      const custRes = await fetch('/api/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          email,
          givenName: firstName,
          familyName: lastName,
        }),
      });
      const custData = await custRes.json();
      customerId = custData.customerId;
      saveCustomerToStorage({ customerId, email, givenName: firstName, familyName: lastName });
    }

    // Step 2: create order
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartItems: cart.map(c => ({
          variationId: c.variationId,
          quantity: c.quantity,
        })),
        customerId,
      }),
    });
    const orderData = await orderRes.json();
    if (!orderData.orderId) throw new Error('Order creation failed');

    currentOrderId = orderData.orderId;
    currentOrderTotal = orderData.totalCents;
    statusEl.textContent = 'Processing payment...';

    // Step 3: tokenize card
    const tokenResult = await squareCard.tokenize();
    if (tokenResult.status !== 'OK') {
      statusEl.textContent = 'Card error: ' + tokenResult.errors?.[0]?.message;
      return;
    }

    // Step 4: charge
    const payRes = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: tokenResult.token,
        orderId: currentOrderId,
        amountCents: currentOrderTotal,
        currency: cart[0]?.currency || 'CAD',
        customerId,
        email,
      }),
    });
    const payData = await payRes.json();

    if (payData.status === 'COMPLETED') {
      cart = [];
      renderCart();
      document.getElementById('checkout-modal').style.display = 'none';
      statusEl.textContent = '';
      alert(`Payment successful! Receipt: ${payData.receiptUrl}`);
    } else {
      statusEl.textContent = 'Payment did not complete. Please try again.';
    }

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Something went wrong. Please try again.';
  }
}

// ─── Customer Auth ────────────────────────────────────────
async function submitLogin() {
  const email = document.getElementById('login-email').value.trim();
  const firstName = document.getElementById('login-first').value.trim();
  const lastName = document.getElementById('login-last').value.trim();
  const statusEl = document.getElementById('login-status');

  if (!email) {
    statusEl.textContent = 'Email required.';
    return;
  }

  statusEl.textContent = 'Looking up account...';

  try {
    // Try lookup first, then register if not found
    const action = firstName ? 'register' : 'lookup';
    const res = await fetch('/api/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, email, givenName: firstName, familyName: lastName }),
    });

    if (res.status === 404) {
      statusEl.textContent = 'No account found. Enter your name to register.';
      return;
    }

    const data = await res.json();
    saveCustomerToStorage({
      customerId: data.customerId,
      email: data.email,
      givenName: data.givenName,
      familyName: data.familyName,
    });
    updateCustomerUI();
    document.getElementById('login-modal').style.display = 'none';
    statusEl.textContent = '';
  } catch {
    statusEl.textContent = 'Error. Please try again.';
  }
}

async function loadOrderHistory() {
  if (!customer) return;
  const listEl = document.getElementById('orders-list');
  listEl.innerHTML = 'Loading...';
  document.getElementById('orders-modal').style.display = 'flex';

  try {
    const res = await fetch(`/api/orders?customerId=${customer.customerId}`);
    const { orders } = await res.json();

    if (!orders.length) {
      listEl.innerHTML = '<p>No completed orders yet.</p>';
      return;
    }

    listEl.innerHTML = orders.map(o => `
      <div class="order-card">
        <p><strong>${new Date(o.createdAt).toLocaleDateString()}</strong></p>
        <ul>
          ${o.lineItems.map(li =>
            `<li>${li.name} x${li.quantity} — $${(li.totalCents / 100).toFixed(2)}</li>`
          ).join('')}
        </ul>
        <p>Total: $${(o.totalCents / 100).toFixed(2)} ${o.currency}</p>
      </div>
    `).join('');
  } catch {
    listEl.innerHTML = '<p>Could not load orders.</p>';
  }
}

// ─── Customer Storage (localStorage session) ──────────────
function saveCustomerToStorage(c) {
  customer = c;
  localStorage.setItem('sq_customer', JSON.stringify(c));
  updateCustomerUI();
}

function loadCustomerFromStorage() {
  const stored = localStorage.getItem('sq_customer');
  if (stored) {
    customer = JSON.parse(stored);
    updateCustomerUI();
  }
}

function updateCustomerUI() {
  const greetingEl = document.getElementById('customer-greeting');
  const loginBtn = document.getElementById('btn-login');
  const ordersBtn = document.getElementById('btn-orders');
  const signoutBtn = document.getElementById('btn-signout');

  if (customer) {
    greetingEl.textContent = `Hi, ${customer.givenName || customer.email}`;
    loginBtn.style.display = 'none';
    ordersBtn.style.display = 'inline-block';
    signoutBtn.style.display = 'inline-block';
  } else {
    greetingEl.textContent = 'Not signed in';
    loginBtn.style.display = 'inline-block';
    ordersBtn.style.display = 'none';
    signoutBtn.style.display = 'none';
  }
}

// ─── Event Bindings ───────────────────────────────────────
function bindUI() {
  // Add to cart
  document.getElementById('items-grid').addEventListener('click', e => {
    if (e.target.classList.contains('btn-add-to-cart')) {
      const btn = e.target;
      addToCart(
        btn.dataset.variationId,
        btn.dataset.name,
        parseInt(btn.dataset.price),
        btn.dataset.currency
      );
    }
  });

  // Remove from cart
  document.getElementById('cart-items').addEventListener('click', e => {
    if (e.target.classList.contains('btn-remove')) {
      removeFromCart(e.target.dataset.id);
    }
  });

  // Checkout
  document.getElementById('btn-checkout').addEventListener('click', startCheckout);
  document.getElementById('btn-pay').addEventListener('click', processPayment);
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('checkout-modal').style.display = 'none';
  });

  // Login
  document.getElementById('btn-login').addEventListener('click', () => {
    document.getElementById('login-modal').style.display = 'flex';
  });
  document.getElementById('btn-submit-login').addEventListener('click', submitLogin);
  document.getElementById('btn-close-login').addEventListener('click', () => {
    document.getElementById('login-modal').style.display = 'none';
  });

  // Orders
  document.getElementById('btn-orders').addEventListener('click', loadOrderHistory);
  document.getElementById('btn-close-orders').addEventListener('click', () => {
    document.getElementById('orders-modal').style.display = 'none';
  });

  // Sign out
  document.getElementById('btn-signout').addEventListener('click', () => {
    customer = null;
    localStorage.removeItem('sq_customer');
    updateCustomerUI();
  });
}
```

---

## PHASE 4 — Deploy

### Step 11: Link environment variables in Vercel

```bash
vercel env add SQUARE_ACCESS_TOKEN
vercel env add SQUARE_APP_ID
vercel env add SQUARE_LOCATION_ID
vercel env add SQUARE_ENVIRONMENT
```

Or add them through the Vercel dashboard UI.

### Step 12: Deploy

```bash
vercel --prod
```

---

## PHASE 5 — Test Checklist

Run through these in order on your live URL:

- [ ] `/api/catalog` returns your items as JSON (open in browser)
- [ ] Shop page loads items from your Square catalog
- [ ] Item with multiple variations shows a dropdown
- [ ] Add to cart, remove from cart, totals calculate correctly
- [ ] Register as a new customer with email + name
- [ ] Log in as existing customer by email only
- [ ] Cart goes through checkout, Square card widget appears
- [ ] Complete a test payment (use a real card — this is production)
- [ ] Receipt URL returned after payment
- [ ] Order appears in "My Orders" after a few seconds
- [ ] Sign out clears customer session

---

---

## PHASE 6 — Shared Navigation & CSS

### Step 13: `css/main.css` — Single stylesheet for all pages

All pages link to the same stylesheet. Add a CSS class per page on the `<body>` tag so you can scope page-specific styles without separate files.

```html
<!-- index.html -->
<body class="page-home">

<!-- shop.html -->
<body class="page-shop">

<!-- about.html -->
<body class="page-about">

<!-- catering.html -->
<body class="page-catering">

<!-- contact.html -->
<body class="page-contact">

<!-- gifting.html -->
<body class="page-gifting">
```

All pages share the same `<head>` block:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>A Slice of G — [Page Name]</title>
  <link rel="stylesheet" href="css/main.css" />
</head>
```

### Step 14: `js/nav.js` — Shared navigation component

Create this file and include it on every page. It injects the nav so you only maintain it in one place.

```javascript
// js/nav.js
// Inject this into every page: <script src="js/nav.js"></script>
// Add <nav id="main-nav"></nav> at the top of each page's <body>

const navLinks = [
  { href: 'index.html',    label: 'Home' },
  { href: 'shop.html',     label: 'Shop All' },
  { href: 'catering.html', label: 'Catering' },
  { href: 'gifting.html',  label: 'Corporate Gifting' },
  { href: 'about.html',    label: 'About Us' },
  { href: 'contact.html',  label: 'Contact' },
];

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  nav.innerHTML = `
    <div class="nav-inner">
      <a class="nav-logo" href="index.html">A Slice of G</a>
      <button class="nav-toggle" id="nav-toggle">☰</button>
      <ul class="nav-links" id="nav-links">
        ${navLinks.map(link => `
          <li>
            <a href="${link.href}"
               class="${currentPage === link.href ? 'active' : ''}">
              ${link.label}
            </a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  // Mobile toggle
  document.getElementById('nav-toggle').addEventListener('click', () => {
    document.getElementById('nav-links').classList.toggle('open');
  });
});
```

Add to every page body:
```html
<nav id="main-nav"></nav>
<script src="js/nav.js"></script>
```

---

## PHASE 7 — About Us Page

### Step 15: `about.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>About Us — A Slice of G</title>
  <link rel="stylesheet" href="css/main.css" />
</head>
<body class="page-about">
  <nav id="main-nav"></nav>

  <section class="about-hero">
    <h1>About A Slice of G</h1>
  </section>

  <section class="about-content">

    <!-- PHOTO PLACEHOLDER — replace src with your image path -->
    <div class="about-photo-block">
      <div class="photo-placeholder">
        <!-- Replace this div with: <img src="images/your-photo.jpg" alt="Simone, founder of A Slice of G" /> -->
        <span>[ Your photo here ]</span>
      </div>
    </div>

    <div class="about-text">
      <h2>The Story Behind the Slice</h2>

      <p>
        A Slice of G started where all the best things do — in a kitchen,
        with someone who knew what she was doing, and a granddaughter paying
        close attention.
      </p>

      <p>
        My grandmother Gloria taught me to bake. She also taught me something
        more important: that the way to someone's heart is through their stomach.
        And that even when someone says no thank you, you serve them a slice
        of cake anyway. They always come back for seconds.
      </p>

      <p>
        Our gold Jamaican rum cake is grandma Gloria's original secret recipe —
        made with premium <strong>Appleton Estate</strong> and
        <strong>Wray &amp; Nephew</strong> rum, exactly as she passed it down.
        It is dense, aromatic, and entirely unapologetic about what it is.
        No shortcuts. No substitutions. The recipe is hers. The cake is ours.
      </p>

      <p>
        A Slice of G is an artisan bakery based in downtown Toronto,
        specializing in rum-infused cakes and cookies made with real ingredients
        and real intention. Every order is made with care — whether it's a box
        of cookies, a catering spread, or a custom gift sent on your behalf to
        someone who deserves a memorable moment.
      </p>

      <p>
        We believe food is one of the few things that works on everyone.
        Even the people who said no thank you.
      </p>
    </div>

  </section>

  <script src="js/nav.js"></script>
</body>
</html>
```

**CSS to add to `main.css` for the about page:**

```css
/* ── About Page ─────────────────────────────── */
.about-hero {
  text-align: center;
  padding: 3rem 1rem 1rem;
}

.about-content {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  max-width: 960px;
  margin: 2rem auto;
  padding: 0 1.5rem;
  align-items: flex-start;
}

.about-photo-block {
  flex: 0 0 280px;
}

.photo-placeholder {
  width: 280px;
  height: 350px;
  background: #f0ece4;
  border: 2px dashed #c9b99a;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #999;
  font-size: 0.9rem;
}

.about-text {
  flex: 1;
  min-width: 260px;
}

.about-text h2 {
  margin-top: 0;
}

.about-text p {
  line-height: 1.75;
  margin-bottom: 1.2rem;
}
```

---

## PHASE 8 — Shop All Page with Category Filtering

### Step 16: `api/categories.js` — Fetch Square categories

```javascript
import { Client, Environment } from 'square';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { result } = await client.catalogApi.listCatalog(undefined, 'CATEGORY');
    const categories = (result.objects || [])
      .filter(o => !o.isDeleted)
      .map(o => ({
        id: o.id,
        name: o.categoryData?.name || 'Uncategorized',
      }));

    return res.status(200).json({ categories });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load categories' });
  }
}
```

### Step 17: Update `api/catalog.js` to include category IDs on each item

In the item mapping inside `api/catalog.js`, add:

```javascript
categoryId: data.categoryId || null,
```

So each item object now includes a `categoryId` that maps to the categories endpoint.

### Step 18: `shop.html` — Category filter UI

Add this filter bar above the items grid:

```html
<!-- Category Filter Bar -->
<div id="filter-bar">
  <button class="filter-btn active" data-category="all">All</button>
  <!-- Category buttons injected by JS -->
</div>

<section id="catalog">
  <div id="items-grid">
    <p id="loading-msg">Loading items...</p>
  </div>
</section>
```

### Step 19: Category filtering logic in `js/shop.js`

Add after `loadCatalog()`:

```javascript
let allItems = [];
let activeCategory = 'all';

async function loadCatalog() {
  try {
    const [catalogRes, categoriesRes] = await Promise.all([
      fetch('/api/catalog'),
      fetch('/api/categories'),
    ]);

    const { items } = await catalogRes.json();
    const { categories } = await categoriesRes.json();

    allItems = items;
    renderFilterBar(categories);
    renderItems(items);
  } catch (err) {
    document.getElementById('loading-msg').textContent =
      'Could not load items. Please refresh.';
  }
}

function renderFilterBar(categories) {
  const bar = document.getElementById('filter-bar');
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat.id;
    btn.textContent = cat.name;
    btn.addEventListener('click', () => {
      activeCategory = cat.id;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filtered = allItems.filter(item => item.categoryId === cat.id);
      renderItems(filtered);
    });
    bar.appendChild(btn);
  });

  // All button resets
  bar.querySelector('[data-category="all"]').addEventListener('click', () => {
    activeCategory = 'all';
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    bar.querySelector('[data-category="all"]').classList.add('active');
    renderItems(allItems);
  });
}
```

---

## PHASE 9 — Catering Page

### Step 20: `catering.html`

Packages are laid out as cards. You will drop Square payment links directly into the `href` on each button — no API needed for this page.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Catering — A Slice of G</title>
  <link rel="stylesheet" href="css/main.css" />
</head>
<body class="page-catering">
  <nav id="main-nav"></nav>

  <section class="catering-hero">
    <h1>Catering</h1>
    <p>Sweet tables, corporate events, celebrations, and everything in between.</p>
  </section>

  <section class="catering-packages">

    <!-- PACKAGE 1 — replace content and payment link -->
    <div class="package-card">
      <h2>Package Name 1</h2>
      <p class="package-description">Description of what's included in this package.</p>
      <ul class="package-includes">
        <li>Item one</li>
        <li>Item two</li>
        <li>Item three</li>
      </ul>
      <p class="package-price">$000</p>
      <!-- Replace # with your Square payment link -->
      <a href="#" class="btn-book" target="_blank">Book This Package</a>
    </div>

    <!-- PACKAGE 2 -->
    <div class="package-card">
      <h2>Package Name 2</h2>
      <p class="package-description">Description of what's included in this package.</p>
      <ul class="package-includes">
        <li>Item one</li>
        <li>Item two</li>
        <li>Item three</li>
      </ul>
      <p class="package-price">$000</p>
      <a href="#" class="btn-book" target="_blank">Book This Package</a>
    </div>

    <!-- PACKAGE 3 -->
    <div class="package-card">
      <h2>Package Name 3</h2>
      <p class="package-description">Description of what's included in this package.</p>
      <ul class="package-includes">
        <li>Item one</li>
        <li>Item two</li>
        <li>Item three</li>
      </ul>
      <p class="package-price">$000</p>
      <a href="#" class="btn-book" target="_blank">Book This Package</a>
    </div>

  </section>

  <section class="catering-note">
    <p>
      Have a custom request or a larger event in mind?
      <a href="contact.html">Get in touch</a> and we'll work something out.
    </p>
  </section>

  <script src="js/nav.js"></script>
</body>
</html>
```

---

## PHASE 10 — Contact Page

### Step 21: `contact.html`

Simple contact form. Wire up to EmailJS or your preferred form handler.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contact — A Slice of G</title>
  <link rel="stylesheet" href="css/main.css" />
</head>
<body class="page-contact">
  <nav id="main-nav"></nav>

  <section class="contact-hero">
    <h1>Contact Us</h1>
    <p>Got a question? A custom order? A situation that calls for rum cake? We're here.</p>
  </section>

  <section class="contact-form-section">
    <form id="contact-form">
      <label for="c-name">Name</label>
      <input type="text" id="c-name" name="name" placeholder="Your name" required />

      <label for="c-email">Email</label>
      <input type="email" id="c-email" name="email" placeholder="your@email.com" required />

      <label for="c-subject">Subject</label>
      <select id="c-subject" name="subject">
        <option value="general">General Inquiry</option>
        <option value="order">Custom Order</option>
        <option value="catering">Catering</option>
        <option value="gifting">Corporate Gifting</option>
      </select>

      <label for="c-message">Message</label>
      <textarea id="c-message" name="message" rows="5" placeholder="Tell us what you need" required></textarea>

      <button type="submit" class="btn-submit">Send Message</button>
      <p id="contact-status"></p>
    </form>
  </section>

  <script src="js/nav.js"></script>
</body>
</html>
```

---

## PHASE 11 — Corporate Gifting Page

### Overview of this page

- **3 subscription package cards** (monthly and quarterly variants, prices TBD)
- **On-Demand order option** (higher per-cake price, Square payment link)
- **How It Works** section explaining the realtor gifting flow
- **Learn More button** → email capture modal → saves to Google Sheet → triggers PDF download + EmailJS welcome email

### Step 22: `gifting.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Corporate Gifting — A Slice of G</title>
  <link rel="stylesheet" href="css/main.css" />
  <!-- EmailJS SDK -->
  <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
</head>
<body class="page-gifting">
  <nav id="main-nav"></nav>

  <!-- HERO -->
  <section class="gifting-hero">
    <h1>Corporate Gifting</h1>
    <p>
      Close the deal. Keep the client. Send the cake.
    </p>
    <p class="gifting-sub">
      Built for realtors and professionals who understand that a memorable
      closing gift says more than a thank-you card ever could.
    </p>
    <button id="btn-learn-more" class="btn-primary">Learn How It Works</button>
  </section>

  <!-- HOW IT WORKS -->
  <section class="how-it-works">
    <h2>How It Works</h2>
    <div class="steps-grid">
      <div class="step-card">
        <span class="step-num">01</span>
        <h3>Choose Your Plan</h3>
        <p>
          Select a monthly or quarterly subscription based on how many clients
          you close. Prepay for your cakes at a better rate than on-demand.
        </p>
      </div>
      <div class="step-card">
        <span class="step-num">02</span>
        <h3>Redeem When You Need It</h3>
        <p>
          Got a closing? Fill out a simple redemption form with your client's
          delivery details and any message for the custom card. We take it from there.
        </p>
      </div>
      <div class="step-card">
        <span class="step-num">03</span>
        <h3>We Deliver the Moment</h3>
        <p>
          Your client receives a beautifully packaged Jamaican rum cake with
          a custom card — branded or personal, your call — so you stay
          top of mind long after the keys are handed over.
        </p>
      </div>
    </div>
  </section>

  <!-- SUBSCRIPTION PACKAGES -->
  <section class="gifting-packages">
    <h2>Subscription Plans</h2>
    <p class="section-sub">Prepay for cakes. Redeem on your schedule. Never miss a moment.</p>

    <div class="packages-grid">

      <!-- PACKAGE 1 — Starter -->
      <div class="gift-package-card">
        <h3>Starter</h3>
        <p class="pkg-tagline">For the agent closing a few deals a month.</p>
        <div class="pkg-pricing">
          <div class="price-option">
            <span class="price-label">Monthly</span>
            <span class="price-amount">$TBD / mo</span>
            <span class="price-detail">X cakes per month</span>
          </div>
          <div class="price-option">
            <span class="price-label">Quarterly</span>
            <span class="price-amount">$TBD / quarter</span>
            <span class="price-detail">X cakes, save X%</span>
          </div>
        </div>
        <ul class="pkg-features">
          <li>Custom card with every delivery</li>
          <li>Cakes roll over within billing period</li>
          <li>Dedicated gifting portal access</li>
        </ul>
        <!-- Subscription billing solution TBD — placeholder button -->
        <button class="btn-subscribe" disabled>Coming Soon</button>
        <p class="pkg-note">Subscription billing launching shortly. <a href="contact.html">Contact us</a> to get set up manually in the meantime.</p>
      </div>

      <!-- PACKAGE 2 — Professional -->
      <div class="gift-package-card featured">
        <div class="pkg-badge">Most Popular</div>
        <h3>Professional</h3>
        <p class="pkg-tagline">For the consistent closer who gifts strategically.</p>
        <div class="pkg-pricing">
          <div class="price-option">
            <span class="price-label">Monthly</span>
            <span class="price-amount">$TBD / mo</span>
            <span class="price-detail">X cakes per month</span>
          </div>
          <div class="price-option">
            <span class="price-label">Quarterly</span>
            <span class="price-amount">$TBD / quarter</span>
            <span class="price-detail">X cakes, save X%</span>
          </div>
        </div>
        <ul class="pkg-features">
          <li>Custom card with every delivery</li>
          <li>Cakes roll over within billing period</li>
          <li>Priority fulfillment</li>
          <li>Custom branded card option</li>
        </ul>
        <button class="btn-subscribe" disabled>Coming Soon</button>
        <p class="pkg-note">Subscription billing launching shortly. <a href="contact.html">Contact us</a> to get set up manually in the meantime.</p>
      </div>

      <!-- PACKAGE 3 — Elite -->
      <div class="gift-package-card">
        <h3>Elite</h3>
        <p class="pkg-tagline">For the top producer who never misses a client touch.</p>
        <div class="pkg-pricing">
          <div class="price-option">
            <span class="price-label">Monthly</span>
            <span class="price-amount">$TBD / mo</span>
            <span class="price-detail">X cakes per month</span>
          </div>
          <div class="price-option">
            <span class="price-label">Quarterly</span>
            <span class="price-amount">$TBD / quarter</span>
            <span class="price-detail">X cakes, save X%</span>
          </div>
        </div>
        <ul class="pkg-features">
          <li>Custom card with every delivery</li>
          <li>Cakes roll over within billing period</li>
          <li>Priority fulfillment</li>
          <li>Fully branded packaging</li>
          <li>Dedicated account contact</li>
        </ul>
        <button class="btn-subscribe" disabled>Coming Soon</button>
        <p class="pkg-note">Subscription billing launching shortly. <a href="contact.html">Contact us</a> to get set up manually in the meantime.</p>
      </div>

    </div>
  </section>

  <!-- ON-DEMAND -->
  <section class="on-demand-section">
    <h2>On-Demand Orders</h2>
    <p>
      Not ready for a subscription? No problem. Order individual gifting cakes
      as you need them — no commitment, no minimum. Just a higher per-cake rate.
    </p>
    <div class="on-demand-card">
      <p class="on-demand-price">$TBD per cake</p>
      <p>Includes custom card and delivery to your client's address.</p>
      <!-- Replace # with your Square on-demand payment link -->
      <a href="#" class="btn-primary" target="_blank" id="btn-on-demand">Order Now</a>
    </div>
  </section>

  <!-- LEARN MORE / EMAIL CAPTURE -->
  <section class="gifting-cta">
    <h2>Want the Full Picture?</h2>
    <p>Download our corporate gifting brochure for full package details, pricing, and FAQs.</p>
    <button id="btn-get-brochure" class="btn-primary">Get the Brochure</button>
  </section>

  <!-- EMAIL CAPTURE MODAL -->
  <div id="brochure-modal" style="display:none">
    <div class="modal-inner">
      <h2>Get the Brochure</h2>
      <p>Enter your email and we'll send it right over.</p>
      <input type="email" id="brochure-email" placeholder="your@email.com" />
      <button id="btn-brochure-submit" class="btn-primary">Send Me the Brochure</button>
      <p id="brochure-status"></p>
      <button class="btn-close-modal" id="btn-close-brochure">✕</button>
    </div>
  </div>
  <div id="modal-overlay" style="display:none"></div>

  <script src="js/nav.js"></script>
  <script src="js/gifting.js"></script>
</body>
</html>
```

---

### Step 23: `js/gifting.js` — Email capture, Google Sheets, EmailJS, PDF download

```javascript
// ── EmailJS config ───────────────────────────────────────
const EMAILJS_SERVICE_ID  = 'service_z6rd8xm';
const EMAILJS_TEMPLATE_ID = 'template_da2a2mm';

// ── Google Apps Script Web App URL ───────────────────────
// Paste your deployed Apps Script URL here after Step 24
const GOOGLE_SHEET_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL';

// ── PDF brochure path ────────────────────────────────────
const BROCHURE_PATH = 'brochure.pdf';

// ── Init EmailJS ─────────────────────────────────────────
emailjs.init('MJ301FjlzSsErNvcg');

// ── Modal controls ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const modal    = document.getElementById('brochure-modal');
  const overlay  = document.getElementById('modal-overlay');

  document.getElementById('btn-get-brochure').addEventListener('click', () => {
    modal.style.display   = 'flex';
    overlay.style.display = 'block';
  });

  document.getElementById('btn-close-brochure').addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  document.getElementById('btn-brochure-submit').addEventListener('click', handleBrochureSubmit);

  // Learn More button in hero scrolls to brochure CTA
  document.getElementById('btn-learn-more').addEventListener('click', () => {
    document.querySelector('.how-it-works').scrollIntoView({ behavior: 'smooth' });
  });
});

function closeModal() {
  document.getElementById('brochure-modal').style.display = 'none';
  document.getElementById('modal-overlay').style.display  = 'none';
}

async function handleBrochureSubmit() {
  const email    = document.getElementById('brochure-email').value.trim();
  const statusEl = document.getElementById('brochure-status');

  if (!email || !email.includes('@')) {
    statusEl.textContent = 'Please enter a valid email address.';
    return;
  }

  const btn = document.getElementById('btn-brochure-submit');
  btn.disabled = true;
  statusEl.textContent = 'Sending...';

  try {
    // Step 1: Save email to Google Sheet
    await saveEmailToSheet(email);

    // Step 2: Send EmailJS email with brochure/template
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: email,
      // Add any other template variables your EmailJS template expects
      // e.g. to_name: '', brochure_url: 'https://yourdomain.vercel.app/brochure.pdf'
    });

    // Step 3: Trigger PDF download in browser
    const link = document.createElement('a');
    link.href     = BROCHURE_PATH;
    link.download = 'ASliceOfG-CorporateGifting.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    statusEl.textContent = '✓ Check your inbox — brochure is on its way!';
    document.getElementById('brochure-email').value = '';
    btn.disabled = false;

    // Auto-close modal after 3 seconds
    setTimeout(closeModal, 3000);

  } catch (err) {
    console.error('Brochure submit error:', err);
    statusEl.textContent = 'Something went wrong. Please try again.';
    btn.disabled = false;
  }
}

async function saveEmailToSheet(email) {
  // Calls your Google Apps Script web app
  // Apps Script handles writing to the sheet (see Step 24)
  await fetch(GOOGLE_SHEET_URL, {
    method: 'POST',
    // Apps Script requires no-cors for cross-origin POST from a static site
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      source: 'gifting-page',
      timestamp: new Date().toISOString(),
    }),
  });
  // Note: no-cors means we get an opaque response — we can't read it.
  // The sheet will receive the data regardless. Handle errors on the
  // Apps Script side with MailApp.sendEmail() alerts if needed.
}
```

---

### Step 24: Google Apps Script — Save emails to your sheet

You said you'll create the Apps Script, so here is the exact script to paste in:

**In Google Sheets → Extensions → Apps Script → paste this:**

```javascript
// Google Apps Script — paste into your Apps Script editor
// Deploy as: Web App → Execute as: Me → Who has access: Anyone

const SHEET_NAME = 'Gifting Leads'; // rename to match your tab

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SHEET_NAME);

    // Add header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Email', 'Source', 'Timestamp']);
    }

    sheet.appendRow([
      data.email || '',
      data.source || '',
      data.timestamp || new Date().toISOString(),
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

**After pasting:**
1. Click **Deploy → New Deployment**
2. Type: **Web App**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click Deploy → copy the **Web App URL**
6. Paste that URL into `js/gifting.js` as `GOOGLE_SHEET_URL`

---

### Step 25: EmailJS template setup

In your EmailJS dashboard:
- Open template `template_da2a2mm`
- Make sure these variables are in the template body (adjust to match what you pass in `gifting.js`):
  - `{{to_email}}` — recipient address
  - `{{brochure_url}}` — direct link to your PDF (e.g. `https://yourdomain.vercel.app/brochure.pdf`)
- Set **To Email** field to `{{to_email}}`
- Your public key `MJ301FjlzSsErNvcg` is already set in `gifting.js`

---

## PHASE 12 — Subscription Billing (Future Implementation Note)

The subscription packages are built in the UI but marked "Coming Soon." When you're ready to activate them, here are your two real options:

**Option A: Square Subscriptions API**
Square has a native Subscriptions API. You'd create subscription plans in the Square dashboard and use the API to enroll customers. The redemption flow (filling out client delivery info) would be a form that decrements their remaining cake balance. This keeps everything in Square's ecosystem.

**Option B: Stripe Billing (if you ever move away from Square for subscriptions)**
Stripe has more flexible subscription logic. Not recommended if you want to stay all-Square.

**Recommended path:** Use Square Subscriptions API. When you're ready, a new `api/subscribe.js` function will handle plan enrollment, and a `redeem.html` page will give subscribers a form to submit a delivery.

For now, clicking "Coming Soon" routes interested clients to `contact.html` so you can onboard them manually while the billing infrastructure is built.

---

## NOTES FOR CLAUDE CODE

- All API functions use ES module syntax (`import`/`export default`). If your project uses CommonJS, replace with `require`/`module.exports`.
- The `square` npm package uses `BigInt` for money amounts — do not try to JSON serialize BigInt directly (the functions above convert with `Number()` before returning to the client).
- `idempotencyKey: crypto.randomUUID()` prevents duplicate charges if a request is retried.
- The customer auth here is **simplified** — it uses Square as the source of truth and localStorage for the session. For stricter auth, add JWT tokens or use Clerk.
- Webhook is **not required** for this implementation. Add it later if you want real-time order status (e.g. to send confirmation emails via Square's built-in receipt, or trigger your own email via SendGrid).
- Your App ID and Location ID are safe to include in frontend HTML. Your Access Token must never leave the server.
```
