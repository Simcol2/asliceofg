# Realtor Gifting Portal — Full Implementation Plan
### Stack: Firebase Auth + Firestore · Vercel Serverless Functions · Square API

---

## OVERVIEW

The portal is a separate protected section of the site accessible at `/portal.html`. Realtors:
1. Create an account (email/password or Google)
2. Complete their profile + RECO verification
3. Choose a package
4. Access their dashboard — view balance, redeem gifts, track orders

---

## DEPENDENCIES TO INSTALL

```bash
npm install firebase
```

Add to your `.env`:
```
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY=your_private_key
```

Add to Vercel environment variables (same four above).

---

## FIRESTORE COLLECTIONS

Create these collections in your Firebase console:

### `realtors` collection
Each document ID = Firebase Auth UID

```json
{
  "uid": "firebase_auth_uid",
  "email": "agent@example.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "416-555-0100",
  "brokerageName": "Royal LePage",
  "recoNumber": "1234567",
  "licenseDate": "2024-09-01",
  "areasServed": ["Downtown Toronto", "Etobicoke", "North York"],
  "logoUrl": null,
  "plan": "first_impression",
  "giftsTotal": 3,
  "giftsRemaining": 3,
  "installmentsPaid": 1,
  "installmentsTotal": 3,
  "setupComplete": true,
  "createdAt": "2026-03-30T00:00:00Z",
  "isNewAgent": true,
  "isVerified": false
}
```

### `redemptions` collection
Each document = one gift redemption

```json
{
  "redemptionId": "auto_generated",
  "realtorUid": "firebase_auth_uid",
  "realtorName": "Jane Smith",
  "recipientName": "John & Mary Chen",
  "recipientAddress": "123 King St W, Toronto ON M5H 1A1",
  "deliveryDate": "2026-04-15",
  "deliveryMethod": "shipping",
  "greeting": "congratulations",
  "greetingText": "Congratulations on your new home! Wishing you many wonderful memories.",
  "notes": "Please buzz unit 402",
  "status": "pending",
  "trackingNumber": null,
  "carrier": null,
  "trackingUrl": null,
  "createdAt": "2026-03-30T00:00:00Z",
  "updatedAt": "2026-03-30T00:00:00Z"
}
```

---

## FILE STRUCTURE ADDITIONS

```
/
├── portal.html              ← main portal shell (auth gated)
├── js/
│   ├── firebase-init.js     ← Firebase config + init
│   ├── portal-auth.js       ← sign in / sign up / Google auth
│   ├── portal-profile.js    ← profile setup form
│   ├── portal-dashboard.js  ← dashboard, balance, redeem
│   └── portal-redeem.js     ← redemption form logic
└── api/
    ├── portal-profile.js    ← POST save/update realtor profile
    ├── portal-redeem.js     ← POST submit redemption to Firestore + notify you
    ├── portal-orders.js     ← GET realtor's redemption history
    └── portal-tracking.js   ← PATCH update tracking number (admin use)
```

---

## PHASE 1 — Firebase Initialization

