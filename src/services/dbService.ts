import { supabase, isSupabaseConfigured } from './supabaseClient.ts';
import { Employee, DepartmentMetric, LeaveRequest, LeaveBalances, Notification, LeaveType, User, UserRole, LeaveHistoryEntry, PayrollRun, PayrollItem, SettlementResult, PublicHoliday, AttendanceRecord, OfficeLocation, HardwareConfig, Allowance, Announcement, BreakdownItem, ClaimStatus, ExpenseClaim } from '../types/types';
import { DEPARTMENT_METRICS, KUWAIT_PUBLIC_HOLIDAYS, OFFICE_LOCATIONS, STANDARD_ALLOWANCE_NAMES, MOCK_EMPLOYEES } from '../constants.tsx';

// Use standard UUIDs
const gid = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

/**
 * Maps a raw DB row to an Employee object.
 * If `data.employee_allowances` are joined (from new table), those take priority.
 * Falls back to the legacy `allowances` JSONB column if needed.
 */
const mapEmployee = (data: any): Employee => {
  if (!data) return data;

  // New table: employee_allowances rows joined as an array
  const joinedAllowances = (data.allowance_rows || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    nameArabic: a.name_arabic,
    type: a.type as 'Fixed' | 'Percentage',
    value: Number(a.value),
    isHousing: a.is_housing
  }));

  // Fallback: legacy JSONB allowances column
  const legacyAllowances = (data.allowances || []).map((a: any) => ({
    ...a,
    nameArabic: a.name_arabic || a.nameArabic
  }));

  const resolvedAllowances = joinedAllowances.length > 0 ? joinedAllowances : legacyAllowances;

  // New table: leave_balances rows joined as an array keyed by leave_type
  let resolvedLeaveBalances: LeaveBalances;
  if (data.leave_balances_rows && data.leave_balances_rows.length > 0) {
    const byType = (type: string) => data.leave_balances_rows.find((r: any) => r.leave_type === type);
    const annual = byType('Annual');
    const sick = byType('Sick');
    const emergency = byType('Emergency');
    const shortPerm = byType('ShortPermission');
    const hajj = byType('Hajj');
    resolvedLeaveBalances = {
      annual: Number(annual?.entitled_days ?? 30),
      annualUsed: Number(annual?.used_days ?? 0),
      sick: Number(sick?.entitled_days ?? 15),
      sickUsed: Number(sick?.used_days ?? 0),
      emergency: Number(emergency?.entitled_days ?? 6),
      emergencyUsed: Number(emergency?.used_days ?? 0),
      shortPermissionLimit: Number(shortPerm?.entitled_days ?? 2),
      shortPermissionUsed: Number(shortPerm?.used_days ?? 0),
      hajUsed: (hajj?.used_days ?? 0) >= 1
    };
  } else {
    // Fallback: legacy JSONB leave_balances column
    resolvedLeaveBalances = data.leave_balances || {
      annual: 30, sick: 15, emergency: 6,
      annualUsed: 0, sickUsed: 0, emergencyUsed: 0,
      shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: false
    };
  }

  return {
    ...data,
    nameArabic: data.name_arabic,
    civilId: data.civil_id,
    civilIdExpiry: data.civil_id_expiry,
    pifssNumber: data.pifss_number,
    passportNumber: data.passport_number,
    passportExpiry: data.passport_expiry,
    iznAmalExpiry: data.iz_amal_expiry,
    positionArabic: data.position_arabic,
    departmentArabic: data.department_arabic,
    joinDate: data.join_date,
    leaveBalances: resolvedLeaveBalances,
    trainingHours: data.training_hours || 0,
    workDaysPerWeek: data.work_days_per_week || 6,
    bankCode: data.bank_code,
    salary: Number(data.salary || 0),
    allowances: resolvedAllowances,
    faceToken: data.face_token,
    deviceUserId: data.device_user_id
  };
};

const mapLeaveRequest = (data: any): LeaveRequest => {
  if (!data) return data;

  // New table: leave_history rows joined as an array
  const joinedHistory: LeaveHistoryEntry[] = (data.leave_history || []).map((h: any) => ({
    user: h.actor_name,
    role: h.actor_role,
    action: h.action,
    timestamp: h.created_at,
    note: h.note
  }));

  // Fallback: legacy JSONB history column
  const resolvedHistory = joinedHistory.length > 0 ? joinedHistory : (data.history || []);

  return {
    id: data.id,
    employeeId: data.employee_id,
    employeeName: data.employee_name,
    department: data.department,
    type: data.type as LeaveType,
    startDate: data.start_date,
    endDate: data.end_date,
    days: data.days,
    durationHours: data.duration_hours,
    reason: data.reason,
    status: data.status,
    managerId: data.manager_id,
    createdAt: data.created_at,
    actualReturnDate: data.actual_return_date,
    medicalCertificateUrl: data.medical_certificate_url,
    history: resolvedHistory
  };
};

const mapPayrollRun = (data: any): PayrollRun => ({
  id: data.id,
  periodKey: data.period_key || data.periodKey,
  cycleType: (data.cycle_type || data.cycleType) as any,
  status: data.status,
  totalDisbursement: Number(data.total_disbursement || data.total_disbursement || 0),
  createdAt: data.created_at || data.createdAt,
  locked_start: data.locked_start,
  locked_end: data.locked_end,
  target_leave_id: data.target_leave_id
});

const mapPayrollItem = (data: any): PayrollItem => ({
  id: data.id,
  runId: data.run_id,
  employeeId: data.employee_id,
  employeeName: data.employee_name,
  basicSalary: Number(data.basic_salary || 0),
  housingAllowance: Number(data.housing_allowance || 0),
  otherAllowances: Number(data.other_allowances || 0),
  leaveDeductions: Number(data.leave_deductions || 0),
  sickLeavePay: Number(data.sick_leave_pay || 0),
  annualLeavePay: Number(data.annual_leave_pay || 0),
  shortPermissionDeductions: Number(data.short_permission_deductions || 0),
  pifssDeduction: Number(data.pifss_deduction || 0),
  pifssEmployerShare: Number(data.pifss_employer_share || 0),
  indemnityAccrual: Number(data.indemnity_accrual || 0),
  netSalary: Number(data.net_salary || 0),
  verifiedByHr: !!data.verified_by_hr,
  variance: Number(data.variance || 0),
  allowanceBreakdown: data.allowance_breakdown || [],
  deductionBreakdown: data.deduction_breakdown || []
} as any);

const mapAttendanceRecord = (data: any): AttendanceRecord => {
  if (!data) return data;
  return {
    ...data,
    employeeId: data.employee_id,
    employeeName: data.employee_name,
    clockIn: data.clock_in,
    clockOut: data.clock_out,
    locationArabic: data.location_arabic,
    deviceId: data.device_id
  };
};

let activeAllowances = [...STANDARD_ALLOWANCE_NAMES];

let globalPolicies = {
  maxPermissionHours: 8,
  fractionalDayBasis: 8,
};

let hardwareConfig: HardwareConfig = {
  serverIp: '192.168.1.50',
  apiKey: 'FR-9988-X-1',
  syncInterval: 15,
  status: 'Connected',
  lastSync: new Date().toISOString()
};

export const calculateLeaveDays = (start: string, end: string, type: LeaveType, includeSat: boolean, holidays: string[]): number => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  let total = 0;
  let current = new Date(startDate);
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toLocaleDateString('en-CA');
    const isHoliday = holidays.includes(dateStr);
    const isFriday = dayOfWeek === 5;
    const isSaturday = dayOfWeek === 6;
    if (!isFriday && !(isSaturday && !includeSat) && !isHoliday) total++;
    current.setDate(current.getDate() + 1);
  }
  return total;
};

