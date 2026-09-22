import { supabase, supabaseAdmin } from './supabaseClient.ts';
import { workflowConfigService, WfRequestType } from './workflowConfigService.ts';

/**
 * Generic request engine client (docs/workflow_engine_design_v2.md §4–§9).
 *
 * Write/decision RPCs (wf_start_request, wf_step_decision) plus the read-model
 * RPCs (wf_action_queue, wf_request_flow) resolve the caller from the JWT, so
 * they go through the user-scoped `supabase` client. The request-type catalog
 * is admin-config metadata and is read via the same service used by the
 * WorkflowConfig screen.
 */

export interface WfRequestRow {
  id: string;
  org_id: string;
  request_type: string;
  requester_id: string;
  payload: Record<string, any>;
  deputy_id: string | null;
  flow_id: string | null;
  flow_version: number | null;
  detail_type: string | null;
  detail_id: string | null;
  current_step: number | null;
  status: string;
  history: any[];
  created_at: string;
  updated_at: string;
}

export interface WfQueueRow {
  request_id: string;
  requester_name: string;
  requester_dept: string | null;
  request_type: string;
  status: string;
  step_order: number;
  step_code: string;
  step_name: string | null;
  flow_code: string | null;
  created_at: string;
}

export interface WfFlowRow {
  step_order: number;
  code: string;
  name: string | null;
  actor_role_code: string | null;
  status: string;
  resolved_actor: string | null;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
}

export interface WfLoanRow {
  id: string;
  request_id: string;
  amount: number;
  duration_months: number;
  instalments: any;
  status: string;
  created_at: string;
}

export interface EligibilityResult {
  eligible: boolean;
  code: string;
  reason: string;
}

export interface StartResult {
  success: boolean;
  id?: string;
  current_step?: number;
  message?: string;
  errors?: string[];
  code?: string;
}

export interface DecideResult {
  success: boolean;
  message?: string;
  current_step?: number;
}

const userClient = (): any => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
};

async function rpcOk<T = any>(p: Promise<{ data: T; error: any }>, label: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

/** Resolve the current portal user to a la_users UUID (RPCs do this from the JWT; we mirror it by email for catalog read-backs). */
export async function resolveLaUserId(email: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from('la_users').select('id').eq('email', email).maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

export const genericRequestService = {
  enabled: !!supabase,

  /** Request-type catalog (admin metadata; service-role read, same as WorkflowConfig). */
  async getCatalog(): Promise<WfRequestType[]> {
    return workflowConfigService.getRequestTypes();
  },

  /** Requests I submitted (resolved via my la_users email). */
  async getMyRequests(user: { email: string }): Promise<WfRequestRow[]> {
    const laId = await resolveLaUserId(user.email);
    if (!laId || !supabaseAdmin) return [];
    const { data, error } = await supabaseAdmin
      .from('wf_requests')
      .select('*')
      .eq('requester_id', laId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`getMyRequests: ${error.message}`);
    return (data || []) as WfRequestRow[];
  },

  /** Requests awaiting the current user's action (JWT-scoped). */
  async getActionQueue(): Promise<WfQueueRow[]> {
    const rows = await rpcOk<WfQueueRow[]>(userClient().rpc('wf_action_queue'), 'wf_action_queue');
    return rows || [];
  },

  /** Per-type eligibility (tenure / max-uses / balance / cool-down) for the current user. Returns null when it cannot be evaluated (service will enforce at submit). */
  async checkEligibility(user: { email: string }, requestType: string, payload: Record<string, any>): Promise<EligibilityResult | null> {
    const laId = await resolveLaUserId(user.email);
    if (!laId || !supabase) return null;
    const rows = await rpcOk<EligibilityResult[]>(
      userClient().rpc('wf_check_eligibility', { p_type: requestType, p_requester_id: laId, p_payload: payload }),
      'wf_check_eligibility'
    );
    return (rows && rows[0]) || null;
  },

  /** Start a new generic request (JWT-resolved requester). */
  async startRequest(requestType: string, payload: Record<string, any>, deputyId: string | null = null): Promise<StartResult> {
    const res = await rpcOk<StartResult>(
      userClient().rpc('wf_start_request', { p_request_type: requestType, p_payload: payload, p_deputy_id: deputyId }),
      'wf_start_request'
    );
    return res;
  },

  /** Decision matrix on the current step: approve | reject | return | cancel | endorse. */
  async decide(requestId: string, decision: string, note?: string | null): Promise<DecideResult> {
    const res = await rpcOk<DecideResult>(
      userClient().rpc('wf_step_decision', { p_request_id: requestId, p_decision: decision, p_note: note ?? null, p_extra: null }),
      'wf_step_decision'
    );
    return res;
  },

  /** Flow trace of a request (requester / assigned actor / HR / CEO only). */
  async getFlow(requestId: string): Promise<WfFlowRow[]> {
    const rows = await rpcOk<WfFlowRow[]>(userClient().rpc('wf_request_flow', { p_request_id: requestId }), 'wf_request_flow');
    return rows || [];
  },

  /** Loan schedule if the finalized request produced one. */
  async getLoan(requestId: string): Promise<WfLoanRow | null> {
    if (!supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin.from('wf_loans').select('*').eq('request_id', requestId).maybeSingle();
    if (error) return null;
    return (data as WfLoanRow) || null;
  },
};