### Step 1: `js/firebase-init.js`

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
```

Note: Firebase API key is safe to expose in the browser for client SDK.
The sensitive keys (service account) stay in `.env` for server-side Vercel functions only.

---

## PHASE 2 — Portal HTML Shell

### Step 2: `portal.html` — full page structure

The portal uses a single-page approach — different `<section>` panels shown/hidden by JS based on auth state and profile completion.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Gifting Portal — A Slice of G</title>
  <link rel="stylesheet" href="css/main.css" />
  <link rel="stylesheet" href="css/portal.css" />
</head>
<body class="page-portal">

  <!-- NAV -->
  <nav id="main-nav"></nav>

  <!-- ── PANEL 1: AUTH (shown when logged out) ── -->
  <section id="panel-auth" class="portal-panel">
    <div class="portal-card">

      <div class="portal-logo">A Slice of G</div>
      <h1 class="portal-heading">Gifting Portal</h1>
      <p class="portal-sub">Sign in to manage your gifting account.</p>

      <!-- Google Sign In -->
      <button id="btn-google-signin" class="btn-google">
        <img src="/public/images/google-icon.svg" width="18" height="18" alt="Google"/>
        Continue with Google
      </button>

      <div class="portal-divider"><span>or</span></div>

      <!-- Email/Password -->
      <div id="auth-form-area">
        <input type="email"    id="auth-email"    placeholder="Email address" />
        <input type="password" id="auth-password" placeholder="Password" />
        <button id="btn-signin"   class="btn-portal-primary">Sign In</button>
        <button id="btn-register" class="btn-portal-ghost">Create Account</button>
        <p id="auth-status" class="portal-status"></p>
      </div>

      <p class="portal-footer-note">
        New to the program? <a href="gifting.html">Learn about our plans →</a>
      </p>

    </div>
  </section>

  <!-- ── PANEL 2: PROFILE SETUP (shown after first login, before setup complete) ── -->
  <section id="panel-setup" class="portal-panel" style="display:none">
    <div class="portal-card portal-card-wide">

      <div class="setup-steps">
        <div class="setup-step active" data-step="1">01 · Profile</div>
        <div class="setup-step" data-step="2">02 · Verification</div>
        <div class="setup-step" data-step="3">03 · Choose Plan</div>
      </div>

      <!-- Step 1: Profile -->
      <div id="setup-step-1">
        <h2>Tell us about yourself</h2>
        <p class="portal-sub">This information appears on your account and helps us personalise your gifts.</p>
        <div class="form-row">
          <input type="text" id="setup-first"    placeholder="First name" />
          <input type="text" id="setup-last"     placeholder="Last name" />
        </div>
        <input type="tel"  id="setup-phone"      placeholder="Phone number" />
        <input type="text" id="setup-brokerage"  placeholder="Brokerage name" />
        <div class="form-row">
          <input type="text" id="setup-city"     placeholder="Primary city" />
          <input type="text" id="setup-areas"    placeholder="Areas served (comma separated)" />
        </div>
        <button id="btn-setup-next-1" class="btn-portal-primary">Continue →</button>
        <p id="setup-status-1" class="portal-status"></p>
      </div>

      <!-- Step 2: RECO Verification -->
      <div id="setup-step-2" style="display:none">
        <h2>Verify your registration</h2>
        <p class="portal-sub">Your RECO number lets us confirm your registration status. This is required for the New Agent package.</p>
        <input type="text" id="setup-reco"         placeholder="RECO registration number" />
        <input type="date" id="setup-license-date" />
        <label class="portal-label" for="setup-license-date">License issue date</label>
        <div class="portal-checkbox-row">
          <input type="checkbox" id="setup-new-agent-confirm" />
          <label for="setup-new-agent-confirm">
            I confirm I received my Ontario real estate license within the last 12 months. I understand that misrepresentation voids any promotional pricing.
          </label>
        </div>
        <button id="btn-setup-next-2" class="btn-portal-primary">Continue →</button>
        <button id="btn-setup-back-1" class="btn-portal-ghost">← Back</button>
        <p id="setup-status-2" class="portal-status"></p>
      </div>

      <!-- Step 3: Choose Plan -->
      <div id="setup-step-3" style="display:none">
        <h2>Choose your plan</h2>
        <p class="portal-sub">Select a plan to activate your account. Payment is collected via Square invoice.</p>

        <div class="plan-select-grid">

          <div class="plan-select-card" data-plan="first_impression">
            <div class="plan-select-badge new-agent">New agents only</div>
            <div class="plan-select-name">First Impression</div>
            <div class="plan-select-price">$420 <span>· 3 gifts · 6 months</span></div>
            <div class="plan-select-detail">Pay in 1, 2, or 3 installments. No setup fee. No branded box.</div>
          </div>

          <div class="plan-select-card" data-plan="closer">
            <div class="plan-select-name">The Closer</div>
            <div class="plan-select-price">$1,600 <span>· 10 gifts · 12 months</span></div>
            <div class="plan-select-detail">+ $75 setup fee. Branded box. Portal access.</div>
          </div>

          <div class="plan-select-card" data-plan="producer">
            <div class="plan-select-name">The Producer</div>
            <div class="plan-select-price">$3,750 <span>· 25 gifts · 12 months</span></div>
            <div class="plan-select-detail">+ $75 setup fee. Branded box. Priority fulfillment.</div>
          </div>

          <div class="plan-select-card" data-plan="partner">
            <div class="plan-select-name">The Partner</div>
            <div class="plan-select-price">$520 <span>/ quarter · auto-renews</span></div>
            <div class="plan-select-detail">Annual contract. + $75 setup fee. Best per-gift rate.</div>
          </div>

        </div>

        <div id="installment-select" style="display:none">
          <p class="portal-sub">How would you like to pay?</p>
          <div class="installment-options">
            <label><input type="radio" name="installments" value="1" checked /> Pay in full — $420</label>
            <label><input type="radio" name="installments" value="2" /> 2 installments — $210 today, $210 in 30 days</label>
            <label><input type="radio" name="installments" value="3" /> 3 installments — $140 today, $140 in 30 days, $140 in 60 days</label>
          </div>
        </div>

        <button id="btn-setup-submit" class="btn-portal-primary">Submit & Request Invoice</button>
        <button id="btn-setup-back-2" class="btn-portal-ghost">← Back</button>
        <p id="setup-status-3" class="portal-status"></p>
      </div>

    </div>
  </section>

  <!-- ── PANEL 3: PENDING APPROVAL (shown after setup, before you activate) ── -->
  <section id="panel-pending" class="portal-panel" style="display:none">
    <div class="portal-card">
      <div class="pending-icon">◎</div>
      <h2>You're on the list.</h2>
      <p class="portal-sub">
        We've received your account request and will send your Square invoice within 24 hours.
        Once payment clears, your gifting balance will be activated and you'll have full portal access.
      </p>
      <p class="portal-sub">Questions? Email <a href="mailto:order@asliceofg.com">order@asliceofg.com</a></p>
      <button id="btn-signout-pending" class="btn-portal-ghost">Sign Out</button>
    </div>
  </section>

  <!-- ── PANEL 4: DASHBOARD (shown when active account) ── -->
  <section id="panel-dashboard" class="portal-panel" style="display:none">

    <!-- Dashboard Header -->
    <div class="dashboard-header">
      <div>
        <p class="dashboard-welcome">Welcome back, <span id="dash-first-name"></span></p>
        <p class="dashboard-plan" id="dash-plan-name"></p>
      </div>
      <button id="btn-signout-dash" class="btn-portal-ghost btn-sm">Sign Out</button>
    </div>

    <!-- Balance Cards -->
    <div class="balance-grid">
      <div class="balance-card">
        <div class="balance-label">Gifts remaining</div>
        <div class="balance-number" id="dash-gifts-remaining">—</div>
      </div>
      <div class="balance-card">
        <div class="balance-label">Gifts redeemed</div>
        <div class="balance-number" id="dash-gifts-used">—</div>
      </div>
      <div class="balance-card">
        <div class="balance-label">Account status</div>
        <div class="balance-number" id="dash-status">Active</div>
      </div>
    </div>

    <!-- Redeem Button -->
    <div class="redeem-cta">
      <button id="btn-open-redeem" class="btn-portal-primary btn-large">
        Send a Gift →
      </button>
      <p class="redeem-note">48-hour lead time · 72 hours for new agent plan</p>
    </div>

    <!-- Order History -->
    <div class="orders-section">
      <h3 class="orders-heading">Your Redemptions</h3>
      <div id="orders-list">
        <p class="orders-empty">No gifts sent yet. Your redemptions will appear here with tracking info.</p>
      </div>
    </div>

  </section>

  <!-- ── REDEMPTION FORM MODAL ── -->
  <div id="redeem-modal" class="portal-modal" style="display:none">
    <div class="portal-modal-inner">

      <div class="modal-header">
        <h2>Send a Gift</h2>
        <button id="btn-close-redeem" class="modal-close">✕</button>
      </div>

      <div class="modal-body">

        <div class="form-section">
          <div class="form-section-label">Recipient</div>
          <div class="form-row">
            <input type="text" id="redeem-first-name" placeholder="First name" />
            <input type="text" id="redeem-last-name"  placeholder="Last name" />
          </div>
          <input type="text" id="redeem-address-1" placeholder="Street address" />
          <div class="form-row">
            <input type="text" id="redeem-city"     placeholder="City" />
            <input type="text" id="redeem-province" placeholder="Province" value="ON" />
            <input type="text" id="redeem-postal"   placeholder="Postal code" />
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-label">Delivery</div>
          <div class="form-row">
            <div>
              <label class="portal-label">Requested delivery date</label>
              <input type="date" id="redeem-date" />
            </div>
            <div>
              <label class="portal-label">Method</label>
              <select id="redeem-method">
                <option value="shipping">Canada Post shipping (+$25)</option>
                <option value="downtown">Downtown delivery (+$20)</option>
              </select>
            </div>
          </div>
          <div class="priority-row">
            <input type="checkbox" id="redeem-priority" />
            <label for="redeem-priority">Priority processing (+$10) — reduces lead time by 24 hours</label>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-label">Card greeting</div>
          <p class="portal-sub-sm">Choose a message for the custom card inside the box.</p>
          <div class="greeting-options">

            <label class="greeting-card">
              <input type="radio" name="greeting" value="congratulations" checked />
              <div class="greeting-card-inner">
                <div class="greeting-title">Congratulations</div>
                <div class="greeting-preview">
                  "Congratulations on your new home. Wishing you many wonderful memories in the years ahead."
                </div>
              </div>
            </label>

            <label class="greeting-card">
              <input type="radio" name="greeting" value="thank_you" />
              <div class="greeting-card-inner">
                <div class="greeting-title">Thank You</div>
                <div class="greeting-preview">
                  "Thank you for trusting me with one of the biggest decisions of your life. It was truly my honour."
                </div>
              </div>
            </label>

            <label class="greeting-card">
              <input type="radio" name="greeting" value="welcome_home" />
              <div class="greeting-card-inner">
                <div class="greeting-title">Welcome Home</div>
                <div class="greeting-preview">
                  "Welcome home. Every great chapter starts somewhere — this is yours. Enjoy every moment."
                </div>
              </div>
            </label>

          </div>
        </div>

        <div class="form-section">
          <div class="form-section-label">Additional notes</div>
          <textarea id="redeem-notes" rows="3" placeholder="Buzzer code, special instructions, anything we should know..."></textarea>
        </div>

      </div>

      <div class="modal-footer">
        <button id="btn-submit-redeem" class="btn-portal-primary">Confirm & Send Gift</button>
        <p id="redeem-status" class="portal-status"></p>
      </div>

    </div>
  </div>
  <div id="redeem-overlay" class="portal-overlay" style="display:none"></div>

  <!-- Firebase SDK (module) -->
  <script type="module" src="js/firebase-init.js"></script>
  <script type="module" src="js/portal-auth.js"></script>
  <script type="module" src="js/portal-profile.js"></script>
  <script type="module" src="js/portal-dashboard.js"></script>
  <script type="module" src="js/portal-redeem.js"></script>
  <script src="js/nav.js"></script>

</body>
</html>
```

