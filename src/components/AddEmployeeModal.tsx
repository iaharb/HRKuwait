
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee, Allowance } from '../types.ts';
import { STANDARD_ALLOWANCE_NAMES } from '../constants.tsx';
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
  const [departments, setDepartments] = useState<{en: string, ar: string}[]>([]);

  const initialFormData: Omit<Employee, 'id'> = {
    name: '',
    nameArabic: '',
    nationality: 'Kuwaiti',
    civilId: '',
    department: 'IT',
    departmentArabic: 'تقنية المعلومات',
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
    allowances: []
  };

  const [formData, setFormData] = useState<Omit<Employee, 'id'>>(initialFormData);

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
        nationality: employeeToEdit.nationality,
        civilId: employeeToEdit.civilId || '',
        department: employeeToEdit.department,
        departmentArabic: employeeToEdit.departmentArabic || '',
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
        allowances: employeeToEdit.allowances || []
      });
    } else if (isOpen) {
      setFormData(initialFormData);
    }
  }, [isOpen, employeeToEdit]);

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
    if (!formData.name || !formData.civilId) {
      notify(t('warning'), t('actionRequired'), "warning");
      return;
    }

    setLoading(true);
    try {
      if (employeeToEdit) {
        await dbService.updateEmployee(employeeToEdit.id, formData);
        notify(t('success'), language === 'ar' ? 'تم تحديث بيانات الموظف' : 'Employee record updated.', "success");
      } else {
        await dbService.addEmployee(formData);
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

  const sectionHeader = (icon: string, label: string) => (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mt-10 mb-6 first:mt-0">
      <span className="text-xl">{icon}</span>
      <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">{label}</h3>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
      <div className="bg-white rounded-[48px] w-full max-w-5xl shadow-2xl relative z-10 overflow-hidden border border-slate-200 max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300">
        
        <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              {employeeToEdit ? (language === 'ar' ? 'تعديل الملف الشخصي' : 'Modify Registry Profile') : t('addMember')}
            </h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Registry Context: {formData.department} Scope</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xl font-bold hover:text-rose-500 transition-colors">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-2">
          
          {/* Identity Section */}
          {sectionHeader("👤", t('personalIdentity'))}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('nameEn')}</label>
              <input required className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('nameAr')}</label>
              <input required dir="rtl" className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-right outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.nameArabic} onChange={e => setFormData({...formData, nameArabic: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('nationality')}</label>
              <select className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.nationality} onChange={e => setFormData({...formData, nationality: e.target.value as any})}>
                <option value="Kuwaiti">{t('kuwaiti')}</option>
                <option value="Expat">{t('expat')}</option>
              </select>
            </div>
          </div>

          {/* Placement Section */}
          {sectionHeader("💼", t('careerPlacement'))}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('dept')}</label>
              <select 
                className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" 
                value={formData.department} 
                onChange={e => {
                  const match = departments.find(d => d.en === e.target.value);
                  setFormData({...formData, department: e.target.value, departmentArabic: match?.ar || ''});
                }}
              >
                {departments.map(d => <option key={d.en} value={d.en}>{language === 'ar' ? d.ar : d.en}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('roleEn')}</label>
              <input required className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('roleAr')}</label>
              <input required dir="rtl" className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-right" value={formData.positionArabic} onChange={e => setFormData({...formData, positionArabic: e.target.value})} />
            </div>
          </div>

          {/* Bank & Payment Details */}
          {sectionHeader("💳", t('bankAndPayment'))}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('bankCode')}</label>
                <select 
                  className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                  value={formData.bankCode}
                  onChange={e => setFormData({...formData, bankCode: e.target.value})}
                >
                   {kuwaitBanks.map(b => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
                </select>
             </div>
             <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('ibanNumber')}</label>
                <input 
                  className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-mono font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" 
                  placeholder="KW00 XXXX XXXX XXXX XXXX XXXX XXXX"
                  value={formData.iban} 
                  onChange={e => setFormData({...formData, iban: e.target.value.toUpperCase()})} 
                />
             </div>
          </div>

          {/* Official Documents */}
          {sectionHeader("🛡️", t('officialDocuments'))}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('civilIdNumber')}</label>
                <input required maxLength={12} className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.civilId} onChange={e => setFormData({...formData, civilId: e.target.value.replace(/\D/g, '')})} />
             </div>
             <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('civilIdExpiry')}</label>
                <input type="date" className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.civilIdExpiry} onChange={e => setFormData({...formData, civilIdExpiry: e.target.value})} />
             </div>
             {formData.nationality === 'Kuwaiti' && (
                <div className="space-y-2">
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('pifssNumber')}</label>
                   <input className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.pifssNumber} onChange={e => setFormData({...formData, pifssNumber: e.target.value})} />
                </div>
             )}
             {formData.nationality === 'Expat' && (
                <>
                   <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('passportNumber')}</label>
                      <input className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.passportNumber} onChange={e => setFormData({...formData, passportNumber: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('passportExpiry')}</label>
                      <input type="date" className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.passportExpiry} onChange={e => setFormData({...formData, passportExpiry: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('iznAmalExpiry')}</label>
                      <input type="date" className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.iznAmalExpiry} onChange={e => setFormData({...formData, iznAmalExpiry: e.target.value})} />
                   </div>
                </>
             )}
          </div>

          {/* Contract Settings */}
          {sectionHeader("📜", t('contractSettings'))}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('joinDate')}</label>
                <input type="date" className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.joinDate} onChange={e => setFormData({...formData, joinDate: e.target.value})} />
             </div>
             <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('workingDaysWeek')}</label>
                <div className="grid grid-cols-2 gap-4">
                   <button type="button" onClick={() => setFormData({...formData, workDaysPerWeek: 5})} className={`py-4 rounded-2xl font-black text-sm border transition-all ${formData.workDaysPerWeek === 5 ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>5 Days</button>
                   <button type="button" onClick={() => setFormData({...formData, workDaysPerWeek: 6})} className={`py-4 rounded-2xl font-black text-sm border transition-all ${formData.workDaysPerWeek === 6 ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>6 Days</button>
                </div>
             </div>
          </div>

          {/* Financial Section */}
          {sectionHeader("💰", t('financialConfig'))}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('salary')} (Basic)</label>
                <input type="number" required className="w-full px-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-black text-lg outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" value={formData.salary} onChange={e => setFormData({...formData, salary: parseInt(e.target.value) || 0})} />
              </div>
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Allowances</h4>
                {formData.allowances.length === 0 && <p className="text-xs text-slate-300 italic">No allowances configured.</p>}
                <div className="space-y-3">
                  {formData.allowances.map(allow => (
                    <div key={allow.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-left-4">
                      <div>
                        <p className="text-xs font-black text-slate-900">{language === 'ar' ? allow.nameArabic : allow.name} {allow.isHousing && '🏠'}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">{allow.type === 'Fixed' ? `${allow.value} KWD` : `${allow.value}% of Basic`}</p>
                      </div>
                      <button type="button" onClick={() => removeAllowance(allow.id)} className="text-rose-500 font-black text-[10px] uppercase tracking-widest p-2 hover:bg-rose-50 rounded-lg transition-all">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-indigo-50/30 p-8 rounded-[40px] border border-indigo-100 space-y-6">
              <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Add New Allowance</h4>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ps-1">Allowance Category</label>
                  <select 
                    className="w-full px-5 py-3 rounded-xl border border-indigo-100 bg-white text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/10" 
                    value={newAllowance.selectedName} 
                    onChange={e => handleNameChange(e.target.value)}
                  >
                    {STANDARD_ALLOWANCE_NAMES.map(opt => (
                      <option key={opt.en} value={opt.en}>{language === 'ar' ? opt.ar : opt.en}</option>
                    ))}
                  </select>
                </div>

                {newAllowance.selectedName === 'Other' && (
                  <input 
                    placeholder="Type Allowance Name..." 
                    className="w-full px-5 py-3 rounded-xl border border-indigo-100 bg-white text-xs font-bold outline-none animate-in fade-in" 
                    value={newAllowance.customName} 
                    onChange={e => setNewAllowance({...newAllowance, customName: e.target.value})} 
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                     <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ps-1">Logic</label>
                     <select className="w-full px-5 py-3 rounded-xl border border-indigo-100 bg-white text-xs font-bold outline-none" value={newAllowance.type} onChange={e => setNewAllowance({...newAllowance, type: e.target.value as any})}>
                       <option value="Fixed">Fixed Amount</option>
                       <option value="Percentage">% of Basic</option>
                     </select>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ps-1">Magnitude</label>
                     <input type="number" placeholder="Value" className="w-full px-5 py-3 rounded-xl border border-indigo-100 bg-white text-xs font-bold outline-none" value={newAllowance.value} onChange={e => setNewAllowance({...newAllowance, value: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none py-2 group">
                  <div className="relative w-10 h-5 bg-slate-200 rounded-full transition-all group-has-[:checked]:bg-indigo-500">
                    <input type="checkbox" className="sr-only peer" checked={newAllowance.isHousing} onChange={e => setNewAllowance({...newAllowance, isHousing: e.target.checked})} />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-5"></div>
                  </div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Is Housing? (Unconditional Payment)</span>
                </label>

                <button type="button" onClick={addAllowance} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/10 active:scale-95 transition-all">
                  Add Allowance to Registry
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-10 border-t border-slate-100 sticky bottom-0 bg-white pb-2 z-10">
            <button type="button" onClick={onClose} className="flex-1 px-8 py-5 rounded-[24px] border border-slate-200 font-black text-[11px] uppercase text-slate-400 transition-all hover:bg-slate-50">
              {t('discard')}
            </button>
            <button type="submit" disabled={loading} className="flex-[2] px-8 py-5 rounded-[24px] font-black text-[11px] uppercase text-white bg-slate-900 shadow-2xl hover:bg-black active:scale-95 transition-all disabled:opacity-50">
              {loading ? '...' : (employeeToEdit ? t('saveChanges') : t('enroll'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeModal;
