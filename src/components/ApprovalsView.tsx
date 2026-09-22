import React, { useState, useEffect } from 'react';
import { User } from '../types/types';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

interface ApprovalsViewProps {
    user: User;
    compactMode?: boolean;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({ user }) => {
    const { t, i18n } = useTranslation();
    const { notify } = useNotifications();
    const [activeTab, setActiveTab] = useState<'overtime' | 'leaves' | 'profile'>('overtime');
    const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [profileRequests, setProfileRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);
    
    // Filter State
    const [filterDept, setFilterDept] = useState<string>('ALL');
    const [filterMonth, setFilterMonth] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState<string>('');

    const months = [
        { val: 'ALL', label: i18n.language === 'ar' ? 'الكل' : 'All Months' },
        { val: '01', label: i18n.language === 'ar' ? 'يناير' : 'January' },
        { val: '02', label: i18n.language === 'ar' ? 'فبراير' : 'February' },
        { val: '03', label: i18n.language === 'ar' ? 'مارس' : 'March' },
        { val: '04', label: i18n.language === 'ar' ? 'أبريل' : 'April' },
        { val: '05', label: i18n.language === 'ar' ? 'مايو' : 'May' },
        { val: '06', label: i18n.language === 'ar' ? 'يونيو' : 'June' },
        { val: '07', label: i18n.language === 'ar' ? 'يوليو' : 'July' },
        { val: '08', label: i18n.language === 'ar' ? 'أغسطس' : 'August' },
        { val: '09', label: i18n.language === 'ar' ? 'سبتمبر' : 'September' },
        { val: '10', label: i18n.language === 'ar' ? 'أكتوبر' : 'October' },
        { val: '11', label: i18n.language === 'ar' ? 'نوفمبر' : 'November' },
        { val: '12', label: i18n.language === 'ar' ? 'ديسمبر' : 'December' }
    ];

    const fetchData = async () => {
        setLoading(true);
        setSelectedIds([]); 
        try {
            const roles = ['Admin', 'Executive', 'HR Manager', 'HR Officer', 'Payroll Manager', 'HR', 'Mandoob', 'Payroll Officer'];
            const isExecOrHr = roles.some(r => r.toLowerCase() === user.role.toLowerCase());
            const userEmpId = user.employeeId || user.id;

            const filterItems = (items: any[], empDeptPath: string, empMgrIdPath: string) => {
                if (isExecOrHr) return items;
                return items.filter((item: any) => {
                    const getNested = (obj: any, path: string) => path.split('.').reduce((o, i) => o?.[i], obj);
                    const dept = getNested(item, empDeptPath);
                    const mgrId = getNested(item, empMgrIdPath);
                    return mgrId === userEmpId || dept === user.department;
                });
            };

            try {
                const depts = await dbService.getDepartmentMetrics();
                setDepartments(depts.map(d => d.name));
            } catch (e) { console.error('Depts fetch failed:', e); }

            try {
                const ot = await dbService.getOvertimeApprovals();
                const filteredOt = filterItems(ot, 'employees.department', 'employees.manager_id').filter((r: any) => r.status !== 'APPROVED_FOR_PAYROLL' && r.status !== 'REJECTED');
                setOvertimeRequests(filteredOt);
            } catch (e) { console.error('OT fetch failed:', e); }

            try {
                const leaves = await dbService.getLeaveRequests();
                const filteredLeaves = filterItems(leaves, 'department', 'managerId').filter((r: any) => ['Pending', 'Pending_Manager', 'Manager_Approved', 'Rejected', 'Rejected_By_Manager'].includes(r.status));
                setLeaveRequests(filteredLeaves);
            } catch (e) { console.error('Leaves fetch failed:', e); }

            try {
                const prof = await dbService.getProfileUpdateRequests();
                const filteredProf = filterItems(prof, 'employees.department', 'employees.manager_id').filter((r: any) => r.status === 'PENDING');
                setProfileRequests(filteredProf);
            } catch (e) { console.error('Profile fetch failed:', e); }
        } catch (error) {
            console.error('Failed to fetch approvals:', error);
        } finally {
            setLoading(false);
        }
    };

    const getFilteredItems = (items: any[], type: 'overtime' | 'leaves' | 'profile') => {
        return items.filter(item => {
            const empName = (type === 'leaves' ? (item.employeeName || '') : (item.employees?.name || '')).toLowerCase();
            const empDept = (type === 'leaves' ? (item.department || '') : (item.employees?.department || ''));
            let dateStr = item.created_at;
            if (type === 'leaves') {
                dateStr = item.startDate;
            } else if (type === 'overtime') {
                dateStr = item.effective_date;
                if (!dateStr && item.notes) {
                    const match = item.notes.match(/on (\d{4}-\d{2}-\d{2})|for (\d{4}-\d{2}-\d{2})/);
                    if (match) dateStr = match[1] || match[2];
                }
            }
            
            let itemMonth: string | null = null;
            if (dateStr) {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    itemMonth = (d.getMonth() + 1).toString().padStart(2, '0');
                }
            }
            
            const matchSearch = searchTerm === '' || empName.includes(searchTerm.toLowerCase());
            const matchDept = filterDept === 'ALL' || empDept === filterDept;
            const matchMonth = filterMonth === 'ALL' || (itemMonth && itemMonth === filterMonth);
            
            return matchSearch && matchDept && matchMonth;
        });
    };