---

## PHASE 3 — Auth Logic

### Step 3: `js/portal-auth.js`

```javascript
import { auth } from './firebase-init.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getRealtorProfile, showCorrectPanel } from './portal-dashboard.js';

const provider = new GoogleAuthProvider();

// ── Auth state listener — runs on every page load ──
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const profile = await getRealtorProfile(user.uid);
    showCorrectPanel(user, profile);
  } else {
    showPanel('panel-auth');
  }
});

// ── Google Sign In ──
document.getElementById('btn-google-signin').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged handles the redirect
  } catch (err) {
    setAuthStatus('Google sign in failed. Please try again.', 'error');
  }
});

// ── Email Sign In ──
document.getElementById('btn-signin').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return setAuthStatus('Please enter your email and password.', 'error');
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthStatus('Incorrect email or password.', 'error');
  }
});

// ── Email Register ──
document.getElementById('btn-register').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return setAuthStatus('Please enter an email and password.', 'error');
  if (password.length < 8) return setAuthStatus('Password must be at least 8 characters.', 'error');
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      setAuthStatus('An account with this email already exists. Please sign in.', 'error');
    } else {
      setAuthStatus('Could not create account. Please try again.', 'error');
    }
  }
});

// ── Sign Out ──
export function handleSignOut() {
  signOut(auth);
}

document.getElementById('btn-signout-pending')?.addEventListener('click', handleSignOut);

function setAuthStatus(msg, type = '') {
  const el = document.getElementById('auth-status');
  el.textContent = msg;
  el.className = 'portal-status ' + type;
}

export function showPanel(id) {
  ['panel-auth','panel-setup','panel-pending','panel-dashboard'].forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = p === id ? 'flex' : 'none';
  });
}
```

