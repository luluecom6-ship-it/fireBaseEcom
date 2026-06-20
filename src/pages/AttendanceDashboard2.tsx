import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Clock, CheckCircle, AlertCircle, XCircle, X,
  Download, Filter, ChevronLeft, ChevronRight,
  Calendar, BarChart2, List, Store, TrendingUp,
  ArrowUpRight, ArrowDownRight, Minus, Eye,
  RefreshCw, Search, Timer, Activity, AppWindow
} from 'lucide-react';
import { User, AdminData, AttendanceRecord } from '../types';
import { parseServerDate } from '../utils/api';
import { cn } from '../lib/utils';
import { SmartImage } from '../components/layout/common/SmartImage';
import { fixImageUrl } from '../utils/formatters';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROSTER_ROLES = new Set(['picker', 'supervisor', 'driver', 'store', 'manager']);

// ─── Types ────────────────────────────────────────────────────────────────────
// ... (rest of types)

interface AttendanceDashboardProps {
  user: User;
  adminData: AdminData;
  navigateTo: (page: any) => void;
  onViewImage: (url: string | null) => void;
  onRefetch: (manual?: boolean) => Promise<void>;
  isLoading?: boolean;
}

type TabId = 'overview' | 'staff' | 'monthly' | 'stores';

interface DayRecord {
  date: string;               // yyyy-MM-dd
  inTime: string | null;
  outTime: string | null;
  durationHrs: number | null;
  status: 'present' | 'partial' | 'absent' | 'weekend' | 'off';
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type DayName = typeof DAYS_OF_WEEK[number];

function normalizeDay(day: string): string {
  const d = day.trim().toLowerCase();
  if (d.startsWith('sun')) return 'sunday';
  if (d.startsWith('mon')) return 'monday';
  if (d.startsWith('tue')) return 'tuesday';
  if (d.startsWith('wed')) return 'wednesday';
  if (d.startsWith('thu')) return 'thursday';
  if (d.startsWith('fri')) return 'friday';
  if (d.startsWith('sat')) return 'saturday';
  return d;
}

interface StaffSummary {
  empId: string;
  name: string;
  storeId: string;
  role: string;
  presentDays: number;
  absentDays: number;
  partialDays: number;
  totalHrs: number;
  avgHrs: number;
  todayStatus: 'in' | 'out' | 'absent' | 'off';
  inTime: string | null;
  outTime: string | null;
  records: DayRecord[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12(ts: any): string {
  if (!ts) return '—';
  try {
    return parseServerDate(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function fmtDur(hrs: number | null): string {
  if (hrs === null || hrs <= 0) return '—';
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toYMD(ts: any): string {
  try {
    return parseServerDate(ts).toLocaleDateString('en-CA');
  } catch { return ''; }
}

function monthDays(year: number, month: number): string[] {
  const days: string[] = [];
  const count = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= count; d++) {
    days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 0 || d.getDay() === 5; // Fri & Sun for KSA; adjust as needed
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  bg: string;
  border: string;
  trend?: number;
  onClick?: () => void;
}> = ({ icon: Icon, label, value, sub, color, bg, border, trend, onClick }) => (
  <motion.button
    whileTap={onClick ? { scale: 0.97 } : undefined}
    onClick={onClick}
    className={cn(
      'bg-white rounded-2xl border p-4 text-left w-full shadow-sm transition-shadow',
      border,
      onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'
    )}
  >
    <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center mb-3', bg)}>
      <Icon size={18} className={color} />
    </div>
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className={cn('text-2xl font-black mt-0.5', color)}>{value}</p>
    {(sub || trend !== undefined) && (
      <div className="flex items-center gap-1.5 mt-1">
        {trend !== undefined && (
          trend > 0
            ? <ArrowUpRight size={11} className="text-emerald-500" />
            : trend < 0
              ? <ArrowDownRight size={11} className="text-red-400" />
              : <Minus size={11} className="text-slate-300" />
        )}
        {sub && <p className="text-[10px] text-slate-400 font-bold">{sub}</p>}
      </div>
    )}
  </motion.button>
);

// ─── Status Dot ───────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ status: DayRecord['status']; title?: string }> = ({ status, title }) => {
  const cls = {
    present: 'bg-emerald-500',
    partial: 'bg-amber-400',
    absent:  'bg-red-300',
    weekend: 'bg-slate-200',
    off:     'bg-blue-300',
  }[status];
  return (
    <div
      className={cn('w-full h-5 rounded-sm', cls)}
      title={title}
    />
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

export const AttendanceIntelligence: React.FC<AttendanceDashboardProps> = ({
  user, adminData, navigateTo, onViewImage, onRefetch, isLoading
}) => {
  const today = new Date();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selMonth, setSelMonth] = useState(today.getMonth());
  const [selYear, setSelYear] = useState(today.getFullYear());
  
  const userRole = String(user.role || '').toLowerCase().trim();
  const userStore = String(user.storeId || '').trim();
  const isRestricted = userRole === 'store' || userRole === 'manager';

  const [selStore, setSelStore] = useState(isRestricted ? userStore : 'All');
  const [searchQ, setSearchQ] = useState('');
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffSummary | null>(null);
  const [firestoreUsers, setFirestoreUsers] = useState<User[]>([]);

  const todayStr = today.toLocaleDateString('en-CA');

  // Fetch users from Firestore once on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const list: User[] = [];
        snapshot.forEach(doc => {
          const d = doc.data();
          list.push({
            ...d,
            empId: String(d.empId || doc.id).trim(),
            name: String(d.name || '').trim(),
            storeId: String(d.storeId || '').trim(),
            role: String(d.role || 'user').toLowerCase().trim() as User['role'],
            status: String(d.status || 'active').toLowerCase().trim(),
            weekOffDay: String(d.weekOffDay || '').trim(),
          } as User);
        });
        setFirestoreUsers(list);
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
    };
    fetchUsers();
  }, []);

  // Stores derived from users + regions + attendance
  const stores = useMemo(() => {
    const s = new Set<string>();
    // Primary source: Firestore users
    firestoreUsers.forEach(u => { if (u.storeId) s.add(u.storeId); });
    // Secondary backups
    adminData.users.forEach(u => { if (u.storeId) s.add(String(u.storeId).trim()); });
    if (adminData.regions) {
      adminData.regions.forEach(r => { if (r.storeId) s.add(String(r.storeId).trim()); });
    }
    adminData.attendance.forEach(a => { if (a.storeId) s.add(String(a.storeId).trim()); });
    
    // Remove empty/garbage
    const list = Array.from(s).filter(sid => sid && sid !== '—' && sid !== 'null' && sid !== 'undefined');
    
    if (isRestricted) {
      return [userStore];
    }
    
    return ['All', ...list.sort()];
  }, [firestoreUsers, adminData.users, adminData.regions, adminData.attendance, isRestricted, userStore]);

  // Month navigation
  const prevMonth = () => {
    if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1); }
    else setSelMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1); }
    else setSelMonth(m => m + 1);
  };
  const monthLabel = new Date(selYear, selMonth, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const days = useMemo(() => monthDays(selYear, selMonth), [selYear, selMonth]);

  // Filter attendance by month
  const monthAtt = useMemo(() =>
    adminData.attendance.filter(r => {
      const d = toYMD(r.timestamp);
      return d.startsWith(`${selYear}-${String(selMonth + 1).padStart(2, '0')}`);
    }), [adminData.attendance, selYear, selMonth]);

  // Today's attendance
  const todayAtt = useMemo(() =>
    adminData.attendance.filter(r => toYMD(r.timestamp) === todayStr),
    [adminData.attendance, todayStr]);

  // Active operational users (Sync filtering logic with Roster Dashboard)
  const opUsers = useMemo(() => {
    // Prefer Firestore users if available for the staff list
    const sourceUsers = firestoreUsers.length > 0 ? firestoreUsers : adminData.users;
    
    return sourceUsers.filter(u => {
      const uStore = String(u.storeId || '').trim();
      const uRole = String(u.role || '').toLowerCase().trim();
      const uStatus = String(u.status || 'active').toLowerCase().trim();
      
      return (
        uStatus === 'active' &&
        ROSTER_ROLES.has(uRole) &&
        (selStore === 'All' || uStore === selStore)
      );
    });
  }, [firestoreUsers, adminData.users, selStore]);

  // Build per-staff summaries for selected month
  const staffSummaries = useMemo((): StaffSummary[] => {
    const todayDayName = DAYS_OF_WEEK[today.getDay()];

    return opUsers.map(u => {
      const uId = String(u.empId).trim();
      const attRecords = monthAtt.filter(r => String(r.empId).trim() === uId);
      const uWeekOff = String((u as any).weekOffDay || '').trim();

      // Group by day
      const byDay: Record<string, { ins: AttendanceRecord[], outs: AttendanceRecord[] }> = {};
      attRecords.forEach(r => {
        const d = toYMD(r.timestamp);
        if (!byDay[d]) byDay[d] = { ins: [], outs: [] };
        if (r.type === 'In') byDay[d].ins.push(r);
        else byDay[d].outs.push(r);
      });

      const records: DayRecord[] = days.map(d => {
        const dName = DAYS_OF_WEEK[new Date(d + 'T00:00:00').getDay()];
        const isOff = normalizeDay(dName) === normalizeDay(uWeekOff);

        if (isWeekend(d)) return { date: d, inTime: null, outTime: null, durationHrs: null, status: 'weekend' };
        const dayData = byDay[d];
        if (!dayData || dayData.ins.length === 0) {
          const isPast = d < todayStr;
          return { date: d, inTime: null, outTime: null, durationHrs: null, status: isPast ? (isOff ? 'off' : 'absent') : 'weekend' };
        }
        // Earliest in, latest out
        const ins = [...dayData.ins].sort((a, b) => parseServerDate(a.timestamp).getTime() - parseServerDate(b.timestamp).getTime());
        const outs = [...dayData.outs].sort((a, b) => parseServerDate(b.timestamp).getTime() - parseServerDate(a.timestamp).getTime());
        const inRec = ins[0];
        const outRec = outs[0] || null;
        const durHrs = outRec
          ? (parseServerDate(outRec.timestamp).getTime() - parseServerDate(inRec.timestamp).getTime()) / 3600000
          : null;
        const status: DayRecord['status'] = outRec ? 'present' : 'partial';
        return { date: d, inTime: inRec.timestamp, outTime: outRec?.timestamp || null, durationHrs: durHrs, status };
      });

      const presentDays = records.filter(r => r.status === 'present').length;
      const partialDays = records.filter(r => r.status === 'partial').length;
      const absentDays = records.filter(r => r.status === 'absent').length;
      const totalHrs = records.reduce((s, r) => s + (r.durationHrs || 0), 0);
      const workDays = presentDays + partialDays;
      const avgHrs = workDays > 0 ? totalHrs / workDays : 0;

      // Today status
      const todayRecs = todayAtt.filter(r => String(r.empId).trim() === uId);
      const todayIn = todayRecs.find(r => r.type === 'In');
      const todayOut = todayRecs.find(r => r.type === 'Out');
      let todayStatus: StaffSummary['todayStatus'] = todayIn ? (todayOut ? 'out' : 'in') : 'absent';
      
      // If absent but it's their week-off, mark as 'off'
      if (todayStatus === 'absent' && normalizeDay(uWeekOff) === normalizeDay(todayDayName)) {
        todayStatus = 'off';
      }

      return {
        empId: uId,
        name: u.name || u.empId,
        storeId: u.storeId || '—',
        role: u.role,
        presentDays,
        absentDays,
        partialDays,
        totalHrs,
        avgHrs,
        todayStatus,
        inTime: todayIn?.timestamp || null,
        outTime: todayOut?.timestamp || null,
        records,
      };
    });
  }, [opUsers, monthAtt, days, todayAtt, todayStr, today]);

  // Filtered summaries by search
  const filteredSummaries = useMemo(() =>
    staffSummaries.filter(s =>
      !searchQ ||
      s.name.toLowerCase().includes(searchQ.toLowerCase()) ||
      s.empId.includes(searchQ) ||
      s.storeId.toLowerCase().includes(searchQ.toLowerCase())
    ), [staffSummaries, searchQ]);

  // KPIs
  const kpis = useMemo(() => {
    // Filter out store 3800 FOR ALL global KPI calculations and matrices
    const kpiStaff = staffSummaries.filter(s => {
      const sid = String(s.storeId).trim();
      return sid !== '3800' && sid !== '3800 - SUPPORTING';
    });
    
    const total = kpiStaff.length;
    const activeNow = kpiStaff.filter(s => s.todayStatus === 'in').length;
    const outToday = kpiStaff.filter(s => s.todayStatus === 'out').length;
    const offToday = kpiStaff.filter(s => s.todayStatus === 'off').length;
    const absentToday = kpiStaff.filter(s => s.todayStatus === 'absent').length;
    const workDays = days.filter(d => !isWeekend(d) && d <= todayStr).length;
    
    const totalPresentDays = kpiStaff.reduce((sum, r) => sum + r.presentDays, 0);
    const avgAttendance = (total > 0 && workDays > 0)
      ? Math.round((totalPresentDays / (total * workDays)) * 100)
      : 0;
      
    return { total, activeNow, outToday, offToday, absentToday, avgAttendance };
  }, [staffSummaries, days, todayStr]);

  // Store breakdown
  const storeBreakdown = useMemo(() => {
    const map: Record<string, { storeId: string; total: number; in: number; out: number; absent: number; off: number }> = {};
    staffSummaries.forEach(s => {
      const sid = s.storeId;
      if (!map[sid]) map[sid] = { storeId: sid, total: 0, in: 0, out: 0, absent: 0, off: 0 };
      map[sid].total++;
      if (s.todayStatus === 'in') map[sid].in++;
      else if (s.todayStatus === 'out') map[sid].out++;
      else if (s.todayStatus === 'off') map[sid].off++;
      else map[sid].absent++;
    });
    return Object.values(map).sort((a, b) => a.storeId.localeCompare(b.storeId));
  }, [staffSummaries]);

  // Export CSV
  const exportCSV = useCallback(() => {
    const rows: string[] = [
      'EmpID,Name,Store,Role,Date,Punch In,Punch Out,Duration (hrs),Status'
    ];
    filteredSummaries.forEach(s => {
      s.records.forEach(r => {
        if (r.status === 'weekend') return;
        rows.push([
          s.empId, `"${s.name}"`, s.storeId, s.role,
          r.date,
          r.inTime ? fmt12(r.inTime) : '',
          r.outTime ? fmt12(r.outTime) : '',
          r.durationHrs !== null ? r.durationHrs.toFixed(2) : '',
          r.status
        ].join(','));
      });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${monthLabel.replace(' ', '_')}_${selStore}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredSummaries, monthLabel, selStore]);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview',    icon: BarChart2   },
    { id: 'staff',    label: 'Staff',       icon: List        },
    { id: 'monthly',  label: 'Monthly Grid',icon: Calendar    },
    { id: 'stores',   label: 'Stores',      icon: Store       },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <motion.div
      key="att-dashboard"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="min-h-screen bg-slate-50 pb-16"
    >
      {/* ── Hero Header ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white px-4 pt-5 pb-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #60a5fa 0%, transparent 60%), radial-gradient(circle at 80% 20%, #818cf8 0%, transparent 50%)' }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-blue-300 text-[10px] font-black uppercase tracking-widest mb-1">
                <Activity size={11} />
                Attendance Intelligence
              </div>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                <Users size={22} /> Workforce Visibility
              </h1>
              <p className="text-blue-200 text-xs mt-0.5 font-bold">
                {monthLabel} · Store: <span className="text-white">{selStore}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Month nav */}
              <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5 backdrop-blur-sm border border-white/20">
                <button onClick={prevMonth} className="p-0.5 hover:bg-white/20 rounded-lg transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] font-black px-2 min-w-[110px] text-center">{monthLabel}</span>
                <button
                  onClick={nextMonth}
                  disabled={selYear === today.getFullYear() && selMonth === today.getMonth()}
                  className="p-0.5 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Store filter */}
              {!isRestricted && (
                <select
                  value={selStore}
                  onChange={e => setSelStore(e.target.value)}
                  className="bg-white/10 border border-white/20 backdrop-blur-sm rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  {stores.map(s => <option key={s} value={s} className="text-slate-900">{s === 'All' ? 'All Stores' : `Store ${s}`}</option>)}
                </select>
              )}

              <button
                onClick={() => onRefetch(true)}
                disabled={isLoading}
                className="h-9 w-9 bg-white/10 border border-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <RefreshCw size={14} className={cn(isLoading && 'animate-spin')} />
              </button>

              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-lg transition-colors"
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4 space-y-4">

        {/* Staff Detail Modal (Punch-In/Out Images) */}
        <AnimatePresence>
          {selectedStaff && (
            <motion.div
              key="staff-detail-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 sm:p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm sm:max-w-md rounded-[2.5rem] bg-white p-5 sm:p-8 shadow-2xl relative flex flex-col max-h-[92vh] overflow-y-auto"
              >
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800">{selectedStaff.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] sm:text-xs">Staff Attendance Detail</p>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[8px] font-black uppercase tracking-widest border border-indigo-100">
                        Today · {todayStr}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedStaff(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors group">
                    <X size={20} className="text-slate-400 group-hover:text-slate-900" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  {['In', 'Out'].map(type => {
                    const record = adminData.attendance.find(a => 
                      String(a.empId).trim() === selectedStaff.empId && 
                      a.type === type && 
                      toYMD(a.timestamp) === todayStr
                    );

                    return (
                      <div key={type} className="space-y-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{type} Verification</p>
                        {record ? (
                          <motion.div
                            whileHover={{ scale: 1.02 }}
                            onClick={() => onViewImage(fixImageUrl(record.imageUrl))}
                            className="relative aspect-square overflow-hidden rounded-3xl border-4 border-slate-50 shadow-lg cursor-zoom-in group"
                          >
                            <SmartImage src={fixImageUrl(record.imageUrl)} className="w-full h-full transition-transform duration-500 group-hover:scale-110" alt={type} />
                            <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-[10px] text-white font-black text-center backdrop-blur-md">
                              {fmt12(record.timestamp)}
                            </div>
                          </motion.div>
                        ) : (
                          <div className="aspect-square flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 text-slate-300">
                            <AlertCircle size={24} className="mb-2 opacity-50" />
                            <span className="text-[8px] font-black uppercase tracking-widest">No Log</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Monthly Grid Integration */}
                <div className="mt-2 border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Attendance History</h4>
                    <span className="text-[10px] font-bold text-slate-400">{monthLabel}</span>
                  </div>
                  <div className="h-12 flex gap-0.5">
                    {selectedStaff.records.map((r, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "flex-1 rounded-sm transition-all",
                          r.status === 'present' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" :
                          r.status === 'partial' ? "bg-amber-400" :
                          r.status === 'absent' ? "bg-red-500" :
                          r.status === 'off' ? "bg-blue-400" :
                          "bg-slate-100"
                        )}
                        title={`${r.date}: ${r.status}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3 mt-6">
                  <div className="p-4 bg-blue-50/50 rounded-2xl flex items-center justify-between border border-blue-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                        <Clock size={16} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-blue-900">Today's Duration</span>
                    </div>
                    <span className="font-black text-blue-700 text-sm sm:text-base">
                      {fmtDur((selectedStaff.records.find(r => r.date === todayStr)?.durationHrs) || 0)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Monthly Present</p>
                      <p className="font-black text-slate-800 text-lg mt-0.5">{selectedStaff.presentDays} Days</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Store ID</p>
                      <p className="font-black text-slate-800 text-lg mt-0.5">{selectedStaff.storeId}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedStaff(null)}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg mt-2"
                  >
                    Close Details
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── KPI Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <KpiCard icon={Users}        label="Total Staff"    value={kpis.total}          color="text-blue-700"    bg="bg-blue-50"    border="border-blue-100"   />
          <KpiCard icon={Activity}     label="Active Now"     value={kpis.activeNow}      color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-100" sub="Punched in"       />
          <KpiCard icon={Calendar}     label="Week Off"       value={kpis.offToday}       color="text-blue-700"    bg="bg-blue-50"    border="border-blue-100"   sub="Scheduled off"     />
          <KpiCard icon={XCircle}      label="Absent Today"   value={kpis.absentToday}    color="text-red-600"     bg="bg-red-50"     border="border-red-100"    sub="Gap in coverage"  />
          <KpiCard icon={TrendingUp}   label="Monthly Att."   value={`${kpis.avgAttendance}%`} color="text-indigo-700"  bg="bg-indigo-50"  border="border-indigo-100" sub={`Work days so far`} />
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1 shadow-sm overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap min-w-fit',
                activeTab === id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-700'
              )}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
          >

            {/* ── OVERVIEW ─────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Today's attendance bar */}
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today's Attendance · {todayStr}</span>
                    <span className="text-[10px] font-bold text-slate-400">{kpis.total} staff</span>
                  </div>
                  <div className="h-7 flex rounded-xl overflow-hidden gap-0.5">
                    {kpis.activeNow > 0 && (
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        className="bg-emerald-500 flex items-center justify-center text-white text-[9px] font-black"
                        style={{ flex: kpis.activeNow }}
                        title={`${kpis.activeNow} active`}
                      >
                        {kpis.activeNow > 2 ? `${kpis.activeNow} IN` : ''}
                      </motion.div>
                    )}
                    {kpis.offToday > 0 && (
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        className="bg-blue-400 flex items-center justify-center text-white text-[9px] font-black"
                        style={{ flex: kpis.offToday }}
                        title={`${kpis.offToday} week off`}
                      >
                        {kpis.offToday > 2 ? `${kpis.offToday} OFF` : ''}
                      </motion.div>
                    )}
                    {kpis.absentToday > 0 && (
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        className="bg-red-200 flex items-center justify-center text-red-600 text-[9px] font-black"
                        style={{ flex: kpis.absentToday }}
                        title={`${kpis.absentToday} absent`}
                      >
                        {kpis.absentToday > 2 ? `${kpis.absentToday} ABS` : ''}
                      </motion.div>
                    )}
                  </div>
                  <div className="flex gap-4 mt-2">
                    {[
                      { color: 'bg-emerald-500', label: 'Active' },
                      { color: 'bg-blue-400', label: 'Week Off' },
                      { color: 'bg-red-200', label: 'Absent' },
                    ].map(l => (
                      <span key={l.label} className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold">
                        <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', l.color)} />
                        {l.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Top absent staff today */}
                {kpis.absentToday > 0 && (
                  <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                        <XCircle size={12} /> Absent Today ({kpis.absentToday})
                      </span>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
                      {staffSummaries.filter(s => s.todayStatus === 'absent' && String(s.storeId).trim() !== '3800').map(s => (
                        <div 
                          key={s.empId} 
                          onClick={() => setSelectedStaff(s)}
                          className="flex items-center justify-between px-4 py-2.5 group cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <div>
                            <p className="text-[12px] font-bold text-slate-700">{s.name}</p>
                            <p className="text-[10px] text-slate-400">{s.empId} · Store {s.storeId}</p>
                          </div>
                          <span className="text-[9px] px-2 py-0.5 bg-red-50 text-red-500 rounded-full font-black uppercase tracking-wider">
                            No Punch
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active staff */}
                <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                      <Activity size={12} /> Currently Active ({kpis.activeNow})
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold">Live · updates on refresh</span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                    {staffSummaries.filter(s => s.todayStatus === 'in' && String(s.storeId).trim() !== '3800').map(s => {
                      const inDate = s.inTime ? parseServerDate(s.inTime) : null;
                      const elapsedMin = inDate ? Math.floor((Date.now() - inDate.getTime()) / 60000) : 0;
                      const elapsedH = Math.floor(elapsedMin / 60);
                      const elapsedM = elapsedMin % 60;
                      return (
                        <div 
                          key={s.empId} 
                          onClick={() => setSelectedStaff(s)}
                          className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                            <div>
                              <p className="text-[12px] font-bold text-slate-700">{s.name}</p>
                              <p className="text-[10px] text-slate-400">Store {s.storeId} · In at {fmt12(s.inTime)}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-emerald-600">
                            {elapsedH}h {elapsedM}m
                          </span>
                        </div>
                      );
                    })}
                    {kpis.activeNow === 0 && (
                      <div className="px-4 py-6 text-center text-slate-300 text-xs font-bold">No staff currently active</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── STAFF ────────────────────────────────────────────────── */}
            {activeTab === 'staff' && (
              <div className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    placeholder="Search name, ID, store…"
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                {/* Staff table */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          {['Staff', 'Store', 'Today Status', 'Punch In', 'Punch Out', 'Present', 'Absent', 'Avg Hrs', ''].map(h => (
                            <th key={h} className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-left whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredSummaries.map(s => (
                          <React.Fragment key={s.empId}>
                            <tr
                              className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                              onClick={() => setExpandedEmp(expandedEmp === s.empId ? null : s.empId)}
                            >
                              <td className="px-4 py-2.5">
                                <p className="font-black text-slate-700 text-[11px]">{s.name}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5">{s.empId}</p>
                              </td>
                              <td className="px-4 py-2.5 font-bold text-slate-500 text-[11px]">{s.storeId}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider',
                                    s.todayStatus === 'in'  ? 'bg-emerald-100 text-emerald-700' :
                                    s.todayStatus === 'out' ? 'bg-teal-100 text-teal-700' :
                                    s.todayStatus === 'off' ? 'bg-blue-100 text-blue-700' :
                                    'bg-red-100 text-red-500'
                                  )}>
                                    {s.todayStatus === 'in' ? 'Active' : s.todayStatus === 'out' ? 'Completed' : s.todayStatus === 'off' ? 'Week Off' : 'Absent'}
                                  </span>
                                  {(s.todayStatus === 'in' || s.todayStatus === 'out') && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedStaff(s);
                                      }}
                                      className="p-1 hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 rounded-md transition-colors"
                                      title="View Verification Images"
                                    >
                                      <Eye size={12} />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{fmt12(s.inTime)}</td>
                              <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{fmt12(s.outTime)}</td>
                              <td className="px-4 py-2.5">
                                <span className="font-black text-emerald-600 text-[12px]">{s.presentDays}</span>
                                <span className="text-[9px] text-slate-400"> days</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={cn('font-black text-[12px]', s.absentDays > 3 ? 'text-red-500' : 'text-slate-400')}>{s.absentDays}</span>
                                <span className="text-[9px] text-slate-400"> days</span>
                              </td>
                              <td className="px-4 py-2.5 font-bold text-slate-600 text-[11px]">{fmtDur(s.avgHrs)}</td>
                              <td className="px-4 py-2.5">
                                <div
                                  className="p-1 text-slate-300 transition-colors"
                                >
                                  <ChevronRight size={14} className={cn('transition-transform', expandedEmp === s.empId && 'rotate-90')} />
                                </div>
                              </td>
                            </tr>
                            {expandedEmp === s.empId && (
                              <tr>
                                <td colSpan={9} className="px-4 py-3 bg-slate-50/60 border-t border-slate-100">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Monthly Records — {monthLabel}</p>
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-[10px]">
                                      <thead>
                                        <tr className="text-slate-400">
                                          <th className="text-left pr-4 pb-1 font-black uppercase">Date</th>
                                          <th className="text-left pr-4 pb-1 font-black uppercase">Punch In</th>
                                          <th className="text-left pr-4 pb-1 font-black uppercase">Punch Out</th>
                                          <th className="text-left pr-4 pb-1 font-black uppercase">Duration</th>
                                          <th className="text-left pb-1 font-black uppercase">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {s.records.filter(r => r.status !== 'weekend').map(r => (
                                          <tr key={r.date}>
                                            <td className="py-1 pr-4 font-mono text-slate-500">{r.date}</td>
                                            <td className="py-1 pr-4 font-mono text-slate-600">{fmt12(r.inTime)}</td>
                                            <td className="py-1 pr-4 font-mono text-slate-600">{fmt12(r.outTime)}</td>
                                            <td className="py-1 pr-4 font-bold text-slate-600">{fmtDur(r.durationHrs)}</td>
                                            <td className="py-1">
                                              <span className={cn(
                                                'px-1.5 py-0.5 rounded text-[8px] font-black uppercase',
                                                r.status === 'present' ? 'bg-emerald-50 text-emerald-600' :
                                                r.status === 'partial' ? 'bg-amber-50 text-amber-600' :
                                                'bg-red-50 text-red-500'
                                              )}>
                                                {r.status}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {filteredSummaries.length === 0 && (
                          <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-300 font-bold">No staff found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── MONTHLY GRID ──────────────────────────────────────────── */}
            {activeTab === 'monthly' && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* Legend */}
                  <div className="px-4 py-3 border-b border-slate-50 flex flex-wrap gap-4 items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Attendance Grid</span>
                    <div className="flex gap-3 ml-auto">
                      {[
                        { color: 'bg-emerald-500', label: 'Present' },
                        { color: 'bg-amber-400', label: 'Partial' },
                        { color: 'bg-blue-300', label: 'Week Off' },
                        { color: 'bg-red-300', label: 'Absent' },
                        { color: 'bg-slate-200', label: 'Weekend' },
                      ].map(l => (
                        <span key={l.label} className="flex items-center gap-1 text-[9px] text-slate-400">
                          <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', l.color)} />
                          {l.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-max px-4 pb-4 pt-2">
                      {/* Day headers */}
                      <div className="flex items-center gap-1 mb-2">
                        <div className="w-36 flex-shrink-0" />
                        {days.map(d => {
                          const dayNum = parseInt(d.split('-')[2]);
                          const dow = new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short' });
                          const isToday = d === todayStr;
                          return (
                            <div key={d} className={cn(
                              'w-5 flex-shrink-0 text-center',
                              isToday && 'relative'
                            )}>
                              <p className={cn('text-[8px] font-black', isToday ? 'text-blue-600' : isWeekend(d) ? 'text-slate-300' : 'text-slate-400')}>
                                {dayNum}
                              </p>
                              <p className={cn('text-[7px] font-bold', isWeekend(d) ? 'text-slate-300' : 'text-slate-300')}>
                                {dow[0]}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Staff rows */}
                      <div className="space-y-1">
                        {filteredSummaries.slice(0, 60).map(s => (
                          <div key={s.empId} className="flex items-center gap-1">
                            {/* Name */}
                            <div className="w-36 flex-shrink-0 text-right pr-2">
                              <p className="text-[10px] font-bold text-slate-700 truncate leading-tight">{s.name.split(' ')[0]}</p>
                              <p className="text-[8px] text-slate-400">{s.storeId}</p>
                            </div>
                            {/* Day dots */}
                            {s.records.map(r => (
                              <div key={r.date} className="w-5 flex-shrink-0">
                                <StatusDot
                                  status={r.date > todayStr ? 'weekend' : r.status}
                                  title={`${s.name} · ${r.date}\nIn: ${fmt12(r.inTime)} Out: ${fmt12(r.outTime)}`}
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                        {filteredSummaries.length > 60 && (
                          <p className="text-[10px] text-slate-400 text-center pt-2">
                            Showing first 60 of {filteredSummaries.length} staff. Use store filter to narrow down.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary row per staff */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Summary · {monthLabel}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          {['Name', 'Store', 'Days Present', 'Days Absent', 'Partial', 'Total Hrs', 'Avg Hrs/Day'].map(h => (
                            <th key={h} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredSummaries.map(s => (
                          <tr key={s.empId} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-2">
                              <p className="font-bold text-slate-700 text-[11px]">{s.name}</p>
                              <p className="text-[9px] text-slate-400">{s.empId}</p>
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-500 text-[11px]">{s.storeId}</td>
                            <td className="px-4 py-2">
                              <span className="font-black text-emerald-600 text-[12px]">{s.presentDays}</span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={cn('font-black text-[12px]', s.absentDays > 5 ? 'text-red-500' : s.absentDays > 2 ? 'text-amber-500' : 'text-slate-400')}>{s.absentDays}</span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={cn('font-black text-[12px]', s.partialDays > 2 ? 'text-amber-500' : 'text-slate-400')}>{s.partialDays}</span>
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-600 text-[11px]">{fmtDur(s.totalHrs)}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full max-w-16 overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full', s.avgHrs >= 9 ? 'bg-emerald-500' : s.avgHrs >= 7 ? 'bg-amber-400' : 'bg-red-400')}
                                    style={{ width: `${Math.min((s.avgHrs / 10) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className="font-black text-[11px] text-slate-600">{fmtDur(s.avgHrs)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── STORES ───────────────────────────────────────────────── */}
            {activeTab === 'stores' && (
              <div className="space-y-3">
                {/* Store cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {storeBreakdown.map(s => {
                    const attendRate = s.total > 0 ? Math.round(((s.in + s.out) / s.total) * 100) : 0;
                    const storeStaff = staffSummaries.filter(ss => ss.storeId === s.storeId);
                    const storePresent = storeStaff.filter(ss => ss.presentDays > 0).length;
                    const workDaysCount = days.filter(d => !isWeekend(d) && d <= todayStr).length;
                    const storeAttRate = workDaysCount > 0 && s.total > 0
                      ? Math.round((storeStaff.reduce((acc, ss) => acc + ss.presentDays, 0) / (s.total * workDaysCount)) * 100)
                      : 0;

                    return (
                      <div key={s.storeId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Store</p>
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                              {s.storeId}
                              {String(s.storeId).trim() === '3800' && (
                                <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">SUPPORTING</span>
                              )}
                            </h3>
                          </div>
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-black uppercase',
                            attendRate >= 80 ? 'bg-emerald-100 text-emerald-700' :
                            attendRate >= 60 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-600'
                          )}>
                            {attendRate}% today
                          </span>
                        </div>

                        {/* Today's breakdown */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Active', val: s.in, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { label: 'Week Off', val: s.off, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Absent', val: s.absent, color: 'text-red-500', bg: 'bg-red-50' },
                          ].map(i => (
                            <div key={i.label} className={cn('rounded-xl p-2 text-center', i.bg)}>
                              <p className={cn('text-xl font-black', i.color)}>{i.val}</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase">{i.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Monthly rate bar */}
                        <div>
                          <div className="flex justify-between text-[9px] text-slate-400 font-bold mb-1">
                            <span>Monthly Attendance</span>
                            <span>{storeAttRate}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${storeAttRate}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className={cn('h-full rounded-full', storeAttRate >= 80 ? 'bg-emerald-500' : storeAttRate >= 60 ? 'bg-amber-400' : 'bg-red-400')}
                            />
                          </div>
                        </div>

                        {/* Staff list preview */}
                        <div className="pt-1 border-t border-slate-50">
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2">{s.total} staff</p>
                          <div className="flex flex-wrap gap-1.5">
                            {storeStaff.slice(0, 8).map(ss => (
                              <span
                                key={ss.empId}
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[9px] font-bold',
                                  ss.todayStatus === 'in' ? 'bg-emerald-100 text-emerald-700' :
                                  ss.todayStatus === 'out' ? 'bg-teal-100 text-teal-700' :
                                  ss.todayStatus === 'off' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-500'
                                )}
                                title={`${ss.name} · ${ss.todayStatus}`}
                              >
                                {ss.name.split(' ')[0]}
                              </span>
                            ))}
                            {storeStaff.length > 8 && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">
                                +{storeStaff.length - 8}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {storeBreakdown.length === 0 && (
                    <div className="col-span-2 bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 font-bold">
                      No store data available
                    </div>
                  )}
                </div>

                {/* All-store comparison table */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cross-Store Comparison · {monthLabel}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          {['Store', 'Total Staff', 'Active Now', 'Off Today', 'Absent Today', 'Monthly %', 'Avg Hours'].map(h => (
                            <th key={h} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {storeBreakdown.map(s => {
                          const storeStaff = staffSummaries.filter(ss => ss.storeId === s.storeId);
                          const wDays = days.filter(d => !isWeekend(d) && d <= todayStr).length;
                          const mRate = wDays > 0 && s.total > 0
                            ? Math.round((storeStaff.reduce((a, ss) => a + ss.presentDays, 0) / (s.total * wDays)) * 100)
                            : 0;
                          const avgHrs = storeStaff.length > 0
                            ? storeStaff.reduce((a, ss) => a + ss.avgHrs, 0) / storeStaff.length
                            : 0;
                          return (
                            <tr key={s.storeId} className="hover:bg-slate-50/60">
                              <td className="px-4 py-2.5 font-black text-slate-700">{s.storeId}</td>
                              <td className="px-4 py-2.5 font-bold text-slate-500">{s.total}</td>
                              <td className="px-4 py-2.5">
                                <span className="font-black text-emerald-600">{s.in}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={cn('font-black', s.off > 0 ? 'text-blue-600' : 'text-slate-300')}>{s.off}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={cn('font-black', s.absent > 0 ? 'text-red-500' : 'text-slate-300')}>{s.absent}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full', mRate >= 80 ? 'bg-emerald-500' : mRate >= 60 ? 'bg-amber-400' : 'bg-red-400')}
                                      style={{ width: `${mRate}%` }}
                                    />
                                  </div>
                                  <span className="font-black text-[11px]">{mRate}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 font-bold text-slate-600 text-[11px]">{fmtDur(avgHrs)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Legend footer */}
        <div className="flex flex-wrap gap-3 px-1 text-[9px] text-slate-400 font-bold">
          <span>Weekend = Fri & Sat (KSA)</span>
          <span>·</span>
          <span>Partial = Punch-In only (no Punch-Out)</span>
          <span>·</span>
          <span>Data source: Last 1000 records</span>
        </div>

      </div>
    </motion.div>
  );
};
