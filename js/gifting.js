// ── Config ───────────────────────────────────────────────────
const EMAILJS_SERVICE_ID       = 'service_z6rd8xm';
const EMAILJS_BROCHURE_TPL     = 'template_gifting_brochure';
const EMAILJS_NEW_AGENT_TPL    = 'template_gifting_newagent'; // create in EmailJS dashboard
const EMAILJS_OPEN_HOUSE_TPL   = 'template_gifting_openhouse'; // create in EmailJS dashboard
const EMAILJS_PUBLIC_KEY       = 'MJ301FjlzSsErNvcg';
const GOOGLE_SHEET_URL         = 'YOUR_APPS_SCRIPT_WEB_APP_URL';
const BROCHURE_PATH            = 'brochure.pdf';

emailjs.init(EMAILJS_PUBLIC_KEY);

// ── DOM Ready ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Brochure modal
  document.getElementById('btn-get-brochure').addEventListener('click', openBrochureModal);
  document.getElementById('btn-close-brochure').addEventListener('click', closeBrochureModal);
  document.getElementById('brochure-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBrochureModal();
  });
  document.getElementById('btn-brochure-submit').addEventListener('click', handleBrochureSubmit);
  document.getElementById('brochure-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleBrochureSubmit();
  });

  // New Agent modal
  document.getElementById('btn-new-agent-apply').addEventListener('click', openNewAgentModal);
  document.getElementById('btn-close-new-agent').addEventListener('click', closeNewAgentModal);
  document.getElementById('new-agent-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNewAgentModal();
  });
  document.getElementById('new-agent-form').addEventListener('submit', handleNewAgentSubmit);

  // Open House modal
  document.getElementById('btn-close-open-house').addEventListener('click', closeOpenHouseModal);
  document.getElementById('open-house-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOpenHouseModal();
  });
  document.getElementById('open-house-form').addEventListener('submit', handleOpenHouseSubmit);

  // Escape key closes all modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeBrochureModal();
      closeNewAgentModal();
      closeOpenHouseModal();
    }
  });
});

// ── Brochure Modal ───────────────────────────────────────────
function openBrochureModal() {
  document.getElementById('brochure-modal').classList.add('open');
  document.getElementById('brochure-email').focus();
}

function closeBrochureModal() {
  document.getElementById('brochure-modal').classList.remove('open');
  document.getElementById('brochure-status').textContent = '';
  document.getElementById('brochure-status').className = 'gifting-modal-status';
}

async function handleBrochureSubmit() {
  const emailInput = document.getElementById('brochure-email');
  const statusEl   = document.getElementById('brochure-status');
  const btn        = document.getElementById('btn-brochure-submit');
  const email      = emailInput.value.trim();

  if (!email || !email.includes('@')) {
    statusEl.textContent = 'Please enter a valid email address.';
    statusEl.className = 'gifting-modal-status error';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending…';
  statusEl.textContent = '';
  statusEl.className = 'gifting-modal-status';

  try {
    if (GOOGLE_SHEET_URL !== 'YOUR_APPS_SCRIPT_WEB_APP_URL') {
      fetch(GOOGLE_SHEET_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'gifting-page', timestamp: new Date().toISOString() }),
      }).catch(() => {});
    }

    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_BROCHURE_TPL, {
      to_email: email,
      brochure_url: window.location.origin + '/' + BROCHURE_PATH,
    });

    const link = document.createElement('a');
    link.href = BROCHURE_PATH;
    link.download = 'ASliceOfG-CorporateGifting.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    statusEl.textContent = 'Check your inbox — the brochure is on its way.';
    statusEl.className = 'gifting-modal-status success';
    emailInput.value = '';
    setTimeout(closeBrochureModal, 3200);

  } catch (err) {
    console.error('Brochure submit error:', err);
    statusEl.textContent = 'Something went wrong. Email us at order@asliceofg.com';
    statusEl.className = 'gifting-modal-status error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Me the Brochure';
  }
}

// ── New Agent Modal ──────────────────────────────────────────
function openNewAgentModal() {
  document.getElementById('new-agent-modal').classList.add('open');
  document.getElementById('new-agent-form-view').style.display = '';
  document.getElementById('new-agent-success-view').style.display = 'none';
}