---

## PHASE 4 — Profile Setup Logic

### Step 4: `js/portal-profile.js`

```javascript
import { auth } from './firebase-init.js';
import { showPanel } from './portal-auth.js';

let selectedPlan = null;

// ── Step navigation ──
document.getElementById('btn-setup-next-1').addEventListener('click', () => {
  const first     = document.getElementById('setup-first').value.trim();
  const last      = document.getElementById('setup-last').value.trim();
  const brokerage = document.getElementById('setup-brokerage').value.trim();
  if (!first || !last || !brokerage) {
    return setStatus('setup-status-1', 'Please fill in all required fields.', 'error');
  }
  showSetupStep(2);
});

document.getElementById('btn-setup-next-2').addEventListener('click', () => {
  const reco = document.getElementById('setup-reco').value.trim();
  if (!reco) return setStatus('setup-status-2', 'Please enter your RECO number.', 'error');
  showSetupStep(3);
});

document.getElementById('btn-setup-back-1').addEventListener('click', () => showSetupStep(1));
document.getElementById('btn-setup-back-2').addEventListener('click', () => showSetupStep(2));

// ── Plan selection ──
document.querySelectorAll('.plan-select-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.plan-select-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlan = card.dataset.plan;
    const installmentSelect = document.getElementById('installment-select');
    installmentSelect.style.display = selectedPlan === 'first_impression' ? 'block' : 'none';
  });
});

// ── Submit setup ──
document.getElementById('btn-setup-submit').addEventListener('click', async () => {
  if (!selectedPlan) return setStatus('setup-status-3', 'Please select a plan.', 'error');

  const user = auth.currentUser;
  if (!user) return;

  const installments = selectedPlan === 'first_impression'
    ? parseInt(document.querySelector('input[name="installments"]:checked')?.value || '1')
    : 1;

  const profileData = {
    uid:              user.uid,
    email:            user.email,
    firstName:        document.getElementById('setup-first').value.trim(),
    lastName:         document.getElementById('setup-last').value.trim(),
    phone:            document.getElementById('setup-phone').value.trim(),
    brokerageName:    document.getElementById('setup-brokerage').value.trim(),
    areasServed:      document.getElementById('setup-areas').value.split(',').map(s => s.trim()).filter(Boolean),
    recoNumber:       document.getElementById('setup-reco').value.trim(),
    licenseDate:      document.getElementById('setup-license-date').value,
    isNewAgent:       document.getElementById('setup-new-agent-confirm').checked,
    plan:             selectedPlan,
    installmentsTotal: installments,
    installmentsPaid: 0,
    giftsTotal:       0,
    giftsRemaining:   0,
    setupComplete:    true,
    accountActive:    false, // you manually activate after payment
  };

  try {
    const res = await fetch('/api/portal-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData),
    });

    if (!res.ok) throw new Error('Save failed');

    showPanel('panel-pending');

  } catch (err) {
    setStatus('setup-status-3', 'Something went wrong. Please try again.', 'error');
  }
});

function showSetupStep(num) {
  [1, 2, 3].forEach(n => {
    document.getElementById(`setup-step-${n}`).style.display = n === num ? 'block' : 'none';
    document.querySelector(`.setup-step[data-step="${n}"]`)?.classList.toggle('active', n === num);
  });
}

function setStatus(id, msg, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'portal-status ' + type;
}
```

