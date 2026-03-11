import { supabase, isSupabaseConfigured, supabaseAdmin } from './supabaseClient.ts';
import { Employee, DepartmentMetric, LeaveRequest, LeaveBalances, Notification, LeaveType, User, UserRole, LeaveHistoryEntry, PayrollRun, PayrollItem, SettlementResult, PublicHoliday, AttendanceRecord, OfficeLocation, HardwareConfig, Allowance, Announcement, BreakdownItem, ClaimStatus, ExpenseClaim, KPITemplate, EmployeeEvaluation, ProfitBonusPool, EmployeeBonusAllocation } from '../types/types';
import { DEPARTMENT_METRICS, KUWAIT_PUBLIC_HOLIDAYS, OFFICE_LOCATIONS, STANDARD_ALLOWANCE_NAMES } from '../constants.tsx';

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

const getCurrentWeekRange = () => {
  const now = new Date();
  const sun = new Date(now);
  sun.setDate(now.getDate() - now.getDay());
  sun.setHours(0, 0, 0, 0);
  const thu = new Date(sun);
  thu.setDate(sun.getDate() + 4);
  thu.setHours(23, 59, 59, 999);
  return {
    start: sun, end: thu
  };
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

    // Structured Name Mapping
    title: data.title,
    firstName: data.first_name,
    secondName: data.second_name,
    thirdName: data.third_name,
    fourthName: data.fourth_name,
    familyName: data.family_name,

    titleAr: data.title_ar,
    firstNameAr: data.first_name_ar,
    secondNameAr: data.second_name_ar,
    thirdNameAr: data.third_name_ar,
    fourthNameAr: data.fourth_name_ar,
    familyNameAr: data.family_name_ar,

    civilId: data.civil_id,
    civilIdExpiry: data.civil_id_expiry,
    email: data.email,
    pifssNumber: data.pifss_number,
    passportNumber: data.passport_number,
    passportExpiry: data.passport_expiry,
    iznAmalExpiry: data.iz_amal_expiry,
    positionArabic: data.position_arabic,
    departmentArabic: data.department_arabic,
    phone: data.phone,
    emergencyContact: data.emergency_contact,
    pifssStatus: data.pifss_status,
    joinDate: data.join_date,
    leaveBalances: resolvedLeaveBalances,
    trainingHours: data.training_hours || 0,
    workDaysPerWeek: data.work_days_per_week || 6,
    bankCode: data.bank_code,
    salary: Number(data.salary || 0),
    managerId: data.manager_id || data.managerId,
    managerName: data.manager_name || data.managerName,
    allowances: resolvedAllowances,
    role: data.role || 'Employee',
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
  overtimeAmount: Number(data.overtime_amount || 0),
  leaveDeductions: Number(data.leave_deductions || 0),
  sickLeavePay: Number(data.sick_leave_pay || 0),
  annualLeavePay: Number(data.annual_leave_pay || 0),
  performanceBonus: Number(data.performance_bonus || 0),
  companyBonus: Number(data.company_bonus || 0),
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
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const isHoliday = holidays.includes(dateStr);

    // Under Kuwait Labor Law, Annual Leave consumes calendar days (including weekends),
    // but official holidays falling during the leave are not counted (not deducted from balance).
    if (!isHoliday) {
      total++;
    }
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
    return dbService._safeQuery(async (client) => {
      const { data, error } = await client.from('app_users').select('*');
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
    return dbService._safeQuery(async (client) => {
      const { data, error } = await client
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
    if (!supabase) return {
      success: false, message: 'Supabase is not configured.'
    };

    const { error } = await supabase.from('app_users').upsert([user], { onConflict: 'username' });
    if (error) {
      console.error('Supabase createAppUser error:', error);
      if (error.code === '23503') {
        return {
          success: false, message: 'Link Failed: The employee record is missing from the online registry.'
        };
      }
      if (error.code === '23505') {
        return {
          success: false, message: 'Conflict: This username is already assigned to another system user.'
        };
      }
      return {
        success: false, message: `Database Error: ${error.message}`
      };
    }

    // Synchronize role with the employees table if linked
    if (user.employee_id) {
      const { error: empError } = await supabase.from('employees').update({ role: user.role }).eq('id', user.employee_id);
      if (empError) {
        console.error('Error syncing role to employees table during app user creation:', empError);
      }
    }

    return {
      success: true
    };
  },

  /** Update a user's role in the online Supabase registry and synchronize with the employee record. */
  updateAppUserRole: async (id: string, role: UserRole): Promise<{ success: boolean; message?: string }> => {
    if (!supabase) return {
      success: false, message: 'Supabase is not configured.'
    };

    // 1. Get the employee_id linked to this user first
    const { data: userData, error: fetchError } = await supabase.from('app_users').select('employee_id').eq('id', id).single();
    if (fetchError) {
      console.error('Error fetching user for role sync:', fetchError);
    }

    // 2. Update the app_users table
    const { error } = await supabase.from('app_users').update({ role }).eq('id', id);
    if (error) {
      console.error('Supabase updateAppUserRole error:', error);
      return {
        success: false, message: `Database Error: ${error.message}`
      };
    }

    // 3. Synchronize with the employees table if linked
    if (userData?.employee_id) {
      const { error: empError } = await supabase.from('employees').update({ role }).eq('id', userData.employee_id);
      if (empError) {
        console.error('Error syncing role to employees table:', empError);
      }
    }

    return {
      success: true
    };
  },

  deleteAppUser: async (id: string): Promise<{ success: boolean; message?: string }> => {
    if (!id) return {
      success: false, message: "Invalid User ID provided for revocation."
    };

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
      return {
        success: false, message: error.message
      };
    }

    return {
      success: true
    };
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
    if (!supabase) return {
      success: false, message: 'Supabase not configured'
    };

    const { error } = await supabase.from('role_permissions').upsert(
      { role, view_id: viewId, is_active: isActive },
      { onConflict: 'role,view_id' }
    ).select();

    if (error) {
      console.error('updateRolePermission error:', error);
      return {
        success: false, message: error.message
      };
    }
    return {
      success: true
    };
  },

  getPermissionTemplates: async (): Promise<any[]> => {
    return dbService._safeQuery(async (client) => {
      const { data, error } = await client.from('permission_templates').select('*');
      if (error) throw error;
      return data || [];
    });
  },

  applyPermissionTemplate: async (role: string, templatePermissions: Record<string, boolean>): Promise<{ success: boolean; message?: string }> => {
    if (!supabase) return {
      success: false, message: 'Supabase not configured'
    };

    const upserts = Object.entries(templatePermissions).map(([view_id, is_active]) => ({
      role,
      view_id,
      is_active
    }));

    const { error } = await supabase.from('role_permissions').upsert(upserts, { onConflict: 'role,view_id' });

    if (error) {
      console.error('applyPermissionTemplate error:', error);
      return {
        success: false, message: error.message
      };
    }
    return {
      success: true
    };
  },

  /** Always true when the Supabase client is initialised (online-only mode). */
  isLive: () => isSupabaseConfigured && !!supabase,

  async testConnection(): Promise<{ success: boolean; message: string; latency?: number; details?: any }> {
    if (!supabase) return {
      success: false, message: 'Supabase client not configured.'
    };
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

    try {
      const { error } = await supabase.from('employees').select('id').limit(1).abortSignal(controller.signal);
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);
      if (error) throw error;
      return {
        success: true, message: 'Connected to Supabase Live Registry.', latency
      };
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.warn('Supabase connectivity check failed:', e);
      return {
        success: false, message: `Network Error: ${e.message}`, details: e
      };
    }
  },

  async _safeQuery<T>(queryFn: (client: typeof supabase) => Promise<T>, _fallback?: T | (() => Promise<T>)): Promise<T> {
    if (!supabase) throw new Error('Supabase is not configured. Cannot execute query.');

    try {
      return await queryFn(supabase);
    } catch (e: any) {
      const isAuthError = e.code === '401' || e.code === '42501' || e.message?.includes('JWT');
      if (isAuthError && supabaseAdmin) {
        console.warn(`[Supabase] RLS/Auth Block detected. Attempting bypass with Admin client.`);
        try {
          return await queryFn(supabaseAdmin as any);
        } catch (adminErr: any) {
          console.error(`[Supabase] Admin bypass failed:`, adminErr);
          // If adminErr has a code or message, log it clearly
          if (adminErr.message) console.error(`[Supabase] Admin Error Message:`, adminErr.message);
          if (adminErr.code) console.error(`[Supabase] Admin Error Code:`, adminErr.code);
          throw e; // Throw original error if admin also fails
        }
      }
      throw e;
    }
  },

  async getGlobalPolicies() {
    return globalPolicies;
  },

  async updateGlobalPolicies(updates: Partial<typeof globalPolicies>) {
    globalPolicies = {
      ...globalPolicies, ...updates
    };
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
    return this._safeQuery(async (client) => {
      // Helper to try different table names
      const tryFetch = async (tableName: string, selectStr: string) => {
        try {
          const { data, error } = await client
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
      name: employee.name || `${employee.title || ''} ${employee.firstName || ''} ${employee.familyName || ''}`.trim(),
      name_arabic: employee.nameArabic || `${employee.titleAr || ''} ${employee.firstNameAr || ''} ${employee.familyNameAr || ''}`.trim(),

      title: employee.title,
      first_name: employee.firstName,
      second_name: employee.secondName,
      third_name: employee.thirdName,
      fourth_name: employee.fourthName,
      family_name: employee.familyName,

      title_ar: employee.titleAr,
      first_name_ar: employee.firstNameAr,
      second_name_ar: employee.secondNameAr,
      third_name_ar: employee.thirdNameAr,
      fourth_name_ar: employee.fourthNameAr,
      family_name_ar: employee.familyNameAr,

      nationality: employee.nationality,
      email: employee.email,
      civil_id: employee.civilId,
      civil_id_expiry: employee.civilIdExpiry || null,
      department: employee.department,
      department_arabic: employee.departmentArabic,
      phone: employee.phone,
      emergency_contact: employee.emergencyContact,
      pifss_status: employee.pifssStatus,
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
      role: employee.role,
      leave_balances: employee.leaveBalances,
      allowances: employee.allowances,
      manager_id: employee.managerId || null,
      manager_name: employee.managerName || null
    };

    return dbService._safeQuery(async (client) => {
      const { data, error } = await client.from('employees').insert([dbPayload]).select().single();
      if (error) throw error;
      const empId = data.id;

      if (employee.allowances?.length) {
        await client.from('employee_allowances').insert(
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
      await client.from('leave_balances').insert([
        { employee_id: empId, leave_type: 'Annual', entitled_days: lb.annual, used_days: lb.annualUsed, year: yr },
        { employee_id: empId, leave_type: 'Sick', entitled_days: lb.sick, used_days: lb.sickUsed, year: yr },
        { employee_id: empId, leave_type: 'Emergency', entitled_days: lb.emergency, used_days: lb.emergencyUsed, year: yr },
        { employee_id: empId, leave_type: 'ShortPermission', entitled_days: lb.shortPermissionLimit, used_days: lb.shortPermissionUsed, year: yr },
        { employee_id: empId, leave_type: 'Hajj', entitled_days: 1, used_days: lb.hajUsed ? 1 : 0, year: yr },
      ]);

      return mapEmployee(data);
    });
  },

  async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.nameArabic !== undefined) dbUpdates.name_arabic = updates.nameArabic;

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
    if (updates.secondName !== undefined) dbUpdates.second_name = updates.secondName;
    if (updates.thirdName !== undefined) dbUpdates.third_name = updates.thirdName;
    if (updates.fourthName !== undefined) dbUpdates.fourth_name = updates.fourthName;
    if (updates.familyName !== undefined) dbUpdates.family_name = updates.familyName;

    if (updates.titleAr !== undefined) dbUpdates.title_ar = updates.titleAr;
    if (updates.firstNameAr !== undefined) dbUpdates.first_name_ar = updates.firstNameAr;
    if (updates.secondNameAr !== undefined) dbUpdates.second_name_ar = updates.secondNameAr;
    if (updates.thirdNameAr !== undefined) dbUpdates.third_name_ar = updates.thirdNameAr;
    if (updates.fourthNameAr !== undefined) dbUpdates.fourth_name_ar = updates.fourthNameAr;
    if (updates.familyNameAr !== undefined) dbUpdates.family_name_ar = updates.familyNameAr;

    if (updates.nationality !== undefined) dbUpdates.nationality = updates.nationality;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.civilId !== undefined) dbUpdates.civil_id = updates.civilId;
    if (updates.department !== undefined) dbUpdates.department = updates.department;
    if (updates.departmentArabic !== undefined) dbUpdates.department_arabic = updates.departmentArabic;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.positionArabic !== undefined) dbUpdates.position_arabic = updates.positionArabic;
    if (updates.joinDate !== undefined) dbUpdates.join_date = updates.joinDate || null;
    if (updates.civilIdExpiry !== undefined) dbUpdates.civil_id_expiry = updates.civilIdExpiry || null;
    if (updates.passportExpiry !== undefined) dbUpdates.passport_expiry = updates.passportExpiry || null;
    if (updates.iznAmalExpiry !== undefined) dbUpdates.izn_amal_expiry = updates.iznAmalExpiry || null;

    if (updates.salary !== undefined) dbUpdates.salary = updates.salary;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.leaveBalances !== undefined) dbUpdates.leave_balances = updates.leaveBalances;
    if (updates.trainingHours !== undefined) dbUpdates.training_hours = updates.trainingHours;
    if (updates.workDaysPerWeek !== undefined) dbUpdates.work_days_per_week = updates.workDaysPerWeek;
    if (updates.iban !== undefined) dbUpdates.iban = updates.iban;
    if (updates.bankCode !== undefined) dbUpdates.bank_code = updates.bankCode;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.emergencyContact !== undefined) dbUpdates.emergency_contact = updates.emergencyContact;
    if (updates.pifssStatus !== undefined) dbUpdates.pifss_status = updates.pifssStatus;
    if (updates.faceToken !== undefined) dbUpdates.face_token = updates.faceToken;
    if (updates.deviceUserId !== undefined) dbUpdates.device_user_id = updates.deviceUserId;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.allowances !== undefined) dbUpdates.allowances = updates.allowances;
    if (updates.managerId !== undefined) dbUpdates.manager_id = updates.managerId || null;
    if (updates.managerName !== undefined) dbUpdates.manager_name = updates.managerName;

    // Use upsert to handle cases where the record might not exist in the database yet (e.g. mock data)
    return dbService._safeQuery(async (client) => {
      // Ensure ID is a valid UUID or skip if it looks like a mock ID that isn't a UUID
      const { data, error = null } = await client.from('employees').upsert([{ ...dbUpdates, id }]).select().single();
      if (error) throw error;

      // Synchronize role with app_users if role was updated
      if (updates.role !== undefined) {
        const { error: userError } = await client.from('app_users').update({ role: updates.role }).eq('employee_id', id);
        if (userError) {
          console.warn('Sync warning: Could not update app_user role during employee update. User might not exist yet.', userError);
        }
      }

      if (updates.leaveBalances !== undefined) {
        const lb = updates.leaveBalances;
        const yr = new Date().getFullYear();
        await client.from('leave_balances').upsert([
          { employee_id: id, leave_type: 'Annual', entitled_days: lb.annual, used_days: lb.annualUsed, year: yr },
          { employee_id: id, leave_type: 'Sick', entitled_days: lb.sick, used_days: lb.sickUsed, year: yr },
          { employee_id: id, leave_type: 'Emergency', entitled_days: lb.emergency, used_days: lb.emergencyUsed, year: yr },
          { employee_id: id, leave_type: 'ShortPermission', entitled_days: lb.shortPermissionLimit, used_days: lb.shortPermissionUsed, year: yr },
          { employee_id: id, leave_type: 'Hajj', entitled_days: 1, used_days: lb.hajUsed ? 1 : 0, year: yr },
        ], { onConflict: 'employee_id,leave_type,year' });
      }

      if (updates.allowances !== undefined) {
        await client.from('employee_allowances').delete().eq('employee_id', id);
        if (updates.allowances.length > 0) {
          await client.from('employee_allowances').insert(
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
    });
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
    const legacyEntry = {
      user: user.name, role: user.role, action: `Status changed to ${status}`, timestamp: now, note
    };
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
    return this._safeQuery(async (client) => {
      const { data, error } = await client.from('payroll_runs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapPayrollRun);
    });
  },

  async getPayrollItems(runId: string): Promise<PayrollItem[]> {
    return this._safeQuery(async (client) => {
      const { data, error } = await client.from('payroll_items').select('*').eq('run_id', runId);
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
    return {
      item: userItem, run: latestRun
    };
  },

  async getCompanySettings(): Promise<any> {
    return this._safeQuery(async () => {
      const { data, error } = await supabase!.from('company_settings').select('*').limit(1).single();
      if (error) {
        // Fallback or return default
        return { company_name: 'ENTERPRISE WORKFORCE SOLUTIONS', mol_id: 'MOL-0000', employer_id: 'EMP-0000' };
      }
      return data;
    });
  },

  async exportWPS(runId: string, bankFormat: string): Promise<string> {
    const items = await this.getPayrollItems(runId);
    const employees = await this.getEmployees();
    const company = await this.getCompanySettings();

    // Standard WPS CSV Layout (NBK/KFH/Standard compliant)
    // Structure: MOL_ID,Employer_ID,Bank_ID,Value_Date,Record_Count,Total_Amount...
    // But for this UI, we return a per-employee breakdown as requested.

    let csv = "";
    const valueDate = new Date().toISOString().split('T')[0].replace(/-/g, '');

    if (bankFormat === 'NBK' || bankFormat === 'Standard') {
      csv = "MOL_ID,Employer_ID,Civil_ID,Employee_Name,Bank_Code,IBAN,Net_Salary,Currency,Value_Date\n";
      items.forEach(item => {
        const emp = employees.find(e => e.id === item.employeeId);
        csv += `${company.mol_id},${company.employer_id},${emp?.civilId || ''},"${item.employeeName}","${emp?.bankCode || ''}","${emp?.iban || ''}",${item.netSalary.toFixed(3)},KWD,${valueDate}\n`;
      });
    } else if (bankFormat === 'KFH') {
      csv = "Employee ID,Civil ID,Name,Beneficiary Bank,IBAN,Amount,Currency,Remarks\n";
      items.forEach(item => {
        const emp = employees.find(e => e.id === item.employeeId);
        csv += `${item.employeeId},${emp?.civilId || ''},"${item.employeeName}","${emp?.bankCode || ''}","${emp?.iban || ''}",${item.netSalary.toFixed(3)},KWD,Salary ${valueDate}\n`;
      });
    } else if (bankFormat === 'BOUB') {
      csv = "Record Type,Civil ID,Name,Bank ID,IBAN,Salary,Allowance,Deductions,Net\n";
      items.forEach(item => {
        const emp = employees.find(e => e.id === item.employeeId);
        csv += `1,${emp?.civilId || ''},"${item.employeeName}","${emp?.bankCode || ''}","${emp?.iban || ''}",${item.basicSalary.toFixed(3)},${(item.housingAllowance + item.otherAllowances).toFixed(3)},${(item.leaveDeductions + item.pifssDeduction).toFixed(3)},${item.netSalary.toFixed(3)}\n`;
      });
    } else {
      // Generic
      csv = "Employee Name,IBAN,Amount,Currency\n";
      items.forEach(item => {
        const emp = employees.find(e => e.id === item.employeeId);
        csv += `"${item.employeeName}","${emp?.iban || ''}",${item.netSalary},KWD\n`;
      });
    }
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
    if (!supabase) throw new Error('Supabase not configured');

    // Call the server-side RPC for atomic generation
    const { data, error } = await supabase.rpc('generate_payroll_draft', {
      p_period_key: periodKey,
      p_cycle_type: cycle
    });

    if (error) throw error;

    // Fetch the generated run to return it
    const { data: runData, error: runError } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('id', data.id)
      .single();

    if (runError) throw runError;
    return mapPayrollRun(runData);
  },

  async finalizePayrollRun(runId: string, user: User): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    // Call the server-side RPC for atomic finalization
    const { error } = await supabase.rpc('finalize_payroll_run', {
      p_run_id: runId,
      p_actor_name: user.name,
      p_actor_role: user.role
    });

    if (error) throw error;
  },

  async rollbackPayrollRun(periodKey: string): Promise<{ success: boolean; message: string }> {
    // 1. Fetch runs that will be deleted
    const { data: runs, error: runsError } = await supabase!
      .from('payroll_runs')
      .select('id, target_leave_id')
      .like('period_key', `${periodKey}%`);

    if (runsError) throw runsError;

    if (runs && runs.length > 0) {
      const runIds = runs.map(r => r.id);

      // 2. Clear associated Journal Entries
      await supabase!.from('journal_entries').delete().in('payroll_run_id', runIds);

      // 3. Unpin Variable Compensation so it can be re-run
      await supabase!.from('variable_compensation')
        .update({ payroll_run_id: null })
        .in('payroll_run_id', runIds);

      // 4. Revert any leave payouts processed in these runs
      const leaveRunIds = runs.map(r => r.target_leave_id).filter(Boolean);
      if (leaveRunIds.length > 0) {
        await supabase!.from('leave_requests')
          .update({ status: 'HR_Finalized' })
          .in('id', leaveRunIds as string[])
          .in('status', ['Paid', 'Pushed_To_Payroll']);
      }
    }

    // 5. Delete the runs safely
    const { data, error } = await supabase!
      .from('payroll_runs')
      .delete()
      .like('period_key', `${periodKey}%`)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) return {
      success: false, message: "No payroll record found for this period."
    };
    return {
      success: true, message: "Payroll records purged successfully from live registry."
    };
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
    if (!data || data.length === 0) return {
      success: false, message: "No run found."
    };

    // Revert the leave request status back to Rejected so it can be re-processed in Approvals Workflow
    await this.updateLeaveRequestStatus(leaveRequestId, 'Rejected', user, "Payout reversed by Admin.");
    return {
      success: true, message: "Leave payout reversed successfully."
    };
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
    return {
      synced: 5, errors: 0
    };
  },

  async generateHistoricalAttendance(): Promise<{ generated: number }> {
    if (!supabase) throw new Error('Supabase not configured');
    const employees = await this.getEmployees();
    let totalGenerated = 0;

    const startDate = new Date('2026-01-01');
    const endDate = new Date();

    for (const emp of employees) {
      const logs = [];
      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        if (currentDate.getDay() !== 5) { // Skip Fridays
          const dateStr = currentDate.toISOString().split('T')[0];

          let clockIn = '07:15:00';
          let clockOut = '15:30:00';

          if (Math.random() < 0.25) {
            const lateMin = Math.floor(Math.random() * 60) + 15;
            clockIn = `08:${lateMin.toString().padStart(2, '0')}:00`;
          }
          if (Math.random() < 0.4) {
            const otHour = Math.floor(Math.random() * 3) + 17;
            clockOut = `${otHour}:00:00`;
          }

          logs.push({
            id: gid(),
            employee_id: emp.id,
            employee_name: emp.name,
            date: dateStr,
            clock_in: clockIn,
            clock_out: clockOut,
            location: 'Al Hamra Tower HQ',
            status: 'On-Site',
            source: 'Hardware'
          });
          totalGenerated++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (logs.length > 0) {
        await supabase.from('attendance').upsert(logs);
      }
    }
    return { generated: totalGenerated };
  },

  async calculateOvertimeFromLogs(): Promise<{ processed: number }> {
    if (!supabase) throw new Error('Supabase not configured');

    // Fetch records needing OT processing
    const { data: records, error } = await supabase
      .from('attendance')
      .select('*')
      .not('clock_in', 'is', null)
      .not('clock_out', 'is', null);

    if (error) throw error;
    if (!records) return { processed: 0 };

    let processedCount = 0;
    const standardShift = 8 * 3600; // 8 hours in seconds

    for (const rec of records) {
      const [hIn, mIn, sIn] = rec.clock_in.split(':').map(Number);
      const [hOut, mOut, sOut] = rec.clock_out.split(':').map(Number);

      const inSec = hIn * 3600 + mIn * 60 + sIn;
      const outSec = hOut * 3600 + mOut * 60 + sOut;
      const duration = outSec - inSec;

      if (duration > standardShift) {
        const otHours = (duration - standardShift) / 3600;

        const { count } = await supabase
          .from('variable_compensation')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', rec.employee_id)
          .eq('comp_type', 'OVERTIME')
          .ilike('notes', `%${rec.id}%`);

        if (!count || count === 0) {
          await supabase.from('variable_compensation').insert([{
            employee_id: rec.employee_id,
            comp_type: 'OVERTIME',
            sub_type: 'Workday_OT',
            amount: otHours,
            status: 'PENDING_MANAGER',
            notes: `Generated from Attendance ID: ${rec.id} on ${rec.date}`
          }]);
          processedCount++;
        }
      }
    }

    return { processed: processedCount };
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
    return {
      ...data, nameArabic: data.name_arabic, addressArabic: data.address_arabic
    };
  },

  async deleteOfficeLocation(id: string): Promise<void> {
    await supabase!.from('office_locations').delete().eq('id', id);
  },

  async addPublicHoliday(h: PublicHoliday): Promise<PublicHoliday> {
    const finalH = h.id ? h : {
      ...h, id: gid()
    };
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
    return {
      ...data, nameArabic: data.name_arabic, isFixed: data.is_fixed
    };
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
    return {
      name: data.name, nameArabic: data.name_arabic, kuwaitiCount: data.kuwaiti_count, expatCount: data.expat_count, targetRatio: data.target_ratio
    };
  },

  async deleteDepartmentMetric(name: string): Promise<void> {
    await supabase!.from('departments').delete().eq('name', name);
  },

  // ─── Leave Balances (direct access to normalized table) ──────────────────────

  async getLeaveBalances(employeeId: string, year?: number): Promise<LeaveBalances> {
    const yr = year || new Date().getFullYear();
    return this._safeQuery(async (client) => {
      const { data } = await client
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
    return this._safeQuery(async (client) => {
      const { data } = await client
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
    let query = supabase!.from('profile_change_requests').select('*, employees(name, department, manager_id)');
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
  },

  async getOvertimeApprovals(managerId?: string, department?: string): Promise<any[]> {
    let query = supabase!
      .from('variable_compensation')
      .select(`
          *,
          employees (
            name,
            name_arabic,
            department,
            manager_id
          )
        `)
      .eq('comp_type', 'OVERTIME');

    if (managerId) {
      query = query.eq('employees.manager_id', managerId);
    }
    if (department) {
      query = query.eq('employees.department', department);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async updateVariableCompStatus(id: string, newStatus: string, calculatedKwd?: number): Promise<void> {
    const updatePayload: any = { status: newStatus };
    if (calculatedKwd !== undefined) {
      updatePayload.calculated_kwd = calculatedKwd;
    }
    const { error } = await supabase!
      .from('variable_compensation')
      .update(updatePayload)
      .eq('id', id);
    if (error) throw error;
  },

  // ─── Performance Evaluations ──────────────────────────────────────────────

  async getKPITemplates(): Promise<KPITemplate[]> {
    const { data, error } = await supabase!.from('kpi_templates').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(d => ({
      id: d.id,
      title: d.title,
      department: d.department,
      roleName: d.role_name,
      kpis: d.kpis,
      createdAt: d.created_at
    }));
  },

  async addKPITemplate(template: Omit<KPITemplate, 'id' | 'createdAt'>): Promise<void> {
    const { error } = await supabase!.from('kpi_templates').insert([{
      title: template.title,
      department: template.department,
      role_name: template.roleName,
      kpis: template.kpis
    }]);
    if (error) throw error;
  },

  async getEmployeeEvaluations(managerId?: string, quarter?: string): Promise<EmployeeEvaluation[]> {
    let query = supabase!.from('employee_evaluations').select('*, employees!employee_evaluations_employee_id_fkey(name, department, role)');
    if (managerId) query = query.eq('evaluator_id', managerId);
    if (quarter) query = query.eq('quarter', quarter);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map(d => ({
      id: d.id,
      employeeId: d.employee_id,
      evaluatorId: d.evaluator_id,
      quarter: d.quarter,
      kpiScores: d.kpi_scores,
      totalScore: Number(d.total_score),
      proRataFactor: Number(d.pro_rata_factor),
      calculatedKwd: Number(d.calculated_kwd),
      status: d.status,
      createdAt: d.created_at,
      employeeName: d.employees?.name,
      department: d.employees?.department,
      role: d.employees?.role
    }));
  },

  async submitEmployeeEvaluation(evalData: Omit<EmployeeEvaluation, 'id' | 'createdAt' | 'status'> & { status?: string }): Promise<void> {
    const { error } = await supabase!.from('employee_evaluations').insert([{
      employee_id: evalData.employeeId,
      evaluator_id: evalData.evaluatorId,
      quarter: evalData.quarter,
      kpi_scores: evalData.kpiScores,
      total_score: evalData.totalScore,
      pro_rata_factor: evalData.proRataFactor,
      calculated_kwd: evalData.calculatedKwd,
      status: evalData.status || 'PENDING_EXEC'
    }]);
    if (error) throw error;
  },

  async updateEvaluationStatus(id: string, newStatus: string): Promise<void> {
    const { error } = await supabase!.from('employee_evaluations').update({ status: newStatus }).eq('id', id);
    if (error) throw error;

    // If it's hitting approved for payroll, inject into variable compensation
    if (newStatus === 'APPROVED_FOR_PAYROLL') {
      const { data: ev, error: fetchErr } = await supabase!.from('employee_evaluations').select('*').eq('id', id).single();
      if (!fetchErr && ev) {
        await supabase!.from('variable_compensation').insert([{
          employee_id: ev.employee_id,
          comp_type: 'PERFORMANCE_BONUS',
          sub_type: ev.quarter,
          amount: ev.calculated_kwd,
          status: 'APPROVED_FOR_PAYROLL',
          notes: `Quarterly Performance Bonus for ${ev.quarter}`
        }]);
      }
    }
  },

  // ─── Profit Sharing & Bonuses ──────────────────────────────────────────────

  async getProfitBonusPools(): Promise<ProfitBonusPool[]> {
    const { data, error } = await supabase!.from('profit_bonus_pools').select(`
      *,
      creator:created_by(name),
      approver:approved_by(name)
    `).order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(d => ({
      id: d.id,
      periodName: d.period_name,
      totalNetProfit: Number(d.total_net_profit),
      recommendedPoolPct: Number(d.recommended_pool_pct),
      approvedPoolAmount: Number(d.approved_pool_amount),
      distributionMethod: d.distribution_method,
      eligibilityCutoffDate: d.eligibility_cutoff_date,
      totalDistributed: Number(d.total_distributed),
      status: d.status,
      createdBy: d.created_by,
      approvedBy: d.approved_by,
      createdAt: d.created_at,
      creatorName: d.creator?.name,
      approverName: d.approver?.name
    }));
  },

  async createProfitBonusPool(pool: Partial<ProfitBonusPool>): Promise<ProfitBonusPool> {
    const { data, error } = await supabase!.from('profit_bonus_pools').insert([{
      period_name: pool.periodName,
      total_net_profit: pool.totalNetProfit,
      recommended_pool_pct: pool.recommendedPoolPct,
      approved_pool_amount: pool.approvedPoolAmount,
      distribution_method: pool.distributionMethod,
      eligibility_cutoff_date: pool.eligibilityCutoffDate,
      status: 'DRAFT',
      created_by: pool.createdBy
    }]).select().single();
    if (error) throw error;
    return {
      id: data.id,
      periodName: data.period_name,
      totalNetProfit: Number(data.total_net_profit),
      recommendedPoolPct: Number(data.recommended_pool_pct),
      approvedPoolAmount: Number(data.approved_pool_amount),
      distributionMethod: data.distribution_method,
      eligibilityCutoffDate: data.eligibility_cutoff_date,
      totalDistributed: Number(data.total_distributed),
      status: data.status,
      createdBy: data.created_by,
      approvedBy: data.approved_by,
      createdAt: data.created_at
    };
  },

  async updateProfitBonusPoolStatus(id: string, newStatus: string, approverId?: string, overrideAmount?: number): Promise<void> {
    const updatePayload: any = { status: newStatus };
    if (approverId) updatePayload.approved_by = approverId;
    if (overrideAmount !== undefined) updatePayload.approved_pool_amount = overrideAmount;

    const { error } = await supabase!.from('profit_bonus_pools').update(updatePayload).eq('id', id);
    if (error) throw error;

    // If Executives approved, we need to generate Accrual Journal Entry here!
    if (newStatus === 'EXECUTIVE_APPROVED') {
      const { data: pool } = await supabase!.from('profit_bonus_pools').select('*').eq('id', id).single();
      if (pool) {
        // Create Accrual Journal Entry linking to the pool
        const costCenterId = '00000000-0000-0000-0000-000000000000'; // Default Company CC
        try {
          await supabase!.from('journal_entries').insert([
            { payroll_run_id: pool.id, employee_id: pool.created_by, cost_center_id: costCenterId, gl_account_id: '510400', amount: pool.approved_pool_amount, entry_date: new Date().toISOString(), entry_type: 'DR' },
            { payroll_run_id: pool.id, employee_id: pool.created_by, cost_center_id: costCenterId, gl_account_id: '210500', amount: pool.approved_pool_amount, entry_date: new Date().toISOString(), entry_type: 'CR' }
          ]);
        } catch (e) { console.error('Failed to post accrual JE', e); }
      }
    }
  },

  async getEmployeeBonusAllocations(poolId: string): Promise<EmployeeBonusAllocation[]> {
    const { data, error } = await supabase!.from('employee_bonus_allocations').select('*, employees(name, department)').eq('pool_id', poolId);
    if (error) throw error;
    return (data || []).map(d => ({
      id: d.id,
      poolId: d.pool_id,
      employeeId: d.employee_id,
      allocatedAmount: Number(d.allocated_amount),
      isPaid: d.is_paid,
      createdAt: d.created_at,
      employeeName: d.employees?.name,
      department: d.employees?.department
    }));
  },

  async createEmployeeBonusAllocations(allocations: Omit<EmployeeBonusAllocation, 'id' | 'createdAt' | 'isPaid'>[], poolId: string): Promise<void> {
    const payload = allocations.map(a => ({
      pool_id: a.poolId,
      employee_id: a.employeeId,
      allocated_amount: a.allocatedAmount
    }));

    const { error } = await supabase!.from('employee_bonus_allocations').insert(payload);
    if (error) throw error;

    // After inserting arrays, update the pool to HR_PROCESSED and sum total_distributed
    const totalDist = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    await supabase!.from('profit_bonus_pools').update({
      status: 'HR_PROCESSED',
      total_distributed: totalDist
    }).eq('id', poolId);

    // Also push to variable_compensation for payroll ingestion!
    const varCompPayload = allocations.map(a => ({
      employee_id: a.employeeId,
      comp_type: 'COMPANY_BONUS',
      sub_type: poolId,
      amount: a.allocatedAmount,
      status: 'APPROVED_FOR_PAYROLL',
      notes: `Profit Sharing Bonus`
    }));
    await supabase!.from('variable_compensation').insert(varCompPayload);
  },

  async provisionAuthUsers(): Promise<{ message: string }> {
    const employees = await this.getEmployees();
    const activeEmployees = employees.filter(e => e.status === 'Active');

    return {
      message: activeEmployees.length > 0
        ? `Enterprise Security Hub: Identified ${activeEmployees.length} employees ready for secure RLS provisioning.`
        : `Staging Database is currently empty. Please ensure employee records are present in the SQL registry first.`
    };
  },

  /** Create a Supabase Auth account for an employee using Admin API */
  provisionAuthUser: async (emp: Employee): Promise<{ success: boolean; message: string }> => {
    if (!supabaseAdmin) return { success: false, message: 'Admin API not available. Check VITE_SUPABASE_SERVICE_ROLE_KEY.' };

    try {
      // 1. Precise Email Identification
      let targetEmail = emp.email;

      if (!targetEmail) {
        // Fallback to Intelligent Email Generation (Skip prefixes like Dr., Eng., etc.)
        let parts = emp.name.split(' ').map(p => p.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const prefixes = ['dr', 'mr', 'mrs', 'ms', 'eng', 'prof'];
        let firstName = prefixes.includes(parts[0]) ? parts[1] : parts[0];

        // Manual override for common cases to ensure consistency with repair script
        if (emp.name.toLowerCase().includes('faisal')) firstName = 'faisal';
        if (emp.name.toLowerCase().includes('ihab')) firstName = 'ihab';

        targetEmail = `${firstName}@test.com`;
      }

      const testEmail = targetEmail;
      const metadata = {
        employee_id: emp.id,
        name: emp.name,
        role: emp.role || 'Employee',
        department: emp.department || 'General'
      };

      // 2. Attempt Create
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: testEmail,
        password: '12345',
        email_confirm: true,
        user_metadata: metadata
      });

      // 3. Handle Already Registered (Auto-Repair)
      if (error) {
        if (error.message.includes('already registered')) {
          // Find the existing user to get their ID for re-linking
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const existing = (users as any[]).find(u => u.email === testEmail);

          if (existing) {
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              user_metadata: metadata
            });
            if (updateError) throw updateError;
            return { success: true, message: `Access repaired: ${emp.name} re-linked to ${testEmail}.` };
          }
          return { success: false, message: `${testEmail} is registered but lookup failed.` };
        }
        throw error;
      }

      // 4. Trigger Welcome Email Edge Function
      try {
        await supabase!.functions.invoke('welcome-email', {
          body: {
            email: testEmail,
            name: emp.name,
            role: emp.role || 'Employee',
            password: '12345'
          }
        });
      } catch (emailErr) {
        console.warn('Welcome email triggering failed, but user was created:', emailErr);
      }

      return { success: true, message: `Access granted for ${emp.name} (${testEmail})` };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  },
};