    const filteredOvertime = getFilteredItems(overtimeRequests, 'overtime').sort((a, b) => {
        const getDate = (item: any) => {
            let dStr = item.effective_date;
            if (!dStr && item.notes) {
                const match = item.notes.match(/on (\d{4}-\d{2}-\d{2})|for (\d{4}-\d{2}-\d{2})/);
                if (match) dStr = match[1] || match[2];
            }
            return dStr ? new Date(dStr).getTime() : 0;
        };
        return getDate(b) - getDate(a);
    });
    const filteredLeaves = getFilteredItems(leaveRequests, 'leaves');
    const filteredProfile = getFilteredItems(profileRequests, 'profile');
    const currentListToDisplay = activeTab === 'overtime' ? filteredOvertime : activeTab === 'leaves' ? filteredLeaves : filteredProfile;

    useEffect(() => {
        fetchData();
    }, [user]);

    useEffect(() => {
        setSelectedIds([]);
    }, [activeTab]);

    const handleUpdateStatus = async (item: any, newStatus: string, successMsg: string) => {
        try {
            await dbService.updateVariableCompStatus(item.id, newStatus);
            notify(t('success'), successMsg, 'success');
            fetchData();
        } catch (error) {
            notify(t('error'), 'Update failed', 'error');
        }
    };

    const handleUpdateLeave = async (item: any, newStatus: any, note: string) => {
        try {
            await dbService.updateLeaveRequestStatus(item.id, newStatus, user, note);
            notify(t('success'), `Leave ${newStatus.replace('_', ' ')}`, 'success');
            fetchData();
        } catch (error) {
            notify(t('error'), 'Update failed', 'error');
        }
    };

