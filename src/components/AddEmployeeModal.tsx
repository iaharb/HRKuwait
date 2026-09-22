
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee, Allowance } from '../types/types';
import { STANDARD_ALLOWANCE_NAMES, STANDARD_ROLES, STANDARD_POSITIONS } from '../constants.tsx';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'ar';
  onSuccess: () => void;
  employeeToEdit?: Employee | null;
}

const EmployeeModal: React.FC<EmployeeModalProps> = ({ isOpen, onClose, language, onSuccess, employeeToEdit }) => {
  const { t, i18n } = useTranslation();
  const { notify } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<{ en: string, ar: string }[]>([]);

  const initialFormData: Omit<Employee, 'id'> = {
    name: '',
    nameArabic: '',
    title: '',
    firstName: '',
    secondName: '',
    thirdName: '',
    fourthName: '',
    familyName: '',
    titleAr: '',
    firstNameAr: '',
    secondNameAr: '',
    thirdNameAr: '',
    fourthNameAr: '',
    familyNameAr: '',
    nationality: 'Kuwaiti',
    email: '',
    civilId: '',
    department: 'IT',
    departmentArabic: 'تقنية المعلومات',
    role: 'Employee',
    position: '',
    positionArabic: '',
    joinDate: new Date().toISOString().split('T')[0],
    salary: 1500,
    status: 'Active',
    trainingHours: 0,
    workDaysPerWeek: 6,
    civilIdExpiry: '',
    pifssNumber: '',
    passportNumber: '',
    passportExpiry: '',
    iznAmalExpiry: '',
    leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 0, sickUsed: 0, emergencyUsed: 0, shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: false },
    iban: '',
    bankCode: 'NBK',
    allowances: [],
    managerId: '',
    managerName: '',
    phone: '',
    emergencyContact: '',
    pifssStatus: 'Pending'
  };

  const [formData, setFormData] = useState<Omit<Employee, 'id'>>(initialFormData);
  const [employeesData, setEmployeesData] = useState<Employee[]>([]);

  const [newAllowance, setNewAllowance] = useState({
    selectedName: 'Housing',
    customName: '',
    type: 'Fixed' as 'Fixed' | 'Percentage',
    value: 0,
    isHousing: true
  });

  const kuwaitBanks = [
    { code: 'NBK', name: 'National Bank of Kuwait' },
    { code: 'KFH', name: 'Kuwait Finance House' },
    { code: 'BOUB', name: 'Boubyan Bank' },
    { code: 'GULF', name: 'Gulf Bank' },
    { code: 'BURGAN', name: 'Burgan Bank' },
    { code: 'AHLI', name: 'Al Ahli Bank' },
    { code: 'KIB', name: 'Kuwait International Bank' }
  ];

  useEffect(() => {
    const loadDepts = async () => {
      const d = await dbService.getDepartmentMetrics();
      setDepartments(d.map(m => ({ en: m.name, ar: m.nameArabic })));
    };
    if (isOpen) loadDepts();

    if (isOpen && employeeToEdit) {
      setFormData({
        name: employeeToEdit.name,
        nameArabic: employeeToEdit.nameArabic || '',
        title: employeeToEdit.title || '',
        firstName: employeeToEdit.firstName || '',
        secondName: employeeToEdit.secondName || '',
        thirdName: employeeToEdit.thirdName || '',
        fourthName: employeeToEdit.fourthName || '',
        familyName: employeeToEdit.familyName || '',
        titleAr: employeeToEdit.titleAr || '',
        firstNameAr: employeeToEdit.firstNameAr || '',
        secondNameAr: employeeToEdit.secondNameAr || '',
        thirdNameAr: employeeToEdit.thirdNameAr || '',
        fourthNameAr: employeeToEdit.fourthNameAr || '',
        familyNameAr: employeeToEdit.familyNameAr || '',
        nationality: employeeToEdit.nationality,
        email: employeeToEdit.email || '',
        civilId: employeeToEdit.civilId || '',
        department: employeeToEdit.department,
        departmentArabic: employeeToEdit.departmentArabic || '',
        role: employeeToEdit.role || 'Employee',
        position: employeeToEdit.position,
        positionArabic: employeeToEdit.positionArabic || '',
        joinDate: employeeToEdit.joinDate,
        salary: employeeToEdit.salary,
        status: employeeToEdit.status,
        trainingHours: employeeToEdit.trainingHours,
        workDaysPerWeek: employeeToEdit.workDaysPerWeek,
        civilIdExpiry: employeeToEdit.civilIdExpiry || '',
        pifssNumber: employeeToEdit.pifssNumber || '',
        passportNumber: employeeToEdit.passportNumber || '',
        passportExpiry: employeeToEdit.passportExpiry || '',
        iznAmalExpiry: employeeToEdit.iznAmalExpiry || '',
        leaveBalances: employeeToEdit.leaveBalances,
        iban: employeeToEdit.iban || '',
        bankCode: employeeToEdit.bankCode || 'NBK',
        allowances: employeeToEdit.allowances || [],
        managerId: employeeToEdit.managerId || '',
        managerName: employeeToEdit.managerName || '',
        phone: employeeToEdit.phone || '',
        emergencyContact: employeeToEdit.emergencyContact || '',
        pifssStatus: employeeToEdit.pifssStatus || 'Pending'
      });
    } else if (isOpen) {
      setFormData(initialFormData);
    }
  }, [isOpen, employeeToEdit]);

  useEffect(() => {
    const fetchEmps = async () => {
      const data = await dbService.getEmployees();
      setEmployeesData(data);
    };
    if (isOpen) fetchEmps();
  }, [isOpen]);

  if (!isOpen) return null;

  const addAllowance = () => {
    const stdMatch = STANDARD_ALLOWANCE_NAMES.find(s => s.en === newAllowance.selectedName);
    const finalName = newAllowance.selectedName === 'Other' ? newAllowance.customName : newAllowance.selectedName;
    const finalNameAr = newAllowance.selectedName === 'Other' ? newAllowance.customName : (stdMatch?.ar || finalName);

    if (!finalName || newAllowance.value <= 0) {
      notify(t('warning'), t('actionRequired'), "warning");
      return;
    }

    const allowanceWithId: Allowance = {
      id: Math.random().toString(36).substr(2, 9),
      name: finalName,
      nameArabic: finalNameAr,
      type: newAllowance.type,
      value: newAllowance.value,
      isHousing: newAllowance.isHousing
    };

    setFormData({
      ...formData,
      allowances: [...formData.allowances, allowanceWithId]
    });

    setNewAllowance({
      selectedName: 'Housing',
      customName: '',
      type: 'Fixed',
      value: 0,
      isHousing: true
    });
  };

  const removeAllowance = (id: string) => {
    setFormData({
      ...formData,
      allowances: formData.allowances.filter(a => a.id !== id)
    });
  };

  const handleNameChange = (name: string) => {
    const standard = STANDARD_ALLOWANCE_NAMES.find(s => s.en === name);
    setNewAllowance({
      ...newAllowance,
      selectedName: name,
      isHousing: standard ? standard.isHousing : false,
      customName: name === 'Other' ? '' : newAllowance.customName
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullNameEn = `${formData.title} ${formData.firstName} ${formData.secondName} ${formData.thirdName} ${formData.fourthName} ${formData.familyName}`.replace(/\s+/g, ' ').trim();
    const fullNameAr = `${formData.titleAr} ${formData.firstNameAr} ${formData.secondNameAr} ${formData.thirdNameAr} ${formData.fourthNameAr} ${formData.familyNameAr}`.replace(/\s+/g, ' ').trim();

    const dataToSubmit = {
      ...formData,
      name: fullNameEn || formData.name,
      nameArabic: fullNameAr || formData.nameArabic
    };

    if (!dataToSubmit.name || !dataToSubmit.civilId) {
      notify(t('warning'), t('actionRequired'), "warning");
      return;
    }

    const dlmExempt = ['Admin', 'Executive'].includes(dataToSubmit.role);
    if (!dlmExempt && !dataToSubmit.managerId) {
      notify(t('warning'), language === 'ar' ? 'كل موظف يجب أن يكون له مدير مباشر (ما عدا الرئيس التنفيذي)' : 'Every employee must have a direct manager (DLM); only Admins and Executives are exempt.', "warning");
      return;
    }

    setLoading(true);
    try {
      if (employeeToEdit) {
        await dbService.updateEmployee(employeeToEdit.id, dataToSubmit);
        notify(t('success'), language === 'ar' ? 'تم تحديث بيانات الموظف' : 'Employee record updated.', "success");
      } else {
        await dbService.addEmployee(dataToSubmit);
        notify(t('success'), t('officialRecord'), "success");
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      notify(t('critical'), t('unknown'), "error");
    } finally {
      setLoading(false);
    }
  };

  const sectionHeader = (label: string) => (
    <div style={{ borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-02)', marginTop: 'var(--cds-spacing-05)', marginBottom: 'var(--cds-spacing-04)' }}>
      <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{label}</h3>
    </div>
  );

  return (
    <div className="cds--modal is-visible" style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="cds--modal-container" style={{ background: 'var(--cds-background)', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', color: 'var(--cds-text-primary)', border: '1px solid var(--cds-border-strong)' }}>
        <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 400 }}>{employeeToEdit ? 'Edit employee registry' : 'Enroll new employee'}</h2>
          </div>
          <button onClick={onClose} className="cds--btn cds--btn--ghost" style={{ padding: '0 var(--cds-spacing-04)' }}>Close</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: 'var(--cds-spacing-05)' }}>
          {sectionHeader("Personal identity")}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
            <div className="cds--form-item">
              <label className="cds--label">Title</label>
              <input className="cds--text-input" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
            </div>
            <div className="cds--form-item">
              <label className="cds--label">First name</label>
              <input required className="cds--text-input" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
            </div>
            <div className="cds--form-item">
              <label className="cds--label">Family name</label>
              <input required className="cds--text-input" value={formData.familyName} onChange={e => setFormData({ ...formData, familyName: e.target.value })} />
            </div>
            <div className="cds--form-item">
              <label className="cds--label">Nationality</label>
              <select className="cds--select" value={formData.nationality} onChange={e => setFormData({ ...formData, nationality: e.target.value as any })}>
                <option value="Kuwaiti">Kuwaiti National</option>
                <option value="Expat">Expat</option>
              </select>
            </div>
          </div>

          {sectionHeader("Career placement")}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
             <div className="cds--form-item">
                <label className="cds--label">Department</label>
                <select className="cds--select" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                   {departments.map(d => <option key={d.en} value={d.en}>{d.en}</option>)}
                </select>
             </div>
             <div className="cds--form-item">
                <label className="cds--label">Position</label>
                <select className="cds--select" required value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })}>
                   <option value="">Select designation</option>
                   {STANDARD_POSITIONS.map(p => <option key={p.en} value={p.en}>{p.en}</option>)}
                </select>
             </div>
