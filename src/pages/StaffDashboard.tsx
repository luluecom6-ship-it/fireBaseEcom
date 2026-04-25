import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, CheckCircle, Moon, AlertCircle, Clock,
  RefreshCw, ChevronDown, ChevronUp, Store,
} from 'lucide-react';
import { User, StaffDashboardData, StoreSummary, StaffTimeline } from '../types';
import { cn } from '../lib/utils';

// ─────────── Types ────────────────────────────────────────────────────────────

interface StaffDashboardProps {
  user: User;
  data: StaffDashboardData | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  onRefetch: () => void;
  navigateTo: (page: any) => void;
}

type RoleFilter = 'All' | 'picker' | 'driver';

// ─────────── Helpers ──────────────────────────────────────────────────────────

function fmtHour(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${suffix}`;
}

// ─────────── Main Component ───────────────────────────────────────────────────

export const StaffDashboard: React.FC<StaffDashboardProps> = ({
  user, data, loading, error, lastFetched, onRefetch, navigateTo,
}) => {
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>('All');
  const [expandedStore, setExpandedStore] = useState<string | null>(null);

  const now = new Date();
  const currentHour = now.getHours();
  const preciseHour = currentHour + (now.getMinutes() / 60);

  // ── Filter data by role ──────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    if (!data) return null;
    if (roleFilter === 'All') return data;

    const filterStores = (stores: StoreSummary[]): StoreSummary[] =>
      stores.map(s => {
        const tl = s.staffTimeline.filter(t => t.role === roleFilter);
        return {
          ...s,
          staffTimeline: tl,
          totalStaff: tl.length,
          activeNow:  tl.filter(t => t.isActive).length,
          weekOff:    tl.filter(t => t.isWeekOff).length,
          notStarted: tl.filter(t => !t.isWeekOff && !t.punchedIn).length,
        };
      });

    const tl = data.storeBreakdown.flatMap(s =>
      s.staffTimeline.filter(t => t.role === roleFilter)
    );
    const summary = {
      totalStores: data.summary.totalStores,
      totalStaff:  tl.length,
      activeNow:   tl.filter(t => t.isActive).length,
      weekOff:     tl.filter(t => t.isWeekOff).length,
      notLoggedIn: tl.filter(t => !t.isWeekOff && !t.punchedIn).length,
    };

    return {
      ...data,
      summary,
      storeBreakdown: filterStores(data.storeBreakdown),
    };
  }, [data, roleFilter]);

  // ── Timeline bar geometry ────────────────────────────────────────────────
  const getBarStyle = (staff: StaffTimeline) => {
    const totalSpan = 24; // 0 to 24 (full day)
    const left  = (staff.shiftStart / totalSpan) * 100;
    const width = (staff.shiftHours / totalSpan) * 100;
    return { left: `${left.toFixed(1)}%`, width: `${width.toFixed(1)}%` };
  };

  const s = filteredData?.summary;

  // ── Empty / error state ──────────────────────────────────────────────────
  if (!data && !loading) {
    return (
      <motion.div
        key="staff-dash-empty"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
      >
        <div className="text-center max-w-xs">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={40} />
          <p className="text-slate-500 text-sm">
            {error || 'Unable to load Staff Dashboard. Check your connection or role permissions.'}
          </p>
          <button
            onClick={onRefetch}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold"
          >
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="staff-dash"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="min-h-screen bg-slate-50 pb-10"
    >
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2">
              <Users size={20} className="text-blue-600" />
              Staff Coverage
            </h2>
            {lastFetched && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Updated {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Role filter */}
            <div className="flex bg-white border border-slate-100 rounded-xl p-1 gap-1 shadow-sm">
              {(['All', 'picker', 'driver'] as RoleFilter[]).map(opt => (
                <button
                  key={opt}
                  onClick={() => setRoleFilter(opt)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all',
                    roleFilter === opt
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-700'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>

            <button
              onClick={onRefetch}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-100
                         rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm
                         text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all
                         disabled:opacity-50"
            >
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── SECTION 1: Summary Bar ──────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { icon: Store,       label: 'Total Stores',  value: s?.totalStores,  ring: 'border-slate-200', val: 'text-slate-700' },
            { icon: Users,       label: 'Total Staff',   value: s?.totalStaff,   ring: 'border-blue-200',  val: 'text-blue-700'  },
            { icon: CheckCircle, label: 'Active Now',    value: s?.activeNow,    ring: 'border-green-200', val: 'text-green-700' },
            { icon: Moon,        label: 'Week Off',      value: s?.weekOff,      ring: 'border-amber-200', val: 'text-amber-700' },
            { icon: AlertCircle, label: 'Not Logged In', value: s?.notLoggedIn,  ring: 'border-red-200',   val: 'text-red-700'   },
          ].map(({ icon: Icon, label, value, ring, val }) => (
            <div
              key={label}
              className={cn(
                'bg-white rounded-2xl p-4 border shadow-sm flex items-center gap-3',
                ring
              )}
            >
              <Icon size={18} className={val} />
              <div>
                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                <p className={cn('text-2xl font-black', val)}>{value ?? '—'}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── SECTION 2: Hourly Heatmap ───────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
            <Clock size={16} className="text-blue-500" />
            <span className="font-black text-sm tracking-tight text-slate-700">Hourly Coverage Heatmap</span>
            <span className="ml-auto text-[10px] text-slate-400">▶ = current hour</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400">
                  <th className="text-left px-5 py-2 font-semibold w-32">Hour</th>
                  <th className="text-left px-4 py-2 font-semibold text-green-600">✅ Active</th>
                  <th className="text-left px-4 py-2 font-semibold text-amber-500">😴 Week Off</th>
                  <th className="text-left px-4 py-2 font-semibold text-red-500">⏳ Not Started</th>
                </tr>
              </thead>
              <tbody>
                {filteredData?.hourlyBreakdown.map(slot => {
                  const isCurrent = slot.hour === currentHour;
                  const maxVal    = filteredData.summary.totalStaff || 1;
                  return (
                    <tr
                      key={slot.hour}
                      className={cn(
                        'border-t border-slate-50 transition-colors',
                        isCurrent ? 'bg-blue-50' : 'hover:bg-slate-50/60'
                      )}
                    >
                      <td className="px-5 py-2 font-mono text-slate-600">
                        {isCurrent && (
                          <span className="text-blue-500 mr-1">▶</span>
                        )}
                        {slot.label}
                      </td>
                      <td className="px-4 py-2">
                        <HeatCell value={slot.active}     max={maxVal} color="green"  />
                      </td>
                      <td className="px-4 py-2">
                        <HeatCell value={slot.weekOff}   max={maxVal} color="amber"  />
                      </td>
                      <td className="px-4 py-2">
                        <HeatCell value={slot.notStarted} max={maxVal} color="red"    />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 3: Store-wise breakdown ─────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-50">
            <Store size={16} className="text-purple-500" />
            <span className="font-black text-sm tracking-tight text-slate-700">Store-wise Breakdown</span>
          </div>
          <div className="divide-y divide-slate-50">
            {filteredData?.storeBreakdown.map(store => (
              <StoreRow
                key={store.storeId}
                store={store}
                isExpanded={expandedStore === store.storeId}
                onToggle={() =>
                  setExpandedStore(prev =>
                    prev === store.storeId ? null : store.storeId
                  )
                }
                fmtHour={fmtHour}
                getBarStyle={getBarStyle}
                preciseHour={preciseHour}
                totalStaff={filteredData.summary.totalStaff}
              />
            ))}
          </div>
        </div>

      </div>
    </motion.div>
  );
};

// ─────────── Sub-components ───────────────────────────────────────────────────

const HeatCell: React.FC<{
  value: number;
  max: number;
  color: 'green' | 'amber' | 'red';
}> = ({ value, max, color }) => {
  const pct = Math.round(Math.min((value / Math.max(max, 1)) * 100, 100));
  const colorMap = {
    green: { text: 'text-green-700',  bg: 'bg-green-500' },
    amber: { text: 'text-amber-600',  bg: 'bg-amber-400' },
    red:   { text: 'text-red-600',    bg: 'bg-red-400'   },
  };
  const { text, bg } = colorMap[color];

  return (
    <div className="flex items-center gap-2">
      <span className={cn('font-black w-5 text-right', text)}>{value}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-20">
        <div
          className={cn('h-full rounded-full transition-all duration-300', bg)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const StoreRow: React.FC<{
  store: StoreSummary;
  isExpanded: boolean;
  onToggle: () => void;
  fmtHour: (h: number) => string;
  getBarStyle: (s: StaffTimeline) => { left: string; width: string };
  preciseHour: number;
  totalStaff: number;
}> = ({ store, isExpanded, onToggle, fmtHour, getBarStyle, preciseHour }) => {
  const nowPct = `${(preciseHour / 24 * 100).toFixed(2)}%`;

  return (
    <div>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3
                   hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-black text-sm text-slate-700 min-w-[60px]">
            {store.storeId}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Badge color="slate">{store.totalStaff} staff</Badge>
            <Badge color="green">✅ {store.activeNow} active</Badge>
            {store.weekOff   > 0 && <Badge color="amber">😴 {store.weekOff} off</Badge>}
            {store.notStarted > 0 && <Badge color="red">⏳ {store.notStarted} pending</Badge>}
          </div>
        </div>
        {isExpanded
          ? <ChevronUp  size={14} className="text-slate-400 flex-shrink-0" />
          : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
        }
      </button>

      {/* Timeline panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 bg-slate-50/60">
              {/* Hour axis */}
              <div className="flex items-center gap-2 mt-3 mb-1">
                <div className="w-24 flex-shrink-0" /> {/* Spacer for name + gap matching row layout */}
                <div className="flex-1 flex text-[9px] text-slate-400 font-mono">
                  {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map(h => (
                    <span key={h} className="flex-1">
                      {h === 0 ? '12A' : h === 12 ? '12P' : h < 12 ? h+'A' : (h-12)+'P'}
                    </span>
                  ))}
                </div>
                <div className="w-16 flex-shrink-0" /> {/* Spacer for time label matching row layout */}
              </div>

              {/* Staff rows */}
              <div className="space-y-1.5">
                {store.staffTimeline.map(staff => {
                  const shiftEnd = staff.shiftStart + staff.shiftHours;
                  const nameColor = staff.isWeekOff
                    ? 'text-amber-500'
                    : staff.isActive   ? 'text-green-600'
                    : staff.punchedIn  ? 'text-blue-500'
                    : 'text-red-400';
                  const barColor = staff.isWeekOff
                    ? ''
                    : staff.isActive   ? 'bg-green-400'
                    : staff.punchedIn  ? 'bg-blue-400'
                    : 'bg-red-200 border border-dashed border-red-300';

                  const crossMidnight = shiftEnd > 24;

                  return (
                    <div key={staff.empId} className="flex items-center gap-2">
                      {/* Name */}
                      <div className={cn('w-24 flex-shrink-0 text-right pr-2', nameColor)}>
                        <span className="text-[10px] font-bold truncate block leading-tight">
                          {staff.name.split(' ')[0]}
                        </span>
                        <span className="text-[9px] opacity-60 capitalize">{staff.role[0].toUpperCase()}</span>
                      </div>

                      {/* Track */}
                      <div className="flex-1 h-5 bg-slate-200 rounded relative overflow-hidden">
                        {/* Hourly grid lines */}
                        {Array.from({ length: 24 }).map((_, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 w-px bg-slate-300/30"
                            style={{ left: `${(i / 24) * 100}%` }}
                          />
                        ))}
                        
                        {/* Current-time marker */}
                        <div
                          className="absolute top-0 bottom-0 w-px bg-blue-500 z-10 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                          style={{ left: nowPct }}
                        />

                        {staff.isWeekOff ? (
                          <div className="absolute inset-0 flex items-center justify-center
                                          text-amber-500 text-[9px] font-black tracking-widest uppercase">
                            Week Off
                          </div>
                        ) : (
                          <>
                            <div
                              className={cn('absolute top-0.5 bottom-0.5 rounded-sm transition-all duration-500', barColor)}
                              style={getBarStyle(staff)}
                              title={`${fmtHour(staff.shiftStart)} – ${fmtHour(shiftEnd % 24)} (${staff.shiftHours}h)`}
                            />
                            {crossMidnight && (
                               <div
                               className={cn('absolute top-0.5 bottom-0.5 rounded-sm transition-all duration-500', barColor)}
                               style={{ left: '0%', width: `${((shiftEnd - 24) / 24) * 100}%` }}
                               title={`${fmtHour(staff.shiftStart)} – ${fmtHour(shiftEnd % 24)} (${staff.shiftHours}h)`}
                             />
                            )}
                          </>
                        )}
                      </div>

                      {/* Time label */}
                      {!staff.isWeekOff && (
                        <span className="text-[9px] text-slate-400 font-mono w-16 flex-shrink-0 text-right">
                          {fmtHour(staff.shiftStart)}–{fmtHour(shiftEnd % 24)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-4 mt-3 text-[9px] text-slate-400">
                <LegendDot color="bg-green-400" label="Active" />
                <LegendDot color="bg-blue-400"  label="Punched in" />
                <LegendDot color="bg-red-200 border border-dashed border-red-300" label="Not started" />
                <LegendDot color="bg-amber-200" label="Week off" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Badge: React.FC<{
  color: 'slate' | 'green' | 'amber' | 'red';
  children: React.ReactNode;
}> = ({ color, children }) => {
  const cls = {
    slate: 'bg-slate-100 text-slate-500',
    green: 'bg-green-50  text-green-600',
    amber: 'bg-amber-50  text-amber-600',
    red:   'bg-red-50    text-red-500',
  }[color];
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', cls)}>
      {children}
    </span>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="flex items-center gap-1">
    <span className={cn('w-3 h-2 rounded-sm inline-block', color)} />
    {label}
  </span>
);