    const handleUpdateProfile = async (item: any, action: 'approve' | 'reject') => {
        try {
            if (action === 'approve') await dbService.approveProfileUpdate(item.id, user.id);
            else await dbService.rejectProfileUpdate(item.id, 'Rejected by ' + user.id);
            notify(t('success'), `Profile ${action}d`, 'success');
            fetchData();
        } catch (error) {
            notify(t('error'), 'Update failed', 'error');
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === currentListToDisplay.length && currentListToDisplay.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(currentListToDisplay.map(i => i.id));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleBatchAction = async (action: 'approve' | 'reject') => {
        if (selectedIds.length === 0) return;
        setLoading(true);
        try {
            const promises = selectedIds.map(async (id) => {
                const item = activeTab === 'overtime' ? overtimeRequests.find(i => i.id === id) : activeTab === 'leaves' ? leaveRequests.find(i => i.id === id) : profileRequests.find(i => i.id === id);
                if (!item) return;

                if (activeTab === 'overtime') {
                    if (action === 'approve') {
                        let next = 'PENDING_HR';
                        if (item.status === 'PENDING_HR') next = 'PENDING_PAYROLL';
                        if (item.status === 'PENDING_PAYROLL') next = 'APPROVED_FOR_PAYROLL';
                        await dbService.updateVariableCompStatus(id, next);
                    } else {
                        await dbService.updateVariableCompStatus(id, 'REJECTED');
                    }
                } else if (activeTab === 'leaves') {
                    if (action === 'approve') {
                        let next: any = 'Manager_Approved';
                        if (item.status === 'Manager_Approved') next = 'HR_Approved';
                        await dbService.updateLeaveRequestStatus(id, next, user, 'Batch approval');
                    } else {
                        await dbService.updateLeaveRequestStatus(id, 'Rejected', user, 'Batch rejection');
                    }
                } else if (activeTab === 'profile') {
                    if (action === 'approve') await dbService.approveProfileUpdate(id, user.id);
                    else await dbService.rejectProfileUpdate(id, 'Batch rejection');
                }
            });

            await Promise.all(promises);
            notify(t('success'), `Batch ${action} completed`, 'success');
            fetchData();
        } catch (error) {
            notify(t('error'), 'Batch action failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const s = status.toUpperCase();
        if (s.includes('PENDING_MANAGER')) return <span className="cds--tag cds--tag--warm-gray" style={{ fontSize: '0.625rem' }}>Manager Action</span>;
        if (s.includes('PENDING_HR')) return <span className="cds--tag cds--tag--blue" style={{ fontSize: '0.625rem' }}>HR Ack</span>;
        if (s.includes('PENDING_PAYROLL')) return <span className="cds--tag cds--tag--gray" style={{ fontSize: '0.625rem' }}>Payroll Action</span>;
        if (s.includes('APPROVED')) return <span className="cds--tag cds--tag--green" style={{ fontSize: '0.625rem' }}>Approved</span>;
        if (s.includes('REJECTED')) return <span className="cds--tag cds--tag--red" style={{ fontSize: '0.625rem' }}>Rejected</span>;
        return <span className="cds--tag cds--tag--cyan" style={{ fontSize: '0.625rem' }}>{status.replace('_', ' ')}</span>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--cds-spacing-01)' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Workflow Approvals</h2>
                    <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>Authorize pending requests across departments.</p>
                </div>
                {selectedIds.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--cds-spacing-03)' }}>
                        <button onClick={() => handleBatchAction('approve')} className="cds--btn cds--btn--primary cds--btn--sm">Approve Batch ({selectedIds.length})</button>
                        <button onClick={() => handleBatchAction('reject')} className="cds--btn cds--btn--danger cds--btn--sm">Reject Set</button>
                    </div>
                )}
            </header>

            {/* Standardized Tabs Navigation - Single Row Pattern */}
            <div className="cds--tabs" style={{ marginBottom: 'var(--cds-spacing-03)', width: '100%', overflowX: 'auto', background: 'var(--cds-background)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                <ul className="cds--tabs__nav" role="tablist" style={{ display: 'flex', gap: '2px', padding: 0, margin: 0, listStyle: 'none' }}>
                    {[
                        { id: 'overtime' as const, label: t('overtime'), count: overtimeRequests.length, icon: '⏱️' },
                        { id: 'leaves' as const, label: t('leaves'), count: leaveRequests.length, icon: '📅' },
                        { id: 'profile' as const, label: t('profile'), count: profileRequests.length, icon: '👤' }
                    ].map(tab => (
                        <li 
                            key={tab.id}
                            className={`cds--tabs__nav-item ${activeTab === tab.id ? 'cds--tabs__nav-item--selected' : ''}`}
                            role="presentation"
                            style={{ flex: '1 0 auto', minWidth: '120px' }}
                        >
                            <button
                                className="cds--tabs__nav-link"
                                onClick={() => { setActiveTab(tab.id); setSelectedIds([]); }}
                                style={{ 
                                    width: '100%',
                                    padding: '0 var(--cds-spacing-05)',
                                    fontSize: '0.75rem',
                                    fontWeight: activeTab === tab.id ? 600 : 400,
                                    background: activeTab === tab.id ? 'var(--cds-layer-01)' : 'transparent',
                                    color: activeTab === tab.id ? 'var(--cds-interactive-01)' : 'var(--cds-text-secondary)',
                                    border: 'none',
                                    borderBottom: activeTab === tab.id ? '2px solid var(--cds-interactive-01)' : '2px solid transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 'var(--cds-spacing-03)',
                                    height: '40px',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <span style={{ opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
                                <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tab.label} ({tab.count})</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <div style={{ display: 'flex', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', flexWrap: 'wrap' }}>
                <input 
                    className="cds--text-input cds--text-input--sm"
                    placeholder="Search employee or role..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ flex: 1, minWidth: '200px', height: '32px' }}
                />
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="cds--select-input" style={{ width: '180px', height: '32px' }}>
                    <option value="ALL">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="cds--select-input" style={{ width: '150px', height: '32px' }}>
                    {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                </select>
                <button onClick={fetchData} className="cds--btn cds--btn--ghost cds--btn--sm" style={{ height: '32px' }}>{t('sync')} 🔄</button>
            </div>

            <div style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', overflowX: 'auto' }}>
                {loading ? (
                    <div style={{ padding: 'var(--cds-spacing-10)', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
                        <div className="cds--loading cds--loading--small" style={{ margin: '0 auto var(--cds-spacing-05) auto' }}></div>
                        Fetching encrypted ledger data...
                    </div>
                ) : (
                    <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}><input type="checkbox" onChange={toggleSelectAll} checked={currentListToDisplay.length > 0 && selectedIds.length === currentListToDisplay.length} /></th>
                                <th>{t('members')}</th>
                                <th>Node Context</th>
                                <th>Quantum</th>
                                <th>Ledger Status</th>
                                <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentListToDisplay.length > 0 ? currentListToDisplay.map((item) => (
                                <tr key={item.id}>
                                    <td><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} /></td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                                          <div style={{ width: '24px', height: '24px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                                            {(activeTab === 'leaves' ? item.employeeName : item.employees?.name)?.[0] || '?'}
                                          </div>
                                          <div>
                                              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{activeTab === 'leaves' ? item.employeeName : item.employees?.name}</div>
                                              <div style={{ fontSize: '0.625rem', opacity: 0.6, textTransform: 'uppercase' }}>{activeTab === 'leaves' ? item.department : item.employees?.department}</div>
                                          </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: '0.75rem' }}>
                                            {activeTab === 'overtime' ? (item.sub_type?.replace('_', ' ') || 'OT_LOG') : activeTab === 'leaves' ? item.type : `PROFILE_SYNC`}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 600, fontSize: '0.75rem' }}>{activeTab === 'overtime' ? `${item.amount}h` : activeTab === 'leaves' ? `${item.days || item.durationHours}${item.days ? 'd' : 'h'}` : '--'}</td>
                                    <td>{getStatusBadge(item.status)}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        {activeTab === 'overtime' && item.status === 'PENDING_MANAGER' && <button onClick={() => handleUpdateStatus(item, 'PENDING_HR', 'Authorized')} className="cds--btn cds--btn--ghost cds--btn--sm">{i18n.language === 'ar' ? 'اعتماد' : 'Authorize'}</button>}
                                        {activeTab === 'leaves' && (item.status === 'Pending' || item.status === 'Pending_Manager') && <button onClick={() => handleUpdateLeave(item, 'Manager_Approved', 'Approved')} className="cds--btn cds--btn--ghost cds--btn--sm">{i18n.language === 'ar' ? 'موافقة' : 'Approve'}</button>}
                                        {activeTab === 'profile' && item.status === 'PENDING' && <button onClick={() => handleUpdateProfile(item, 'approve')} className="cds--btn cds--btn--ghost cds--btn--sm">{i18n.language === 'ar' ? 'مراجعة' : 'Review'}</button>}
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--cds-spacing-10)', color: 'var(--cds-text-disabled)', fontStyle: 'italic' }}>No pending ledger nodes found for this criteria.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
