import { executeGasRequest } from "./gasService.js";
import {
  DEFAULT_ORDER_ALERT_TEMPLATE,
  ORDER_ALERT_SAMPLE_VARS,
  OrderAlertArticle,
  groupAppliesToRegion,
  resolveCommonGroups,
  normalizeSku,
  renderOrderAlert,
} from "../utils/orderAlertTemplate.js";

/**
 * WhatsApp "Order Alert": the first time the monitor sees an undelivered order (new OR already open when the article was added)
 * that contains a watched article (SKU), send ONE message (with the item photo)
 * to the store's fulfillment WhatsApp group and, if enabled, one common group. Never re-sent once marked "sent".
 *
 * - Config lives in Firestore system/config (edited from Admin > Settings).
 * - De-duplication is atomic via order_alert_log/{orderId_sku} (create()).
 */

// An alert is sent once, any time from order creation until delivery.
const FINISHED_STATUSES = new Set(["DELIVERED", "FINISHED", "CANCELLED", "CANCELED"]);
const SKIP_ITEM_STATUSES = new Set(["REMOVED", "OUT_OF_STOCK", "REJECTED"]);
const CONFIG_TTL_MS = 10 * 60 * 1000; // same 10-min cadence as the monitor: keeps Firestore/Vercel usage low
const MAX_SENDS_PER_TICK = 20;
const MAX_ATTEMPTS = 3;

let cfg: any = null;
let cfgTime = 0;
const handled = new Set<string>();
const missingMappingLogged = new Set<string>();

const normStore = (id: any) => {
  const s = String(id ?? "").trim().toLowerCase();
  return /^0+[1-9]\d*$/.test(s) ? s.replace(/^0+/, "") : s;
};

const largeImageUrl = (u: string) => {
  if (!u) return "";
  const str = String(u);
  if (str.includes("drive.google.com")) {
    const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
    if (id) return `https://lh3.googleusercontent.com/d/${id}=s1000`;
  }
  return str;
};

async function getConfig(db: any) {
  if (cfg && Date.now() - cfgTime < CONFIG_TTL_MS) return cfg;
  const snap = await db.collection("system").doc("config").get();
  cfg = snap.exists ? snap.data() || {} : {};
  cfgTime = Date.now();
  return cfg;
}

