import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import path from 'path';
import axiosLib from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Self-contained monitor — does NOT import from src/ so there are no .ts
// extension resolution failures at Vercel runtime (ERR_MODULE_NOT_FOUND).
// All logic previously in monitorService.ts / alertLogic.ts / gasService.ts
// is inlined here.
// ─────────────────────────────────────────────────────────────────────────────

const APP_NAME = 'lulu-monitor';

// ── Status constants ──────────────────────────────────────────────────────────
const PREP_STATUSES = [
  "PICKING","PICKING WITH PACKING","PICKING WITH UNASSIGNED ZONE",
  "STORING","STORED","PARKED","AUDITING","TRANSFERRING"
];
const DELIVERY_STATUSES = [
  "GOING TO ORIGIN","GOING TO DESTINATION","IN ROUTE","DELIVERING"
];
const AGE_BUCKETS = [
  "0-5MIN","5-10MIN","10-15MIN","15-20MIN","20-25MIN","25-30MIN",
  "30-35MIN","35-40MIN","40-45MIN","45-50MIN","50-55MIN","55-60MIN","60MIN+"
];

// ── Alert detection helpers ───────────────────────────────────────────────────
function getBucketIndex(bucket: string) {
  const n = (bucket || "").toString().toUpperCase().replace(/\s+/g,'').trim();
  return AGE_BUCKETS.findIndex(b => b.toUpperCase().replace(/\s+/g,'').trim() === n);
}
function parseTime(t: string) {
  if (!t) return 0;
  const m = t.trim().toUpperCase().match(/(\d+)(?::(\d+))?\s*(AM|PM)/);
  if (!m) return 0;
  let h = parseInt(m[1],10), mins = m[2] ? parseInt(m[2],10) : 0;
  if (m[3]==='PM' && h!==12) h+=12;
  if (m[3]==='AM' && h===12) h=0;
  return h*60+mins;
}
function parseSlot(slot: string) {
  if (!slot||!slot.includes('-')) return null;
  const [a,b] = slot.split('-').map(s=>s.trim());
  return { start: parseTime(a), end: parseTime(b) };
}

function detectAlerts(
  matrixData: any,
  escalationRules: any[],
  existingAlertIds: Set<string>,
  scheduledThreshold: number,
  storeToRegion: Record<string,string>,
  scheduledConfig?: any
) {
  const results: any[] = [];
  const norm = (s: string) => (s||"").toString().toUpperCase().replace(/\s+/g,'').trim();
  const activeRules = escalationRules.filter((r:any)=>r.isActive);
  const now = new Date();
  const nowMins = now.getHours()*60+now.getMinutes();

  // Quick commerce
  (matrixData.quick||[]).forEach((item:any) => {
    const status = norm(item.status), bucket = norm(item.bucket);
    const itemBucketIdx = getBucketIndex(item.bucket);
    const itemStore = String(item.storeID||"").trim();
    const itemRegion = storeToRegion[itemStore]||"";
    const matching = activeRules.filter((r:any)=>{
      const rStatus=norm(r.status), rBucketIdx=getBucketIndex(r.bucket);
      const rRegion=(r.region||"All").trim();
      if (norm(r.status)!==status||itemBucketIdx<rBucketIdx||rBucketIdx===-1) return false;
      return rRegion==="All"||rRegion===itemRegion;
    });
    if (matching.length>0) {
      const alertKey=`QUICK|${item.orderID}|${status}|${bucket}`.toLowerCase().trim();
      if (!existingAlertIds.has(alertKey))
        results.push({ alertKey, item, statusTrigger:`${item.status} (${item.bucket})`, bucket:item.bucket, type:'QUICK' });
    }
  });

  // Scheduled commerce
  (matrixData.schedule||[]).forEach((item:any) => {
    if (item.slot) {
      const dm = item.slot.match(/([A-Za-z]{3}\s\d{1,2},\s\d{4})/);
      if (dm) {
        const d=new Date(dm[1]), today=new Date();
        if (!isNaN(d.getTime()) && !(d.getDate()===today.getDate()&&d.getMonth()===today.getMonth()&&d.getFullYear()===today.getFullYear())) return;
      }
    }
    const slotInfo=parseSlot(item.slot);
    if (!slotInfo) return;
    const status=(item.status||"").toUpperCase().trim();
    const itemStore=String(item.storeID||"").trim();
    const itemRegion=storeToRegion[itemStore]||"";
    let shouldTrigger=false, triggerType:string|null=null;
    if (nowMins>=slotInfo.end) { shouldTrigger=true; triggerType='PAST'; }
    else if (nowMins>=slotInfo.start) {
      if (PREP_STATUSES.includes(status)) { shouldTrigger=true; triggerType='RUNNING'; }
      else if (DELIVERY_STATUSES.includes(status)&&nowMins>=slotInfo.end-scheduledThreshold) { shouldTrigger=true; triggerType='RUNNING'; }
    }
    if (shouldTrigger&&triggerType&&scheduledConfig) {
      const cfg=triggerType==='PAST'?scheduledConfig.pastSlot:scheduledConfig.runningSlot;
      if (cfg) {
        if (cfg.isActive===false) shouldTrigger=false;
        if (shouldTrigger&&cfg.regions?.length>0&&!cfg.regions.includes('All')&&!cfg.regions.includes(itemRegion)) shouldTrigger=false;
      }
    }
    if (shouldTrigger) {
      const alertKey=`SCHED|${item.orderID}|${status}|${item.slot}`.toLowerCase().trim();
      if (!existingAlertIds.has(alertKey))
        results.push({ alertKey, item, statusTrigger:`Still in '${item.status}' Stage - ${item.slot}`, bucket:item.slot, type:'SCHED' });
    }
  });

  return results;
}

