/* File: src/App.tsx */
import { FinanceMappingSettings } from './components/FinanceMappingSettings.tsx';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './services/supabaseClient.ts';
import Sidebar from './components/Sidebar.tsx';
import Dashboard from './components/Dashboard.tsx';
import EmployeeDirectory from './components/EmployeeDirectory.tsx';
import AiInsights from './components/AiInsights.tsx';
import ComplianceView from './components/ComplianceView.tsx';
import ProfileView from './components/ProfileView.tsx';
import LeaveManagement from './components/LeaveManagement.tsx';
import PayrollView from './components/PayrollView.tsx';
import SettlementView from './components/SettlementView.tsx';
import AttendanceView from './components/AttendanceView.tsx';
import AdminCenter from './components/AdminCenter.tsx';
import Whitepaper from './components/Whitepaper.tsx';
import MandoobDashboard from './components/MandoobDashboard.tsx';
import EmployeeModal from './components/AddEmployeeModal.tsx';
import IntelligentTicker from './components/IntelligentTicker.tsx';
import Login from './components/Login.tsx';
import MobileApp from './mobile/App.tsx';
import MobileLogin from './mobile/Login.tsx';
import { ManagementDashboard } from './components/ManagementDashboard.tsx';
import { UserManagement } from './components/UserManagement.tsx';
import { View, User, Notification, Employee } from './types.ts';
import { dbService } from './services/dbService.ts';
import { useTranslation } from 'react-i18next';
import { useTheme } from './components/ThemeContext.tsx';

const ScopeDirectoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  user: User;
  language: string;
}> = ({ isOpen, onClose, user, language }) => {
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

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('app_user_session');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('app_user_session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('app_user_session');
    }
  }, [currentUser]);

  const [loading, setLoading] = useState(true);
  const [currentView, setView] = useState<View>(View.Dashboard);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(window.innerWidth < 1024 ? 'mobile' : 'desktop');
  const [compactMode, setCompactMode] = useState(localStorage.getItem('ui_compact') === 'true');
  const [presentationMode, setPresentationMode] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  const language = i18n.language as 'en' | 'ar';
  const setLanguage = (lang: 'en' | 'ar') => i18n.changeLanguage(lang);

  useEffect(() => {
    localStorage.setItem('ui_compact', compactMode.toString());
  }, [compactMode]);

  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          name: session.user.user_metadata.name || session.user.email,
          role: session.user.user_metadata.role || 'Employee',
          department: session.user.user_metadata.department || 'Global',
        } as User);
      }
      setLoading(false);
    };
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          name: session.user.user_metadata.name || session.user.email,
          role: session.user.user_metadata.role || 'Employee',
          department: session.user.user_metadata.department || 'Global',
        } as User);
      } else {
        // If there's no Supabase auth session, only logout if we don't have a local mock session
        const hasMockSession = localStorage.getItem('app_user_session');
        if (!hasMockSession) {
          setCurrentUser(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Inactivity timeout (30 minutes)
  useEffect(() => {
    if (!currentUser) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // Log out user after 30s of inactivity
        setCurrentUser(null);
        localStorage.removeItem('app_user_session');
      }, 1800000); // 30 minutes
    };

    // Initialize timer
    resetTimer();

    // Listen to all activity events
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer));

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [currentUser]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024 && viewMode === 'desktop') setViewMode('mobile');
      else if (window.innerWidth >= 1024 && viewMode === 'mobile' && !localStorage.getItem('force_mobile')) setViewMode('desktop');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  useEffect(() => {
    if (currentUser) {
      setView(currentUser.role === 'Employee' ? View.Profile : View.Dashboard);
      fetchNotifications();
    }
  }, [currentUser]);

  const fetchNotifications = async () => {
    if (currentUser) {
      try {
        const data = await dbService.getNotifications(currentUser.id);
        setNotifications(data);
      } catch (e) { console.error(e); }
    }
  };

  const handleRefresh = () => { setRefreshKey(prev => prev + 1); fetchNotifications(); };
  const handleEditEmployee = (emp: Employee) => { setEmployeeToEdit(emp); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setEmployeeToEdit(null); };

  const toggleViewMode = () => {
    const nextMode = viewMode === 'desktop' ? 'mobile' : 'desktop';
    setViewMode(nextMode);
    if (nextMode === 'mobile') localStorage.setItem('force_mobile', 'true');
    else localStorage.removeItem('force_mobile');
  };

  const getViewTitle = (view: View) => {
    switch (view) {
      case View.Dashboard: return t('dashboard');
      case View.Directory: return t('directory');
      case View.Insights: return t('insights');
      case View.Compliance: return t('compliance');
      case View.Profile: return t('profile');
      case View.Leaves: return t('leaves');
      case View.Payroll: return t('payroll');
      case View.Settlement: return t('settlement');
      case View.Attendance: return t('attendance');
      case View.AdminCenter: return t('adminCenter');
      case View.Whitepaper: return t('whitepaper');
      case View.Mandoob: return language === 'ar' ? 'أعمال المندوب' : 'Mandoob Dashboard';
      case View.Finance: return 'Finance Mapping';
      case View.Management: return t('strategy');
      case View.UserManagement: return 'Security & Roles';
      default: return '';
    }
  };

  const renderView = () => {
    switch (currentView) {
      case View.Dashboard: return <Dashboard user={currentUser!} onNavigate={setView} key={`dash-${refreshKey}`} language={language} />;
      case View.Directory: return <EmployeeDirectory user={currentUser!} onAddClick={() => setIsModalOpen(true)} onEditClick={handleEditEmployee} key={`dir-${refreshKey}`} language={language} />;
      case View.Insights: return <AiInsights key={`ai-${refreshKey}`} />;
      case View.Compliance: return <ComplianceView key={`comp-${refreshKey}`} />;
      case View.Profile: return <ProfileView user={currentUser!} key={`profile-${refreshKey}`} />;
      case View.Leaves: return <LeaveManagement user={currentUser!} key={`leaves-${refreshKey}`} />;
      case View.Payroll: return <PayrollView user={currentUser!} key={`pay-${refreshKey}`} />;
      case View.Settlement: return <SettlementView key={`settle-${refreshKey}`} />;
      case View.Attendance: return <AttendanceView user={currentUser!} key={`attend-${refreshKey}`} />;
      case View.AdminCenter: return <AdminCenter key={`admin-${refreshKey}`} />;
      case View.Whitepaper: return <Whitepaper key={`wp-${refreshKey}`} />;
      case View.Mandoob: return <MandoobDashboard key={`mandoob-${refreshKey}`} />;
      case View.Finance: return <FinanceMappingSettings key={`finance-${refreshKey}`} />;
      case View.Management: return <ManagementDashboard key={`manage-${refreshKey}`} />;
      case View.UserManagement: return <UserManagement key={`user-${refreshKey}`} />;
      default: return null;
    }
  };

  const handleLogin = (user: User) => {
    // Core access and role normalization
    let updatedUser = { ...user };


    // Normalize role casing from DB (case-insensitive match → canonical form)
    const roleLower = updatedUser.role.toLowerCase().trim();
    const roleMap: Record<string, typeof updatedUser.role> = {
      'admin': 'Admin',
      'hr': 'HR',
      'manager': 'Manager',
      'employee': 'Employee',
      'mandoob': 'Mandoob',
      'executive': 'Executive',
      'hr officer': 'HR Officer',
      'hr manager': 'HR Manager',
      'payroll officer': 'Payroll Officer',
      'payroll manager': 'Payroll Manager',
    };
    if (roleMap[roleLower]) updatedUser.role = roleMap[roleLower];

    setCurrentUser(updatedUser);
  };

  const renderAppStructure = () => {
    if (viewMode === 'mobile') {
      if (!currentUser) {
        return <MobileLogin onLogin={handleLogin} language={language} setLanguage={setLanguage} onSwitchToDesktop={() => { localStorage.removeItem('force_mobile'); setViewMode('desktop'); }} />;
      }
      return <MobileApp user={currentUser} language={language} setLanguage={setLanguage} onLogout={() => setCurrentUser(null)} onSwitchToDesktop={() => { localStorage.removeItem('force_mobile'); setViewMode('desktop'); }} />;
    }

    if (!currentUser) {
      return <Login onLogin={handleLogin} language={language} />;
    }

    return (
      <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
        <Sidebar currentView={currentView} setView={setView} user={currentUser} language={language} setLanguage={setLanguage} onLogout={() => setCurrentUser(null)} onToggleMobile={toggleViewMode} onAddMember={() => { setEmployeeToEdit(null); setIsModalOpen(true); }} />
        <main className={`flex-1 min-w-0 overflow-y-auto transition-all duration-500 ${compactMode ? 'compact-ui' : ''} ${presentationMode ? 'presentation-main' : ''}`}>
          <div className={`h-full ${compactMode ? 'px-6 py-4' : 'px-12 py-8'} ${presentationMode ? 'max-w-full' : 'max-w-[1500px] mx-auto'}`}>
            <div className={`flex items-center justify-between ${compactMode ? 'mb-6' : 'mb-12'} no-print`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span className="hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => setView(View.Dashboard)}>{t('enterprise')}</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-indigo-600">{getViewTitle(currentView)}</span>
                </div>
                <h1 className={`${compactMode ? 'text-xl' : 'text-2xl'} font-black text-slate-900 tracking-tight`}>{getViewTitle(currentView)}</h1>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={toggleTheme} className={`flex items-center justify-center p-2 rounded-xl transition-all ${theme === 'shadcn' ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50 shadow-sm'}`} title="Toggle UI Design Language">
                  {theme === 'shadcn' ? '🔳 Shadcn Base' : '🪩 Glassmorphism'}
                </button>
                <button onClick={() => setCompactMode(!compactMode)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${compactMode ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                  <span className="text-[10px] font-black uppercase tracking-wider">{compactMode ? '🗜️ Compact' : '📏 Normal'}</span>
                </button>
                <button onClick={() => setPresentationMode(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-white text-slate-500 hover:bg-slate-50">
                  <span className="text-[10px] font-black uppercase tracking-wider">📽️ Present</span>
                </button>
                <div className="relative" ref={notificationRef}>
                  <button onClick={() => setShowNotifications(!showNotifications)} className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${showNotifications ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>
                    <span className="text-xl">🔔</span>
                    {notifications.filter(n => !n.isRead).length > 0 && <span className="absolute -top-1 right-0 w-4 h-4 bg-rose-500 text-white text-[8px] rounded-full flex items-center justify-center border-2 border-white">{notifications.filter(n => !n.isRead).length}</span>}
                  </button>
                </div>
                <button onClick={() => setIsScopeModalOpen(true)} className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 h-11 hover:bg-slate-50 transition-all">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {currentUser.role === 'Admin' ? 'Global Admin' : `${currentUser.department} Scope`}
                  </span>
                </button>
              </div>
            </div>
            <IntelligentTicker />
            <div className="pb-24">{renderView()}</div>
          </div>
        </main>
        <EmployeeModal isOpen={isModalOpen} onClose={handleCloseModal} language={language} onSuccess={handleRefresh} employeeToEdit={employeeToEdit} />
        <ScopeDirectoryModal isOpen={isScopeModalOpen} onClose={() => setIsScopeModalOpen(false)} user={currentUser} language={language} />
      </div>
    );
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-900">
      <div className="text-indigo-500 font-black tracking-tighter animate-pulse text-2xl">SECURE_SESSION_RECOVERY...</div>
    </div>
  );

  return (
    <div className={presentationMode ? 'presentation-stage' : ''} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {presentationMode ? (
        <>
          <div className="presentation-frame">
            <div className="presentation-inner">{renderAppStructure()}</div>
          </div>
          <div className="presentation-controls">
            <div className="flex items-center gap-6 px-4">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em]">Projection</span>
                <span className="text-[10px] font-black text-white uppercase tracking-widest">16:9 Presentation Mode</span>
              </div>
              <button onClick={() => setPresentationMode(false)} className="px-6 py-2 bg-rose-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-rose-700">Exit Stage</button>
            </div>
          </div>
        </>
      ) : renderAppStructure()}
    </div>
  );
};

export default App;