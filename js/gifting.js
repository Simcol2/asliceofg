// ── Config ───────────────────────────────────────────────────
const EMAILJS_SERVICE_ID  = 'service_z6rd8xm';
const EMAILJS_TEMPLATE_ID = 'template_gifting_brochure'; // create this template in EmailJS
const EMAILJS_PUBLIC_KEY  = 'MJ301FjlzSsErNvcg';

// Paste your Google Apps Script Web App URL here after deployment
// See: Extensions → Apps Script → Deploy → New Deployment → Web App
const GOOGLE_SHEET_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL';

// Path to your brochure PDF (add brochure.pdf to the project root)
const BROCHURE_PATH = 'brochure.pdf';

// ── Init EmailJS ─────────────────────────────────────────────
emailjs.init(EMAILJS_PUBLIC_KEY);

// ── DOM Ready ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('brochure-modal');

  // Both "Get the Brochure" buttons open the modal
  document.getElementById('btn-get-brochure').addEventListener('click', openModal);
  document.getElementById('btn-get-brochure-hero').addEventListener('click', openModal);

  // "See the Plans" scrolls to the plans section
  document.getElementById('btn-learn-more').addEventListener('click', () => {
    document.getElementById('plans').scrollIntoView({ behavior: 'smooth' });
  });

  // Close modal
  document.getElementById('btn-close-brochure').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // Submit
  document.getElementById('btn-brochure-submit').addEventListener('click', handleBrochureSubmit);

  // Allow Enter key in email input
  document.getElementById('brochure-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleBrochureSubmit();
  });
});

function openModal() {
  document.getElementById('brochure-modal').classList.add('open');
  document.getElementById('brochure-email').focus();
}

function closeModal() {
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
    // 1. Save to Google Sheet (fire-and-forget — no-cors so we can't read response)
    if (GOOGLE_SHEET_URL !== 'YOUR_APPS_SCRIPT_WEB_APP_URL') {
      fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'gifting-page',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}); // silent — opaque response expected
    }

    // 2. Send brochure via EmailJS
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:     email,
      brochure_url: window.location.origin + '/' + BROCHURE_PATH,
    });

    // 3. Trigger PDF download in browser
    const link = document.createElement('a');
    link.href     = BROCHURE_PATH;
    link.download = 'ASliceOfG-CorporateGifting.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    statusEl.textContent = 'Check your inbox — the brochure is on its way.';
    statusEl.className = 'gifting-modal-status success';
    emailInput.value = '';

    setTimeout(closeModal, 3200);

  } catch (err) {
    console.error('Brochure submit error:', err);
    statusEl.textContent = 'Something went wrong. Email us at order@asliceofg.com';
    statusEl.className = 'gifting-modal-status error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Me the Brochure';
  }
}