---

## PHASE 5 — Dashboard Logic

### Step 5: `js/portal-dashboard.js`

```javascript
import { db } from './firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { showPanel, handleSignOut } from './portal-auth.js';

const PLAN_LABELS = {
  first_impression: 'First Impression · 3 gifts',
  closer:           'The Closer · 10 gifts',
  producer:         'The Producer · 25 gifts',
  partner:          'The Partner · Quarterly',
};

export async function getRealtorProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'realtors', uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export function showCorrectPanel(user, profile) {
  if (!profile || !profile.setupComplete) {
    showPanel('panel-setup');
    return;
  }
  if (!profile.accountActive) {
    showPanel('panel-pending');
    return;
  }
  showPanel('panel-dashboard');
  populateDashboard(profile);
  loadRedemptionHistory(user.uid);
}

function populateDashboard(profile) {
  document.getElementById('dash-first-name').textContent     = profile.firstName || '';
  document.getElementById('dash-plan-name').textContent      = PLAN_LABELS[profile.plan] || profile.plan;
  document.getElementById('dash-gifts-remaining').textContent = profile.giftsRemaining ?? '—';
  document.getElementById('dash-gifts-used').textContent     =
    (profile.giftsTotal - profile.giftsRemaining) || 0;

  const statusEl = document.getElementById('dash-status');
  statusEl.textContent = profile.accountActive ? 'Active' : 'Pending';
  statusEl.style.color = profile.accountActive
    ? 'var(--color-text-success)'
    : 'var(--color-text-warning)';

  // Disable redeem if no gifts remaining
  const redeemBtn = document.getElementById('btn-open-redeem');
  if (profile.giftsRemaining <= 0) {
    redeemBtn.disabled = true;
    redeemBtn.textContent = 'No gifts remaining';
  }
}

async function loadRedemptionHistory(uid) {
  try {
    const res = await fetch(`/api/portal-orders?uid=${encodeURIComponent(uid)}`);
    const { orders } = await res.json();
    renderOrders(orders);
  } catch {
    document.getElementById('orders-list').innerHTML =
      '<p class="orders-empty">Could not load orders.</p>';
  }
}

function renderOrders(orders) {
  const el = document.getElementById('orders-list');
  if (!orders?.length) {
    el.innerHTML = '<p class="orders-empty">No gifts sent yet.</p>';
    return;
  }

  const STATUS_LABELS = {
    pending:   'Pending',
    confirmed: 'Confirmed',
    shipped:   'Shipped',
    delivered: 'Delivered',
  };

  el.innerHTML = orders.map(o => `
    <div class="order-row">
      <div class="order-row-main">
        <div class="order-recipient">${o.recipientName}</div>
        <div class="order-date">${new Date(o.createdAt).toLocaleDateString('en-CA', { month:'long', day:'numeric', year:'numeric' })}</div>
        <div class="order-status status-${o.status}">${STATUS_LABELS[o.status] || o.status}</div>
      </div>
      ${o.trackingNumber ? `
        <div class="order-tracking">
          <span class="tracking-label">Tracking:</span>
          <a href="${o.trackingUrl || '#'}" target="_blank" class="tracking-number">${o.trackingNumber}</a>
          <span class="tracking-carrier">${o.carrier || ''}</span>
        </div>
      ` : ''}
      <div class="order-address">${o.recipientAddress}</div>
    </div>
  `).join('');
}

// Sign out
document.getElementById('btn-signout-dash')?.addEventListener('click', handleSignOut);
```

