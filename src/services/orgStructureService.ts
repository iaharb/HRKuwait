import { supabase, supabaseAdmin } from './supabaseClient.ts';

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
  created_at: string;
  updated_at: string;
  // Computed
  children?: HrOrgUnit[];
  head_name?: string;
  employee_count?: number;
  unit_count?: number;
}

export interface JobTitle {
  id: string;
  org_id: string;
  code: string;
  name: string;
  name_arabic: string | null;
  department_id: string | null;
  grade: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Computed
  department_name?: string;
  employee_count?: number;
}

export interface EmployeeAssignment {
  id: string;
  email: string;
  full_name: string;
  job_title_id: string | null;
  job_title_code: string | null;
  job_title_name: string | null;
  entity_id: string | null;
  entity_code: string | null;
  entity_kind: OrgKind | null;
  entity_name: string | null;
  department_id: string | null;
  department_code: string | null;
  department_name: string | null;
  division_id: string | null;
  division_code: string | null;
  division_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  role: string;
  status: string;
}

export interface DlmCoverageRow {
  user_id: string;
  email: string;
  full_name: string;
  manager_id: string | null;
  manager_name: string | null;
  has_manager: boolean;
}

export interface HeadCoverageRow {
  entity_id: string;
  entity_code: string;
  entity_name: string;
  kind: OrgKind;
  head_user_id: string | null;
  head_name: string | null;
  has_head: boolean;
}

export interface ReassignPreviewRow {
  request_id: string;
  step_order: number;
  code: string;
  from_user: string;
  to_user: string | null;
  status: string;
  note: string;
}

export interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
}

const ORG = '00000000-0000-0000-0000-000000000000';

async function unwrap<T>(promise: Promise<{ data: T | null; error: any }>, label: string): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

function adminClient() {
  if (!supabaseAdmin) throw new Error('Supabase Admin not configured.');
  return supabaseAdmin;
}

function userClient() {
  if (!supabase) throw new Error('Supabase not configured.');
  return supabase;
}

