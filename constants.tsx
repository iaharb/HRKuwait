
import { Employee, LeaveRequest, DepartmentMetric, PublicHoliday, OfficeLocation, Allowance } from './types.ts';

export const STANDARD_ALLOWANCE_NAMES = [
  { en: 'Housing', ar: 'بدل سكن', isHousing: true },
  { en: 'Transport', ar: 'بدل انتقال', isHousing: false },
  { en: 'Car', ar: 'بدل سيارة', isHousing: false },
  { en: 'Mobile', ar: 'بدل هاتف', isHousing: false },
  { en: 'Social', ar: 'بدل اجتماعي', isHousing: false },
  { en: 'Hardship', ar: 'بدل طبيعة عمل', isHousing: false }
];

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Dr. Faisal Al-Sabah', nameArabic: 'د. فيصل الصباح',
    nationality: 'Kuwaiti', department: 'Executive', departmentArabic: 'الإدارة التنفيذية',
    position: 'CEO', positionArabic: 'الرئيس التنفيذي',
    joinDate: '2015-01-01', salary: 7500, status: 'Active',
    trainingHours: 120, workDaysPerWeek: 5, civilIdExpiry: '2028-12-31',
    leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 5, sickUsed: 0, emergencyUsed: 0, shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: false },
    iban: 'KW51NBK00000012345678901111', bankCode: 'NBK',
    allowances: [{ id: 'a1', name: 'Housing', nameArabic: 'بدل سكن', type: 'Fixed', value: 1000, isHousing: true }]
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Layla Al-Fadhli', nameArabic: 'ليلى الفضلي',
    nationality: 'Kuwaiti', department: 'HR', departmentArabic: 'الموارد البشرية',
    position: 'HR Manager', positionArabic: 'مدير الموارد البشرية',
    joinDate: '2018-03-12', salary: 3500, status: 'Active',
    trainingHours: 65, workDaysPerWeek: 5, civilIdExpiry: '2027-05-20',
    leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 5, sickUsed: 0, emergencyUsed: 0, shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: false },
    iban: 'KW89BOUB00000055443322112222', bankCode: 'BOUB',
    managerId: '00000000-0000-0000-0000-000000000001',
    allowances: [{ id: 'a2', name: 'Transport', nameArabic: 'بدل انتقال', type: 'Fixed', value: 150, isHousing: false }]
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Ahmed Al-Mutairi', nameArabic: 'أحمد المطيري',
    nationality: 'Kuwaiti', department: 'IT', departmentArabic: 'تقنية المعلومات',
    position: 'IT Lead', positionArabic: 'رئيس قسم التقنية',
    joinDate: '2019-06-15', salary: 3200, status: 'Active',
    trainingHours: 45, workDaysPerWeek: 5, civilIdExpiry: '2026-03-15',
    leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 12, sickUsed: 4, emergencyUsed: 1, shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: false },
    iban: 'KW22KFH00000098765432103333', bankCode: 'KFH',
    managerId: '00000000-0000-0000-0000-000000000001',
    allowances: [{ id: 'a3', name: 'Technical', nameArabic: 'علاوة فنية', type: 'Percentage', value: 10, isHousing: false }]
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Sarah Al-Ghanim', nameArabic: 'سارة الغانم',
    nationality: 'Kuwaiti', department: 'IT', departmentArabic: 'تقنية المعلومات',
    position: 'Senior Developer', positionArabic: 'مطور أقدم',
    joinDate: '2021-05-20', salary: 2200, status: 'Active',
    trainingHours: 40, workDaysPerWeek: 5, civilIdExpiry: '2027-10-10',
    leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 8, sickUsed: 2, emergencyUsed: 0, shortPermissionLimit: 2, shortPermissionUsed: 1.5, hajUsed: false },
    iban: 'KW44GULF00000066778899004444', bankCode: 'GULF',
    managerId: '00000000-0000-0000-0000-000000000003',
    allowances: []
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'John Doe', nameArabic: 'جون دو',
    nationality: 'Expat', department: 'IT', departmentArabic: 'تقنية المعلومات',
    position: 'Network Engineer', positionArabic: 'مهندس شبكات',
    joinDate: '2022-03-15', salary: 1800, status: 'Active',
    trainingHours: 32, workDaysPerWeek: 6, civilIdExpiry: '2026-03-15', passportExpiry: '2026-12-31',
    leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 14, sickUsed: 5, emergencyUsed: 3, shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: true },
    iban: 'KW51NBK00000011223344555555', bankCode: 'NBK',
    managerId: '00000000-0000-0000-0000-000000000003',
    allowances: [{ id: 'a4', name: 'Housing', nameArabic: 'بدل سكن', type: 'Fixed', value: 300, isHousing: true }]
  }
];

export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: 'l1', employeeId: '00000000-0000-0000-0000-000000000004', employeeName: 'Sarah Al-Ghanim', department: 'IT', type: 'Annual',
    startDate: '2026-01-28', endDate: '2026-02-05', days: 8, reason: 'Travel', status: 'HR_Approved',
    managerId: '00000000-0000-0000-0000-000000000003', createdAt: '2026-01-15T08:00:00Z', history: []
  }
];

export const DEPARTMENT_METRICS: DepartmentMetric[] = [
  { name: 'Executive', nameArabic: 'الإدارة التنفيذية', kuwaitiCount: 1, expatCount: 0, targetRatio: 100 },
  { name: 'HR', nameArabic: 'الموارد البشرية', kuwaitiCount: 1, expatCount: 0, targetRatio: 100 },
  { name: 'IT', nameArabic: 'تقنية المعلومات', kuwaitiCount: 2, expatCount: 1, targetRatio: 60 }
];

export const KUWAIT_PUBLIC_HOLIDAYS: PublicHoliday[] = [
  { id: '13', name: 'New Year Day 2026', nameArabic: 'رأس السنة الميلادية ٢٠٢٦', date: '2026-01-01', type: 'National', isFixed: true },
  { id: '14', name: 'National Day 2026', nameArabic: 'اليوم الوطني ٢٠٢٦', date: '2026-02-25', type: 'National', isFixed: true },
  { id: '15', name: 'Liberation Day 2026', nameArabic: 'يوم التحرير ٢٠٢٦', date: '2026-02-26', type: 'National', isFixed: true }
];

export const OFFICE_LOCATIONS: OfficeLocation[] = [
  {
    id: 'hq',
    name: 'Kuwait City HQ (Al Hamra)',
    nameArabic: 'المقر الرئيسي - مدينة الكويت (برج الحمراء)',
    address: 'Al Hamra Tower, Sharq, Kuwait City',
    addressArabic: 'برج الحمراء، شرق، مدينة الكويت',
    lat: 29.3785,
    lng: 47.9902,
    radius: 250
  }
];
