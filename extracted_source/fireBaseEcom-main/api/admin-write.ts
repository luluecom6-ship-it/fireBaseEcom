import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import path from 'path';

const APP_NAME = 'lulu-admin';

function getDatabaseId(): string | undefined {
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;
  try {
    const cfg = JSON.parse(readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
    return cfg.firestoreDatabaseId || undefined;
  } catch { return undefined; }
}

function getAdminApp(): App {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return existing;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const missing: string[] = [];
  if (!projectId)   missing.push('FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKey)  missing.push('FIREBASE_PRIVATE_KEY');
  if (missing.length > 0) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  if (!privateKey.includes('-----BEGIN')) throw new Error('FIREBASE_PRIVATE_KEY is malformed');

  return initializeApp({ credential: cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey }) }, APP_NAME);
}

/**
 * POST /api/admin-write
 *
 * A backend bypass for Firestore writes that require admin role.
 * Used for: saving escalation rules (system/config), sending broadcasts (push_queue).
 *
 * Body: { operation, empId, ...operationPayload }
 *
 * Operations:
 *   save_config   → { data: SystemConfig }
 *   send_broadcast → { title, body, targetRoles, senderName }
 *
 * Auth: verifies empId has role='admin' in Firestore before any write.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    const app        = getAdminApp();
    const dbId       = getDatabaseId();
    const db         = dbId ? getFirestore(app, dbId) : getFirestore(app);

    const { operation, empId } = req.body;
    if (!operation) return res.status(400).json({ error: 'operation required' });
    if (!empId)     return res.status(400).json({ error: 'empId required' });

    // ── Verify caller is admin ─────────────────────────────────────────────
    const userSnap = await db.collection('users').doc(String(empId)).get();
    const userRole  = userSnap.exists ? String(userSnap.data()?.role || '').toLowerCase().trim() : '';

    if (userRole !== 'admin') {
      console.warn(`[admin-write] Rejected non-admin empId="${empId}" role="${userRole}"`);
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }
    console.log(`[admin-write] Authorized admin "${empId}" for operation="${operation}"`);

    // ── save_config ────────────────────────────────────────────────────────
    if (operation === 'save_config') {
      const { data } = req.body;
      if (!data) return res.status(400).json({ error: 'data required for save_config' });

      await db.collection('system').doc('config').set(
        { ...data, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      console.log(`[admin-write] system/config saved by "${empId}"`);
      return res.status(200).json({ success: true, operation });
    }

    // ── send_broadcast ─────────────────────────────────────────────────────
    if (operation === 'send_broadcast') {
      const { title, body, targetRoles, senderName } = req.body;
      if (!body) return res.status(400).json({ error: 'body required for send_broadcast' });

      const notificationId = `broadcast-${Date.now()}`;
      await db.collection('push_queue').doc(notificationId).set({
        title: title || '📢 SYSTEM BROADCAST',
        body,
        targetRoles: Array.isArray(targetRoles) ? targetRoles : [],
        timestamp: new Date(),
        status: 'pending',
        sender: senderName || empId,
      });
      console.log(`[admin-write] Broadcast "${notificationId}" queued by "${empId}"`);
      return res.status(200).json({ success: true, operation, notificationId });
    }

    return res.status(400).json({ error: `Unknown operation: ${operation}` });

  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[admin-write] Error:', message);
    return res.status(500).json({ error: message });
  }
}
