import type { RequestStatus, Role } from './types';

export const fmtDate = (iso: string) => {
  if (!iso) return '';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const fmtDateTime = (iso: string) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

export function countWorkingDays(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00').getTime();
  const e = new Date(end + 'T00:00:00').getTime();
  if (e < s) return 0;
  let days = 0;
  for (let t = s; t <= e; t += 86400000) {
    const dow = new Date(t).getDay();
    if (dow !== 5) days += 1; // Friday excluded
  }
  return days;
}

export const fmtDays = (d: number | string | null | undefined) => {
  const n = Number(d ?? 0);
  return `${n} day${n === 1 ? '' : 's'}`;
};

export const STATUS_META: Record<RequestStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Awaiting deputy', cls: 'chip-info' },
  DEPUTY_CONFIRMED: { label: 'Awaiting manager', cls: 'chip-info' },
  MANAGER_APPROVED: { label: 'Awaiting HR', cls: 'chip-warn' },
  HR_APPROVED: { label: 'Awaiting CEO', cls: 'chip-warn' },
  APPROVED: { label: 'Approved', cls: 'chip-ok' },
  REJECTED: { label: 'Rejected', cls: 'chip-bad' },
  CANCELLED: { label: 'Cancelled', cls: 'chip-mute' },
};

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  Annual: 'Annual leave',
  Sick: 'Sick leave',
  Emergency: 'Emergency leave',
  ShortPermission: 'Short permission',
};

export const ROLE_LABEL: Record<string, Role | string> = {
  staff: 'Employee',
  manager: 'Manager',
  hr: 'HR',
  ceo: 'CEO',
};

export const FLOW_STEPS = [
  { key: 'submit', label: 'Submitted' },
  { key: 'deputy', label: 'Replacement concurrence' },
  { key: 'manager', label: 'Line manager' },
  { key: 'hr', label: 'HR balance check' },
  { key: 'ceo', label: 'CEO final approval' },
] as const;