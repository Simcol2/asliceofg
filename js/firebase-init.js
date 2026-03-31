import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAqAYHoZEQYkMUPYdJA_vNYfxk0XGJDcbw",
  authDomain: "a-slice-of-g.firebaseapp.com",
  projectId: "a-slice-of-g",
  storageBucket: "a-slice-of-g.firebasestorage.app",
  messagingSenderId: "931362320181",
  appId: "1:931362320181:web:c081261bfe181c8f06e67c",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);