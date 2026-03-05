export type UserRole =
  | 'Admin'
  | 'Manager'
  | 'Employee'
  | 'HR'
  | 'Mandoob'
  | 'Executive'
  | 'HR Officer'
  | 'HR Manager'
  | 'Payroll Officer'
  | 'Payroll Manager';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  avatar?: string;
}

export interface Announcement {
  id: string;
  title: string;
  titleArabic?: string;
  content: string;
  contentArabic?: string;
  priority: 'Normal' | 'Urgent';
  createdAt: string;
}

export interface Allowance {
  id: string;
  name: string;
  nameArabic: string;
  type: 'Fixed' | 'Percentage';
  value: number;
  isHousing: boolean;
}

export interface LeaveBalances {
  annual: number;
  sick: number;
  emergency: number;
  annualUsed: number;
  sickUsed: number;
  emergencyUsed: number;
  shortPermissionLimit: number;
  shortPermissionUsed: number;
  hajUsed: boolean;
}

export interface Employee {
  id: string;
  name: string;
  nameArabic?: string;
  email?: string;

  // Structured English Name
  title?: string;
  firstName?: string;
  secondName?: string;
  thirdName?: string;
  fourthName?: string;
  familyName?: string;

  // Structured Arabic Name
  titleAr?: string;
  firstNameAr?: string;
  secondNameAr?: string;
  thirdNameAr?: string;
  fourthNameAr?: string;
  familyNameAr?: string;

  nationality: 'Kuwaiti' | 'Expat';
  civilId?: string;
  civilIdExpiry?: string;
  pifssNumber?: string;
  passportNumber?: string;
  passportExpiry?: string;
  iznAmalExpiry?: string;
  department: string;
  departmentArabic?: string;
  position: string;
  positionArabic?: string;
  joinDate: string;
  salary: number;
  allowances: Allowance[];
  status: 'Active' | 'On Leave' | 'Terminated';
  managerId?: string;
  managerName?: string;
  leaveBalances: LeaveBalances;
  trainingHours: number;
  workDaysPerWeek: number;
  pifssStatus?: 'Registered' | 'Pending' | 'Exempt';
  lastResetYear?: number;
  iban?: string;
  bankCode?: string;
  faceToken?: string;
  deviceUserId?: string;
  role: UserRole;
  phone?: string;
  emergencyContact?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  location: string;
  locationArabic?: string;
  status: 'On-Site' | 'Off-Site' | 'Late';
  coordinates?: { lat: number; lng: number };
  source: 'Web' | 'Mobile' | 'Hardware';
  deviceId?: string;
}

export interface HardwareConfig {
  serverIp: string;
  apiKey: string;
  syncInterval: number;
  lastSync?: string;
  status: 'Connected' | 'Error' | 'Disconnected';
}

export interface OfficeLocation {
  id: string;
  name: string;
  nameArabic: string;
  address: string;
  addressArabic: string;
  lat: number;
  lng: number;
  radius: number;
}

export interface PublicHoliday {
  id: string;
  name: string;
  nameArabic: string;
  date: string;
  type: 'National' | 'Religious' | 'Other';
  isFixed: boolean;
}

export interface SettlementResult {
  tenureYears: number;
  tenureMonths: number;
  tenureDays: number;
  totalServiceDays: number;
  remuneration: number;
  indemnityAmount: number;
  leavePayout: number;
  totalSettlement: number;
  dailyRate: number;
  breakdown: {
    baseIndemnity: number;
    multiplierApplied: number;
    firstFiveYearAmount: number;
    subsequentYearAmount: number;
    leaveDaysEncashed: number;
    isCapped: boolean;
    unpaidDaysDeducted: number;
  };
}

export type LeaveType =
  | 'Annual'
  | 'Sick'
  | 'Emergency'
  | 'Maternity'
  | 'Hajj'
  | 'Marriage'
  | 'Compassionate'
  | 'Paternity'
  | 'ShortPermission';

export interface LeaveHistoryEntry {
  user: string;
  role: string;
  action: string;
  timestamp: string;
  note?: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  durationHours?: number;
  reason: string;
  status: 'Pending' | 'Manager_Approved' | 'HR_Approved' | 'Resumed' | 'Rejected' | 'HR_Finalized' | 'Paid' | 'Pushed_To_Payroll';
  managerId: string;
  createdAt: string;
  actualReturnDate?: string;
  medicalCertificateUrl?: string;
  history: LeaveHistoryEntry[];
}

export interface PayrollRun {
  id: string;
  period_key?: string;
  periodKey: string;
  cycle_type?: 'Monthly' | 'Bi-Weekly' | 'Leave_Run';
  cycleType: 'Monthly' | 'Bi-Weekly' | 'Leave_Run';
  status: 'Draft' | 'Finalized' | 'JV_Generated' | 'Locked';
  totalDisbursement: number;
  total_disbursement?: number;
  createdAt: string;
  locked_start?: string; // For Leave Runs
  locked_end?: string;
  target_leave_id?: string;
}

export interface BreakdownItem {
  name: string;
  nameArabic?: string;
  value: number;
}