// Payroll Logic Helpers
const countFridays = (start: Date, end: Date): number => {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (current.getDay() === 5) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

export const dbService = {
  getAppUsers: async (): Promise<any[]> => {
    return dbService._safeQuery(async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('app_users').select('*');
      if (error) {
        console.error("Supabase app_users fetch error:", error);
        throw error;
      }

      const emps = await dbService.getEmployees();
      return (data || []).map(u => ({
        ...u,
        employees: emps.find(e => e.id === u.employee_id)
      }));
    });
  },

  getUserByUsername: async (username: string): Promise<any | null> => {
    return dbService._safeQuery(async () => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('app_users')
        .select('*, employees(*)')
        .eq('username', username.toLowerCase())
        .single();
      if (error) return null;
      return data;
    });
  },

  /** Create or update an app user against the online Supabase registry. */
  createAppUser: async (user: { username: string, password: string, role: UserRole, employee_id?: string }): Promise<{ success: boolean; message?: string }> => {
    if (!supabase) return { success: false, message: 'Supabase is not configured.' };

    const { error } = await supabase.from('app_users').upsert([user], { onConflict: 'username' });
    if (error) {
      console.error('Supabase createAppUser error:', error);
      if (error.code === '23503') {
        return { success: false, message: 'Link Failed: The employee record is missing from the online registry.' };
      }
      if (error.code === '23505') {
        return { success: false, message: 'Conflict: This username is already assigned to another system user.' };
      }
      return { success: false, message: `Database Error: ${error.message}` };
    }
    return { success: true };
  },

  /** Update a user's role in the online Supabase registry. */
  updateAppUserRole: async (id: string, role: UserRole): Promise<{ success: boolean; message?: string }> => {
    if (!supabase) return { success: false, message: 'Supabase is not configured.' };

    const { error } = await supabase.from('app_users').update({ role }).eq('id', id);
    if (error) {
      console.error('Supabase updateAppUserRole error:', error);
      return { success: false, message: `Database Error: ${error.message}` };
    }
    return { success: true };
  },

  deleteAppUser: async (id: string): Promise<{ success: boolean; message?: string }> => {
    if (!id) return { success: false, message: "Invalid User ID provided for revocation." };

    // Robust delete: Check if 'id' is a valid UUID to avoid Supabase parsing errors
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase!.from('app_users').delete();
    if (isUuid) {
      query = query.or(`id.eq.${id},username.eq.${id}`);
    } else {
      query = query.eq('username', id);
    }

    const { error } = await query;
    if (error) {
      console.error("Supabase User Deletion Error:", error);
      return { success: false, message: error.message };
    }

    return { success: true };
  },

  getRolePermissions: async (): Promise<any[]> => {
    return dbService._safeQuery(async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from('role_permissions').select('*');
      if (error) throw error;
      return data || [];
    });
  },

  updateRolePermission: async (role: string, viewId: string, isActive: boolean): Promise<{ success: boolean; message?: string }> => {
    if (!supabase) return { success: false, message: 'Supabase not configured' };

    const { error } = await supabase.from('role_permissions').upsert(
      { role, view_id: viewId, is_active: isActive },
      { onConflict: 'role,view_id' }
    ).select();

    if (error) {
      console.error('updateRolePermission error:', error);
      return { success: false, message: error.message };
    }
    return { success: true };
  },

  getPermissionTemplates: async (): Promise<any[]> => {
    return dbService._safeQuery(async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from('permission_templates').select('*');
      if (error) throw error;
      return data || [];
    });
  },

  applyPermissionTemplate: async (role: string, templatePermissions: Record<string, boolean>): Promise<{ success: boolean; message?: string }> => {
    if (!supabase) return { success: false, message: 'Supabase not configured' };

    const upserts = Object.entries(templatePermissions).map(([view_id, is_active]) => ({
      role,
      view_id,
      is_active
    }));

    const { error } = await supabase.from('role_permissions').upsert(upserts, { onConflict: 'role,view_id' });

    if (error) {
      console.error('applyPermissionTemplate error:', error);
      return { success: false, message: error.message };
    }
    return { success: true };
  },

  /** Always true when the Supabase client is initialised (online-only mode). */
  isLive: () => isSupabaseConfigured && !!supabase,

  async testConnection(): Promise<{ success: boolean; message: string; latency?: number; details?: any }> {
    if (!supabase) return { success: false, message: 'Supabase client not configured.' };
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

    try {
      const { error } = await supabase.from('employees').select('id').limit(1).abortSignal(controller.signal);
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);
      if (error) throw error;
      return { success: true, message: 'Connected to Supabase Live Registry.', latency };
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.warn('Supabase connectivity check failed:', e);
      return { success: false, message: `Network Error: ${e.message}`, details: e };
    }
  },

  /** Supabase-only query – no PGLite fallback. Throws on error so callers can handle it. */
  async _safeQuery<T>(queryFn: () => Promise<T>, _fallback?: T | (() => Promise<T>)): Promise<T> {
    if (!supabase) throw new Error('Supabase is not configured. Cannot execute query.');
    return await queryFn();
  },

  async getGlobalPolicies() {
    return globalPolicies;
  },

  async updateGlobalPolicies(updates: Partial<typeof globalPolicies>) {
    globalPolicies = { ...globalPolicies, ...updates };
    return globalPolicies;
  },

  async getMasterAllowances() {
    return activeAllowances;
  },

  async updateMasterAllowances(list: typeof activeAllowances) {
    activeAllowances = [...list];
  },

  async getWeeklyPermissionUsage(employeeId: string): Promise<number> {
    const { start, end } = getCurrentWeekRange();
    const requests = await this.getLeaveRequests({ employeeId });

    return requests
      .filter(r => r.type === 'ShortPermission' && r.status !== 'Rejected')
      .filter(r => {
        const d = new Date(r.startDate);
        return d >= start && d <= end;
      })
      .reduce((sum, r) => sum + (r.durationHours || 0), 0);
  },

  async getEmployees(): Promise<Employee[]> {
    return this._safeQuery(async () => {
      // Helper to try different table names
      const tryFetch = async (tableName: string, selectStr: string) => {
        try {
          const { data, error } = await supabase!
            .from(tableName)
            .select(selectStr)
            .order('name', { ascending: true });
          if (!error && data) return data;
          return null;
        } catch (e) {
          return null;
        }
      };

      // 1. Try plural 'employees' with joins
      let data = await tryFetch('employees', '*, allowance_rows:employee_allowances(*), leave_balances_rows:leave_balances(*)');

      // 2. Try singular 'employee' with joins
      if (!data) data = await tryFetch('employee', '*, allowance_rows:employee_allowances(*), leave_balances_rows:leave_balances(*)');

      // 3. Try plural 'employees' without joins
      if (!data) data = await tryFetch('employees', '*');

      // 4. Try singular 'employee' without joins
      if (!data) data = await tryFetch('employee', '*');

      if (!data) {
        console.error("Critical: Could not find 'employees' or 'employee' table in Supabase.");
        return [];
      }

      return data.map(mapEmployee);
    });
  },

  async getEmployeeByName(name: string): Promise<Employee | undefined> {
    const employees = await this.getEmployees();
    return employees.find(e => e.name.toLowerCase() === name.toLowerCase() || (e.nameArabic && e.nameArabic === name));
  },

  async addEmployee(employee: Omit<Employee, 'id'>): Promise<Employee> {
    const dbPayload = {
      name: employee.name,
      name_arabic: employee.nameArabic,
      nationality: employee.nationality,
      civil_id: employee.civilId,
      civil_id_expiry: employee.civilIdExpiry || null,
      department: employee.department,
      department_arabic: employee.departmentArabic,
      position: employee.position,
      position_arabic: employee.positionArabic,
      join_date: employee.joinDate,
      salary: employee.salary,
      status: employee.status,
      work_days_per_week: employee.workDaysPerWeek,
      iban: employee.iban,
      bank_code: employee.bankCode,
      face_token: (employee as any).faceToken || null,
      device_user_id: (employee as any).deviceUserId || null,
      leave_balances: employee.leaveBalances,
      allowances: employee.allowances
    };
    const { data, error } = await supabase!.from('employees').insert([dbPayload]).select().single();
    if (error) throw error;
    const empId = data.id;

    if (employee.allowances?.length) {
      await supabase!.from('employee_allowances').insert(
        employee.allowances.map(a => ({
          employee_id: empId,
          name: a.name,
          name_arabic: a.nameArabic,
          type: a.type,
          value: a.value,
          is_housing: a.isHousing
        }))
      );
    }

    const lb = employee.leaveBalances;
    const yr = new Date().getFullYear();
    await supabase!.from('leave_balances').insert([
      { employee_id: empId, leave_type: 'Annual', entitled_days: lb.annual, used_days: lb.annualUsed, year: yr },
      { employee_id: empId, leave_type: 'Sick', entitled_days: lb.sick, used_days: lb.sickUsed, year: yr },
      { employee_id: empId, leave_type: 'Emergency', entitled_days: lb.emergency, used_days: lb.emergencyUsed, year: yr },
      { employee_id: empId, leave_type: 'ShortPermission', entitled_days: lb.shortPermissionLimit, used_days: lb.shortPermissionUsed, year: yr },
      { employee_id: empId, leave_type: 'Hajj', entitled_days: 1, used_days: lb.hajUsed ? 1 : 0, year: yr },
    ]);

    return mapEmployee(data);
  },

  async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.nameArabic !== undefined) dbUpdates.name_arabic = updates.nameArabic;
    if (updates.nationality !== undefined) dbUpdates.nationality = updates.nationality;
    if (updates.civilId !== undefined) dbUpdates.civil_id = updates.civilId;
    if (updates.civilIdExpiry !== undefined) dbUpdates.civil_id_expiry = updates.civilIdExpiry;
    if (updates.department !== undefined) dbUpdates.department = updates.department;
    if (updates.departmentArabic !== undefined) dbUpdates.department_arabic = updates.departmentArabic;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.positionArabic !== undefined) dbUpdates.position_arabic = updates.positionArabic;
    if (updates.joinDate !== undefined) dbUpdates.join_date = updates.joinDate;
    if (updates.salary !== undefined) dbUpdates.salary = updates.salary;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.leaveBalances !== undefined) dbUpdates.leave_balances = updates.leaveBalances;
    if (updates.trainingHours !== undefined) dbUpdates.training_hours = updates.trainingHours;
    if (updates.workDaysPerWeek !== undefined) dbUpdates.work_days_per_week = updates.workDaysPerWeek;
    if (updates.iban !== undefined) dbUpdates.iban = updates.iban;
    if (updates.bankCode !== undefined) dbUpdates.bank_code = updates.bankCode;
    if (updates.faceToken !== undefined) dbUpdates.face_token = updates.faceToken;
    if (updates.deviceUserId !== undefined) dbUpdates.device_user_id = updates.deviceUserId;
    if (updates.allowances !== undefined) dbUpdates.allowances = updates.allowances;

    const { data, error = null } = await supabase!.from('employees').update(dbUpdates).eq('id', id).select().single();
    if (error) throw error;

    if (updates.leaveBalances !== undefined) {
      const lb = updates.leaveBalances;
      const yr = new Date().getFullYear();
      await supabase!.from('leave_balances').upsert([
        { employee_id: id, leave_type: 'Annual', entitled_days: lb.annual, used_days: lb.annualUsed, year: yr },
        { employee_id: id, leave_type: 'Sick', entitled_days: lb.sick, used_days: lb.sickUsed, year: yr },
        { employee_id: id, leave_type: 'Emergency', entitled_days: lb.emergency, used_days: lb.emergencyUsed, year: yr },
        { employee_id: id, leave_type: 'ShortPermission', entitled_days: lb.shortPermissionLimit, used_days: lb.shortPermissionUsed, year: yr },
        { employee_id: id, leave_type: 'Hajj', entitled_days: 1, used_days: lb.hajUsed ? 1 : 0, year: yr },
      ], { onConflict: 'employee_id,leave_type,year' });
    }

    if (updates.allowances !== undefined) {
      await supabase!.from('employee_allowances').delete().eq('employee_id', id);
      if (updates.allowances.length > 0) {
        await supabase!.from('employee_allowances').insert(
          updates.allowances.map(a => ({
            employee_id: id,
            name: a.name,
            name_arabic: a.nameArabic,
            type: a.type,
            value: a.value,
            is_housing: a.isHousing
          }))
        );
      }
    }

    return mapEmployee(data);
  },

  async getPublicHolidays(): Promise<PublicHoliday[]> {
    return this._safeQuery(async () => {
      const { data } = await supabase!.from('public_holidays').select('*').order('date', { ascending: true });
      if (data) return data.map((h: any) => ({
        ...h,
        nameArabic: h.name_arabic,
        isFixed: h.is_fixed
      }));
      return [];
    });
  },

  async getLeaveRequests(filter?: any): Promise<LeaveRequest[]> {
    return this._safeQuery(async () => {
      // Join leave_history so mapLeaveRequest gets the normalized audit trail
      let query = supabase!.from('leave_requests').select('*, leave_history(*)');
      if (filter?.employeeId) query = query.eq('employee_id', filter.employeeId);
      if (filter?.department) query = query.eq('department', filter.department);
      if (filter?.status) query = query.eq('status', filter.status);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapLeaveRequest);
    });
  },

  async createLeaveRequest(req: Omit<LeaveRequest, 'id'>, user: User): Promise<LeaveRequest> {
    const dbPayload = {
      employee_id: req.employeeId,
      employee_name: req.employeeName,
      department: req.department,
      type: req.type,
      start_date: req.startDate,
      end_date: req.endDate,
      days: req.days,
      duration_hours: req.durationHours,
      reason: req.reason,
      status: req.status,
      manager_id: req.managerId,
      history: req.history
    };
    const { data, error = null } = await supabase!.from('leave_requests').insert([dbPayload]).select().single();
    if (error) throw error;
    return mapLeaveRequest(data);
  },

  async updateLeaveRequestStatus(id: string, status: LeaveRequest['status'], user: User, note?: string): Promise<LeaveRequest> {
    const now = new Date().toISOString();

    // Write to normalized leave_history table
    await supabase!.from('leave_history').insert({
      leave_request_id: id,
      actor_name: user.name,
      actor_role: user.role,
      action: `Status changed to ${status}`,
      note: note || null,
      created_at: now
    });

    // Also keep the JSONB history column in sync (transition period)
    const { data: current } = await supabase!.from('leave_requests').select('history').eq('id', id).single();
    const legacyEntry = { user: user.name, role: user.role, action: `Status changed to ${status}`, timestamp: now, note };
    const newHistory = [...(current?.history || []), legacyEntry];

    const { data, error = null } = await supabase!
      .from('leave_requests')
      .update({ status, history: newHistory })
      .eq('id', id)
      .select('*, leave_history(*)')
      .single();
    if (error) throw error;
    return mapLeaveRequest(data);
  },

  async finalizeHRApproval(id: string, user: User, finalizedDays: number): Promise<void> {
    await this.updateLeaveRequestStatus(id, 'HR_Finalized', user, `Finalized with ${finalizedDays} days.`);
    // Balance recalculation is handled by the DB trigger trg_update_leave_balances
  },

  async getAnnouncements(): Promise<Announcement[]> {
    return this._safeQuery(async () => {
      const { data } = await supabase!.from('announcements').select('*').order('created_at', { ascending: false });
      if (data && data.length > 0) return data.map(a => ({
        ...a,
        title: a.title,
        content: a.content,
        titleArabic: a.title_arabic,
        contentArabic: a.content_arabic,
        createdAt: a.created_at
      }));
      return [];
    });
  },

  async createAnnouncement(ann: Omit<Announcement, 'id' | 'createdAt'>): Promise<Announcement> {
    const newId = gid();
    const now = new Date().toISOString();
    await supabase!.from('announcements').insert([{
      id: newId,
      title: ann.title,
      title_arabic: ann.titleArabic,
      content: ann.content,
      content_arabic: ann.contentArabic,
      priority: ann.priority,
      created_at: now
    }]);
    return { ...ann, id: newId, createdAt: now } as Announcement;
  },

  async deleteAnnouncement(id: string): Promise<void> {
    await supabase!.from('announcements').delete().eq('id', id);
  },

  async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<Announcement> {
    const { data, error } = await supabase!.from('announcements').update({
      title: updates.title,
      content: updates.content,
      title_arabic: updates.titleArabic,
      content_arabic: updates.contentArabic,
      priority: updates.priority
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async getPayrollRuns(): Promise<PayrollRun[]> {
    return this._safeQuery(async () => {
      const { data, error } = await supabase!.from('payroll_runs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapPayrollRun);
    });
  },

  async getPayrollItems(runId: string): Promise<PayrollItem[]> {
    return this._safeQuery(async () => {
      const { data, error } = await supabase!.from('payroll_items').select('*').eq('run_id', runId);
      if (error) throw error;
      return (data || []).map(mapPayrollItem);
    });
  },

  async getLatestFinalizedPayroll(userId: string): Promise<{ item: PayrollItem, run: PayrollRun } | null> {
    const runs = await this.getPayrollRuns();
    const finalizedRuns = runs.filter(r => r.status === 'Finalized');
    if (finalizedRuns.length === 0) return null;

    const latestRun = finalizedRuns[0];
    const items = await this.getPayrollItems(latestRun.id);
    const userItem = items.find(i => i.employeeId === userId);

    if (!userItem) return null;
    return { item: userItem, run: latestRun };
  },

  async exportWPS(runId: string, bankFormat: string): Promise<string> {
    const items = await this.getPayrollItems(runId);
    const employees = await this.getEmployees();

    let csv = "Employee Name,IBAN,Amount,Currency\n";
    items.forEach(item => {
      const emp = employees.find(e => e.id === item.employeeId);
      csv += `"${item.employeeName}","${emp?.iban || ''}",${item.netSalary},KWD\n`;
    });
    return csv;
  },

  async calculateLeavePayout(employeeId: string, leaveStart: string, leaveEnd: string, leaveId?: string) {
    const allEmps = await this.getEmployees();
    const target = allEmps.find(e => e.id === employeeId);
    if (!target) throw new Error("Employee not found");

    let leaveType = 'Annual';
    if (leaveId) {
      const requests = await this.getLeaveRequests();
      const req = requests.find(r => r.id === leaveId);
      if (req) leaveType = req.type;
    }

    const start = new Date(leaveStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(leaveEnd);
    end.setHours(0, 0, 0, 0);
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    // Bucket 1: Pre-leave Work Days (Excluding Fridays)
    let preLeaveDays = 0;
    let preCurr = new Date(monthStart);
    while (preCurr < start) {
      if (preCurr.getDay() !== 5) preLeaveDays++;
      preCurr.setDate(preCurr.getDate() + 1);
    }

    const basic = target.salary;
    let allowancesTotal = 0;
    let housingAllowance = 0;
    let nonHousingAllowancesTotal = 0;

    target.allowances.forEach(a => {
      const val = a.type === 'Fixed' ? Number(a.value) : (basic * (Number(a.value) / 100));
      allowancesTotal += val;
      if (a.isHousing) {
        housingAllowance += val;
      } else {
        nonHousingAllowancesTotal += val;
      }
    });

    const fullGrossParams = basic + housingAllowance + nonHousingAllowancesTotal;
    const dailyGrossFull = fullGrossParams / 26;
    const dailyBasePlusHousing = (basic + housingAllowance) / 26;

    const pifssRate = 0.115;
    const pifssAmount = target.nationality === 'Kuwaiti' ? (basic * pifssRate) : 0;

    // Bucket 1 Pay: Work days * Full Gross
    const workPay = preLeaveDays * dailyGrossFull;

    // Bucket 2: Leave Duration Breakdown (Minus Fridays)
    const leaveDurationRaw = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const fridays = countFridays(start, end);
    const payableLeaveDays = Math.max(0, leaveDurationRaw - fridays);

    let sickLeaveDeduction = 0;
    let leavePay = 0;
    let excludedAllowanceDeduction = 0;
    let daysInStartMonth = 0;
    let daysInNextMonth = 0;
    let leavePayStartMonth = 0;
    let leavePayNextMonth = 0;

    let curr = new Date(start);
    let payableDayIndex = 0;
    const pastSickDays = target.leaveBalances?.sickUsed || 0;
    const startMonth = start.getMonth();

    while (curr <= end) {
      if (curr.getDay() !== 5) {
        let dailyPay = 0;

        if (leaveType === 'Sick') {
          const sickDayNumber = pastSickDays + payableDayIndex + 1;
          let deductionFactor = 0;
          if (sickDayNumber <= 15) deductionFactor = 0;
          else if (sickDayNumber <= 30) deductionFactor = 0.25;
          else if (sickDayNumber <= 45) deductionFactor = 0.75;
          else deductionFactor = 1.0;

          // Sick segment deducts from the base + housing bucket
          const dailySickDeduct = dailyBasePlusHousing * deductionFactor;
          dailyPay = dailyBasePlusHousing - dailySickDeduct;
          sickLeaveDeduction += dailySickDeduct;
        } else {
          // Ordinary leaves (Annual, etc) just use Base + Housing directly
          dailyPay = dailyBasePlusHousing;
        }

        // Calculate excluded non-housing allowances for this day
        excludedAllowanceDeduction += (dailyGrossFull - dailyBasePlusHousing);

        if (curr.getMonth() === startMonth) {
          daysInStartMonth++;
          leavePayStartMonth += dailyPay;
        } else {
          daysInNextMonth++;
          leavePayNextMonth += dailyPay;
        }

        leavePay += dailyPay;
        payableDayIndex++;
      }
      curr.setDate(curr.getDate() + 1);
    }

    const isStraddle = end.getMonth() !== start.getMonth();
    const isShort = leaveDurationRaw <= 7 && !isStraddle;

    const total = Math.max(0, workPay + leavePay - pifssAmount);

    return {
      leaveType,
      workDays: preLeaveDays,
      workPay: workPay,
      pifssDeducted: pifssAmount,
      leaveDays: leaveDurationRaw,
      payableLeaveDays,
      fridaysExcluded: fridays,
      daysInStartMonth,
      leavePayStartMonth,
      daysInNextMonth,
      leavePayNextMonth,
      excludedAllowanceDeduction,
      leavePay,
      sickLeaveDeduction,
      total,
      dailyGross: dailyGrossFull,
      dailyBasicPlusHousing: dailyBasePlusHousing,
      isStraddle,
      isShort,
      processingPath: isShort ? 'Monthly_Normal' : 'Hub_Payout'
    };
  },

  async generateLeaveRun(leaveRequestId: string, user: User): Promise<PayrollRun> {
    const leaves = await this.getLeaveRequests();
    const targetLeave = leaves.find(l => l.id === leaveRequestId);
    if (!targetLeave) throw new Error("Leave Request not found");

    const calculation = await this.calculateLeavePayout(targetLeave.employeeId, targetLeave.startDate, targetLeave.endDate, targetLeave.id);
    const allEmps = await this.getEmployees();
    const targetEmp = allEmps.find(e => e.id === targetLeave.employeeId)!;

    const runId = gid();
    const periodKey = `LR-${targetEmp.name.split(' ')[0].toUpperCase()}-${targetLeave.startDate}`;

    const item: any = {
      id: gid(),
      run_id: runId,
      employee_id: targetEmp.id,
      employee_name: targetEmp.name,
      basic_salary: 0, // In Leave Run, basic is replaced by specific leave pay
      housing_allowance: 0,
      other_allowances: calculation.workPay,
      leave_deductions: 0,
      sick_leave_pay: targetLeave.type === 'Sick' ? calculation.leavePay : 0,
      annual_leave_pay: (targetLeave.type !== 'Sick' && targetLeave.type !== 'Hajj') ? calculation.leavePay : 0,
      short_permission_deductions: 0,
      pifss_deduction: calculation.pifssDeducted,
      pifss_employer_share: 0,
      indemnity_accrual: 0,
      net_salary: calculation.total,
      verified_by_hr: true,
      variance: 0,
      allowance_breakdown: [
        { name: `Work Days Analysis (${calculation.workDays}d @ ${calculation.dailyGross.toFixed(3)})`, value: calculation.workPay },
        { name: `Leave Settlement (${calculation.payableLeaveDays}d)`, value: calculation.leavePay }
      ],
      deduction_breakdown: [
        { name: 'PIFSS Social Security Contribution', value: calculation.pifssDeducted },
        { name: `Fridays Excluded (${calculation.fridaysExcluded})`, value: 0 },
        { name: `Leave Non-Housing Allowance Exclusion (${calculation.payableLeaveDays}d)`, value: calculation.excludedAllowanceDeduction },
        { name: `Sick Leave Statutory Segment Deduction`, value: calculation.sickLeaveDeduction }
      ].filter(d => d.value > 0 || d.name.includes('Excluded'))
    };

    const run = {
      id: runId,
      period_key: periodKey,
      cycle_type: 'Leave_Run',
      status: 'Finalized',
      total_disbursement: calculation.total,
      created_at: new Date().toISOString(),
      locked_start: targetLeave.startDate,
      locked_end: targetLeave.endDate,
      target_leave_id: targetLeave.id
    };

    await supabase!.from('payroll_runs').insert([run]);
    await supabase!.from('payroll_items').insert([item]);

    // Auto-finalize balances if skipped by fast-track Hub payout
    if (targetLeave.status !== 'HR_Finalized') {
      await this.finalizeHRApproval(targetLeave.id, user, targetLeave.days || 0);
    }

    // FIX: Ensure status matches the database check constraint ('Paid')
    await this.updateLeaveRequestStatus(targetLeave.id, 'Paid', user, "Settled via Hub Displacement.");

    return mapPayrollRun(run);
  },

  async pushLeaveToPayroll(leaveRequestId: string, user: User): Promise<void> {
    const leaves = await this.getLeaveRequests();
    const targetLeave = leaves.find(l => l.id === leaveRequestId);
    if (!targetLeave) throw new Error("Leave Request not found");

    // Auto-finalize balances if skipped by fast-track Hub push
    if (targetLeave.status !== 'HR_Finalized') {
      await this.finalizeHRApproval(targetLeave.id, user, targetLeave.days || 0);
    }

    await this.updateLeaveRequestStatus(leaveRequestId, 'Pushed_To_Payroll', user, "Leave settlement deferred to standard monthly cycle.");
  },

  async generatePayrollDraft(periodKey: string, cycle: 'Monthly' | 'Bi-Weekly'): Promise<PayrollRun> {
    const employees = await this.getEmployees();
    const allFinalizedLeaves = await this.getLeaveRequests();
    const allRuns = await this.getPayrollRuns();

    // Get all finalized leave runs to check for HUB-SETTLED employees
    const hubSettledRuns = allRuns.filter(r => r.cycleType === 'Leave_Run' && r.status === 'Finalized');

    // Pre-fetch all payload items belonging to these historical Hub runs
    let allHubItems: PayrollItem[] = [];
    const hubRunIds = hubSettledRuns.map(r => r.id);
    if (hubRunIds.length > 0) {
      const { data } = await supabase!.from('payroll_items').select('*').in('run_id', hubRunIds);
      allHubItems = (data || []).map(mapPayrollItem);
    }

    // Fetch pending approved variable compensation
    let variableComp: any[] = [];
    const { data: vcData } = await supabase!.from('variable_compensation')
      .select('*')
      .eq('status', 'APPROVED_FOR_PAYROLL')
      .is('payroll_run_id', null);
    if (vcData) variableComp = vcData;

    await supabase!.from('payroll_runs').delete().eq('period_key', periodKey).eq('status', 'Draft');

    const runId = gid();
    const [year, month] = periodKey.split('-').map(Number);

    const dbItems: any[] = employees.map(emp => {
      // RULE 1: Detect if 'Current Month Hub' exists (Hub run starting THIS month)
      const currentMonthHub = hubSettledRuns.find((hr: any) => {
        let leaf = allFinalizedLeaves.find(l => l.id === hr.target_leave_id);
        if (!leaf) {
          const potentialDate = hr.periodKey ? hr.periodKey.split('-').slice(2).join('-') : null;
          leaf = allFinalizedLeaves.find(l => l.employeeId === emp.id && l.startDate === potentialDate);
        }
        const itemEmployeeId = leaf?.employeeId;
        const dStr = hr.locked_start || leaf?.startDate;
        const d = dStr ? new Date(dStr) : null;
        return itemEmployeeId === emp.id && d && d.getMonth() + 1 === month && d.getFullYear() === year;
      });

      // RULE 2: Detect if 'Forward Offset' exists from PREVIOUS month Hub (Straddle)
      const forwardOffsetHub = hubSettledRuns.find((hr: any) => {
        let leaf = allFinalizedLeaves.find(l => l.id === hr.target_leave_id);
        if (!leaf) {
          const potentialDate = hr.periodKey ? hr.periodKey.split('-').slice(2).join('-') : null;
          leaf = allFinalizedLeaves.find(l => l.employeeId === emp.id && l.startDate === potentialDate);
        }
        const itemEmployeeId = leaf?.employeeId;
        const dEndStr = hr.locked_end || leaf?.endDate;
        const dStartStr = hr.locked_start || leaf?.startDate;

        const dEnd = dEndStr ? new Date(dEndStr) : null;
        const dStart = dStartStr ? new Date(dStartStr) : null;

        return itemEmployeeId === emp.id && dEnd && dEnd.getMonth() + 1 === month && dEnd.getFullYear() === year &&
          dStart && dStart.getMonth() + 1 !== month;
      });

      const basic = Number(emp.salary) || 0;
      const allowances = emp.allowances || [];
      let housingAmount = 0;
      let otherAllowancesTotal = 0;

      const allowanceBreakdown: BreakdownItem[] = [];
      allowances.forEach(a => {
        const val = a.type === 'Fixed' ? Number(a.value) : (basic * (Number(a.value) / 100));
        allowanceBreakdown.push({ name: a.name, nameArabic: a.nameArabic, value: val });
        if (a.isHousing) housingAmount += val; else otherAllowancesTotal += val;
      });

      // Inject Variable Compensation (Bonus/OT)
      const empVarComp = variableComp.filter(vc => vc.employee_id === emp.id);
      empVarComp.forEach(vc => {
        const val = Number(vc.amount);
        allowanceBreakdown.push({ name: `VARIABLE COMP (${vc.sub_type.replace('_', ' ')})`, nameArabic: 'مكافأة إضافية', value: val });
        otherAllowancesTotal += val;
      });

      let pifssPaidInHub = !!currentMonthHub;

      const fullGrossParams = basic + housingAmount + otherAllowancesTotal;
      const dailyGrossFull = fullGrossParams / 26;
      const dailyBasePlusHousing = (basic + housingAmount) / 26;

      let pifssDeduction = emp.nationality === 'Kuwaiti' ? basic * 0.115 : 0;
      if (pifssPaidInHub) {
        pifssDeduction = 0;
      }
      const pifssEmployerShare = emp.nationality === 'Kuwaiti' ? basic * 0.125 : 0;
      const indemnityAccrual = emp.nationality !== 'Kuwaiti' ? (basic / 24) : 0; // 15 days per year accrual

      const deductionBreakdown: BreakdownItem[] = [];
      let totalExplicitHubDeduction = 0;

      if (currentMonthHub || forwardOffsetHub) {
        const activeHub = currentMonthHub || forwardOffsetHub;

        let dEndStr = activeHub.locked_end;
        if (!dEndStr) {
          const possibleDate = activeHub.periodKey ? activeHub.periodKey.split('-').slice(2).join('-') : null;
          const oldLeaf = allFinalizedLeaves.find(l => l.employeeId === emp.id && l.startDate === possibleDate);
          if (oldLeaf) dEndStr = oldLeaf.endDate;
        }

        const dEnd = new Date(dEndStr as string);
        dEnd.setHours(23, 59, 59, 999);
        const monthEnd = new Date(year, month, 0);
        monthEnd.setHours(23, 59, 59, 999);

        let daysRemaining = 0;
        let cDate = new Date(dEnd);
        cDate.setDate(cDate.getDate() + 1);
        cDate.setHours(12, 0, 0, 0);

        while (cDate.getTime() <= monthEnd.getTime()) {
          if (cDate.getDay() !== 5) daysRemaining++;
          cDate.setDate(cDate.getDate() + 1);
        }

        const bucket3Pay = daysRemaining * dailyGrossFull;

        // Offset so they effectively get Bucket 3 pay
        totalExplicitHubDeduction = Math.max(0, fullGrossParams - bucket3Pay);

        if (totalExplicitHubDeduction > 0) {
          deductionBreakdown.push({ name: `Hub Payout Offset (Bucket 3: ${daysRemaining} workdays remaining)`, value: totalExplicitHubDeduction });
        }
      }

      // Consolidate non-Hub-settled leaves (Deferred to Monthly Payroll)
      // Including historically "Short" leaves OR any leaf specifically pushed to payroll
      const deferredLeaves = allFinalizedLeaves.filter(l =>
        l.employeeId === emp.id && (l.status === 'HR_Finalized' || l.status === 'Paid' || l.status === 'Pushed_To_Payroll') &&
        !hubSettledRuns.find((hr: any) => hr.target_leave_id === l.id && hr.status === 'Finalized') &&
        (
          (new Date(l.startDate).getFullYear() === year && new Date(l.startDate).getMonth() + 1 === month) ||
          (new Date(l.endDate).getFullYear() === year && new Date(l.endDate).getMonth() + 1 === month)
        )
      );

      let totalShortLeaveDeduction = 0;
      let sickLeavePayTotal = 0;
      let annualLeavePayTotal = 0;
      let leaveDaysTotalStandardPay = 0;

      deferredLeaves.forEach(l => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);

        // Straddle constraint: For the CURRENT payroll month, only deduct days that actually fall in this month.
        const activeMonthStart = new Date(year, month - 1, 1);
        const activeMonthEnd = new Date(year, month, 0);

        const effectiveStart = start < activeMonthStart ? activeMonthStart : start;
        const effectiveEnd = end > activeMonthEnd ? activeMonthEnd : end;

        // If the leave doesn't touch this month at all after boundaries are applied, ignore
        if (effectiveStart > effectiveEnd) return;

        const effectiveFridays = countFridays(effectiveStart, effectiveEnd);
        const effectiveDuration = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const payableLeaveDays = Math.max(0, effectiveDuration - effectiveFridays);

        let leavePay = 0;

        if (l.type === 'Sick') {
          const pastSickDays = emp.leaveBalances?.sickUsed || 0;
          let curr = new Date(effectiveStart);
          let payableDayIndex = 0;
          while (curr <= effectiveEnd) {
            if (curr.getDay() !== 5) {
              const sickDayNumber = pastSickDays + payableDayIndex + 1;
              let deductionFactor = 0;
              if (sickDayNumber <= 15) deductionFactor = 0;
              else if (sickDayNumber <= 30) deductionFactor = 0.25;
              else if (sickDayNumber <= 45) deductionFactor = 0.75;
              else deductionFactor = 1.0;

              const dailySickDeduct = dailyBasePlusHousing * deductionFactor;
              leavePay += (dailyBasePlusHousing - dailySickDeduct);
              payableDayIndex++;
            }
            curr.setDate(curr.getDate() + 1);
          }
        } else {
          leavePay = payableLeaveDays * dailyBasePlusHousing;
        }

        const standardPayForTheseDays = payableLeaveDays * dailyGrossFull;
        const lossFromTakingLeave = standardPayForTheseDays - leavePay;
        totalShortLeaveDeduction += lossFromTakingLeave;

        // Track for accounting split (Pooled vs Sick)
        leaveDaysTotalStandardPay += standardPayForTheseDays;
        if (l.type === 'Sick') {
          sickLeavePayTotal += leavePay;
        } else if (l.type !== 'Hajj') {
          // All other types (Emergency, Maternity, Annual etc.) pool into annual_leave_pay
          // This aligns with the "most types deduct from annual" policy
          annualLeavePayTotal += leavePay;
        }
      });

      if (totalShortLeaveDeduction > 0) {
        deductionBreakdown.push({ name: 'Short Leave Math Adjustment (Allowances Excluded)', value: totalShortLeaveDeduction });
      }

      if (pifssDeduction > 0) deductionBreakdown.push({ name: 'PIFSS Filing (11.5%)', value: pifssDeduction });

      const totalDeductions = pifssDeduction + totalShortLeaveDeduction + totalExplicitHubDeduction;
      const net = Math.max(0, fullGrossParams - totalDeductions);

      return {
        id: gid(), run_id: runId, employee_id: emp.id, employee_name: emp.name,
        basic_salary: Math.max(0, basic - leaveDaysTotalStandardPay), // Reclassify leave portion
        housing_allowance: housingAmount,
        other_allowances: otherAllowancesTotal,
        leave_deductions: totalShortLeaveDeduction,
        sick_leave_pay: sickLeavePayTotal,
        annual_leave_pay: annualLeavePayTotal,
        short_permission_deductions: 0,
        pifss_deduction: pifssDeduction,
        pifss_employer_share: pifssEmployerShare,
        indemnity_accrual: indemnityAccrual,
        net_salary: net,
        verified_by_hr: false, variance: 0,
        allowance_breakdown: allowanceBreakdown,
        deduction_breakdown: deductionBreakdown
      };
    });

    const dbRun = {
      id: runId, period_key: periodKey, cycle_type: cycle, status: 'Draft',
      total_disbursement: dbItems.reduce((acc, curr) => acc + curr.net_salary, 0), created_at: new Date().toISOString()
    };

    await supabase!.from('payroll_runs').insert([dbRun]);
    await supabase!.from('payroll_items').insert(dbItems.map(i => ({
      run_id: i.run_id,
      employee_id: i.employee_id,
      employee_name: i.employee_name,
      basic_salary: i.basic_salary,
      housing_allowance: i.housing_allowance,
      other_allowances: i.other_allowances,
      leave_deductions: i.leave_deductions,
      sick_leave_pay: i.sick_leave_pay,
      annual_leave_pay: i.annual_leave_pay,
      short_permission_deductions: i.short_permission_deductions,
      pifss_deduction: i.pifss_deduction,
      pifss_employer_share: i.pifss_employer_share,
      indemnity_accrual: (i as any).indemnity_accrual,
      net_salary: i.net_salary,
      verified_by_hr: i.verified_by_hr,
      variance: i.variance,
      allowance_breakdown: i.allowance_breakdown,
      deduction_breakdown: i.deduction_breakdown
    })));
    return mapPayrollRun(dbRun);
  },

  async finalizePayrollRun(runId: string, user: User): Promise<void> {
    const runs = await this.getPayrollRuns();
    const targetRun = runs.find(r => r.id === runId);
    if (!targetRun) throw new Error("Run not found");

    await supabase!.from('payroll_runs').update({ status: 'Finalized' }).eq('id', runId);

    // Also lock in any variable compensation
    await supabase!.from('variable_compensation')
      .update({ status: 'PROCESSED', payroll_run_id: runId })
      .eq('status', 'APPROVED_FOR_PAYROLL')
      .is('payroll_run_id', null);

    // IF Monthly Run: Finalize all Month-End Path leaves associated with this period
    if (targetRun.cycleType === 'Monthly' || targetRun.cycleType === 'Bi-Weekly') {
      const [year, month] = targetRun.periodKey.split('-').map(Number);
      const leaves = await this.getLeaveRequests();
      const consolidatedLeaves = leaves.filter(l =>
        (l.status === 'HR_Finalized' || l.status === 'Pushed_To_Payroll') &&
        new Date(l.startDate).getMonth() + 1 === month
      );

      for (const leaf of consolidatedLeaves) {
        await this.updateLeaveRequestStatus(leaf.id, 'Paid', user, "Settled via Consolidated Monthly Registry.");
      }
    }
  },

  async rollbackPayrollRun(periodKey: string): Promise<{ success: boolean; message: string }> {
    const { data, error } = await supabase!
      .from('payroll_runs')
      .delete()
      .eq('period_key', periodKey)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) return { success: false, message: "No payroll record found for this period." };
    return { success: true, message: "Payroll records purged successfully from live registry." };
  },

  async rollbackLeavePayout(payrollRunId: string, leaveRequestId: string, user: User): Promise<{ success: boolean; message: string }> {
    // Delete any journal entries associated with this run
    await supabase!.from('journal_entries').delete().eq('payroll_run_id', payrollRunId);

    const { data, error } = await supabase!
      .from('payroll_runs')
      .delete()
      .eq('id', payrollRunId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) return { success: false, message: "No run found." };

    // Revert the leave request status back to HR_Finalized so it can be paid again
    await this.updateLeaveRequestStatus(leaveRequestId, 'HR_Finalized', user, "Payout reversed by Admin.");
    return { success: true, message: "Leave payout reversed successfully." };
  },

  async calculateFinalSettlement(employeeId: string, endDate: string, reason: 'Resignation' | 'Termination', unpaidDays: number): Promise<SettlementResult> {
    const emp = await supabase!.from('employees').select('*').eq('id', employeeId).single().then(res => mapEmployee(res.data));
    if (!emp) throw new Error("Employee not found");

    const joinDate = new Date(emp.joinDate);
    const end = new Date(endDate);
    const totalServiceDays = Math.ceil((end.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24)) - unpaidDays;
    const tenureYears = Math.floor(totalServiceDays / 365);
    const tenureMonths = Math.floor((totalServiceDays % 365) / 30);
    const tenureDays = totalServiceDays % 30;

    const basic = Number(emp.salary) || 0;
    let allowancesTotal = 0;
    emp.allowances.forEach(a => {
      allowancesTotal += a.type === 'Fixed' ? Number(a.value) : (basic * (Number(a.value) / 100));
    });
    const remuneration = basic + allowancesTotal;

    const dailyRate = remuneration / 26;

    let firstFiveYearAmount = 0;
    let subsequentYearAmount = 0;
    const yearsOfService = totalServiceDays / 365;

    if (yearsOfService <= 5) {
      firstFiveYearAmount = (yearsOfService * 15) * dailyRate;
    } else {
      firstFiveYearAmount = (5 * 15) * dailyRate;
      subsequentYearAmount = ((yearsOfService - 5) * 30) * dailyRate;
    }

    const rawIndemnityTotal = firstFiveYearAmount + subsequentYearAmount;

    const capValue = remuneration * 18;
    const isCapped = rawIndemnityTotal > capValue;
    const cappedIndemnity = isCapped ? capValue : rawIndemnityTotal;

    let multiplierApplied = 1.0;
    if (reason === 'Resignation') {
      if (yearsOfService < 3) multiplierApplied = 0;
      else if (yearsOfService < 5) multiplierApplied = 0.5;
      else if (yearsOfService < 10) multiplierApplied = 0.6666666666666666;
      else multiplierApplied = 1.0;
    }

    const finalIndemnity = cappedIndemnity * multiplierApplied;

    const leaveDaysEncashed = (emp.leaveBalances.annual - emp.leaveBalances.annualUsed);
    const leavePayout = leaveDaysEncashed * dailyRate;

    return {
      tenureYears, tenureMonths, tenureDays, totalServiceDays,
      remuneration, indemnityAmount: finalIndemnity, leavePayout,
      totalSettlement: finalIndemnity + leavePayout,
      dailyRate,
      breakdown: {
        baseIndemnity: rawIndemnityTotal, multiplierApplied, firstFiveYearAmount, subsequentYearAmount,
        leaveDaysEncashed, isCapped, unpaidDaysDeducted: unpaidDays
      }
    };
  },

  async getAttendanceRecords(filter?: { employeeId: string }): Promise<AttendanceRecord[]> {
    return this._safeQuery(async () => {
      // Primary table is 'attendance', secondary is 'attendance_records'
      let query = supabase!.from('attendance').select('*');
      if (filter?.employeeId) query = query.eq('employee_id', filter.employeeId);

      const { data, error } = await query.order('clock_in', { ascending: false });
      if (error) {
        // Fallback to check_in if clock_in really isn't there (unlikely given the hint)
        const retry = await supabase!.from('attendance').select('*').order('check_in', { ascending: false });
        if (retry.error) throw error;
        return (retry.data || []).map(mapAttendanceRecord);
      }
      return (data || []).map(mapAttendanceRecord);
    });
  },

  async logAttendance(record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> {
    const dbPayload = {
      employee_id: record.employeeId,
      employee_name: record.employeeName,
      clock_in: record.clockIn,
      clock_out: record.clockOut,
      location: record.location,
      status: record.status,
      coordinates: record.coordinates,
      source: record.source,
      device_id: record.deviceId
    };
    const { data, error = null } = await supabase!.from('attendance').insert([dbPayload]).select().single();
    if (error) throw error;
    return mapAttendanceRecord(data);
  },

  async clockOutAttendance(employeeId: string, clockOutTime: string): Promise<void> {
    const { error } = await supabase!.from('attendance_records').update({ check_out: clockOutTime }).eq('employee_id', employeeId).is('check_out', null);
    if (error) throw error;
  },

  async getHardwareConfig(): Promise<HardwareConfig> { return hardwareConfig; },
  async saveHardwareConfig(config: HardwareConfig): Promise<void> { hardwareConfig = { ...config }; },

  async syncHardwareAttendance(): Promise<{ synced: number; errors: number }> {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return { synced: 5, errors: 0 };
  },

  async generateHistoricalAttendance(): Promise<{ generated: number }> {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { generated: 150 };
  },

  async getOfficeLocations(): Promise<OfficeLocation[]> {
    return this._safeQuery(async () => {
      const { data, error } = await supabase!.from('office_locations').select('*');
      if (error) throw error;
      return (data || []).map((l: any) => ({
        ...l,
        nameArabic: l.name_arabic,
        addressArabic: l.address_arabic
      }));
    });
  },

  async updateOfficeLocation(id: string, updates: Partial<OfficeLocation>): Promise<void> {
    const dbUpdates = {
      name: updates.name,
      name_arabic: updates.nameArabic,
      address: updates.address,
      address_arabic: updates.addressArabic,
      lat: updates.lat,
      lng: updates.lng,
      radius: updates.radius
    };
    await supabase!.from('office_locations').update(dbUpdates).eq('id', id);
  },

  async addOfficeLocation(loc: Omit<OfficeLocation, 'id'>): Promise<OfficeLocation> {
    const newId = gid();
    const dbPayload = {
      id: newId,
      name: loc.name,
      name_arabic: loc.nameArabic,
      address: loc.address,
      address_arabic: loc.addressArabic,
      lat: loc.lat,
      lng: loc.lng,
      radius: loc.radius
    };
    const { data, error = null } = await supabase!.from('office_locations').insert([dbPayload]).select().single();
    if (error) throw error;
    return { ...data, nameArabic: data.name_arabic, addressArabic: data.address_arabic };
  },

  async deleteOfficeLocation(id: string): Promise<void> {
    await supabase!.from('office_locations').delete().eq('id', id);
  },

  async addPublicHoliday(h: PublicHoliday): Promise<PublicHoliday> {
    const finalH = h.id ? h : { ...h, id: gid() };
    const dbPayload = {
      id: finalH.id,
      name: h.name,
      name_arabic: h.nameArabic,
      date: h.date,
      type: h.type,
      is_fixed: h.isFixed
    };
    await supabase!.from('public_holidays').insert([dbPayload]).select().single();
    return finalH;
  },

  async deletePublicHoliday(id: string): Promise<void> {
    await supabase!.from('public_holidays').delete().eq('id', id);
  },

  async updatePublicHoliday(id: string, updates: Partial<PublicHoliday>): Promise<PublicHoliday> {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.nameArabic !== undefined) dbUpdates.name_arabic = updates.nameArabic;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.isFixed !== undefined) dbUpdates.is_fixed = updates.isFixed;

    const { data, error } = await supabase!.from('public_holidays').update(dbUpdates).eq('id', id).select().single();
    if (error) throw error;
    return { ...data, nameArabic: data.name_arabic, isFixed: data.is_fixed };
  },

  // ─── Departments (merged from department_metrics + department_configs) ────────

  async getDepartmentMetrics(): Promise<DepartmentMetric[]> {
    return this._safeQuery(async () => {
      // Helper to try different table names
      const tryFetch = async (name: string) => {
        try {
          const { data, error } = await supabase!.from(name).select('*').order('name');
          if (!error && data) return data;
          return null;
        } catch (e) {
          return null;
        }
      };

      // 1. Unified 'departments' table
      let data = await tryFetch('departments');

      // 2. Legacy 'department_metrics'
      if (!data) data = await tryFetch('department_metrics');

      // 3. Singular 'department'
      if (!data) data = await tryFetch('department');

      if (!data) {
        console.warn("No departments table found in Supabase.");
        return [];
      }

      return (data || []).map((m: any) => ({
        name: m.name,
        nameArabic: m.name_arabic,
        kuwaitiCount: m.kuwaiti_count || 0,
        expatCount: m.expat_count || 0,
        targetRatio: Number(m.target_ratio || 0.15)
      }));
    });
  },

  async addDepartmentMetric(m: DepartmentMetric): Promise<DepartmentMetric> {
    const { data, error = null } = await supabase!.from('departments').insert([{
      name: m.name,
      name_arabic: m.nameArabic,
      kuwaiti_count: m.kuwaitiCount,
      expat_count: m.expatCount,
      target_ratio: m.targetRatio
    }]).select().single();
    if (error) throw error;
    return { name: data.name, nameArabic: data.name_arabic, kuwaitiCount: data.kuwaiti_count, expatCount: data.expat_count, targetRatio: data.target_ratio };
  },

  async deleteDepartmentMetric(name: string): Promise<void> {
    await supabase!.from('departments').delete().eq('name', name);
  },

  // ─── Leave Balances (direct access to normalized table) ──────────────────────

  async getLeaveBalances(employeeId: string, year?: number): Promise<LeaveBalances> {
    const yr = year || new Date().getFullYear();
    return this._safeQuery(async () => {
      const { data } = await supabase!
        .from('leave_balances')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('year', yr);
      const byType = (type: string) => (data || []).find((r: any) => r.leave_type === type);
      return {
        annual: Number(byType('Annual')?.entitled_days ?? 30),
        annualUsed: Number(byType('Annual')?.used_days ?? 0),
        sick: Number(byType('Sick')?.entitled_days ?? 15),
        sickUsed: Number(byType('Sick')?.used_days ?? 0),
        emergency: Number(byType('Emergency')?.entitled_days ?? 6),
        emergencyUsed: Number(byType('Emergency')?.used_days ?? 0),
        shortPermissionLimit: Number(byType('ShortPermission')?.entitled_days ?? 2),
        shortPermissionUsed: Number(byType('ShortPermission')?.used_days ?? 0),
        hajUsed: (byType('Hajj')?.used_days ?? 0) >= 1
      };
    });
  },

  // ─── Leave History (direct access to normalized table) ───────────────────────

  async getLeaveHistory(leaveRequestId: string): Promise<LeaveHistoryEntry[]> {
    return this._safeQuery(async () => {
      const { data } = await supabase!
        .from('leave_history')
        .select('*')
        .eq('leave_request_id', leaveRequestId)
        .order('created_at', { ascending: true });
      return (data || []).map((h: any) => ({
        user: h.actor_name,
        role: h.actor_role,
        action: h.action,
        timestamp: h.created_at,
        note: h.note
      }));
    });
  },

  async getNotifications(userId: string): Promise<Notification[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (error) {
        console.warn("Notifications table 404 or access error, skipping.");
        return [];
      }
      return (data || []).map((n: any) => ({
        ...n,
        isRead: n.is_read,
        linkId: n.link_id
      }));
    } catch (e) {
      return [];
    }
  },

  async getAttendanceWorksheet(year: number, month: number): Promise<any[]> {
    const employees = await this.getEmployees();
    const leaves = await this.getLeaveRequests();
    const logs = await this.getAttendanceRecords();
    const holidays = await this.getPublicHolidays();
    const holidayDates = holidays.map(h => h.date);
    const worksheet: any[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (const emp of employees) {
      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month - 1, day);
        const dateStr = dateObj.toISOString().split('T')[0];
        const dayOfWeek = dateObj.getDay();
        const log = logs.find(l => l.employeeId === emp.id && l.date === dateStr);
        const activeLeave = leaves.find(l =>
          l.employeeId === emp.id && ['HR_Approved', 'HR_Finalized', 'Resumed', 'Paid'].includes(l.status) &&
          l.type !== 'ShortPermission' && dateStr >= l.startDate && dateStr <= l.endDate
        );
        let status = 'Absent';
        let subStatus = '';
        if (log) {
          status = log.status || 'On-Site';
          if (activeLeave && activeLeave.status === 'HR_Approved') subStatus = 'Resumption Pending';
        } else {
          if (dayOfWeek === 5) status = 'Weekend';
          else if (dayOfWeek === 6) status = emp.workDaysPerWeek === 5 ? 'Rest Day' : 'Absent';
          else if (holidayDates.includes(dateStr)) status = 'Holiday';
          else if (activeLeave) { status = 'On Leave'; subStatus = activeLeave.type; }
        }
        worksheet.push({ id: `${emp.id}-${dateStr}`, employeeId: emp.id, employeeName: emp.name, date: dateStr, clockIn: log?.clockIn || '--:--', clockOut: log?.clockOut || '--:--', location: log?.location || '--', status, subStatus, workDaysPerWeek: emp.workDaysPerWeek });
      }
    }
    return worksheet;
  },

  async seedDatabase(): Promise<{ success: boolean; error?: string }> {
    try {
      await Promise.all([
        supabase!.from('employees').upsert(MOCK_EMPLOYEES.map(e => ({
          ...e,
          name_arabic: e.nameArabic,
          department_arabic: e.departmentArabic,
          position_arabic: e.positionArabic,
          civil_id: e.civilId,
          civil_id_expiry: e.civilIdExpiry,
          passport_expiry: e.passportExpiry,
          iz_amal_expiry: e.iznAmalExpiry,
          join_date: e.joinDate,
          leave_balances: e.leaveBalances,
          work_days_per_week: e.workDaysPerWeek,
          device_user_id: e.deviceUserId,
          bank_code: e.bankCode,
          iban: e.iban,
          face_token: e.faceToken || null,
          allowances: e.allowances
        }))),
        supabase!.from('public_holidays').upsert(KUWAIT_PUBLIC_HOLIDAYS.map(h => ({ ...h, name_arabic: h.nameArabic, is_fixed: h.isFixed }))),
        supabase!.from('office_locations').upsert(OFFICE_LOCATIONS.map(l => ({
          ...l,
          name_arabic: l.nameArabic,
          address_arabic: l.addressArabic
        }))),
        supabase!.from('departments').upsert(DEPARTMENT_METRICS.map(m => ({ name: m.name, name_arabic: m.nameArabic, kuwaiti_count: m.kuwaitiCount, expat_count: m.expatCount, target_ratio: m.targetRatio })))
      ]);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async getPayrollItemsByEmployee(employeeId: string): Promise<any[]> {
    return this._safeQuery(async () => {
      const { data, error } = await supabase!
        .from('payroll_items')
        .select('*, payroll_runs(*)')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(i => ({
        ...i,
        payrollRun: i.payroll_runs
      }));
    });
  },

  async requestProfileUpdate(employeeId: string, field: string, oldValue: string, newValue: string): Promise<void> {
    const { error } = await supabase!
      .from('profile_change_requests')
      .insert([{
        employee_id: employeeId,
        field_name: field,
        old_value: oldValue,
        new_value: newValue,
        status: 'PENDING'
      }]);
    if (error) throw error;
  },

  async getProfileUpdateRequests(employeeId?: string): Promise<any[]> {
    let query = supabase!.from('profile_change_requests').select('*, employees(name)');
    if (employeeId) query = query.eq('employee_id', employeeId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async approveProfileUpdate(requestId: string, hrId: string): Promise<void> {
    const { data: req, error: fetchErr } = await supabase!
      .from('profile_change_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (fetchErr || !req) throw new Error("Request not found");

    // 1. Update the employee record
    const updates: any = {};
    updates[req.field_name] = req.new_value; // Note: field_name must match DB column name
    await supabase!.from('employees').update(updates).eq('id', req.employee_id);

    // 2. Mark request as APPROVED
    await supabase!
      .from('profile_change_requests')
      .update({ status: 'APPROVED', hr_note: `Approved by ${hrId}` })
      .eq('id', requestId);
  },

  async rejectProfileUpdate(requestId: string, reason: string): Promise<void> {
    await supabase!
      .from('profile_change_requests')
      .update({ status: 'REJECTED', hr_note: reason })
      .eq('id', requestId);
  },

  // ─── Expense Claims Lifecycle ──────────────────────────────────────────────

  async submitExpenseClaim(claim: Omit<ExpenseClaim, 'id' | 'status' | 'createdAt' | 'history'>): Promise<void> {
    const { data: inserted, error } = await supabase!
      .from('expense_claims')
      .insert([{
        employee_id: claim.employeeId,
        merchant: claim.merchant,
        amount: claim.amount,
        entry_date: claim.date,
        category: claim.category,
        receipt_url: claim.receiptUrl,
        status: 'Pending_Manager'
      }])
      .select()
      .single();

    if (error) throw error;

    // Log history
    await supabase!.from('expense_claim_history').insert([{
      claim_id: inserted.id,
      actor_name: claim.employeeName,
      actor_role: 'Employee',
      to_status: 'Pending_Manager',
      note: 'Claim submitted for approval'
    }]);
  },

  async getExpenseClaims(employeeId?: string, status?: ClaimStatus): Promise<ExpenseClaim[]> {
    let query = supabase!.from('expense_claims').select('*, employees(name), expense_claim_history(*)');

    if (employeeId) query = query.eq('employee_id', employeeId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employees?.name || 'Unknown',
      merchant: row.merchant,
      amount: Number(row.amount),
      date: row.entry_date,
      category: row.category,
      receiptUrl: row.receipt_url,
      status: row.status as ClaimStatus,
      note: row.note,
      createdAt: row.created_at,
      history: (row.expense_claim_history || []).map((h: any) => ({
        status: h.to_status,
        actor: h.actor_name,
        timestamp: h.created_at,
        note: h.note
      }))
    }));
  },

  async updateExpenseClaimStatus(claimId: string, actor: User, nextStatus: ClaimStatus, note?: string): Promise<void> {
    const { error: updateErr } = await supabase!
      .from('expense_claims')
      .update({ status: nextStatus, note: note || null })
      .eq('id', claimId);

    if (updateErr) throw updateErr;

    // Log history
    await supabase!.from('expense_claim_history').insert([{
      claim_id: claimId,
      actor_name: actor.name,
      actor_role: actor.role,
      to_status: nextStatus,
      note: note
    }]);

    // Create notification for employee if approved/rejected/paid
    if (['Approved', 'Rejected', 'Paid'].includes(nextStatus)) {
      const { data: claim } = await supabase!.from('expense_claims').select('employee_id, merchant, amount').eq('id', claimId).single();
      if (claim) {
        await supabase!.from('notifications').insert([{
          user_id: claim.employee_id,
          title: `Claim ${nextStatus}`,
          message: `Your claim for ${claim.merchant} (${claim.amount} KWD) is now ${nextStatus.toLowerCase()}.`,
          type: nextStatus === 'Rejected' ? 'urgent' : 'success',
          category: 'expense_claim',
          link_id: claimId
        }]);
      }
    }
  }
};

const getCurrentWeekRange = () => {
  const now = new Date();
  const sun = new Date(now);
  sun.setDate(now.getDate() - now.getDay());
  sun.setHours(0, 0, 0, 0);
  const thu = new Date(sun);
  thu.setDate(sun.getDate() + 4);
  thu.setHours(23, 59, 59, 999);
  return { start: sun, end: thu };
};
