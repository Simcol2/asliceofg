import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { realtorUid, ...redemptionData } = req.body;
  if (!realtorUid) return res.status(400).json({ error: 'Missing realtorUid' });

  const realtorRef = db.collection('realtors').doc(realtorUid);

  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(realtorRef);
      if (!snap.exists) throw new Error('Realtor not found');

      const profile = snap.data();
      if (profile.giftsRemaining <= 0) throw new Error('No gifts remaining');

      const redemptionId = crypto.randomUUID();

      t.set(db.collection('redemptions').doc(redemptionId), {
        redemptionId,
        realtorUid,
        ...redemptionData,
        status: 'pending',
        trackingNumber: null,
        trackingUrl: null,
        carrier: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

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