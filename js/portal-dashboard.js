import { db } from './firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { showPanel, handleSignOut } from './portal-auth.js';

const PLAN_LABELS = {
  first_impression: 'First Impression · 3 gifts',
  closer: 'The Closer · 10 gifts',
  producer: 'The Producer · 25 gifts',
  partner: 'The Partner · Quarterly',
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
  document.getElementById('dash-first-name').textContent = profile.firstName || '';
  document.getElementById('dash-plan-name').textContent = PLAN_LABELS[profile.plan] || profile.plan;
  document.getElementById('dash-gifts-remaining').textContent = profile.giftsRemaining ?? '—';
  document.getElementById('dash-gifts-used').textContent = (profile.giftsTotal - profile.giftsRemaining) || 0;

  const statusEl = document.getElementById('dash-status');
  statusEl.textContent = profile.accountActive ? 'Active' : 'Pending';
  statusEl.style.color = profile.accountActive ? 'var(--color-text-success)' : 'var(--color-text-warning)';

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
    document.getElementById('orders-list').innerHTML = '<p class="orders-empty">Could not load orders.</p>';
  }
}

function renderOrders(orders) {
  const el = document.getElementById('orders-list');
  if (!orders?.length) {
    el.innerHTML = '<p class="orders-empty">No gifts sent yet.</p>';
    return;
  }

  const STATUS_LABELS = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    shipped: 'Shipped',
    delivered: 'Delivered',
  };

  el.innerHTML = orders.map(o => `
    <div class="order-row">
      <div class="order-row-main">
        <div class="order-recipient">${o.recipientName}</div>
        <div class="order-date">${new Date(o.createdAt).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
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

document.getElementById('btn-signout-dash')?.addEventListener('click', handleSignOut);