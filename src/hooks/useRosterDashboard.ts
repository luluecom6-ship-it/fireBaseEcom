import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;
export type DayName = typeof DAYS_OF_WEEK[number];

/** Operational hours shown in the hourly view (6 AM – 11 PM inclusive) */
export const SHIFT_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

// Roles that should appear in roster planning (exclude test / system accounts)
const ROSTER_ROLES = new Set(['picker', 'supervisor', 'driver', 'store', 'manager']);

// ─── Derived Types ────────────────────────────────────────────────────────────

export interface RosterUser extends User {
  /** true if shiftStart + shiftHours are both set */
  hasSchedule: boolean;
}

export interface StoreCoverage {
  storeId: string;
  staff: RosterUser[];
  /** count of staff working per hour (index = hour 6…23) */
  hourlyCount: number[];
  /** hours (6–23) with 0 coverage */
  uncoveredHours: number[];
  /** hours with only 1 person */
  thinHours: number[];
  hasSupervisor: boolean;
  supervisorsToday: RosterUser[];
  workingToday: RosterUser[];
  onWeekOffToday: RosterUser[];
}

export interface GapAlert {
  level: 'critical' | 'warning' | 'info';
  storeId: string;
  title: string;
  detail: string;
}

export interface RosterDashboardData {
  allStaff: RosterUser[];
  stores: string[];
  storeCoverage: Record<string, StoreCoverage>;
  alerts: GapAlert[];
  /** Summary counts for today */
  today: {
    totalWorking: number;
    totalOff: number;
    totalNoSchedule: number;
    criticalStores: number;
    warningStores: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayName(): DayName {
  return DAYS_OF_WEEK[new Date().getDay()];
}

export function fmtHour(h: number): string {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function isWorkingOnDay(s: RosterUser, day: DayName): boolean {
  if (s.status !== 'Active') return false;
  if (s.weekOffDay === day) return false;
  return true;
}

export function isWorkingAtHour(s: RosterUser, day: DayName, hour: number): boolean {
  if (!isWorkingOnDay(s, day)) return false;
  if (s.shiftStart == null || !s.shiftHours) return false;
  const start = Number(s.shiftStart);
  const end = start + Number(s.shiftHours);
  // Handle overnight shifts (e.g. 22:00 + 10h = 08:00 next day)
  if (end <= 24) return hour >= start && hour < end;
  return hour >= start || hour < (end - 24);
}

function buildStoreCoverage(
  staff: RosterUser[],
  storeId: string,
  day: DayName
): StoreCoverage {
  const storeStaff = staff.filter(s => String(s.storeId) === storeId);
  const working = storeStaff.filter(s => isWorkingOnDay(s, day));
  const offToday = storeStaff.filter(s => s.weekOffDay === day && s.status === 'Active');
  const supervisors = storeStaff.filter(s => s.role === 'supervisor');
  const supsWorking = supervisors.filter(s => isWorkingOnDay(s, day));

  const hourlyCount = SHIFT_HOURS.map(h =>
    working.filter(s => isWorkingAtHour(s, day, h)).length
  );
  const uncoveredHours = SHIFT_HOURS.filter((_, i) => hourlyCount[i] === 0);
  const thinHours = SHIFT_HOURS.filter((_, i) => hourlyCount[i] === 1);

  return {
    storeId,
    staff: storeStaff,
    hourlyCount,
    uncoveredHours,
    thinHours,
    hasSupervisor: supervisors.length > 0,
    supervisorsToday: supsWorking,
    workingToday: working,
    onWeekOffToday: offToday,
  };
}

function buildAlerts(
  stores: string[],
  coverage: Record<string, StoreCoverage>,
  staff: RosterUser[],
  day: DayName
): GapAlert[] {
  const alerts: GapAlert[] = [];

  stores.forEach(sid => {
    const sc = coverage[sid];
    if (!sc) return;

    // Zero staff today
    if (sc.workingToday.length === 0) {
      alerts.push({
        level: 'critical',
        storeId: sid,
        title: `Store ${sid} — zero staff today`,
        detail: `All ${sc.staff.length} active staff are on week-off or inactive on ${day}.`,
      });
    }

    // No supervisor role at all
    if (!sc.hasSupervisor) {
      alerts.push({
        level: 'critical',
        storeId: sid,
        title: `Store ${sid} — no supervisor assigned`,
        detail: 'This store has no supervisor in the system. Please assign one.',
      });
    } else if (sc.supervisorsToday.length === 0) {
      alerts.push({
        level: 'warning',
        storeId: sid,
        title: `Store ${sid} — no supervisor today`,
        detail: `All supervisors have ${day} as their week-off day.`,
      });
    }

    // Large coverage gap (>4 consecutive uncovered hours during ops window)
    if (sc.uncoveredHours.length > 4 && sc.workingToday.length > 0) {
      alerts.push({
        level: 'warning',
        storeId: sid,
        title: `Store ${sid} — ${sc.uncoveredHours.length} uncovered hours`,
        detail: `Coverage gaps between ${fmtHour(Math.min(...sc.uncoveredHours))} – ${fmtHour(Math.max(...sc.uncoveredHours) + 1)} on ${day}.`,
      });
    }

    // Single-person store (≤1 active staff total)
    if (sc.staff.filter(s => s.status === 'Active').length <= 1) {
      alerts.push({
        level: 'warning',
        storeId: sid,
        title: `Store ${sid} — critically understaffed`,
        detail: `Only ${sc.staff.filter(s => s.status === 'Active').length} active staff member(s) assigned.`,
      });
    }
  });

  // Staff-level: missing schedule data
  const noSchedule = staff.filter(
    s => ROSTER_ROLES.has(s.role) && s.status === 'Active' && !s.hasSchedule
  );
  if (noSchedule.length) {
    alerts.push({
      level: 'info',
      storeId: 'ALL',
      title: `${noSchedule.length} staff missing shift schedule`,
      detail: noSchedule.map(s => s.name).join(', '),
    });
  }

  // Check each day for severe gaps across all stores
  DAYS_OF_WEEK.forEach(d => {
    if (d === day) return; // already covered per-store above
    stores.forEach(sid => {
      const sc2 = buildStoreCoverage(staff, sid, d);
      if (sc2.workingToday.length === 0 && sc2.staff.filter(s => s.status === 'Active').length > 0) {
        alerts.push({
          level: 'warning',
          storeId: sid,
          title: `Store ${sid} — zero coverage on ${d}`,
          detail: `No active staff are scheduled to work on ${d}.`,
        });
      }
    });
  });

  return alerts;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRosterDashboard(currentUser: User | null) {
  const [rawStaff, setRawStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Real-time Firestore subscription ────────────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const users: User[] = [];
        snapshot.forEach(doc => {
          const d = doc.data();
          users.push({
            ...d,
            empId:   String(d.empId   || doc.id).trim(),
            name:    String(d.name    || '').trim(),
            storeId: String(d.storeId || '').trim(),
            role:    String(d.role    || 'user').toLowerCase().trim() as User['role'],
            region:  String(d.region  || '').trim(),
            status:  String(d.status  || 'Active').trim(),
          } as User);
        });
        setRawStaff(users);
        setLastUpdated(new Date());
        setLoading(false);
        setError(null);
      },
      err => {
        console.error('[useRosterDashboard] Firestore error:', err);
        setError('Failed to load staff data from Firestore.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const data = useMemo((): RosterDashboardData | null => {
    if (!rawStaff.length) return null;

    const day = todayName();

    // Filter to roster-relevant, active staff only
    const allStaff: RosterUser[] = rawStaff
      .filter(s => ROSTER_ROLES.has(s.role) && s.status === 'Active')
      .map(s => ({
        ...s,
        hasSchedule: s.shiftStart != null && !!s.shiftHours,
      }));

    // Unique store IDs, sorted
    const stores = [...new Set(allStaff.map(s => s.storeId))]
      .filter(Boolean)
      .sort();

    // Per-store coverage for today
    const storeCoverage: Record<string, StoreCoverage> = {};
    stores.forEach(sid => {
      storeCoverage[sid] = buildStoreCoverage(allStaff, sid, day);
    });

    const alerts = buildAlerts(stores, storeCoverage, allStaff, day);

    const today = {
      totalWorking:    allStaff.filter(s => isWorkingOnDay(s, day)).length,
      totalOff:        allStaff.filter(s => s.weekOffDay === day).length,
      totalNoSchedule: allStaff.filter(s => !s.hasSchedule).length,
      criticalStores:  Object.values(storeCoverage).filter(sc =>
        sc.workingToday.length === 0 || !sc.hasSupervisor
      ).length,
      warningStores: Object.values(storeCoverage).filter(sc =>
        sc.workingToday.length > 0 && sc.hasSupervisor && sc.supervisorsToday.length === 0
      ).length,
    };

    return { allStaff, stores, storeCoverage, alerts, today };
  }, [rawStaff]);

  return { data, loading, error, lastUpdated };
}
