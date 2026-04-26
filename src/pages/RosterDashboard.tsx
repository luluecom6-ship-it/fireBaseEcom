import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, RefreshCw, AlertTriangle, CheckCircle, Moon, Clock,
  Store, ChevronDown, ChevronUp, Calendar, Activity, Info,
  AlertCircle, LayoutGrid,
} from 'lucide-react';
import { User } from '../types';
import { cn } from '../lib/utils';
import {
  useRosterDashboard,
  DAYS_OF_WEEK,
  SHIFT_HOURS,
  DayName,
  RosterUser,
  StoreCoverage,
  GapAlert,
  isWorkingOnDay,
  isWorkingAtHour,
  fmtHour,
  todayName,
} from '../hooks/useRosterDashboard';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RosterDashboardProps {
  user: User;
  navigateTo: (page: any) => void;
}

// ─── Tab Types ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'hourly' | 'weekly' | 'gaps';

// ─── Small helpers ────────────────────────────────────────────────────────────

function roleBadge(role: string) {
  const map: Record<string, string> = {
    supervisor: 'bg-blue-100 text-blue-700',
    picker:     'bg-emerald-50 text-emerald-700',
    driver:     'bg-amber-50  text-amber-700',
    store:      'bg-purple-50 text-purple-700',
    manager:    'bg-slate-100 text-slate-600',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider', map[role] ?? 'bg-slate-100 text-slate-500')}>
      {role}
    </span>
  );
}

/** Coverage severity colour for a count value */
function covColor(n: number): string {
  if (n === 0) return 'text-red-600 font-black';
  if (n === 1) return 'text-amber-600 font-bold';
  if (n <= 2)  return 'text-emerald-600 font-bold';
  return 'text-blue-600 font-bold';
}

function covBg(n: number): string {
  if (n === 0) return 'bg-red-500';
  if (n === 1) return 'bg-amber-400';
  if (n <= 2)  return 'bg-emerald-400';
  return 'bg-blue-400';
}

const TODAY: DayName = todayName();

// ─── SECTION: Summary Stat Card ───────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number | string;
  border: string;
  valColor: string;
  onClick?: () => void;
}> = ({ icon: Icon, label, value, border, valColor, onClick }) => (
  <motion.button
    whileTap={onClick ? { scale: 0.95 } : undefined}
    onClick={onClick}
    className={cn(
      'bg-white rounded-2xl border p-4 flex flex-col gap-1 shadow-sm text-left', 
      border,
      onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : 'cursor-default'
    )}
  >
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
      <Icon size={13} />
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <span className={cn('text-2xl font-black', valColor)}>{value}</span>
  </motion.button>
);

// ─── SECTION: Overview Tab ────────────────────────────────────────────────────

