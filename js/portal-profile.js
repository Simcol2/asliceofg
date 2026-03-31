import { auth } from './firebase-init.js';
import { showPanel } from './portal-auth.js';

let selectedPlan = null;

document.getElementById('btn-setup-next-1')?.addEventListener('click', () => {
  const first = document.getElementById('setup-first').value.trim();
  const last = document.getElementById('setup-last').value.trim();
  const brokerage = document.getElementById('setup-brokerage').value.trim();
  if (!first || !last || !brokerage) {
    return setStatus('setup-status-1', 'Please fill in all required fields.', 'error');
  }
  showSetupStep(2);
});

document.getElementById('btn-setup-next-2')?.addEventListener('click', () => {
  const reco = document.getElementById('setup-reco').value.trim();
  if (!reco) return setStatus('setup-status-2', 'Please enter your RECO number.', 'error');
  showSetupStep(3);
});

document.getElementById('btn-setup-back-1')?.addEventListener('click', () => showSetupStep(1));
document.getElementById('btn-setup-back-2')?.addEventListener('click', () => showSetupStep(2));

document.querySelectorAll('.plan-select-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.plan-select-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlan = card.dataset.plan;
    const installmentSelect = document.getElementById('installment-select');
    installmentSelect.style.display = selectedPlan === 'first_impression' ? 'block' : 'none';
  });
});

document.getElementById('btn-setup-submit')?.addEventListener('click', async () => {
  if (!selectedPlan) return setStatus('setup-status-3', 'Please select a plan.', 'error');

  const user = auth.currentUser;
  if (!user) return;

  const installments = selectedPlan === 'first_impression'
    ? parseInt(document.querySelector('input[name="installments"]:checked')?.value || '1')
    : 1;

  const profileData = {
    uid: user.uid,
    email: user.email,
    firstName: document.getElementById('setup-first').value.trim(),
    lastName: document.getElementById('setup-last').value.trim(),
    phone: document.getElementById('setup-phone').value.trim(),
    brokerageName: document.getElementById('setup-brokerage').value.trim(),
    areasServed: document.getElementById('setup-areas').value.split(',').map(s => s.trim()).filter(Boolean),
    recoNumber: document.getElementById('setup-reco').value.trim(),
    licenseDate: document.getElementById('setup-license-date').value,
    isNewAgent: document.getElementById('setup-new-agent-confirm').checked,
    plan: selectedPlan,
    installmentsTotal: installments,
    installmentsPaid: 0,
    giftsTotal: 0,
    giftsRemaining: 0,
    setupComplete: true,
    accountActive: false,
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