export const orgStructureService = {
  // ===== Org Tree =====
  async getOrgTree(): Promise<HrOrgUnit[]> {
    const units = await unwrap<HrOrgUnit[]>(
      adminClient().from('hr_org_units').select('*').eq('org_id', ORG).order('kind'),
      'getOrgTree'
    );
    return this.buildTree(units || []);
  },

  buildTree(flat: HrOrgUnit[]): HrOrgUnit[] {
    const map = new Map<string, HrOrgUnit>();
    flat.forEach(u => map.set(u.id, { ...u, children: [] }));
    const roots: HrOrgUnit[] = [];
    flat.forEach(u => {
      const node = map.get(u.id)!;
      if (u.parent_id) {
        const parent = map.get(u.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });
    return roots;
  },

  async getFlatOrgUnits(): Promise<HrOrgUnit[]> {
    return unwrap<HrOrgUnit[]>(
      adminClient().from('hr_org_units').select('*').eq('org_id', ORG).order('kind'),
      'getFlatOrgUnits'
    );
  },

  async createOrgUnit(input: Omit<HrOrgUnit, 'id' | 'org_id' | 'created_at' | 'updated_at'>): Promise<HrOrgUnit> {
    const created = await unwrap<HrOrgUnit[]>(
      adminClient().from('hr_org_units').insert({ ...input, org_id: ORG }).select('*'),
      'createOrgUnit'
    );
    return created[0];
  },

  async updateOrgUnit(id: string, patch: Partial<HrOrgUnit>): Promise<HrOrgUnit> {
    const updated = await unwrap<HrOrgUnit[]>(
      adminClient().from('hr_org_units').update(patch).eq('id', id).select('*'),
      'updateOrgUnit'
    );
    return updated[0];
  },

  async deleteOrgUnit(id: string): Promise<void> {
    // Check for children
    const { data: children } = await adminClient().from('hr_org_units').select('id').eq('parent_id', id).limit(1);
    if (children && children.length > 0) {
      throw new Error('Cannot delete entity with children. Reassign or delete children first.');
    }
    // Check for employees assigned
    const { data: emps } = await adminClient().from('la_users').select('id').eq('entity_id', id).limit(1);
    if (emps && emps.length > 0) {
      throw new Error('Cannot delete entity with assigned employees. Reassign employees first.');
    }
    await unwrap(adminClient().from('hr_org_units').delete().eq('id', id), 'deleteOrgUnit');
  },

  // ===== Job Titles =====
  async getJobTitles(): Promise<JobTitle[]> {
    const titles = await unwrap<JobTitle[]>(
      adminClient().from('hr_job_titles').select('*').eq('org_id', ORG).eq('active', true).order('code'),
      'getJobTitles'
    );
    return titles || [];
  },

  async getAllJobTitles(): Promise<JobTitle[]> {
    return unwrap<JobTitle[]>(
      adminClient().from('hr_job_titles').select('*').eq('org_id', ORG).order('code'),
      'getAllJobTitles'
    );
  },

  async createJobTitle(input: Omit<JobTitle, 'id' | 'org_id' | 'created_at' | 'updated_at'>): Promise<JobTitle> {
    const created = await unwrap<JobTitle[]>(
      adminClient().from('hr_job_titles').insert({ ...input, org_id: ORG }).select('*'),
      'createJobTitle'
    );
    return created[0];
  },

  async updateJobTitle(id: string, patch: Partial<JobTitle>): Promise<JobTitle> {
    const updated = await unwrap<JobTitle[]>(
      adminClient().from('hr_job_titles').update(patch).eq('id', id).select('*'),
      'updateJobTitle'
    );
    return updated[0];
  },

  async deleteJobTitle(id: string): Promise<void> {
    const { data: emps } = await adminClient().from('la_users').select('id').eq('job_title_id', id).limit(1);
    if (emps && emps.length > 0) {
      throw new Error('Cannot delete job title assigned to employees. Reassign first.');
    }
    await unwrap(adminClient().from('hr_job_titles').delete().eq('id', id), 'deleteJobTitle');
  },

  // ===== Employee Assignment =====
  async getEmployeeAssignments(): Promise<EmployeeAssignment[]> {
    const { data: emps } = await adminClient().from('la_users').select(`
      id, email, full_name, role, status, department, manager_id,
      entity_id, job_title_id, derived_department_id, derived_division_id,
      job_title:hr_job_titles!la_users_job_title_id_fkey(code, name),
      entity:hr_org_units!la_users_entity_id_fkey(code, kind, name),
      department:hr_org_units!la_users_derived_department_id_fkey(code, name),
      division:hr_org_units!la_users_derived_division_id_fkey(code, name),
      manager:la_users!la_users_manager_id_fkey(full_name)
    `).eq('org_id', '00000000-0000-0000-0000-000000000000').eq('status', 'active').order('full_name');

    return (emps || []).map(e => ({
      id: e.id,
      email: e.email,
      full_name: e.full_name,
      job_title_id: e.job_title_id,
      job_title_code: e.job_title?.code || null,
      job_title_name: e.job_title?.name || null,
      entity_id: e.entity_id,
      entity_code: e.entity?.code || null,
      entity_kind: e.entity?.kind || null,
      entity_name: e.entity?.name || null,
      department_id: e.derived_department_id,
      department_code: e.department?.code || null,
      department_name: e.department?.name || null,
      division_id: e.derived_division_id,
      division_code: e.division?.code || null,
      division_name: e.division?.name || null,
      manager_id: e.manager_id,
      manager_name: e.manager?.full_name || null,
      role: e.role,
      status: e.status,
    }));
  },

  async updateEmployeeAssignment(userId: string, patch: { job_title_id?: string | null; entity_id?: string | null; manager_id?: string | null }): Promise<void> {
    await unwrap(
      adminClient().from('la_users').update(patch).eq('id', userId),
      'updateEmployeeAssignment'
    );
  },

  // ===== DLM Coverage =====
  async getDlmCoverage(): Promise<DlmCoverageRow[]> {
    const { data: users } = await adminClient().from('la_users').select('id, email, full_name, manager_id, role, status').eq('org_id', ORG).eq('status', 'active');
    const byId = new Map((users || []).map(u => [u.id, u]));
    return (users || []).map(u => ({
      user_id: u.id,
      email: u.email,
      full_name: u.full_name,
      manager_id: u.manager_id,
      manager_name: u.manager_id ? byId.get(u.manager_id)?.full_name || null : null,
      has_manager: !!u.manager_id,
    }));
  },

  async setDlmManager(userId: string, managerId: string | null): Promise<void> {
    if (managerId === userId) throw new Error('Cannot assign self as manager');
    await unwrap(
      adminClient().from('la_users').update({ manager_id: managerId }).eq('id', userId),
      'setDlmManager'
    );
  },

  // ===== Head Coverage =====
  async getHeadCoverage(): Promise<HeadCoverageRow[]> {
    const units = await this.getFlatOrgUnits();
    const { data: users } = await adminClient().from('la_users').select('id, full_name').eq('status', 'active');
    const byId = new Map((users || []).map(u => [u.id, u.full_name]));

    return units.map(u => ({
      entity_id: u.id,
      entity_code: u.code,
      entity_name: u.name,
      kind: u.kind,
      head_user_id: u.head_user_id,
      head_name: u.head_user_id ? byId.get(u.head_user_id) || null : null,
      has_head: !!u.head_user_id,
    }));
  },

  async setEntityHead(entityId: string, headUserId: string | null): Promise<void> {
    if (headUserId) {
      const { data: user } = await adminClient().from('la_users').select('id, status').eq('id', headUserId).single();
      if (!user || user.status !== 'active') throw new Error('Head user must be active');
    }
    await unwrap(
      adminClient().from('hr_org_units').update({ head_user_id: headUserId }).eq('id', entityId),
      'setEntityHead'
    );
  },

  // ===== Reassignment =====
  async reassignPending(oldUserId: string, newUserId: string | null): Promise<any[]> {
    const rows = await unwrap<any[]>(
      userClient().rpc('wf_reassign_pending', { p_old_user_id: oldUserId, p_new_user_id: newUserId }),
      'reassignPending'
    );
    return rows || [];
  },

  async getOpenStepsCount(userId: string): Promise<number> {
    const [legacy, generic] = await Promise.all([
      adminClient().from('la_request_steps').select('id', { count: 'exact', head: true }).eq('resolved_actor_id', userId).in('status', ['PENDING', 'WAITING']),
      adminClient().from('wf_request_steps').select('id', { count: 'exact', head: true }).eq('resolved_actor_id', userId).in('status', ['PENDING', 'WAITING']),
    ]);
    return (legacy.count || 0) + (generic.count || 0);
  },

  // ===== Audit Trail =====
  async getAuditLog(entityType?: string, entityId?: string, limit = 100): Promise<AuditLogEntry[]> {
    let query = adminClient().from('org_structure_audit').select('*').eq('org_id', ORG).order('created_at', { ascending: false }).limit(limit);
    if (entityType) query = query.eq('entity_type', entityType);
    if (entityId) query = query.eq('entity_id', entityId);
    return unwrap<AuditLogEntry[]>(query, 'getAuditLog');
  },
};

export default orgStructureService;