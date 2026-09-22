import { supabase, supabaseAdmin } from './supabaseClient.ts';

const ORG = '00000000-0000-0000-0000-000000000000';
const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency', 'ShortPermission'] as const;

export type StepType = 'init' | 'approval' | 'review' | 'acknowledge' | 'auto';
export type ApproverRule = 'role' | 'requester' | 'line_manager' | 'requester_replacement' | 'department_head' | 'unit_head' | 'supervision_head' | 'division_head' | 'reporting_chain' | 'specific_user' | 'delegate_to_role' | 'escalate_after_hours' | 'escalate_to_rule';

export interface WfRole {
  code: string;
  name: string | null;
  rank: number;
  is_approver: boolean;
}

export interface WfFlow {
  id: string;
  code: string;
  name: string;
  version: number;
  status: 'active' | 'draft' | 'archived';
  applies_to: { leave_types?: string[]; request_types?: string[] };
  effective_from?: string;
}

export interface WfRequestType {
  id: string;
  code: string;
  name: string;
  payload_schema: Record<string, any>;
  eligibility: Record<string, any>;
  finalization: Record<string, any>;
  active: boolean;
  created_at?: string;
}

export interface WfStep {
  step_order: number;
  code: string;
  name: string;
  actor_role_code: string | null;
  step_type: StepType;
  rule: ApproverRule;
  rule_config: Record<string, any>;
  condition: Record<string, any>;
  is_required: boolean;
  allow_self: boolean;
}

export interface WfUserRole {
  id: string;
  user_id: string;
  role_code: string;
  department_scope: string | null;
}

export interface LaUserLite {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  role: string;
  status: string;
  entity_id: string | null;
}

export type OrgKind = 'division' | 'department' | 'supervision' | 'unit';

export interface HrOrgUnit {
  id: string;
  org_id: string;
  code: string;
  kind: OrgKind;
  parent_id: string | null;
  head_user_id: string | null;
  name: string;
  name_arabic: string | null;
  active: boolean;
}

export interface DlmRow {
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
  position: string | null;
  role: string;
  status: string;
  manager_id: string | null;
  manager_name: string | null;
}

const db = supabaseAdmin || supabase;

function ensure(): any {
  if (!db) throw new Error('Supabase is not configured.');
  if (!supabaseAdmin) {
    console.warn('[WorkflowConfig] Service-role key missing — writes will be blocked by RLS.');
  }
  return db;
}

