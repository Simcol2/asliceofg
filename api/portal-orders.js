import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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