---

## PHASE 6 — Redemption Form Logic

### Step 6: `js/portal-redeem.js`

```javascript
import { auth } from './firebase-init.js';

// Open/close modal
document.getElementById('btn-open-redeem').addEventListener('click', () => {
  document.getElementById('redeem-modal').style.display   = 'flex';
  document.getElementById('redeem-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';

  // Set minimum date based on plan lead time
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 3); // 72 hours default
  document.getElementById('redeem-date').min = minDate.toISOString().split('T')[0];
});

function closeRedeemModal() {
  document.getElementById('redeem-modal').style.display   = 'none';
  document.getElementById('redeem-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('btn-close-redeem').addEventListener('click', closeRedeemModal);
document.getElementById('redeem-overlay').addEventListener('click', closeRedeemModal);

// Priority checkbox adjusts minimum date
document.getElementById('redeem-priority').addEventListener('change', (e) => {
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + (e.target.checked ? 2 : 3));
  document.getElementById('redeem-date').min = minDate.toISOString().split('T')[0];
});

// Submit redemption
document.getElementById('btn-submit-redeem').addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;

  const firstName = document.getElementById('redeem-first-name').value.trim();
  const lastName  = document.getElementById('redeem-last-name').value.trim();
  const address1  = document.getElementById('redeem-address-1').value.trim();
  const city      = document.getElementById('redeem-city').value.trim();
  const postal    = document.getElementById('redeem-postal').value.trim();
  const date      = document.getElementById('redeem-date').value;
  const method    = document.getElementById('redeem-method').value;
  const priority  = document.getElementById('redeem-priority').checked;
  const greeting  = document.querySelector('input[name="greeting"]:checked')?.value;
  const notes     = document.getElementById('redeem-notes').value.trim();

  if (!firstName || !lastName || !address1 || !city || !postal || !date) {
    return setRedeemStatus('Please fill in all required fields.', 'error');
  }

  const btn = document.getElementById('btn-submit-redeem');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/portal-redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        realtorUid:       user.uid,
        recipientName:    `${firstName} ${lastName}`,
        recipientAddress: `${address1}, ${city}, ON ${postal}`,
        deliveryDate:     date,
        deliveryMethod:   method,
        priority,
        greeting,
        notes,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setRedeemStatus('Gift submitted successfully! Check your redemptions below.', 'success');
    setTimeout(() => {
      closeRedeemModal();
      location.reload(); // refresh dashboard balance + orders
    }, 2000);

  } catch (err) {
    setRedeemStatus('Something went wrong. Please try again.', 'error');
    btn.disabled = false;
    btn.textContent = 'Confirm & Send Gift';
  }
});

function setRedeemStatus(msg, type = '') {
  const el = document.getElementById('redeem-status');
  el.textContent = msg;
  el.className = 'portal-status ' + type;
}
```

