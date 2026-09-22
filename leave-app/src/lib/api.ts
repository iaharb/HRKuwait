import { supabase } from './supabase';
import type {
  LaUser,
  LaBalance,
  LaLeaveRequest,
  QueueItem,
  RequestDetail,
  Notification,
  RpcResult,
  LeaveType,
} from './types';

const rpc = async <T>(fn: string, params?: Record<string, unknown>): Promise<T> => {
  const res = await supabase.rpc(fn, params ?? {});
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

export type EngineMode = 'legacy' | 'configurable';
let _mode: EngineMode | null = null;

/** Which workflow engine the app should use (set in the HR portal config page). */
export async function engineMode(force = false): Promise<EngineMode> {
  if (_mode && !force) return _mode;
  try {
    const { data } = await supabase.from('wf_settings').select('engine_mode').limit(1).maybeSingle();
    _mode = ((data as any)?.engine_mode as EngineMode) ?? 'legacy';
  } catch {
    _mode = 'legacy';
  }
  return _mode;
}

export function resetEngineMode() { _mode = null; }

export async function fetchProfile(email: string): Promise<LaUser | null> {
  const { data, error } = await supabase.from('la_users').select('*').eq('email', email).single();
  if (error || !data) return null;
  return data as LaUser;
}

export const directory = () => rpc<LaUser[]>('la_users_directory');

export const myBalances = () => rpc<LaBalance[]>('la_my_balances');
export const myRequests = () => rpc<LaLeaveRequest[]>('la_my_requests');
export const actionQueue = async (): Promise<QueueItem[]> => {
  const mode = await engineMode();
  if (mode !== 'configurable') return rpc<QueueItem[]>('la_action_queue');
  const rows = await rpc<any[]>('la_workflow_action_queue');
  return rows.map((r) => ({
    request_id: r.request_id,
    requester_name: r.requester_name,
    requester_pos: r.requester_pos,
    requester_dept: r.requester_dept,
    leave_type: r.leave_type,
    start_date: r.start_date,
    end_date: r.end_date,
    days: Number(r.days),
    reason: r.reason,
    contact_during: r.contact_during,
    deputy_name: r.deputy_name ?? '',
    requester_manager: r.requester_manager,
    status: r.status,
    step: r.step_code,
    step_code: r.step_code,
    step_name: r.step_name,
    is_final_step: r.is_final_step,
    engine: true,
    created_at: r.created_at,
  })) as QueueItem[];
};
export const requestDetail = (id: string) => rpc<RequestDetail>('la_request_detail', { p_request_id: id });
export const notifications = () => rpc<Notification[]>('la_notifications');
export const markNotificationRead = (id: string) =>
  rpc<RpcResult>('la_notifications_mark_read', { p_notification_id: id });
export const markAllNotificationsRead = () => rpc<RpcResult>('la_notifications_mark_all_read');

export interface SubmitPayload {
  leaveType: LeaveType;
  start: string;
  end: string;
  reason: string;
  contact: string;
  deputyId: string;
}
export const submitRequest = async (p: SubmitPayload) => {
  const mode = await engineMode();
  return rpc<RpcResult>(mode === 'configurable' ? 'la_start_request' : 'la_submit_leave_request', {
    p_leave_type: p.leaveType,
    p_start_date: p.start,
    p_end_date: p.end,
    p_reason: p.reason,
    p_contact: p.contact,
    p_deputy_id: p.deputyId,
  });
};

/** Configurable-engine decision for the current step of a request. */
export const stepDecision = (requestId: string, approve: boolean, note?: string, finalDays?: number) =>
  rpc<RpcResult>('la_step_decision', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note ?? null,
    p_final_days: finalDays ?? null,
  });

export const deputyDecision = (requestId: string, approve: boolean, note?: string) =>
  rpc<RpcResult>('la_deputy_decision', { p_request_id: requestId, p_approve: approve, p_note: note ?? null });

export const managerDecision = (requestId: string, approve: boolean, note?: string) =>
  rpc<RpcResult>('la_manager_decision', { p_request_id: requestId, p_approve: approve, p_note: note ?? null });

export const hrDecision = (requestId: string, approve: boolean, finalDays?: number, note?: string) =>
  rpc<RpcResult>('la_hr_decision', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note ?? null,
    p_final_days: finalDays ?? null,
  });

export const ceoDecision = (requestId: string, approve: boolean, note?: string) =>
  rpc<RpcResult>('la_ceo_decision', { p_request_id: requestId, p_approve: approve, p_note: note ?? null });

export const cancelRequest = (requestId: string) =>
  rpc<RpcResult>('la_cancel_request', { p_request_id: requestId });