<div className="cds--form-item">
                <label className="cds--label">Registry role</label>
                <select className="cds--select" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as any })}>
                  {STANDARD_ROLES.map(r => <option key={r.id} value={r.id}>{r.en}</option>)}
                </select>
             </div>
             <div className="cds--form-item">
                <label className="cds--label">Direct manager (DLM)</label>
                <select className="cds--select" value={formData.managerId} onChange={e => setFormData({ ...formData, managerId: e.target.value, managerName: e.target.value ? (employeesData.find(em => em.id === e.target.value)?.name || '') : '' })}>
                   <option value="">—</option>
                   {employeesData.filter(em => em.id !== (employeeToEdit?.id || '')).map(em => <option key={em.id} value={em.id}>{em.name}</option>)}
                </select>
             </div>
          </div>

          {sectionHeader("Official documents")}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
            <div className="cds--form-item">
                <label className="cds--label">Civil ID number</label>
                <input required maxLength={12} className="cds--text-input" value={formData.civilId} onChange={e => setFormData({ ...formData, civilId: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div className="cds--form-item">
                <label className="cds--label">Civil ID expiry</label>
                <input type="date" className="cds--text-input" value={formData.civilIdExpiry} onChange={e => setFormData({ ...formData, civilIdExpiry: e.target.value })} />
            </div>
            <div className="cds--form-item">
                <label className="cds--label">Passport number</label>
                <input className="cds--text-input" value={formData.passportNumber} onChange={e => setFormData({ ...formData, passportNumber: e.target.value })} />
            </div>
          </div>

          {sectionHeader("Financial configuration")}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
             <div className="cds--form-item">
                <label className="cds--label">Basic salary (KWD)</label>
                <input type="number" className="cds--text-input" value={formData.salary} onChange={e => setFormData({ ...formData, salary: parseInt(e.target.value) || 0 })} />
             </div>
             <div className="cds--form-item">
                <label className="cds--label">Bank account (IBAN)</label>
                <input className="cds--text-input" value={formData.iban} onChange={e => setFormData({ ...formData, iban: e.target.value.toUpperCase() })} />
             </div>
          </div>
        </form>

        <div style={{ padding: 'var(--cds-spacing-05)', borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', gap: 'var(--cds-spacing-05)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="cds--btn cds--btn--secondary">Discard</button>
          <button type="submit" disabled={loading} onClick={handleSubmit} className="cds--btn cds--btn--primary">
            {loading ? 'Processing...' : (employeeToEdit ? 'Save changes' : 'Enroll member')}
          </button>
        </div>
      </div>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: -1 }} onClick={onClose}></div>
    </div>
  );
};

export default EmployeeModal;