---

## PHASE 7 — Vercel API Functions

### Step 7: `api/portal-profile.js` — Save profile to Firestore

```javascript
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const data = req.body;
  if (!data.uid) return res.status(400).json({ error: 'Missing uid' });

  try {
    await db.collection('realtors').doc(data.uid).set({
      ...data,
      createdAt: new Date().toISOString(),
    }, { merge: true });

    // Notify you by email that a new signup needs activation
    // Wire this to EmailJS or SendGrid if you want an email alert

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save profile' });
  }
}
```

### Step 8: `api/portal-redeem.js` — Submit redemption + decrement balance

```javascript
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { realtorUid, ...redemptionData } = req.body;
  if (!realtorUid) return res.status(400).json({ error: 'Missing realtorUid' });

  const realtorRef = db.collection('realtors').doc(realtorUid);

  try {
    // Run as transaction to safely decrement balance
    await db.runTransaction(async (t) => {
      const snap = await t.get(realtorRef);
      if (!snap.exists) throw new Error('Realtor not found');

      const profile = snap.data();
      if (profile.giftsRemaining <= 0) throw new Error('No gifts remaining');

      const redemptionId = crypto.randomUUID();

      // Write redemption document
      t.set(db.collection('redemptions').doc(redemptionId), {
        redemptionId,
        realtorUid,
        ...redemptionData,
        status:         'pending',
        trackingNumber: null,
        trackingUrl:    null,
        carrier:        null,
        createdAt:      new Date().toISOString(),
        updatedAt:      new Date().toISOString(),
      });

      // Decrement balance
      t.update(realtorRef, {
        giftsRemaining: FieldValue.increment(-1),
      });
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Redemption failed' });
  }
}
```

