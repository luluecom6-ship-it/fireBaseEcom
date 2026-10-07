import React, { useRef, useState } from 'react';
import { Plus, Trash2, Save, Send, RotateCcw, BellRing, ChevronDown, ChevronUp, RefreshCw, Play } from 'lucide-react';
import { cn } from '../../lib/utils';
import { authHeaders } from '../../utils/authHeaders';
import {
  DEFAULT_ORDER_ALERT_TEMPLATE,
  ORDER_ALERT_PLACEHOLDERS,
  ORDER_ALERT_SAMPLE_VARS,
  OrderAlertArticle,
  normalizeSku,
  renderOrderAlert,
} from '../../utils/orderAlertTemplate';

interface Props {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  articles: OrderAlertArticle[];
  setArticles: (v: OrderAlertArticle[]) => void;
  template: string;
  setTemplate: (v: string) => void;
  commonEnabled: boolean;
  setCommonEnabled: (v: boolean) => void;
  commonGroupJid: string;
  setCommonGroupJid: (v: string) => void;
  onSave: () => void;
  isSaving: boolean;
  canSave: boolean;
  defaultTestJid?: string;
  requesterRole: string;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const OrderAlertConfig: React.FC<Props> = ({
  enabled, setEnabled, articles, setArticles, template, setTemplate,
  commonEnabled, setCommonEnabled, commonGroupJid, setCommonGroupJid,
  onSave, isSaving, canSave, defaultTestJid, requesterRole, showToast,
}) => {
  const [skuInput, setSkuInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testJid, setTestJid] = useState(defaultTestJid || '');
  const [isTesting, setIsTesting] = useState(false);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [status, setStatus] = useState<any | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const effectiveTemplate = template && template.trim() ? template : DEFAULT_ORDER_ALERT_TEMPLATE;
  const isDefault = !template || template.trim() === '' || template === DEFAULT_ORDER_ALERT_TEMPLATE;

  // Accepts one SKU or many (comma / space / newline separated)
  const addArticles = () => {
    const incoming = skuInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    const existing = new Set(articles.map(a => normalizeSku(a.sku)));
    const now = new Date().toISOString();
    const fresh: OrderAlertArticle[] = [];
    incoming.forEach(sku => {
      const k = normalizeSku(sku);
      if (existing.has(k)) return;
      existing.add(k);
      fresh.push({ sku, note: incoming.length === 1 ? noteInput.trim() : '', active: true, addedAt: now });
    });
    if (fresh.length === 0) { showToast?.('Article(s) already in the list', 'error'); return; }
    setArticles([...articles, ...fresh]);
    setSkuInput(''); setNoteInput('');
    showToast?.(`${fresh.length} article(s) added. Click Save Config to apply.`, 'success');
  };

  const updateArticle = (sku: string, patch: Partial<OrderAlertArticle>) =>
    setArticles(articles.map(a => (a.sku === sku ? { ...a, ...patch } : a)));

  const insertPlaceholder = (key: string) => {
    const tag = `{{${key}}}`;
    const el = templateRef.current;
    const base = effectiveTemplate;
    if (!el) { setTemplate(base + tag); return; }
    const start = el.selectionStart ?? base.length;
    const end = el.selectionEnd ?? base.length;
    setTemplate(base.slice(0, start) + tag + base.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); });
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/admin/whatsapp/order-alert-log', { headers: await authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLogs(data.logs || []);
    } catch (e: any) {
      showToast?.(e.message || 'Failed to load alert log', 'error');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const retryLog = async (id: string) => {
    try {
      const res = await fetch('/api/admin/whatsapp/order-alert-retry', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast?.('Queued for retry on the next monitor cycle', 'success');
      loadLogs();
    } catch (e: any) {
      showToast?.(e.message || 'Retry failed', 'error');
    }
  };

  const loadStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/admin/whatsapp/order-alert-status', { headers: await authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus(data.status || null);
      setStatusLoaded(true);
    } catch (e: any) {
      showToast?.(e.message || 'Failed to load status', 'error');
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const runNow = async () => {
    if (!window.confirm('Run the alert check now? This sends REAL WhatsApp alerts (once per order) for every matching order currently in the feed. Save Config first if you changed anything.')) return;
    setIsRunning(true);
    try {
      const res = await fetch('/api/admin/whatsapp/order-alert-run', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus(data.summary || null);
      setStatusLoaded(true);
      showToast?.(`Check finished: ${data.summary?.sent ?? 0} sent`, 'success');
      loadLogs();
    } catch (e: any) {
      showToast?.(e.message || 'Run failed', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const sendTest = async () => {
    if (!testJid.trim()) { showToast?.('Enter a group JID or phone number for the test', 'error'); return; }
    setIsTesting(true);
    try {
      const res = await fetch('/api/admin/whatsapp/order-alert-test', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ number: testJid.trim(), template: effectiveTemplate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast?.('Test Order Alert sent', 'success');
    } catch (e: any) {
      showToast?.(e.message || 'Test failed', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const input = 'w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700 outline-none focus:border-amber-400';

  return (
    <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden mt-6">
      <div className="p-4 sm:p-6 bg-amber-50/60 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-black text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
            <BellRing size={20} className="text-amber-600" />
            WhatsApp Order Alert (Watched Articles)
          </h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
            Sends ONE alert per order to the store's fulfillment group, any time from order creation until delivery
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{enabled ? 'Enabled' : 'Disabled'}</p>
          <button
            onClick={() => setEnabled(!enabled)}
            className={cn('w-10 h-5 sm:w-12 sm:h-6 rounded-full relative transition-colors duration-300', enabled ? 'bg-amber-500' : 'bg-slate-200')}
          >
            <div className={cn('absolute top-1 h-3 w-3 sm:h-4 sm:w-4 bg-white rounded-full transition-all shadow-sm', enabled ? 'right-1' : 'left-1')} />
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !canSave}
            className={cn('px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ml-2',
              (isSaving || !canSave) ? 'bg-slate-100 text-slate-400' : 'bg-amber-600 text-white hover:bg-amber-700')}
          >
            <Save size={12} /> {isSaving ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </div>

      {enabled && (
        <div className="p-4 sm:p-6 bg-slate-50 flex flex-col gap-6">
          {/* Common group */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h5 className="text-xs font-black text-slate-800">Common group (all stores)</h5>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                  One WhatsApp group that receives every Order Alert from every store, in addition to the store's own fulfillment group. Each alert is sent once to it.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{commonEnabled ? 'On' : 'Off'}</p>
                <button
                  onClick={() => setCommonEnabled(!commonEnabled)}
                  className={cn('w-10 h-5 rounded-full relative transition-colors duration-300', commonEnabled ? 'bg-amber-500' : 'bg-slate-200')}
                >
                  <div className={cn('absolute top-1 h-3 w-3 bg-white rounded-full transition-all shadow-sm', commonEnabled ? 'right-1' : 'left-1')} />
                </button>
              </div>
            </div>
            <input className={cn(input, 'mt-3')} value={commonGroupJid} onChange={e => setCommonGroupJid(e.target.value)}
              placeholder="Common group JID (120363…@g.us)" />
            {commonEnabled && !commonGroupJid.trim() && (
              <p className="text-[10px] font-bold text-red-500 mt-1">Enter the group JID, otherwise nothing is sent to the common group.</p>
            )}
            <p className="text-[9px] font-bold text-slate-400 mt-1">Uses the main WhatsApp instance. Stores without a fulfillment mapping still reach this group while it is On.</p>
          </div>

          {/* Articles */}
          <div>
            <h5 className="text-xs font-black text-slate-800">Article numbers (SKU)</h5>
            <p className="text-[9px] font-bold text-slate-400 mt-0.5 mb-3">
              Applies to new orders AND orders already open (not yet delivered) when the article is added. Each order + article alerts once and is never re-sent. Adding an article with many open orders sends up to 20 alerts per cycle. Alerts go out on the monitor's ~10-minute cycle. Recipients = the store group in "WhatsApp Fulfillment Alerts" and, if switched on below, the common group.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
              <input className={input} value={skuInput} onChange={e => setSkuInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addArticles()}
                placeholder="SKU — paste several separated by comma, space or new line" />
              <input className={input} value={noteInput} onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addArticles()}
                placeholder="Note for this SKU → replaces the last line of the alert" />
              <button onClick={addArticles} className="px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold flex items-center gap-1.5 justify-center">
                <Plus size={14} /> Add
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {articles.length === 0 && <p className="text-xs text-slate-400 font-bold">No articles added yet.</p>}
              {articles.map(a => (
                <div key={a.sku} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateArticle(a.sku, { active: a.active === false })}
                      className={cn('w-9 h-5 rounded-full relative shrink-0 transition-colors', a.active === false ? 'bg-slate-200' : 'bg-amber-500')}
                      title={a.active === false ? 'Paused' : 'Active'}
                    >
                      <div className={cn('absolute top-1 h-3 w-3 bg-white rounded-full transition-all', a.active === false ? 'left-1' : 'right-1')} />
                    </button>
                    <span className="font-black text-sm text-slate-800 shrink-0">{a.sku}</span>
                    <input className={cn(input, 'flex-1')} value={a.note || ''} placeholder="Note"
                      onChange={e => updateArticle(a.sku, { note: e.target.value })} />
                    {a.messageOverride?.trim() && <span className="text-[9px] font-black uppercase text-amber-600 shrink-0">Custom msg</span>}
                    <button onClick={() => setExpanded(expanded === a.sku ? null : a.sku)} className="text-slate-400 hover:text-slate-600" title="Per-article message">
                      {expanded === a.sku ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button onClick={() => setArticles(articles.filter(x => x.sku !== a.sku))} className="text-red-400 hover:text-red-600" title="Remove">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {expanded === a.sku && (
                    <div className="mt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Start date (optional)</label>
                          <input type="date" className={input} value={a.startDate || ''} onChange={e => updateArticle(a.sku, { startDate: e.target.value || undefined })} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">End date (optional)</label>
                          <input type="date" className={input} value={a.endDate || ''} onChange={e => updateArticle(a.sku, { endDate: e.target.value || undefined })} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Min ordered qty (optional)</label>
                          <input type="number" min={1} className={input} value={a.minQty ?? ''} placeholder="Any"
                            onChange={e => updateArticle(a.sku, { minQty: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} />
                        </div>
                      </div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        Message override for this article (leave empty to use the global message)
                      </label>
                      <textarea rows={7} className={cn(input, 'font-mono')} value={a.messageOverride || ''}
                        placeholder={effectiveTemplate}
                        onChange={e => updateArticle(a.sku, { messageOverride: e.target.value })} />
                      {a.messageOverride?.trim() && (
                        <pre className="mt-2 bg-green-50 border border-green-100 rounded-lg p-3 text-xs whitespace-pre-wrap text-slate-700">
                          {renderOrderAlert(a.messageOverride, { ...ORDER_ALERT_SAMPLE_VARS, sku: a.sku, note: a.note })}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Global template */}
          <div>
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-black text-slate-800">Default message {isDefault && <span className="text-slate-400 font-bold">(using built-in default)</span>}</h5>
              <button onClick={() => setTemplate('')} disabled={isDefault}
                className={cn('text-[10px] font-black uppercase tracking-widest flex items-center gap-1', isDefault ? 'text-slate-300' : 'text-amber-600 hover:text-amber-700')}>
                <RotateCcw size={12} /> Reset to default
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 my-2">
              {ORDER_ALERT_PLACEHOLDERS.map(p => (
                <button key={p.key} onClick={() => insertPlaceholder(p.key)} title={p.label}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-mono font-bold text-slate-600 hover:bg-amber-50">
                  {`{{${p.key}}}`}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <textarea ref={templateRef} rows={11} className={cn(input, 'font-mono')} value={effectiveTemplate}
                onChange={e => setTemplate(e.target.value)} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Preview (sample data, image attached)</p>
                <pre className="bg-green-50 border border-green-100 rounded-lg p-3 text-xs whitespace-pre-wrap text-slate-700 min-h-[14rem]">
                  {renderOrderAlert(effectiveTemplate, ORDER_ALERT_SAMPLE_VARS)}
                </pre>
              </div>
            </div>
            <p className="text-[9px] font-bold text-slate-400 mt-1">WhatsApp formatting works: *bold*, _italic_. Empty values show as "--". The last line ({'{{action}}'}) shows the SKU's note, or "Take necessary action on this order." when the SKU has no note. The preview uses the sample note "Priority article".</p>
          </div>

          {/* Test */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input className={cn(input, 'sm:max-w-xs')} value={testJid} onChange={e => setTestJid(e.target.value)}
              placeholder="Test group JID / number (120363…@g.us)" />
            <button onClick={sendTest} disabled={isTesting}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold flex items-center gap-1.5 justify-center">
              <Send size={14} /> {isTesting ? 'Sending…' : 'Send test message'}
            </button>
            <p className="text-[9px] font-bold text-slate-400">Tests use the current (unsaved) message above.</p>
          </div>
          {/* Status & diagnostics */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h5 className="text-xs font-black text-slate-800">Status &amp; diagnostics</h5>
              <div className="flex items-center gap-3">
                <button onClick={loadStatus} disabled={isLoadingStatus}
                  className="text-[10px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 flex items-center gap-1">
                  <RefreshCw size={12} className={isLoadingStatus ? 'animate-spin' : ''} /> {statusLoaded ? 'Refresh' : 'Load last run'}
                </button>
                <button onClick={runNow} disabled={isRunning}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-amber-600 text-white hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 flex items-center gap-1.5">
                  <Play size={12} /> {isRunning ? 'Running…' : 'Run alert check now'}
                </button>
              </div>
            </div>
            {!statusLoaded && <p className="text-[10px] font-bold text-slate-400">Shows what the monitor did on its last cycle and why each matching order was or wasn't alerted.</p>}
            {statusLoaded && !status && (
              <p className="text-xs font-bold text-red-500">No run recorded yet. If the feature has been on for 10+ minutes, this deployment's monitor is not being triggered. Use “Run alert check now”.</p>
            )}
            {status && (
              <div className="text-xs font-bold text-slate-700 flex flex-col gap-2">
                <p>
                  Last run: {status.at ? new Date(status.at).toLocaleString() : '--'} ({status.source === 'manual' ? 'manual' : 'monitor cycle'})
                </p>
                {status.problem && <p className="text-red-600">⚠ {status.problem}</p>}
                <p className="text-slate-500">
                  Orders in feed: {status.ordersScanned} · Watched articles: {status.watchedArticles} · Matching items: {status.matchedItems} · Sent: {status.sent} · Failed: {status.failed} · Common group: {status.commonGroup}
                </p>
                {status.reasons && Object.keys(status.reasons).length > 0 && (
                  <ul className="list-disc pl-5 text-slate-600">
                    {Object.entries(status.reasons).map(([k, v]: any) => <li key={k}>{k}: {v}</li>)}
                  </ul>
                )}
                {status.samples && status.samples.length > 0 && (
                  <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                        <th className="p-1.5">Order</th><th className="p-1.5">Store</th><th className="p-1.5">SKU</th><th className="p-1.5">Order status</th><th className="p-1.5">Result</th>
                      </tr></thead>
                      <tbody>
                        {status.samples.map((s: any, i: number) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="p-1.5">{s.orderId}</td><td className="p-1.5">{s.storeId}</td><td className="p-1.5">{s.sku}</td>
                            <td className="p-1.5">{s.status}</td><td className="p-1.5">{s.result}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {status.feed && (
                  <p className="text-[10px] text-slate-400 break-words">
                    Feed SKU sample: {(status.feed.skuSample || []).join(', ') || '--'} · Order statuses seen: {(status.feed.statusSample || []).join(', ') || '--'} · Item fields: {(status.feed.itemKeys || []).join(', ') || '--'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Send log */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-black text-slate-800">Recent alerts (last 50)</h5>
              <button onClick={loadLogs} disabled={isLoadingLogs}
                className="text-[10px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 flex items-center gap-1">
                <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} /> {logs === null ? 'Load' : 'Refresh'}
              </button>
            </div>
            {logs !== null && logs.length === 0 && <p className="text-xs text-slate-400 font-bold">No alerts sent yet.</p>}
            {logs && logs.length > 0 && (
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="p-2">Time</th><th className="p-2">Order</th><th className="p-2">SKU</th>
                      <th className="p-2">Store</th><th className="p-2">To</th><th className="p-2">Status</th><th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id} className="border-b border-slate-50 font-bold text-slate-700">
                        <td className="p-2 whitespace-nowrap">{l.createdAt ? new Date(l.createdAt).toLocaleString() : '--'}</td>
                        <td className="p-2">{l.orderId}</td>
                        <td className="p-2">{l.sku}</td>
                        <td className="p-2">{l.storeId}</td>
                        <td className="p-2">{l.destination === 'common' ? 'Common' : 'Store'}</td>
                        <td className="p-2" title={l.error || ''}>
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase',
                            l.status === 'sent' ? 'bg-green-100 text-green-700' : l.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500')}>
                            {l.status}{l.status === 'failed' ? ` (${l.attempts}/3)` : ''}
                          </span>
                        </td>
                        <td className="p-2">
                          {l.status === 'failed' && (
                            <button onClick={() => retryLog(l.id)} className="text-[10px] font-black uppercase text-amber-600 hover:text-amber-700">Retry</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
