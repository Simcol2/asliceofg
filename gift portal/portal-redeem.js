import { auth } from './firebase-init.js';

document.getElementById('btn-open-redeem')?.addEventListener('click', () => {
  document.getElementById('redeem-modal').style.display = 'flex';
  document.getElementById('redeem-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 3);
  document.getElementById('redeem-date').min = minDate.toISOString().split('T')[0];
});

function closeRedeemModal() {
  document.getElementById('redeem-modal').style.display = 'none';
  document.getElementById('redeem-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('btn-close-redeem')?.addEventListener('click', closeRedeemModal);
document.getElementById('redeem-overlay')?.addEventListener('click', closeRedeemModal);

document.getElementById('redeem-priority')?.addEventListener('change', (e) => {
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + (e.target.checked ? 2 : 3));
  document.getElementById('redeem-date').min = minDate.toISOString().split('T')[0];
});

document.getElementById('btn-submit-redeem')?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;

  const firstName = document.getElementById('redeem-first-name').value.trim();
  const lastName = document.getElementById('redeem-last-name').value.trim();
  const address1 = document.getElementById('redeem-address-1').value.trim();
  const city = document.getElementById('redeem-city').value.trim();
  const postal = document.getElementById('redeem-postal').value.trim();
  const date = document.getElementById('redeem-date').value;
  const method = document.getElementById('redeem-method').value;
  const priority = document.getElementById('redeem-priority').checked;
  const greeting = document.querySelector('input[name="greeting"]:checked')?.value;
  const notes = document.getElementById('redeem-notes').value.trim();

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
        realtorUid: user.uid,
        recipientName: `${firstName} ${lastName}`,
        recipientAddress: `${address1}, ${city}, ON ${postal}`,
        deliveryDate: date,
        deliveryMethod: method,
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
      location.reload();
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