async function unwrap<T>(p: any, label: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

function sameSteps(a: WfStep[], b: WfStep[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => {
    const t = b[i];
    return s.step_order === t.step_order && s.code === t.code && s.name === t.name &&
      s.actor_role_code === t.actor_role_code && s.step_type === t.step_type &&
      s.rule === t.rule && s.is_required === t.is_required && s.allow_self === t.allow_self &&
      JSON.stringify(s.condition || {}) === JSON.stringify(t.condition || {}) &&
      JSON.stringify(s.rule_config || {}) === JSON.stringify(t.rule_config || {});
  });
}

export const workflowConfigService = {
  LEAVE_TYPES,
  enabled: !!db,
  hasWriteAccess: !!supabaseAdmin,

  async getRoles(): Promise<WfRole[]> {
    return unwrap<WfRole[]>(ensure().from('wf_roles').select('code,name,rank,is_approver').order('rank'), 'getRoles');
  },

  async saveRoles(roles: WfRole[]): Promise<void> {
    const rows = roles.map(r => ({ org_id: ORG, code: r.code.trim(), name: r.name || r.code.trim(), rank: r.rank, is_approver: r.is_approver }));
    await unwrap(ensure().from('wf_roles').upsert(rows, { onConflict: 'org_id,code' }), 'saveRoles');
  },

  async deleteRole(code: string): Promise<void> {
    await unwrap(ensure().from('wf_roles').delete().eq('code', code), 'deleteRole');
  },

  async getFlows(): Promise<WfFlow[]> {
    return unwrap<WfFlow[]>(ensure().from('wf_flows').select('*').order('code').order('version', { ascending: false }), 'getFlows');
  },

  async getSteps(flowId: string): Promise<WfStep[]> {
    return unwrap<WfStep[]>(
      ensure().from('wf_flow_steps').select('step_order,code,name,actor_role_code,step_type,rule,rule_config,condition,is_required,allow_self').eq('flow_id', flowId).order('step_order'),
      'getSteps'
    );
  },

  /** Request-type catalog (generic engine). Credit-card style: code+name+active + JSON rule packs. */
  async getRequestTypes(): Promise<WfRequestType[]> {
    return unwrap<WfRequestType[]>(ensure().from('wf_request_types').select('*').order('code'), 'getRequestTypes');
  },

  async saveRequestType(rt: Partial<WfRequestType>): Promise<void> {
    if (!rt.code?.trim() || !rt.name?.trim()) throw new Error('Code and name are required.');
    await unwrap(ensure().from('wf_request_types').upsert({
      org_id: ORG,
      code: rt.code.trim(),
      name: rt.name.trim(),
      payload_schema: rt.payload_schema || {},
      eligibility: rt.eligibility || {},
      finalization: rt.finalization || { action: 'none' },
      active: rt.active ?? true,
    }, { onConflict: 'org_id,code' }), 'saveRequestType');
  },

  async deleteRequestType(code: string): Promise<void> {
    await unwrap(ensure().from('wf_request_types').delete().eq('org_id', ORG).eq('code', code), 'deleteRequestType');
  },

  /** Upsert a flow and replace its steps. Editing an ACTIVE flow versions it. */
  async saveFlow(flow: Partial<WfFlow>, steps: WfStep[]): Promise<WfFlow> {
    const client = ensure();
    const appliesTo = {
      leave_types: flow.applies_to?.leave_types || [],
      request_types: flow.applies_to?.request_types || [],
    };
    const cleanSteps = steps.map((s, i) => ({
      step_order: i,
      code: s.code.trim(),
      name: s.name || s.code,
      actor_role_code: s.actor_role_code || null,
      step_type: s.step_type,
      rule: s.rule,
      rule_config: s.rule_config || {},
      condition: s.condition || {},
      is_required: s.is_required,
      allow_self: s.allow_self,
    }));

    if (!flow.id) {
      const created = await unwrap<WfFlow[]>(
        client.from('wf_flows').insert({ org_id: ORG, code: flow.code, name: flow.name, version: 1, status: flow.status || 'draft', applies_to: appliesTo }).select('*'),
        'createFlow'
      );
      const f = created[0];
      await unwrap(client.from('wf_flow_steps').insert(cleanSteps.map(s => ({ ...s, flow_id: f.id }))), 'insertSteps');
      return f;
    }

    const existingSteps = await this.getSteps(flow.id);
    const changed = !sameSteps(existingSteps, cleanSteps as WfStep[]);

    // Editing an active flow's steps creates a new version (in-flight requests keep theirs).
    if (changed && flow.status === 'active') {
      await unwrap(client.from('wf_flows').update({ status: 'archived' }).eq('id', flow.id), 'archiveOld');
      const created = await unwrap<WfFlow[]>(
        client.from('wf_flows').insert({ org_id: ORG, code: flow.code, name: flow.name, version: (flow.version || 1) + 1, status: 'active', applies_to: appliesTo }).select('*'),
        'versionFlow'
      );
      const f = created[0];
      await unwrap(client.from('wf_flow_steps').insert(cleanSteps.map(s => ({ ...s, flow_id: f.id }))), 'insertVSteps');
      return f;
    }

    await unwrap(client.from('wf_flows').update({ name: flow.name, status: flow.status, applies_to: appliesTo }).eq('id', flow.id), 'updateFlow');
    if (changed) {
      await unwrap(client.from('wf_flow_steps').delete().eq('flow_id', flow.id), 'clearSteps');
      await unwrap(client.from('wf_flow_steps').insert(cleanSteps.map(s => ({ ...s, flow_id: flow.id }))), 'writeSteps');
    }
    return { ...(flow as WfFlow), applies_to: appliesTo };
  },

  async deleteFlow(id: string): Promise<void> {
    await unwrap(ensure().from('wf_flows').delete().eq('id', id), 'deleteFlow');
  },

  async getUserRoles(): Promise<WfUserRole[]> {
    return unwrap<WfUserRole[]>(ensure().from('wf_user_roles').select('id,user_id,role_code,department_scope').order('role_code'), 'getUserRoles');
  },

  async setUserRole(userId: string, roleCode: string, deptScope: string | null): Promise<void> {
    await unwrap(
      ensure().from('wf_user_roles').upsert({ org_id: ORG, user_id: userId, role_code: roleCode, department_scope: deptScope }, { onConflict: 'org_id,user_id,role_code' }),
      'setUserRole'
    );
  },

  async removeUserRole(id: string): Promise<void> {
    await unwrap(ensure().from('wf_user_roles').delete().eq('id', id), 'removeUserRole');
  },

  async getLaUsers(): Promise<LaUserLite[]> {
    return unwrap<LaUserLite[]>(ensure().from('la_users').select('id,full_name,email,department,role,status,entity_id').order('full_name'), 'getLaUsers');
  },

  /** Org entity tree (flat; the UI builds parent/child links via parent_id). */
  async getOrgUnits(): Promise<HrOrgUnit[]> {
    return unwrap<HrOrgUnit[]>(ensure().from('hr_org_units').select('*').order('kind'), 'getOrgUnits');
  },

  /** Create or update an org entity. Structure rules are also enforced server-side. */
  async saveOrgUnit(u: Partial<HrOrgUnit>): Promise<HrOrgUnit> {
    if (!u.name?.trim() || !u.code?.trim()) throw new Error('Name and code are required.');
    if (u.kind === 'division' && u.parent_id) throw new Error('A division is a root entity.');
    if (u.kind !== 'division' && !u.parent_id) throw new Error(`${u.kind} requires a parent entity.`);
    const row = {
      org_id: ORG,
      code: u.code.trim(),
      kind: u.kind,
      parent_id: u.parent_id || null,
      head_user_id: u.head_user_id || null,
      name: u.name.trim(),
      name_arabic: u.name_arabic || null,
      active: u.active ?? true,
    };
    if (u.id) {
      await unwrap(ensure().from('hr_org_units').update(row).eq('id', u.id), 'saveOrgUnit');
      return { ...(row as HrOrgUnit), id: u.id };
    }
    const created = await unwrap<HrOrgUnit[]>(ensure().from('hr_org_units').insert(row).select('*'), 'createOrgUnit');
    return created[0];
  },

  async deleteOrgUnit(id: string): Promise<void> {
    await unwrap(ensure().from('hr_org_units').delete().eq('id', id), 'deleteOrgUnit');
  },

  /** Assign an employee's leaf entity (unit/supervision) on the leave roster. */
  async setLaUserEntity(userId: string, entityId: string | null): Promise<void> {
    await unwrap(ensure().from('la_users').update({ entity_id: entityId }).eq('id', userId), 'setLaUserEntity');
  },

  /** Roster + each employee's direct line manager (DLM), for the coverage tab. */
  async getDlmCoverage(): Promise<DlmRow[]> {
    const rows = await unwrap<DlmRow[]>(ensure().rpc('wf_dlm_coverage'), 'getDlmCoverage');
    return rows || [];
  },

  /** Assign (or clear) an employee's direct line manager on the leave roster. */
  async setDlmManager(userId: string, managerId: string | null): Promise<void> {
    await unwrap(ensure().from('la_users').update({ manager_id: managerId }).eq('id', userId), 'setDlmManager');
  },

  async getEngineMode(): Promise<'legacy' | 'configurable'> {
    const rows = await unwrap<{ engine_mode: string }[]>(ensure().from('wf_settings').select('engine_mode').eq('org_id', ORG).limit(1), 'getEngineMode');
    return (rows[0]?.engine_mode as 'legacy' | 'configurable') || 'legacy';
  },

  async setEngineMode(mode: 'legacy' | 'configurable'): Promise<void> {
    await unwrap(ensure().from('wf_settings').update({ engine_mode: mode, updated_at: new Date().toISOString() }).eq('org_id', ORG), 'setEngineMode');
  },

  /** Reassign pending steps from one user to another (or re-resolve by rule if target is null). */
  async reassignPending(oldUserId: string, newUserId: string | null): Promise<any[]> {
    const rows = await unwrap<any[]>(ensure().rpc('wf_reassign_pending', { p_old_user_id: oldUserId, p_new_user_id: newUserId }), 'reassignPending');
    return rows || [];
  },

  /** Count open (PENDING/WAITING) steps currently assigned to a user across both engines. */
  async getOpenStepsCount(userId: string): Promise<number> {
    const [legacy, generic] = await Promise.all([
      ensure().from('la_request_steps').select('id', { count: 'exact', head: true }).eq('resolved_actor_id', userId).in('status', ['PENDING', 'WAITING']),
      ensure().from('wf_request_steps').select('id', { count: 'exact', head: true }).eq('resolved_actor_id', userId).in('status', ['PENDING', 'WAITING']),
    ]);
    return (legacy.count || 0) + (generic.count || 0);
  },
};
