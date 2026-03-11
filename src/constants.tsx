
import { Employee, LeaveRequest, DepartmentMetric, PublicHoliday, OfficeLocation, Allowance } from './types/types';

export const STANDARD_ALLOWANCE_NAMES = [
  { en: 'Housing', ar: 'بدل سكن', isHousing: true },
  { en: 'Transport', ar: 'بدل انتقال', isHousing: false },
  { en: 'Car', ar: 'بدل سيارة', isHousing: false },
  { en: 'Mobile', ar: 'بدل هاتف', isHousing: false },
  { en: 'Social', ar: 'بدل اجتماعي', isHousing: false },
  { en: 'Hardship', ar: 'بدل طبيعة عمل', isHousing: false }
];

export const STANDARD_ROLES = [
  { id: 'Admin', en: 'Admin', ar: 'مدير نظام' },
  { id: 'HR', en: 'HR', ar: 'الموارد البشرية' },
  { id: 'HR Manager', en: 'HR Manager', ar: 'مدير موارد بشرية' },
  { id: 'HR Officer', en: 'HR Officer', ar: 'مسؤول موارد بشرية' },
  { id: 'Payroll Manager', en: 'Payroll Manager', ar: 'مدير رواتب' },
  { id: 'Payroll Officer', en: 'Payroll Officer', ar: 'مسؤول رواتب' },
  { id: 'Manager', en: 'Manager', ar: 'مدير' },
  { id: 'Executive', en: 'Executive', ar: 'تنفيذي' },
  { id: 'Mandoob', en: 'Mandoob', ar: 'مندوب' },
  { id: 'Employee', en: 'Employee', ar: 'موظف' },
];

export const STANDARD_POSITIONS = [
  { en: 'CEO', ar: 'الرئيس التنفيذي' },
  { en: 'General Manager', ar: 'المدير العام' },
  { en: 'HR Manager', ar: 'مدير الموارد البشرية' },
  { en: 'IT Manager', ar: 'مدير تقنية المعلومات' },
  { en: 'Payroll Manager', ar: 'مدير الرواتب' },
  { en: 'Operations Manager', ar: 'مدير العمليات' },
  { en: 'Senior Developer', ar: 'مطور أقدم' },
  { en: 'Network Engineer', ar: 'مهندس شبكات' },
  { en: 'HR Officer', ar: 'مسؤول موارد بشرية' },
  { en: 'Accountant', ar: 'محاسب' },
  { en: 'Administrative Assistant', ar: 'مساعد إداري' },
  { en: 'Mandoob', ar: 'مندوب' },
  { en: 'Driver', ar: 'سائق' },
  { en: 'Security Officer', ar: 'مسؤول أمن' }
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