const OverviewTab: React.FC<{
  stores: string[];
  storeCoverage: Record<string, StoreCoverage>;
  onDrillStore: (sid: string) => void;
}> = ({ stores, storeCoverage, onDrillStore }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {stores.map(sid => {
        const sc = storeCoverage[sid];
        if (!sc) return null;
        const status =
          sc.workingToday.length === 0 || !sc.hasSupervisor ? 'critical'
          : sc.supervisorsToday.length === 0                 ? 'warning'
          : 'ok';
        const borderCls =
          status === 'critical' ? 'border-red-300 bg-red-50/30'
          : status === 'warning' ? 'border-amber-300 bg-amber-50/20'
          : 'border-slate-100';

        return (
          <motion.button
            key={sid}
            whileTap={{ scale: 0.98 }}
            onClick={() => onDrillStore(sid)}
            className={cn(
              'bg-white rounded-2xl border p-4 text-left shadow-sm hover:shadow-md transition-shadow w-full',
              borderCls
            )}
          >
            {/* Store header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Store</div>
                <div className="text-lg font-black text-slate-800">{sid}</div>
              </div>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                status === 'critical' ? 'bg-red-100 text-red-600'
                : status === 'warning' ? 'bg-amber-100 text-amber-600'
                : 'bg-emerald-50 text-emerald-600'
              )}>
                {status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : 'OK'}
              </span>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: 'Working', val: sc.workingToday.length, color: 'text-emerald-600' },
                { label: 'Off today', val: sc.onWeekOffToday.length, color: 'text-amber-600' },
                { label: 'Supervisors', val: sc.supervisorsToday.length, color: 'text-blue-600' },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center">
                  <div className={cn('text-xl font-black', color)}>{val}</div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
                </div>
              ))}
            </div>

            {/* Mini hourly bar */}
            <div className="flex gap-px h-3 items-end">
              {sc.hourlyCount.map((n, i) => (
                <div
                  key={i}
                  className={cn('flex-1 rounded-sm', n === 0 ? 'bg-red-300' : covBg(n))}
                  style={{ height: `${Math.min(100, (n / Math.max(...sc.hourlyCount, 1)) * 100)}%`, minHeight: n === 0 ? '100%' : '20%', opacity: n === 0 ? 0.6 : 0.85 }}
                  title={`${fmtHour(SHIFT_HOURS[i])}: ${n} staff`}
                />
              ))}
            </div>
            <div className="text-[9px] text-slate-400 mt-1">Hourly coverage (6 AM – 11 PM)</div>

            <div className="mt-3 text-[10px] text-blue-500 font-bold flex items-center gap-1">
              Tap to drill hourly view <ChevronDown size={10} />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

// ─── SECTION: Hourly Tab ──────────────────────────────────────────────────────

const HourlyTab: React.FC<{
  stores: string[];
  storeCoverage: Record<string, StoreCoverage>;
  initialStore?: string;
}> = ({ stores, storeCoverage, initialStore }) => {
  const [selectedStore, setSelectedStore] = useState(initialStore || stores[0] || '');
  const [selectedDay, setSelectedDay]     = useState<DayName>(TODAY);
  const [expandedSup, setExpandedSup]     = useState(true);

  // Re-derive coverage for selected day (hook only pre-computes for today)
  const sc = storeCoverage[selectedStore];
  const allStaff = sc?.staff || [];

  const working = useMemo(
    () => allStaff.filter(s => isWorkingOnDay(s, selectedDay) && s.hasSchedule),
    [allStaff, selectedDay]
  );
  const offDay = useMemo(
    () => allStaff.filter(s => s.weekOffDay === selectedDay && s.status === 'Active'),
    [allStaff, selectedDay]
  );
  const noSched = useMemo(
    () => allStaff.filter(s => isWorkingOnDay(s, selectedDay) && !s.hasSchedule),
    [allStaff, selectedDay]
  );

  const coverageByHour = SHIFT_HOURS.map(h =>
    working.filter(s => isWorkingAtHour(s, selectedDay, h)).length
  );

  const nowHour = new Date().getHours();

  // Sort: supervisors first, then pickers
  const sortedWorking = [...working].sort((a, b) => {
    const order = (r: string) => r === 'supervisor' ? 0 : r === 'driver' ? 1 : 2;
    return order(a.role) - order(b.role) || (a.shiftStart ?? 0) - (b.shiftStart ?? 0);
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={selectedStore}
          onChange={e => setSelectedStore(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {stores.map(s => <option key={s} value={s}>Store {s}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {DAYS_OF_WEEK.map(d => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all',
                selectedDay === d
                  ? 'bg-blue-600 text-white shadow'
                  : d === TODAY
                    ? 'bg-blue-50 text-blue-500 border border-blue-200'
                    : 'bg-white text-slate-400 border border-slate-100 hover:text-slate-700'
              )}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {[
          { label: 'Working', val: working.length,  color: 'text-emerald-600', border: 'border-emerald-100' },
          { label: 'Week-off', val: offDay.length,   color: 'text-amber-600',   border: 'border-amber-100'   },
          { label: 'No sched', val: noSched.length,  color: 'text-slate-400',   border: 'border-slate-100'   },
          { label: 'Zero-cov hrs', val: coverageByHour.filter(n => n === 0).length, color: 'text-red-600', border: 'border-red-100' },
        ].map(({ label, val, color, border }) => (
          <div key={label} className={cn('bg-white border rounded-xl p-3 text-center shadow-sm', border)}>
            <div className={cn('text-xl font-black', color)}>{val}</div>
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar chart */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
          Hourly coverage — {selectedDay === TODAY ? 'today · ' : ''}{selectedDay}
        </div>
        <div className="flex gap-px h-10 items-end">
          {coverageByHour.map((n, i) => {
            const h = SHIFT_HOURS[i];
            const isNow = selectedDay === TODAY && h === nowHour;
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-px">
                <div
                  className={cn(
                    'w-full rounded-t-sm transition-all',
                    n === 0 ? 'bg-red-300' : covBg(n),
                    isNow && 'ring-1 ring-blue-500 ring-offset-1'
                  )}
                  style={{ height: `${Math.max(8, (n / Math.max(...coverageByHour, 1)) * 100)}%` }}
                  title={`${fmtHour(h)}: ${n} staff`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex mt-1">
          {SHIFT_HOURS.map((h, i) => (
            <div key={h} className="flex-1 text-center text-[8px] text-slate-300">
              {i % 3 === 0 ? fmtHour(h).replace(' ', '') : ''}
            </div>
          ))}
        </div>
        {/* Coverage numbers */}
        <div className="flex gap-px mt-2">
          {coverageByHour.map((n, i) => (
            <div key={i} className={cn('flex-1 text-center text-[9px]', covColor(n))}>
              {n}
            </div>
          ))}
        </div>
      </div>

      {/* Staff timeline grid */}
      {sortedWorking.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">
          No staff with schedules working on {selectedDay}.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Shift timeline · {working.length} staff
            </span>
            <div className="flex gap-3 text-[9px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />Supervisor</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Picker</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />Other</span>
            </div>
          </div>

          {/* Hour ruler */}
          <div className="flex px-4 pt-2 pb-0">
            <div className="w-24 flex-shrink-0" />
            <div className="flex-1 flex text-[8px] text-slate-300 font-mono">
              {SHIFT_HOURS.filter((_, i) => i % 3 === 0).map(h => (
                <span key={h} className="flex-1">{fmtHour(h).replace(' ', '')}</span>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-50 px-4 pb-4">
            {sortedWorking.map(staff => {
              const start = Number(staff.shiftStart ?? 0);
              const hours = Number(staff.shiftHours ?? 0);
              const end   = start + hours;
              const span  = SHIFT_HOURS[SHIFT_HOURS.length - 1] + 1 - SHIFT_HOURS[0]; // 18h window
              const leftPct  = Math.max(0, ((start  - SHIFT_HOURS[0]) / span) * 100);
              const widthPct = Math.min(100 - leftPct, (hours / span) * 100);
              const nowPct   = ((nowHour - SHIFT_HOURS[0]) / span) * 100;
              const barColor = staff.role === 'supervisor' ? 'bg-blue-500'
                : staff.role === 'driver' ? 'bg-amber-400'
                : 'bg-emerald-400';

              return (
                <div key={staff.empId} className="flex items-center gap-2 py-1.5">
                  {/* Name */}
                  <div className="w-24 flex-shrink-0 text-right pr-2">
                    <p className="text-[11px] font-bold text-slate-700 truncate leading-tight">
                      {staff.name.split(' ')[0]}
                    </p>
                    <p className="text-[9px] text-slate-400 capitalize">{staff.role[0].toUpperCase()}</p>
                  </div>

                  {/* Track */}
                  <div className="flex-1 h-5 bg-slate-100 rounded relative overflow-hidden">
                    {/* Now line */}
                    {selectedDay === TODAY && nowHour >= SHIFT_HOURS[0] && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-blue-500 z-10"
                        style={{ left: `${Math.min(100, Math.max(0, nowPct)).toFixed(1)}%` }}
                      />
                    )}
                    <div
                      className={cn('absolute top-0.5 bottom-0.5 rounded-sm', barColor)}
                      style={{ left: `${leftPct.toFixed(1)}%`, width: `${widthPct.toFixed(1)}%` }}
                      title={`${fmtHour(start)} – ${fmtHour(end % 24 || 24)} (${hours}h)`}
                    />
                  </div>

                  {/* Time label */}
                  <span className="text-[9px] text-slate-400 font-mono w-16 flex-shrink-0 text-right">
                    {fmtHour(start)}–{fmtHour(end > 24 ? end - 24 : end)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Week-off staff */}
          {offDay.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-50 flex flex-wrap gap-1.5">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider w-full mb-1">
                On week-off today
              </span>
              {offDay.map(s => (
                <span key={s.empId} className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold">
                  {s.name.split(' ')[0]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── SECTION: Weekly Tab ──────────────────────────────────────────────────────

const WeeklyTab: React.FC<{
  stores: string[];
  storeCoverage: Record<string, StoreCoverage>;
}> = ({ stores, storeCoverage }) => {
  const [selectedStore, setSelectedStore] = useState(stores[0] || '');
  const sc = storeCoverage[selectedStore];
  const staff = sc?.staff || [];

  // Coverage counts per day, for footer
  const dayTotals = DAYS_OF_WEEK.map(d =>
    staff.filter(s => isWorkingOnDay(s, d)).length
  );
  const minDay = Math.min(...dayTotals);

  // Sort: supervisors first
  const sorted = [...staff].sort((a, b) => {
    const order = (r: string) => r === 'supervisor' ? 0 : r === 'manager' ? 1 : 2;
    return order(a.role) - order(b.role) || a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <select
        value={selectedStore}
        onChange={e => setSelectedStore(e.target.value)}
        className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        {stores.map(s => <option key={s} value={s}>Store {s}</option>)}
      </select>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">
          No active staff in this store.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 min-w-[130px]">
                  Name
                </th>
                {DAYS_OF_WEEK.map(d => (
                  <th
                    key={d}
                    className={cn(
                      'text-center px-2 py-2.5 text-[10px] font-black uppercase tracking-widest',
                      d === TODAY ? 'text-blue-600 bg-blue-50/60' : 'text-slate-400'
                    )}
                  >
                    {d.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(s => (
                <tr key={s.empId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2">
                    <div className="font-bold text-slate-700 text-[11px] leading-tight">
                      {s.name.split(' ').slice(0, 2).join(' ')}
                    </div>
                    <div className="mt-0.5">{roleBadge(s.role)}</div>
                  </td>
                  {DAYS_OF_WEEK.map(d => {
                    const isOff     = s.weekOffDay === d;
                    const hasShift  = s.hasSchedule;
                    const isToday   = d === TODAY;
                    const working   = isWorkingOnDay(s, d);
                    return (
                      <td
                        key={d}
                        className={cn(
                          'text-center px-2 py-2',
                          isToday && 'bg-blue-50/40'
                        )}
                      >
                        {isOff ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-amber-100 border border-amber-300" title={`Week-off: ${d}`} />
                        ) : working && hasShift ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-emerald-400" title={`Working: ${fmtHour(Number(s.shiftStart))}–${fmtHour(Number(s.shiftStart) + Number(s.shiftHours))}`} />
                        ) : working && !hasShift ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-slate-200 border border-dashed border-slate-300" title="No shift time set" />
                        ) : (
                          <span className="inline-block w-3 h-0.5 rounded bg-slate-200" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-100 bg-slate-50/50">
                <td className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Total working
                </td>
                {dayTotals.map((n, i) => {
                  const d = DAYS_OF_WEEK[i];
                  return (
                    <td
                      key={d}
                      className={cn(
                        'text-center px-2 py-2 text-[12px] font-black',
                        n === minDay && n < 2 ? 'text-red-500'
                        : n === minDay ? 'text-amber-600'
                        : d === TODAY ? 'text-blue-600'
                        : 'text-emerald-600'
                      )}
                    >
                      {n}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 px-4 py-2 border-t border-slate-50 text-[9px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" /> Working (scheduled)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-100 border border-amber-300 inline-block" /> Week-off</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-200 border border-dashed border-slate-300 inline-block" /> Working (no time set)</span>
            <span className="flex items-center gap-1.5 font-black text-blue-500">* Today highlighted in blue</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SECTION: Gaps Tab ────────────────────────────────────────────────────────

const GapsTab: React.FC<{
  alerts: GapAlert[];
  allStaff: RosterUser[];
}> = ({ alerts, allStaff }) => {
  const [filterLevel, setFilterLevel] = useState<GapAlert['level'] | 'all'>('all');
  
  const critical = alerts.filter(a => a.level === 'critical');
  const warnings = alerts.filter(a => a.level === 'warning');
  const info     = alerts.filter(a => a.level === 'info');
  const noSched  = allStaff.filter(s => !s.hasSchedule);

  const filteredAlerts = useMemo(() => {
    if (filterLevel === 'all') return alerts;
    return alerts.filter(a => a.level === filterLevel);
  }, [alerts, filterLevel]);

  const alertIcon = (level: GapAlert['level']) =>
    level === 'critical' ? <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
    : level === 'warning' ? <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
    : <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />;

  const alertBorder = (level: GapAlert['level']) =>
    level === 'critical' ? 'border-l-red-400' : level === 'warning' ? 'border-l-amber-400' : 'border-l-blue-300';

  return (
    <div className="space-y-5">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { id: 'critical' as const, label: 'Critical', val: critical.length, color: 'text-red-600',   border: 'border-red-100', active: filterLevel === 'critical' },
          { id: 'warning' as const, label: 'Warnings', val: warnings.length, color: 'text-amber-600', border: 'border-amber-100', active: filterLevel === 'warning' },
          { id: 'info' as const, label: 'Info',     val: info.length,     color: 'text-blue-600',  border: 'border-blue-100', active: filterLevel === 'info' },
          { id: 'no-schedule' as const, label: 'No schedule', val: noSched.length, color: 'text-slate-500', border: 'border-slate-100', active: false },
        ].map(({ id, label, val, color, border, active }) => (
          <motion.button 
            key={label} 
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              if (id === 'no-schedule') {
                document.getElementById('no-schedule-section')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                setFilterLevel(prev => prev === id ? 'all' : id);
              }
            }}
            className={cn(
              'bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden', 
              border,
              active && 'ring-2 ring-slate-900 ring-offset-2'
            )}
          >
            {active && (
              <div className="absolute top-0 right-0 p-1">
                <CheckCircle size={10} className="text-slate-900" />
              </div>
            )}
            <div className={cn('text-2xl font-black', color)}>{val}</div>
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
          </motion.button>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {filterLevel !== 'all' && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Showing {filterLevel} alerts only
            </span>
            <button onClick={() => setFilterLevel('all')} className="text-[10px] text-blue-500 font-bold hover:underline">
              Clear filter
            </button>
          </div>
        )}
        {filteredAlerts.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">
            <CheckCircle className="mx-auto mb-2 text-emerald-400" size={24} />
            No {filterLevel !== 'all' ? filterLevel : ''} alerts — all stores look good!
          </div>
        )}
        {filteredAlerts.map((a, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              'bg-white border-l-4 rounded-r-xl border border-slate-100 px-4 py-3 shadow-sm',
              alertBorder(a.level)
            )}
          >
            <div className="flex items-start gap-2">
              {alertIcon(a.level)}
              <div className="min-w-0">
                <p className="text-[12px] font-black text-slate-700">{a.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{a.detail}</p>
              </div>
              {a.storeId !== 'ALL' && (
                <span className="ml-auto px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-wider flex-shrink-0">
                  {a.storeId}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Staff without schedule */}
      {noSched.length > 0 && (
        <div id="no-schedule-section" className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden scroll-mt-20">
          <div className="px-4 py-3 border-b border-slate-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Staff missing shift data ({noSched.length})
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {noSched.map(s => (
              <div key={s.empId} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-[12px] font-bold text-slate-700">{s.name}</span>
                  <span className="ml-2">{roleBadge(s.role)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">Store {s.storeId}</span>
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-black uppercase tracking-wider">
                    No shift set
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const RosterDashboard: React.FC<RosterDashboardProps> = ({ user, navigateTo }) => {
  const { data, loading, error, lastUpdated } = useRosterDashboard(user);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [drillStore, setDrillStore] = useState<string | undefined>();

  const handleDrillStore = (sid: string) => {
    setDrillStore(sid);
    setActiveTab('hourly');
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'All Stores', icon: LayoutGrid },
    { id: 'hourly',   label: 'Hourly',     icon: Clock       },
    { id: 'weekly',   label: 'Weekly',     icon: Calendar    },
    { id: 'gaps',     label: 'Gaps',       icon: Activity    },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <motion.div
        key="roster-loading"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="min-h-screen bg-slate-50 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <RefreshCw size={28} className="animate-spin text-blue-500" />
          <p className="text-sm font-bold">Loading roster from Firebase…</p>
        </div>
      </motion.div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <motion.div
        key="roster-error"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
      >
        <div className="text-center max-w-xs">
          <AlertCircle className="mx-auto mb-3 text-red-400" size={40} />
          <p className="text-slate-500 text-sm">{error || 'No roster data available.'}</p>
        </div>
      </motion.div>
    );
  }

  const { allStaff, stores, storeCoverage, alerts, today } = data;

  return (
    <motion.div
      key="roster-dash"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="min-h-screen bg-slate-50 pb-12"
    >
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2">
              <Users size={20} className="text-blue-600" />
              Roster &amp; Availability
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Today: <span className="font-bold text-blue-500">{TODAY}</span>
              {lastUpdated && (
                <> &nbsp;·&nbsp; Live as of {lastUpdated.toLocaleTimeString()}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Live · Firebase
            </span>
          </div>
        </div>

        {/* ── Summary Metrics ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { icon: Store,        label: 'Stores',       value: stores.length,         border: 'border-slate-100',   valColor: 'text-slate-700' },
            { icon: Users,        label: 'Active staff',  value: allStaff.length,       border: 'border-blue-100',    valColor: 'text-blue-700'  },
            { icon: CheckCircle,  label: 'Working today', value: today.totalWorking,    border: 'border-emerald-100', valColor: 'text-emerald-600' },
            { icon: Clock,        label: 'No Schedule',   padding: 'p-4', value: today.totalNoSchedule, border: today.totalNoSchedule > 0 ? 'border-amber-200 bg-amber-50/10' : 'border-slate-100', valColor: 'text-amber-600', onClick: () => { setActiveTab('gaps'); setTimeout(() => document.getElementById('no-schedule-section')?.scrollIntoView({ behavior: 'smooth' }), 100); } },
            { icon: Moon,         label: 'On week-off',   value: today.totalOff,        border: 'border-slate-100',   valColor: 'text-slate-400' },
            { icon: AlertTriangle,label: 'Alerts',        value: alerts.filter(a => a.level !== 'info').length, border: alerts.filter(a => a.level === 'critical').length > 0 ? 'border-red-200' : 'border-amber-100', valColor: alerts.filter(a => a.level === 'critical').length > 0 ? 'text-red-600' : 'text-amber-600', onClick: () => setActiveTab('gaps') },
          ].map(p => <StatCard key={p.label} {...p} />)}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1 shadow-sm overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap',
                activeTab === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-700'
              )}
            >
              <Icon size={12} />
              {label}
              {id === 'gaps' && alerts.filter(a => a.level === 'critical').length > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-black">
                  {alerts.filter(a => a.level === 'critical').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'overview' && (
              <OverviewTab
                stores={stores}
                storeCoverage={storeCoverage}
                onDrillStore={handleDrillStore}
              />
            )}
            {activeTab === 'hourly' && (
              <HourlyTab
                stores={stores}
                storeCoverage={storeCoverage}
                initialStore={drillStore}
              />
            )}
            {activeTab === 'weekly' && (
              <WeeklyTab
                stores={stores}
                storeCoverage={storeCoverage}
              />
            )}
            {activeTab === 'gaps' && (
              <GapsTab
                alerts={alerts}
                allStaff={allStaff}
              />
            )}
          </motion.div>
        </AnimatePresence>

      </div>
    </motion.div>
  );
};