async function postToEvolution(config: any, instance: string, number: string, text: string, imageUrl?: string) {
  const base = String(config.whatsappApiUrl || "").replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", apikey: config.whatsappApiKey };
  const options = { delay: 0, presence: "composing", linkPreview: false };

  if (imageUrl) {
    const res = await fetch(`${base}/message/sendMedia/${instance}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ number, options, mediatype: "image", mimetype: "image/jpeg", caption: text, media: imageUrl }),
    });
    if (res.ok) return { ok: true as const };
    // Image failed (bad URL etc.) -> fall back to text so the alert is never lost
    console.warn(`[OrderAlert] sendMedia failed (${res.status}), falling back to text`);
  }
  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ number, options, text }),
  });
  if (res.ok) return { ok: true as const };
  return { ok: false as const, error: `API ${res.status}: ${(await res.text()).slice(0, 120)}` };
}

export async function sendOrderAlertTest(config: any, number: string, template?: string) {
  const instance = config.whatsappInstanceName;
  if (!config.whatsappApiUrl || !config.whatsappApiKey || !instance) {
    return { ok: false as const, error: "WhatsApp integration is not fully configured" };
  }
  const text = renderOrderAlert(template, ORDER_ALERT_SAMPLE_VARS);
  return postToEvolution(
    config,
    instance,
    number,
    text,
    "https://bf1af2.cdn.akinoncloud.com/products/2024/09/11/56757/ef474c50-bdaf-4331-951f-6982163edb64.jpg",
  );
}

export async function getOrderAlertLog(db: any, limit = 50) {
  const snap = await db.collection("order_alert_log").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d: any) => {
    const x = d.data();
    const ts = (v: any) => (v?.toDate ? v.toDate().toISOString() : v || "");
    return {
      id: d.id, orderId: x.orderId, sku: x.sku, storeId: x.storeId, destination: x.destination || "store", groupName: x.groupName || "", region: x.region || "", status: x.status,
      attempts: x.attempts || 1, error: x.error || "", sentAt: x.sentAt || "", createdAt: ts(x.createdAt),
    };
  });
}

// Allow a failed alert to be retried on the next monitor tick
export async function retryOrderAlert(db: any, id: string) {
  const ref = db.collection("order_alert_log").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.status !== "failed") return false;
  await ref.update({ attempts: 0, updatedAt: new Date() });
  handled.delete(id);
  return true;
}

export interface OrderAlertRunSummary {
  at: string;
  source: "monitor" | "manual";
  featureEnabled: boolean;
  problem?: string;               // set when the run could not even start
  ordersScanned: number;
  watchedArticles: number;
  matchedItems: number;           // items in the feed whose SKU is on the watchlist
  sent: number;
  failed: number;
  reasons: Record<string, number>;
  samples: { orderId: string; storeId: string; sku: string; status: string; result: string }[];
  feed: { itemKeys: string[]; skuSample: string[]; statusSample: string[] };
  commonGroup: string;            // e.g. "off" or "2 active: North, South"
}

/** Fetches the same V2 order feed the monitor uses (so a manual run sees identical data). */
export async function fetchMatrixV2Orders(): Promise<any[]> {
  const FALLBACK_V2_GAS_URL =
    "https://script.google.com/macros/s/AKfycbx9GSOgBy9dLdd4vn2JLu3piAOVxTj-5AfKZ3NeomK5mMgbSVDrzd_ny8qI1k4Bf6vq_Q/exec";
  const v2Url = (process.env.V2_GAS_URL || process.env.VITE_V2_GAS_URL || FALLBACK_V2_GAS_URL).trim();
  const url = `${v2Url}${v2Url.includes("?") ? "&" : "?"}action=getMatrixDataV2`;
  const res: any = await executeGasRequest(
    { method: "GET", url },
    { skipCache: true, cacheKey: `GET:${v2Url}:action=getMatrixDataV2` },
  );
  let d: any = res.data;
  if (typeof d === "string" && (d.trim().startsWith("{") || d.trim().startsWith("["))) {
    try { d = JSON.parse(d); } catch { /* keep as is */ }
  }
  let raw: any = d?.status === "success" ? d.data : d?.data || d || [];
  if (raw && typeof raw === "object" && !Array.isArray(raw) && !raw.job_number) {
    raw = raw.data || raw.orders || raw.results || raw.rows || raw.items || raw;
  }
  if (raw && !Array.isArray(raw) && typeof raw === "object" && raw.job_number) raw = [raw];
  return Array.isArray(raw) ? raw : [];
}

/** store id -> region, from the same Admin data the monitor uses. */
export async function fetchStoreRegions(): Promise<Record<string, string>> {
  const FALLBACK_V1_GAS_URL =
    "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
  let baseUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
  if (!baseUrl || baseUrl === "undefined" || !baseUrl.startsWith("http")) baseUrl = FALLBACK_V1_GAS_URL;
  const res: any = await executeGasRequest(
    { method: "GET", url: `${baseUrl}?action=getAdminData` },
    { skipCache: true, cacheKey: `GET:${baseUrl}:action=getAdminData` },
  );
  const body: any = res.data;
  const adminRaw = body?.status === "success" ? body.data : body?.data || body;
  const out: Record<string, string> = {};
  (adminRaw?.regions || []).forEach((r: any) => {
    const sId = String(r.storeId || r.StoreID || "").trim();
    const reg = String(r.region || r.Region || "").trim();
    if (sId) out[sId] = reg;
  });
  return out;
}

export async function getOrderAlertStatus(db: any) {
  const snap = await db.collection("order_alert_status").doc("last").get();
  return snap.exists ? snap.data() : null;
}

export async function processOrderAlerts(
  db: any,
  orders: any[],
  opts: { refreshConfig?: boolean; source?: "monitor" | "manual"; storeToRegion?: Record<string, string> } = {},
): Promise<OrderAlertRunSummary> {
  if (opts.refreshConfig) cfgTime = 0;
  const config = await getConfig(db);
  const list: any[] = Array.isArray(orders) ? orders : [];
  const storeToRegion: Record<string, string> = opts.storeToRegion || {};
  const commonGroups = resolveCommonGroups(config).filter(
    (g) => g && g.enabled && String(g.groupJid || "").trim() && (g.regions || []).length > 0,
  );

  const summary: OrderAlertRunSummary = {
    at: new Date().toISOString(),
    source: opts.source || "monitor",
    featureEnabled: !!config.whatsappOrderAlertEnabled,
    ordersScanned: list.length,
    watchedArticles: 0,
    matchedItems: 0,
    sent: 0,
    failed: 0,
    reasons: {},
    samples: [],
    feed: { itemKeys: [], skuSample: [], statusSample: [] },
    commonGroup: commonGroups.length
      ? `${commonGroups.length} active: ${commonGroups.map((g) => `${g.name || "Common"} [${(g.regions || []).join("/")}]`).join(", ")}`
      : "off",
  };
  const note = (reason: string, orderId: string, storeId: string, sku: string, status: string, result = reason) => {
    summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
    if (summary.samples.length < 15) summary.samples.push({ orderId, storeId, sku: String(sku), status, result });
  };
  const finish = async () => {
    try {
      await db.collection("order_alert_status").doc("last").set(summary);
    } catch (e: any) {
      console.warn("[OrderAlert] could not save status:", e?.message);
    }
    return summary;
  };

  // What does the feed look like? (helps spot field-name / SKU-format mismatches)
  const firstWithItems = list.find((o) => Array.isArray(o?.items) && o.items.length > 0);
  if (firstWithItems) summary.feed.itemKeys = Object.keys(firstWithItems.items[0]).slice(0, 25);
  const skuSeen = new Set<string>();
  const statusSeen = new Set<string>();
  for (const o of list) {
    if (statusSeen.size < 8 && o?.partial_status) statusSeen.add(String(o.partial_status));
    if (skuSeen.size < 6 && Array.isArray(o?.items)) {
      for (const it of o.items) { if (it?.sku && skuSeen.size < 6) skuSeen.add(String(it.sku)); }
    }
  }
  summary.feed.skuSample = [...skuSeen];
  summary.feed.statusSample = [...statusSeen];

  if (!summary.featureEnabled) { summary.problem = "Order Alert is switched OFF (or not saved) in Admin."; return finish(); }
  if (!config.whatsappApiUrl || !config.whatsappApiKey) { summary.problem = "WhatsApp API URL / key missing in config."; return finish(); }
  if (list.length === 0) { summary.problem = "The order feed returned 0 orders."; return finish(); }

  const articles: OrderAlertArticle[] = (config.whatsappOrderAlertArticles || []).filter(
    (a: OrderAlertArticle) => a && a.sku && a.active !== false,
  );
  summary.watchedArticles = articles.length;
  if (articles.length === 0) { summary.problem = "No active watched articles saved in Admin (click Save Config after adding)."; return finish(); }
  const bySku = new Map<string, OrderAlertArticle>();
  articles.forEach((a) => bySku.set(normalizeSku(a.sku), a));

  const globalTemplate: string = config.whatsappOrderAlertTemplate || DEFAULT_ORDER_ALERT_TEMPLATE;
  const mappings: any[] = config.whatsappFulfillmentMappings || [];
  let sends = 0;

  outer: for (const order of list) {
    const status = String(order.partial_status || "").toUpperCase().trim().replace(/[\s-]+/g, "_");
    if (!Array.isArray(order.items)) continue;

    const orderId = order.job_number || "";
    const rawStoreName = String(order.store_name || "");
    const m = rawStoreName.match(/\b(\d{4})\b/);
    const storeId = m ? m[1] : rawStoreName.slice(0, 4) || "UNKNOWN";

    for (const item of order.items) {
      const article = bySku.get(normalizeSku(item.sku));
      if (!article) continue;
      summary.matchedItems++;

      if (!orderId) { note("order has no job_number", orderId, storeId, item.sku, status); continue; }
      if (!status || FINISHED_STATUSES.has(status)) { note(`order already ${status || "without status"}`, orderId, storeId, item.sku, status); continue; }
      if (SKIP_ITEM_STATUSES.has(String(item.item_status || item.status || "").toUpperCase().trim())) {
        note("item removed / out of stock", orderId, storeId, item.sku, status); continue;
      }

      // Optional validity window (inclusive, server time) and minimum quantity
      const todayStr = new Date().toISOString().slice(0, 10);
      if (article.startDate && todayStr < article.startDate) { note("article not started yet (start date)", orderId, storeId, item.sku, status); continue; }
      if (article.endDate && todayStr > article.endDate) { note("article expired (end date)", orderId, storeId, item.sku, status); continue; }
      if (article.minQty && Number(item.quantity || 0) < Number(article.minQty)) { note("ordered qty below minimum", orderId, storeId, item.sku, status); continue; }

      const baseKey = `${orderId}_${item.sku}`.replace(/\//g, "_");

      // Destinations: the store's fulfillment group and/or the one common group.
      const region = storeToRegion[storeId] || "";
      const targets: { kind: "store" | "common"; key: string; jid: string; instance: string; label?: string }[] = [];
      const mapping = mappings.find((x: any) => normStore(x.storeId) === normStore(storeId));
      if (mapping && mapping.groupJid) {
        const instance = mapping.instanceName || config.whatsappInstanceName;
        if (instance) targets.push({ kind: "store", key: baseKey, jid: mapping.groupJid, instance });
      }
      // Common groups whose region selection covers this store's region
      const seenJids = new Set<string>(targets.map((t) => t.jid));
      if (config.whatsappInstanceName) {
        for (const g of commonGroups) {
          if (!groupAppliesToRegion(g, region)) continue;
          const jid = String(g.groupJid).trim();
          if (seenJids.has(jid)) continue; // never post the same alert twice into one group
          seenJids.add(jid);
          const key = g.id === "common" ? `${baseKey}__common` : `${baseKey}__common_${String(g.id).replace(/[^A-Za-z0-9_-]/g, "")}`;
          targets.push({ kind: "common", key, jid, instance: config.whatsappInstanceName, label: g.name || "Common group" });
        }
      }
      if (targets.length === 0) {
        if (!missingMappingLogged.has(storeId)) {
          missingMappingLogged.add(storeId);
          console.warn(`[OrderAlert] No group for store ${storeId} (region "${region || "unknown"}"): no fulfillment mapping and no common group covers it.`);
        }
        note(`no group for store ${storeId} (region ${region || "unknown"}): no fulfillment mapping and no common group selected for this region`, orderId, storeId, item.sku, status);
        continue;
      }

      const template = (article.messageOverride && article.messageOverride.trim()) || globalTemplate;
      const text = renderOrderAlert(template, {
        store: storeId,
        storeName: rawStoreName || storeId,
        orderId,
        sku: item.sku,
        itemName: item.item_name,
        location: item.location,
        qty: item.quantity,
        foundQty: item.found_qty,
        status: status.replace(/_/g, " "),
        slot: `${order.slot_from || ""} - ${order.slot_to || ""}`.trim(),
        note: article.note,
      });

      for (const t of targets) {
        if (handled.has(t.key)) { note("already sent earlier (not repeated)", orderId, storeId, item.sku, status, `already sent (${t.kind})`); continue; }
        if (sends >= MAX_SENDS_PER_TICK) { note("waiting: per-cycle send limit reached", orderId, storeId, item.sku, status); continue outer; }

        // Atomic claim per destination (also protects against overlapping server instances)
        const ref = db.collection("order_alert_log").doc(t.key);
        let attempts = 1;
        try {
          await ref.create({
            orderId, sku: String(item.sku), storeId, destination: t.kind, groupName: t.label || "", region, status: "sending", attempts,
            createdAt: new Date(), updatedAt: new Date(),
          });
        } catch (_e) {
          const snap = await ref.get();
          const d = snap.exists ? snap.data() || {} : {};
          if (d.status === "failed" && (d.attempts ?? 1) < MAX_ATTEMPTS) {
            attempts = (d.attempts ?? 1) + 1;
            await ref.update({ status: "sending", attempts, updatedAt: new Date() });
          } else {
            handled.add(t.key);
            note("already sent earlier (not repeated)", orderId, storeId, item.sku, status, `already ${d.status || "logged"} (${t.kind})`);
            continue;
          }
        }

        sends++;
        try {
          const result = await postToEvolution(config, t.instance, t.jid, text, largeImageUrl(item.photo_url));
          if (result.ok) {
            handled.add(t.key);
            summary.sent++;
            note("SENT", orderId, storeId, item.sku, status, `sent to ${t.kind === "common" ? `common group "${t.label}"` : "store group"}`);
            await ref.update({ status: "sent", sentAt: new Date().toISOString(), updatedAt: new Date() });
            console.log(`[OrderAlert] Sent for order ${orderId}, SKU ${item.sku} -> ${t.kind} group (store ${storeId})`);
          } else {
            summary.failed++;
            note("send FAILED", orderId, storeId, item.sku, status, `failed (${t.kind}): ${result.error}`);
            await ref.update({ status: "failed", error: result.error, updatedAt: new Date() });
            console.error(`[OrderAlert] Failed (${attempts}/${MAX_ATTEMPTS}) ${orderId}/${item.sku} [${t.kind}]: ${result.error}`);
          }
        } catch (e: any) {
          summary.failed++;
          note("send FAILED", orderId, storeId, item.sku, status, `error (${t.kind}): ${String(e?.message || e).slice(0, 80)}`);
          await ref.update({ status: "failed", error: String(e?.message || e).slice(0, 120), updatedAt: new Date() });
          console.error(`[OrderAlert] Error (${attempts}/${MAX_ATTEMPTS}) ${orderId}/${item.sku} [${t.kind}]:`, e?.message);
        }
      }
    }
  }

  if (summary.matchedItems === 0) {
    summary.problem = `None of the ${list.length} orders in the feed contain a watched article. Compare your SKUs with "feed SKU sample" below.`;
  }
  return finish();
}