// ── GAS request helper ────────────────────────────────────────────────────────
async function gasGet(url: string): Promise<any> {
  const res = await axiosLib.get(url, { timeout: 45000 });
  return res.data;
}

// ── Firebase Admin init ───────────────────────────────────────────────────────
function getDatabaseId(): string | undefined {
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;
  try {
    const cfg = JSON.parse(readFileSync(path.join(process.cwd(),'firebase-applet-config.json'),'utf8'));
    return cfg.firestoreDatabaseId||undefined;
  } catch { return undefined; }
}

function getAdminApp(): App {
  const existing = getApps().find(a=>a.name===APP_NAME);
  if (existing) return existing;
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saEnv) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing');
  let sa: any;
  try { let raw=saEnv.trim(); if(raw.startsWith('"')&&raw.endsWith('"')) raw=JSON.parse(raw); sa=typeof raw==='string'?JSON.parse(raw):raw; }
  catch(e:any) { throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT: ${e.message}`); }
  return initializeApp({ credential: cert(sa) }, APP_NAME);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[Monitor] Request received');
  const monitorKey = req.headers['x-monitor-key'];
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const secretKey = process.env.MONITOR_SECRET_KEY;
  if (secretKey && !isVercelCron && (!monitorKey || monitorKey !== secretKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const app   = getAdminApp();
    const dbId  = getDatabaseId();
    const db    = dbId ? getFirestore(app, dbId) : getFirestore(app);
    const msg   = getMessaging(app);
    const baseUrl = process.env.GAS_API_URL ||
      'https://script.google.com/macros/s/AKfycbyj8wQ6A7bGSn28_NG-PEOqb2hCH8bZ3Cav6kYOvLgoTsq6aroyNCKi1Bf70S43x3DQ/exec';

    // 1. Config
    const cfgSnap = await db.collection('system').doc('config').get();
    const cfg = cfgSnap.exists ? cfgSnap.data()! : {};
    const escalationRules = (cfg.escalationRules||[]).filter((r:any)=>r.isActive);
    const scheduledThreshold = cfg.scheduledThreshold||30;
    const scheduledConfig = { pastSlot: cfg.scheduledPastSlot, runningSlot: cfg.scheduledRunningSlot };

    // 2. GAS data
    const [matrixRaw, adminRaw] = await Promise.all([
      gasGet(`${baseUrl}?action=getMatrixData`),
      gasGet(`${baseUrl}?action=getAdminData`)
    ]);
    const matrix = matrixRaw?.status==='success' ? matrixRaw.data : matrixRaw;
    const adminD = adminRaw?.status==='success' ? adminRaw.data : adminRaw;
    if (!matrix||!adminD) { return res.status(200).json({ message: 'No data from GAS' }); }

    const matrixData = { quick: matrix.quick||[], schedule: matrix.schedule||[] };
    const regions: any[] = adminD.regions||[];
    const storeToRegion: Record<string,string> = {};
    regions.forEach((r:any)=>{ storeToRegion[String(r.storeId).trim()]=String(r.region).trim(); });

    // 3. Existing alerts (last 1 hour)
    const oneHourAgo = new Date(Date.now()-3600000).toISOString();
    const existingSnap = await db.collection('alerts').where('timestamp','>=',oneHourAgo).get();
    const existingIds = new Set<string>(existingSnap.docs.map((d:any)=>d.id.toLowerCase().trim()));

    // 4. Auto-escalation
    for (const doc of existingSnap.docs) {
      const d = doc.data();
      if (d.status==='Pending'&&d.escalation!=='TRUE') {
        const age = (Date.now()-new Date(d.triggeredAt||0).getTime())/60000;
        if (age>=3) { await doc.ref.update({ escalation:'TRUE', updatedAt:new Date() }); }
      }
    }

    // 5. Detect & write new alerts
    const newAlerts = detectAlerts(matrixData, escalationRules, existingIds, scheduledThreshold, storeToRegion, scheduledConfig);
    if (newAlerts.length===0) {
      console.log('[Monitor] No new alerts'); return res.status(200).json({ message:'No new alerts' });
    }

    const tokensSnap = await db.collection('fcm_tokens').get();
    const allTokens = tokensSnap.docs.map((d:any)=>({...d.data(), ref:d.ref}));

    for (const alert of newAlerts) {
      const now = new Date().toISOString();
      const notifTime = new Date(Date.now()+60000).toISOString();
      const alertStore = String(alert.item.storeID||"").trim();
      const alertRegion = storeToRegion[alertStore]||"";

      await db.collection('alerts').doc(alert.alertKey).set({
        timestamp:now, orderId:alert.item.orderID||"", eventType:'trigger',
        storeId:alertStore, userId:'SYSTEM', bucket:alert.bucket||"",
        notificationTime:notifTime, storeStaffName:"", status:'Pending',
        escalation:'FALSE', managerName:"", managerStatus:'Pending',
        orderCreatedAt:alert.item.timestamp||now, statusTrigger:alert.statusTrigger||"",
        triggeredAt:now, updatedAt:new Date()
      });

      const targets = allTokens.filter((t:any)=>{
        if (!t.token) return false;
        const role=String(t.role||"").toLowerCase().trim();
        if (role==='admin') return true;
        if (role==='supervisor') return t.region&&alertRegion&&t.region===alertRegion;
        if (['picker','store','manager'].includes(role)) return String(t.storeId||"").trim()===alertStore;
        return false;
      });

      if (targets.length>0) {
        const fcmResp = await msg.sendEachForMulticast({
          notification: { title:`⚠️ ALERT: ${alert.statusTrigger}`, body:`Order ${alert.item.orderID} at Store ${alert.item.storeID} requires attention.` },
          data: { orderId:alert.item.orderID, type:'alert', alertId:alert.alertKey },
          tokens: targets.map((t:any)=>t.token)
        });
        console.log(`[Monitor] FCM: ${fcmResp.successCount} ok, ${fcmResp.failureCount} fail`);
        const bad = fcmResp.responses.map((r:any,i:number)=>(!r.success&&r.error?.code==='messaging/registration-token-not-registered'?targets[i].ref:null)).filter(Boolean);
        if (bad.length>0) { const batch=db.batch(); bad.forEach((ref:any)=>batch.delete(ref)); await batch.commit(); }
      }
    }

    return res.status(200).json({ message:`Processed ${newAlerts.length} new alerts` });
  } catch (err:any) {
    console.error('[Monitor] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
