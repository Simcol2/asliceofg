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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const profile = await getRealtorProfile(user.uid);
    showCorrectPanel(user, profile);
  } else {
    showPanel('panel-auth');
  }
});

document.getElementById('btn-google-signin')?.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    setAuthStatus('Google sign in failed. Please try again.', 'error');
  }
});

document.getElementById('btn-signin')?.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) return setAuthStatus('Please enter your email and password.', 'error');
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setAuthStatus('Incorrect email or password.', 'error');
  }
});

document.getElementById('btn-register')?.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
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
  ['panel-auth', 'panel-setup', 'panel-pending', 'panel-dashboard'].forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = p === id ? 'flex' : 'none';
  });
}