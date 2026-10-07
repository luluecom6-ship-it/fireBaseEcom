import {
  DEFAULT_ORDER_ALERT_TEMPLATE,
  ORDER_ALERT_SAMPLE_VARS,
  OrderAlertArticle,
  normalizeSku,
  renderOrderAlert,
} from "../utils/orderAlertTemplate.js";

/**
 * WhatsApp "Order Alert": the first time the monitor sees an undelivered order (new OR already open when the article was added)
 * that contains a watched article (SKU), send ONE message (with the item photo)
 * to the store's fulfillment WhatsApp group. Never re-sent once marked "sent".
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
      id: d.id, orderId: x.orderId, sku: x.sku, storeId: x.storeId, status: x.status,
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

export async function processOrderAlerts(db: any, orders: any[]) {
  if (!Array.isArray(orders) || orders.length === 0) return;

  const config = await getConfig(db);
  if (!config.whatsappOrderAlertEnabled) return;
  if (!config.whatsappApiUrl || !config.whatsappApiKey) return;

  const articles: OrderAlertArticle[] = (config.whatsappOrderAlertArticles || []).filter(
    (a: OrderAlertArticle) => a && a.sku && a.active !== false,
  );
  if (articles.length === 0) return;
  const bySku = new Map<string, OrderAlertArticle>();
  articles.forEach((a) => bySku.set(normalizeSku(a.sku), a));

  const globalTemplate: string = config.whatsappOrderAlertTemplate || DEFAULT_ORDER_ALERT_TEMPLATE;
  const mappings: any[] = config.whatsappFulfillmentMappings || [];
  let sends = 0;

  for (const order of orders) {
    const status = String(order.partial_status || "").toUpperCase().trim().replace(/[\s-]+/g, "_");
    if (!status || FINISHED_STATUSES.has(status)) continue;
    if (!Array.isArray(order.items)) continue;

    const orderId = order.job_number || "";
    if (!orderId) continue;
    const rawStoreName = String(order.store_name || "");
    const m = rawStoreName.match(/\b(\d{4})\b/);
    const storeId = m ? m[1] : rawStoreName.slice(0, 4) || "UNKNOWN";

    for (const item of order.items) {
      const article = bySku.get(normalizeSku(item.sku));
      if (!article) continue;
      if (SKIP_ITEM_STATUSES.has(String(item.item_status || item.status || "").toUpperCase().trim())) continue;

      // Optional validity window (inclusive, server time) and minimum quantity
      const todayStr = new Date().toISOString().slice(0, 10);
      if (article.startDate && todayStr < article.startDate) continue;
      if (article.endDate && todayStr > article.endDate) continue;
      if (article.minQty && Number(item.quantity || 0) < Number(article.minQty)) continue;

      const key = `${orderId}_${item.sku}`.replace(/\//g, "_");
      if (handled.has(key)) continue;

      const mapping = mappings.find((x: any) => normStore(x.storeId) === normStore(storeId));
      if (!mapping || !mapping.groupJid) {
        if (!missingMappingLogged.has(storeId)) {
          missingMappingLogged.add(storeId);
          console.warn(`[OrderAlert] No fulfillment group mapped for store ${storeId}; alerts for it are skipped.`);
        }
        continue;
      }
      const instance = mapping.instanceName || config.whatsappInstanceName;
      if (!instance) continue;

      if (sends >= MAX_SENDS_PER_TICK) return;

      // Atomic claim (also protects against overlapping server instances)
      const ref = db.collection("order_alert_log").doc(key);
      let attempts = 1;
      try {
        await ref.create({
          orderId, sku: String(item.sku), storeId, status: "sending", attempts,
          createdAt: new Date(), updatedAt: new Date(),
        });
      } catch (_e) {
        const snap = await ref.get();
        const d = snap.exists ? snap.data() || {} : {};
        if (d.status === "failed" && (d.attempts ?? 1) < MAX_ATTEMPTS) {
          attempts = (d.attempts ?? 1) + 1;
          await ref.update({ status: "sending", attempts, updatedAt: new Date() });
        } else {
          handled.add(key);
          continue;
        }
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

      sends++;
      try {
        const result = await postToEvolution(config, instance, mapping.groupJid, text, largeImageUrl(item.photo_url));
        if (result.ok) {
          handled.add(key);
          await ref.update({ status: "sent", sentAt: new Date().toISOString(), updatedAt: new Date() });
          console.log(`[OrderAlert] Sent for order ${orderId}, SKU ${item.sku} -> store ${storeId}`);
        } else {
          await ref.update({ status: "failed", error: result.error, updatedAt: new Date() });
          console.error(`[OrderAlert] Failed (${attempts}/${MAX_ATTEMPTS}) ${orderId}/${item.sku}: ${result.error}`);
        }
      } catch (e: any) {
        await ref.update({ status: "failed", error: String(e?.message || e).slice(0, 120), updatedAt: new Date() });
        console.error(`[OrderAlert] Error (${attempts}/${MAX_ATTEMPTS}) ${orderId}/${item.sku}:`, e?.message);
      }
    }
  }
}
