
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee, User } from '../types/types.ts';

interface ScopeDirectoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    language: string;
}

const ScopeDirectoryModal: React.FC<ScopeDirectoryModalProps> = ({ isOpen, onClose, user, language }) => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const isAr = language === 'ar';

    useEffect(() => {
        if (isOpen) {
            dbService.getEmployees().then(data => {
                if (user.role === 'Admin') {
                    setEmployees(data);
                } else {
                    setEmployees(data.filter(e => {
                        const isCEO = e.position.toLowerCase().includes('ceo');
                        const isInDept = e.department === user.department;
                        return isCEO || isInDept;
                    }));
                }
            });
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="bg-white rounded-[40px] w-full max-w-lg shadow-2xl relative z-10 overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center text-start">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">{isAr ? 'هيكل النطاق الوظيفي' : 'Scope Directory Structure'}</h3>
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">Registry Context: {user.department || 'Global'}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 font-bold text-2xl hover:text-slate-600 transition-colors">×</button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                    {employees.sort((a, b) => {
                        const pA = a.position.toLowerCase();
                        const pB = b.position.toLowerCase();
                        if (pA.includes('ceo')) return -1;
                        if (pB.includes('ceo')) return 1;
                        return 0;
                    }).map((emp) => (
                        <div key={emp.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:border-indigo-200 transition-all text-start">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs relative">
                                {emp.faceToken ? <img src={emp.faceToken} className="w-full h-full object-cover rounded-xl grayscale" /> : emp.name[0]}
                                {emp.position.toLowerCase().includes('ceo') && (
                                    <div className="absolute -top-1 -right-1 text-[8px]">👑</div>
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-black text-slate-800 leading-none">{isAr && emp.nameArabic ? emp.nameArabic : emp.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1.5">
                                    {isAr && emp.positionArabic ? emp.positionArabic : emp.position}
                                    <span className="ms-2 opacity-40">•</span>
                                    <span className="ms-2">{isAr && emp.departmentArabic ? emp.departmentArabic : emp.department}</span>
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ScopeDirectoryModal;
