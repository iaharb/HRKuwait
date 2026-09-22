import { supabaseAdmin } from './supabaseClient.ts';

const admin = () => {
  if (!supabaseAdmin) throw new Error('Supabase Admin not configured.');
  return supabaseAdmin;
};

/**
 * Sync utilities for keeping la_users and employees in sync
 * across organizational fields (entity_id, job_title_id, manager_id, etc.)
 */
export const orgSyncService = {
  /**
   * Manually trigger sync from la_users to employees for a specific user.
   * Useful when a user is created/updated via the portal and needs to be reflected in employees.
   */
  async syncUserToEmployees(userId: string): Promise<void> {
    const { data: user } = await admin().from('la_users').select(`
      id, org_id, entity_id, job_title_id, manager_id, email, full_name, department, role, status
    `).eq('id', userId).single();

    if (!user) throw new Error('User not found');

    const { error } = await admin().from('employees').upsert({
      id: user.id,
      org_id: user.org_id,
      entity_id: user.entity_id,
      job_title_id: user.job_title_id,
      manager_id: user.manager_id,
      email: user.email,
      name: user.full_name,
      department: user.department,
      role: user.role,
      status: user.status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) throw new Error(`syncUserToEmployees: ${error.message}`);
  },

  /**
   * Sync all active users from la_users to employees.
   * Useful for initial migration or bulk recovery.
   */
  async syncAllUsersToEmployees(): Promise<{ synced: number; errors: string[] }> {
    const { data: users } = await admin().from('la_users').select(`
      id, org_id, entity_id, job_title_id, manager_id, email, full_name, department, role, status
    `).eq('status', 'active');

    let synced = 0;
    const errors: string[] = [];

    for (const u of users || []) {
      try {
        await admin().from('employees').upsert({
          id: u.id,
          org_id: u.org_id,
          entity_id: u.entity_id,
          job_title_id: u.job_title_id,
          manager_id: u.manager_id,
          email: u.email,
          name: u.full_name,
          department: u.department,
          role: u.role,
          status: u.status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        synced++;
      } catch (e: any) {
        errors.push(`${u.email}: ${e.message}`);
      }
    }

    return { synced, errors };
  },

  /**
   * Sync a single employee update to la_users (reverse sync).
   * Called when an employee is edited in the portal.
   */
  async syncEmployeeToUser(employeeId: string): Promise<void> {
    const { data: emp } = await admin().from('employees').select(`
      id, entity_id, job_title_id, manager_id, email, name, department, role, status
    `).eq('id', employeeId).single();

    if (!emp) throw new Error('Employee not found');

    const { error } = await admin().from('la_users').update({
      entity_id: emp.entity_id,
      job_title_id: emp.job_title_id,
      manager_id: emp.manager_id,
      email: emp.email,
      full_name: emp.name,
      department: emp.department,
      role: emp.role,
      status: emp.status,
      updated_at: new Date().toISOString(),
    }).eq('id', emp.id);

    if (error) throw new Error(`syncEmployeeToUser: ${error.message}`);
  },

  /**
   * Validate sync integrity between la_users and employees.
   * Returns discrepancies for manual review.
   */
  async validateSync(): Promise<{
    mismatches: Array<{ userId: string; field: string; laValue: any; empValue: any }>;
    missingInEmployees: string[];
    missingInLaUsers: string[];
  }> {
    const { data: laUsers } = await admin().from('la_users').select('id, entity_id, job_title_id, manager_id, email, full_name, department, role, status').eq('status', 'active');
    const { data: employees } = await admin().from('employees').select('id, entity_id, job_title_id, manager_id, email, name, department, role, status').eq('status', 'Active');

    const laMap = new Map((laUsers || []).map(u => [u.id, u]));
    const empMap = new Map((employees || []).map(e => [e.id, e]));

    const mismatches: Array<{ userId: string; field: string; laValue: any; empValue: any }> = [];
    const fields = ['entity_id', 'job_title_id', 'manager_id', 'email', 'full_name', 'department', 'role', 'status'] as const;

    for (const [id, laUser] of laMap) {
      const emp = empMap.get(id);
      if (!emp) continue;

      for (const field of fields) {
        const laVal = (laUser as any)[field];
        const empVal = (emp as any)[field === 'full_name' ? 'name' : field];
        if (laVal !== empVal) {
          mismatches.push({ userId: id, field, laValue: laVal, empValue: empVal });
        }
      }
    }

    const laIds = new Set(laMap.keys());
    const empIds = new Set(empMap.keys());
    const missingInEmployees = [...laIds].filter(id => !empIds.has(id));
    const missingInLaUsers = [...empIds].filter(id => !laIds.has(id));

    return { mismatches, missingInEmployees, missingInLaUsers };
  },

  /**
   * Repair sync by overwriting employees with la_users data for mismatched fields.
   */
  async repairSync(userIds?: string[]): Promise<{ repaired: number }> {
    let query = admin().from('la_users').select('id, org_id, entity_id, job_title_id, manager_id, email, full_name, department, role, status');
    if (userIds && userIds.length > 0) {
      query = query.in('id', userIds);
    }
    const { data: users } = await query;

    let repaired = 0;
    for (const u of users || []) {
      await admin().from('employees').upsert({
        id: u.id,
        org_id: u.org_id,
        entity_id: u.entity_id,
        job_title_id: u.job_title_id,
        manager_id: u.manager_id,
        email: u.email,
        name: u.full_name,
        department: u.department,
        role: u.role,
        status: u.status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      repaired++;
    }
    return { repaired };
  },
};

export default orgSyncService;