function closeNewAgentModal() {
  document.getElementById('new-agent-modal').classList.remove('open');
  document.getElementById('new-agent-status').textContent = '';
  document.getElementById('new-agent-status').className = 'gifting-modal-status';
}

async function handleNewAgentSubmit(e) {
  e.preventDefault();
  const form   = e.target;
  const btn    = document.getElementById('btn-new-agent-submit');
  const status = document.getElementById('new-agent-status');

  btn.disabled = true;
  btn.textContent = 'Submitting…';
  status.textContent = '';
  status.className = 'gifting-modal-status';

  const params = {
    to_email:       'simone.cole2@gmail.com',
    reply_to:       form.querySelector('[name="email"]').value,
    first_name:     form.querySelector('[name="first_name"]').value,
    last_name:      form.querySelector('[name="last_name"]').value,
    email:          form.querySelector('[name="email"]').value,
    phone:          form.querySelector('[name="phone"]').value,
    reco_number:    form.querySelector('[name="reco_number"]').value,
    license_date:   form.querySelector('[name="license_date"]').value,
    payment_option: form.querySelector('[name="payment_option"]').value,
    package_name:   'New Agent Gift Program',
    confirmed:      'Yes — confirmed new registrant',
  };

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_NEW_AGENT_TPL, params);
    document.getElementById('new-agent-form-view').style.display = 'none';
    document.getElementById('new-agent-success-view').style.display = '';
    form.reset();
  } catch (err) {
    console.error('New agent submit error:', err);
    status.textContent = 'Something went wrong. Email us at order@asliceofg.com';
    status.className = 'gifting-modal-status error';
    btn.disabled = false;
    btn.textContent = 'Submit Application';
  }
}

// ── Open House Modal ─────────────────────────────────────────
function openOpenHouseModal(name, price) {
  document.getElementById('oh-modal-title').textContent = name;
  document.getElementById('oh-modal-pkg').textContent = '$' + price + ' — pickup required';
  document.getElementById('oh-tray-name').value = name;
  document.getElementById('oh-tray-price').value = price;
  document.getElementById('open-house-form-view').style.display = '';
  document.getElementById('open-house-success-view').style.display = 'none';
  document.getElementById('open-house-modal').classList.add('open');
}

function closeOpenHouseModal() {
  document.getElementById('open-house-modal').classList.remove('open');
  document.getElementById('open-house-status').textContent = '';
  document.getElementById('open-house-status').className = 'gifting-modal-status';
}

async function handleOpenHouseSubmit(e) {
  e.preventDefault();
  const form   = e.target;
  const btn    = form.querySelector('[type="submit"]');
  const status = document.getElementById('open-house-status');

  btn.disabled = true;
  btn.textContent = 'Sending…';
  status.textContent = '';
  status.className = 'gifting-modal-status';

  const locationSelect = form.querySelector('[name="pickup_location"]');
  const params = {
    to_email:        'simone.cole2@gmail.com',
    reply_to:        form.querySelector('[name="email"]').value,
    first_name:      form.querySelector('[name="first_name"]').value,
    last_name:       form.querySelector('[name="last_name"]').value,
    email:           form.querySelector('[name="email"]').value,
    tray_name:       form.querySelector('[name="tray_name"]').value,
    tray_price:      '$' + form.querySelector('[name="tray_price"]').value,
    pickup_date:     form.querySelector('[name="pickup_date"]').value,
    pickup_location: locationSelect.options[locationSelect.selectedIndex].text,
    notes:           form.querySelector('[name="notes"]').value || 'None',
  };

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_OPEN_HOUSE_TPL, params);
    document.getElementById('open-house-form-view').style.display = 'none';
    document.getElementById('open-house-success-view').style.display = '';
    form.reset();
  } catch (err) {
    console.error('Open house submit error:', err);
    status.textContent = 'Something went wrong. Email us at order@asliceofg.com';
    status.className = 'gifting-modal-status error';
    btn.disabled = false;
    btn.textContent = 'Submit Booking Request';
  }
}
