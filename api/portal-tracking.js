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
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { redemptionId, trackingNumber, trackingUrl, carrier, status } = req.body;
  if (!redemptionId) return res.status(400).json({ error: 'Missing redemptionId' });

  try {
    await db.collection('redemptions').doc(redemptionId).update({
      trackingNumber: trackingNumber || null,
      trackingUrl: trackingUrl || null,
      carrier: carrier || null,
      status: status || 'shipped',
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Update failed' });
  }
}