### Step 9: `api/portal-orders.js` — Get redemption history for a realtor

```javascript
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'Missing uid' });

  try {
    const snap = await db.collection('redemptions')
      .where('realtorUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const orders = snap.docs.map(d => d.data());
    return res.status(200).json({ orders });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
}
```

### Step 10: `api/portal-tracking.js` — Admin endpoint to add tracking number

You call this manually (or via a simple admin script) once you've shipped an order.

```javascript
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  // Protect with a simple admin secret
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { redemptionId, trackingNumber, trackingUrl, carrier, status } = req.body;
  if (!redemptionId) return res.status(400).json({ error: 'Missing redemptionId' });

  try {
    await db.collection('redemptions').doc(redemptionId).update({
      trackingNumber: trackingNumber || null,
      trackingUrl:    trackingUrl    || null,
      carrier:        carrier        || null,
      status:         status         || 'shipped',
      updatedAt:      new Date().toISOString(),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Update failed' });
  }
}
```

Add to your `.env`:
```
ADMIN_SECRET=choose_a_long_random_string
```

To update tracking from your terminal:
```bash
curl -X PATCH https://asliceofg.vercel.app/api/portal-tracking \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your_admin_secret" \
  -d '{"redemptionId":"xxx","trackingNumber":"1234567890","carrier":"Canada Post","trackingUrl":"https://canadapost.ca/track?...","status":"shipped"}'
```

---

## PHASE 8 — Additional Dependencies

```bash
npm install firebase-admin
```

Add to `vercel.json` env section:
```json
"FIREBASE_PROJECT_ID": "@firebase_project_id",
"FIREBASE_CLIENT_EMAIL": "@firebase_client_email",
"FIREBASE_PRIVATE_KEY": "@firebase_private_key",
"ADMIN_SECRET": "@admin_secret"
```

---

## PHASE 9 — Firestore Security Rules

In Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Realtors can only read/write their own document
    match /realtors/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Realtors can read their own redemptions
    match /redemptions/{redemptionId} {
      allow read: if request.auth != null &&
        resource.data.realtorUid == request.auth.uid;
      // Write is server-side only (via admin SDK in Vercel functions)
      allow write: if false;
    }
  }
}
```

---

## ACTIVATION FLOW (your manual step)

When a new realtor signs up you will:
1. Receive a notification (wire up EmailJS in `api/portal-profile.js` — send to `order@asliceofg.com`)
2. Review their RECO number at reco.on.ca/find-a-registrant
3. Send Square invoice based on their plan + installment choice
4. When payment clears — go to Firebase Console → Firestore → `realtors` → their document → manually set:
   - `accountActive: true`
   - `giftsTotal: 3` (or 10/25 based on plan)
   - `giftsRemaining: 3`

Later you can build a simple `/admin.html` page to do this without touching the Firebase console.

---

## TEST CHECKLIST

- [ ] Sign up with email creates Firebase Auth user
- [ ] Google sign in works
- [ ] Profile setup saves to Firestore `realtors` collection
- [ ] Pending panel shows after setup
- [ ] After manual activation in Firebase console, dashboard loads
- [ ] Balance displays correctly
- [ ] Redeem form validates required fields
- [ ] Submitting redemption decrements `giftsRemaining` by 1
- [ ] Redemption appears in order history
- [ ] Tracking number appears after PATCH call
- [ ] Sign out clears session and returns to auth panel
```
