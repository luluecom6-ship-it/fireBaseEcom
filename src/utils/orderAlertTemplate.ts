// Shared (frontend + server) helpers for the WhatsApp "Order Alert" feature.

export interface OrderAlertArticle {
  sku: string;              // article number (matches order item `sku`)
  note?: string;            // optional note; replaces the default footer line (also available as {{note}})
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
  { key: 'action', label: 'Article note, or default action line' },
];

export const DEFAULT_ORDER_ALERT_FOOTER = 'Take necessary action on this order.';

export const DEFAULT_ORDER_ALERT_TEMPLATE =
  `🚨 *Order Alert*\n\n` +
  `Store: {{store}}\n` +
  `Order No: {{orderId}}\n` +
  `SKU: {{sku}}\n` +
  `Item Name: {{itemName}}\n` +
  `Location: {{location}}\n` +
  `Store Name: {{storeName}}\n\n` +
  `{{action}}`;

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
  const note = String(vars.note ?? '').trim();
  // {{action}} = the article's note when it has one, otherwise the default footer line
  const all: Record<string, any> = { ...vars, action: note || DEFAULT_ORDER_ALERT_FOOTER };
  let out = t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    const v = all[k];
    return v === undefined || v === null || String(v).trim() === '' ? '--' : String(v);
  });
  // Templates saved earlier still contain the fixed footer text: swap it for the note,
  // unless the template already places the note itself via {{note}}.
  if (note && !/\{\{\s*note\s*\}\}/.test(t)) {
    out = out.split(DEFAULT_ORDER_ALERT_FOOTER).join(note);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