export interface PayrollItem {
  type: any;
  amount: number;
  id: string;
  runId: string;
  employeeId: string;
  employeeName: string;
  basicSalary: number;
  housingAllowance: number;
  otherAllowances: number;
  overtimeAmount: number; // Added
  leaveDeductions: number;
  sickLeavePay: number; // Added
  annualLeavePay: number; // Added
  performanceBonus: number; // Added
  companyBonus: number; // Added
  shortPermissionDeductions: number;
  pifssDeduction: number;
  pifssEmployerShare: number;
  indemnityAccrual: number; // Added for EOSB
  netSalary: number;
  verifiedByHr: boolean;
  variance: number;
  allowanceBreakdown: Array<{ name: string; nameArabic?: string; value: number }>;
  deductionBreakdown: Array<{ name: string; nameArabic?: string; value: number }>;
}

export type ClaimStatus =
  | 'Draft'
  | 'Pending_Manager'
  | 'Pending_HR'
  | 'Pending_Payroll'
  | 'Approved'
  | 'Rejected'
  | 'Paid';

export interface ExpenseClaim {
  id: string;
  employeeId: string;
  employeeName: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
  receiptUrl?: string; // Base64 or storage URL
  status: ClaimStatus;
  note?: string;
  createdAt: string;
  history: Array<{
    status: ClaimStatus;
    actor: string;
    timestamp: string;
    note?: string;
  }>;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'urgent' | 'reminder' | 'success' | 'info';
  category: 'leave_start' | 'leave_return' | 'pending_approval' | 'payroll_alert' | 'document_expiry' | 'permission_resume' | 'expense_claim';
  timestamp: string;
  isRead: boolean;
  linkId?: string;
}

export interface DepartmentMetric {
  name: string;
  nameArabic: string;
  kuwaitiCount: number;
  expatCount: number;
  targetRatio: number;
}

export interface InsightReport {
  summary: string;
  recommendations: string[];
  complianceStatus: string;
}

export enum View {
  Dashboard = 'dashboard',
  Directory = 'directory',
  Insights = 'insights',
  Compliance = 'compliance',
  Profile = 'profile',
  Leaves = 'leaves',
  Payroll = 'payroll',
  Settlement = 'settlement',
  Attendance = 'attendance',
  AdminCenter = 'admin-center',
  Whitepaper = 'whitepaper',
  Mandoob = 'mandoob',
  Finance = 'finance',
  Management = 'management',
  UserManagement = 'user-management',
  Approvals = 'approvals',
  Performance = 'performance',
  ProfitSharing = 'profit-sharing'
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: ToastType;
}

// --------------------------------------------------------
// FINANCE MODULE INTERFACES (Mapped to snake_case DB Schema)
// --------------------------------------------------------
export interface FinanceChartOfAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  is_active: boolean;
  created_at?: string;
}

export interface FinanceCostCenter {
  id: string;
  department_id: string;
  cost_center_code: string;
  segment_name: string;
  created_at?: string;
}

export interface FinanceMappingRule {
  id: string;
  rule_name: string;
  payroll_item_type: string;
  nationality_group: NationalityGroup;
  gl_account_id: string;
  credit_or_debit: EntryType;
  created_at?: string;
  finance_chart_of_accounts?: {
    account_name: string;
  };
}

export interface JournalEntry {
  id?: string; // Optional because the DB generates it
  payroll_run_id: string;
  employee_id: string;
  cost_center_id: string;
  gl_account_id: string;
  amount: number;
  entry_date: string;
  entry_type: EntryType;
  payroll_item_type?: string;
}

export interface FinancialRollup {
  payroll_run_id: string;
  payroll_item_type: string;
  segment_name: string;
  account_name: string;
  nationality_status: string;
  total_amount: number;
}

// Database Enum Types
export type AccountType = 'EXPENSE' | 'LIABILITY' | 'ASSET';
export type NationalityGroup = 'LOCAL' | 'EXPAT' | 'ALL';
export type EntryType = 'DR' | 'CR';

export interface KPI {
  name: string;
  weight: number;
}

export interface KPITemplate {
  id: string;
  title: string;
  department: string;
  roleName: string;
  kpis: KPI[];
  createdAt?: string;
}

export interface KPIScore {
  name: string;
  weight: number;
  score: number;
}

export interface EmployeeEvaluation {
  id: string;
  employeeId: string;
  evaluatorId: string;
  quarter: string;
  kpiScores: KPIScore[];
  totalScore: number;
  proRataFactor: number;
  calculatedKwd: number;
  status: 'PENDING_EXEC' | 'PENDING_HR' | 'APPROVED_FOR_PAYROLL' | 'PROCESSED';
  createdAt?: string;
  employeeName?: string;
  department?: string;
  role?: string;
}

export type ProfitBonusStatus = 'DRAFT' | 'EXECUTIVE_APPROVED' | 'HR_PROCESSED' | 'PAID';

export interface ProfitBonusPool {
  id: string;
  periodName: string;
  totalNetProfit: number;
  recommendedPoolPct: number;
  approvedPoolAmount: number;
  distributionMethod: 'EQUAL_SPLIT' | 'PRO_RATA_SALARY';
  eligibilityCutoffDate: string;
  totalDistributed: number;
  status: ProfitBonusStatus;
  createdBy: string;
  approvedBy?: string;
  createdAt?: string;
  creatorName?: string;
  approverName?: string;
}

export interface EmployeeBonusAllocation {
  id: string;
  poolId: string;
  employeeId: string;
  allocatedAmount: number;
  isPaid: boolean;
  createdAt?: string;
  employeeName?: string;
  department?: string;
}
