// Shared (frontend + server) helpers for the WhatsApp "Order Alert" feature.

export interface OrderAlertArticle {
  sku: string;              // article number (matches order item `sku`)
  note?: string;            // optional reason, available as {{note}}
  messageOverride?: string; // optional per-article template (empty = use global)
  active?: boolean;         // default true
  startDate?: string;       // optional YYYY-MM-DD (inclusive)
  endDate?: string;         // optional YYYY-MM-DD (inclusive)
  minQty?: number;          // optional: only alert if ordered qty >= this
  addedAt: string;          // ISO; only orders created after this time trigger
}

export const ORDER_ALERT_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'store', label: 'Store ID' },
  { key: 'storeName', label: 'Store Name' },
  { key: 'orderId', label: 'Order No' },
  { key: 'sku', label: 'SKU / Article' },
  { key: 'itemName', label: 'Item Name' },
  { key: 'location', label: 'Shelf Location' },
  { key: 'qty', label: 'Ordered Qty' },
  { key: 'foundQty', label: 'Picked Qty' },
  { key: 'status', label: 'Order Status' },
  { key: 'slot', label: 'Slot' },
  { key: 'note', label: 'Article Note' },
];

export const DEFAULT_ORDER_ALERT_TEMPLATE =
  `🚨 *Order Alert*\n\n` +
  `Store: {{store}}\n` +
  `Order No: {{orderId}}\n` +
  `SKU: {{sku}}\n` +
  `Item Name: {{itemName}}\n` +
  `Location: {{location}}\n` +
  `Store Name: {{storeName}}\n\n` +
  `Take necessary action on this order.`;

export const ORDER_ALERT_SAMPLE_VARS: Record<string, string> = {
  store: '2382',
  storeName: '2382 - LH,FESTIVAL PLAZA,DUBAI',
  orderId: 'Lulu-323539209013INP1',
  sku: '293819',
  itemName: 'Al Rawabi Full Cream Fresh Yoghurt 1 kg',
  location: '26A-SH238273',
  qty: '1',
  foundQty: '0',
  status: 'PICKING',
  slot: '12:22 - 13:22',
  note: 'Priority article',
};

export const normalizeSku = (s: any): string => String(s ?? '').trim().toLowerCase();

export function renderOrderAlert(template: string | undefined | null, vars: Record<string, any>): string {
  const t = (template && template.trim()) ? template : DEFAULT_ORDER_ALERT_TEMPLATE;
  const out = t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    return v === undefined || v === null || String(v).trim() === '' ? '--' : String(v);
  });
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// ---- Common groups (one or more groups that receive alerts for chosen regions) ----
export interface OrderAlertCommonGroup {
  id: string;         // stable id; 'common' = the original single common group
  name: string;
  groupJid: string;
  regions: string[];  // region names, or ['All'] for every region. Empty = receives nothing.
  enabled: boolean;
}

/** Current list; falls back to the older single "common group" settings so nothing is lost. */
export function resolveCommonGroups(cfg: any): OrderAlertCommonGroup[] {
  if (Array.isArray(cfg?.whatsappOrderAlertCommonGroups)) return cfg.whatsappOrderAlertCommonGroups;
  const jid = String(cfg?.whatsappOrderAlertCommonGroupJid || '').trim();
  if (!jid && !cfg?.whatsappOrderAlertCommonEnabled) return [];
  return [{ id: 'common', name: 'Common group', groupJid: jid, regions: ['All'], enabled: !!cfg?.whatsappOrderAlertCommonEnabled }];
}

/** Does this group receive alerts for a store in `region`? (unknown region only matches 'All') */
export function groupAppliesToRegion(g: OrderAlertCommonGroup, region: string): boolean {
  const regs = (g.regions || []).map((r) => String(r).trim().toLowerCase()).filter(Boolean);
  if (regs.length === 0) return false;
  if (regs.includes('all')) return true;
  const r = String(region || '').trim().toLowerCase();
  return !!r && regs.includes(r);
}
