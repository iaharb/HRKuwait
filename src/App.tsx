
/* File: src/App.tsx */
import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar.tsx';
import MainHeader from './components/MainHeader.tsx';
import ViewRenderer from './components/ViewRenderer.tsx';
import ScopeDirectoryModal from './components/ScopeDirectoryModal.tsx';
import EmployeeModal from './components/AddEmployeeModal.tsx';
import IntelligentTicker from './components/IntelligentTicker.tsx';
import Login from './components/Login.tsx';
import MobileApp from './mobile/App.tsx';
import MobileLogin from './mobile/Login.tsx';
import { View, Employee, User } from './types/types.ts';
import { useTranslation } from 'react-i18next';
import { useTheme } from './components/ThemeContext.tsx';
import { useAuth } from './hooks/useAuth.ts';
import { useNotificationsFetch } from './hooks/useNotifications.ts';
import { useUIMode } from './hooks/useUIMode.ts';
import { useNavigate } from 'react-router-dom';

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, loading, login, logout } = useAuth();
  const {
    viewMode,
    setViewMode,
    compactMode,
    setCompactMode,
    presentationMode,
    setPresentationMode,
    toggleViewMode
  } = useUIMode();

  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    notifications,
    showNotifications,
    setShowNotifications,
    fetchNotifications
  } = useNotificationsFetch(currentUser);

  const { theme, toggleTheme } = useTheme();

  const language = i18n.language as 'en' | 'ar';
  const setLanguage = (lang: 'en' | 'ar') => i18n.changeLanguage(lang);

  useEffect(() => {
    if (currentUser) {
      fetchNotifications();
    }
  }, [currentUser, fetchNotifications]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    fetchNotifications();
  };

  const handleEditEmployee = (emp: Employee) => {
    setEmployeeToEdit(emp);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEmployeeToEdit(null);
  };

  const navigateTo = (view: View) => {
    navigate(`/${view.toLowerCase()}`);
  };

  const handleAuthLogin = (user: User) => {
    login(user);
    let defaultRoute = '/dashboard';
    if (user.role === 'Employee') {
      defaultRoute = '/profile';
    } else if (user.role === 'Manager') {
      defaultRoute = '/directory';
    }
    navigate(defaultRoute, { replace: true });
  };

  const handleAuthLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const renderAppStructure = () => {
    if (viewMode === 'mobile') {
      if (!currentUser) {
        return (
          <MobileLogin
            onLogin={handleAuthLogin}
            language={language}
            setLanguage={setLanguage}
            onSwitchToDesktop={() => {
              localStorage.removeItem('force_mobile');
              setViewMode('desktop');
            }}
          />
        );
      }
      return (
        <MobileApp
          user={currentUser}
          language={language}
          setLanguage={setLanguage}
          onLogout={handleAuthLogout}
          onSwitchToDesktop={() => {
            localStorage.removeItem('force_mobile');
            setViewMode('desktop');
          }}
        />
      );
    }

    if (!currentUser) {
      return <Login onLogin={handleAuthLogin} language={language} />;
    }

    return (
      <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
        <Sidebar
          user={currentUser}
          language={language}
          setLanguage={setLanguage}
          onLogout={handleAuthLogout}
          onToggleMobile={toggleViewMode}
          onAddMember={() => { setEmployeeToEdit(null); setIsModalOpen(true); }}
          compactMode={compactMode}
        />
        <main className={`flex-1 min-w-0 overflow-y-auto transition-all duration-500 ${compactMode ? 'compact-ui' : ''} ${presentationMode ? 'presentation-main' : ''}`}>
          <div className={`h-full ${compactMode ? 'px-6 py-2' : 'px-8 py-6'} ${presentationMode ? 'max-w-full' : 'max-w-[1500px] mx-auto'}`}>
            <MainHeader
              user={currentUser}
              language={language}
              theme={theme}
              toggleTheme={toggleTheme}
              compactMode={compactMode}
              setCompactMode={setCompactMode}
              presentationMode={presentationMode}
              setPresentationMode={setPresentationMode}
              notifications={notifications}
              showNotifications={showNotifications}
              setShowNotifications={setShowNotifications}
              onOpenScopeModal={() => setIsScopeModalOpen(true)}
            />
            <IntelligentTicker />
            <div className="pb-24">
              <ViewRenderer
                user={currentUser}
                language={language}
                refreshKey={refreshKey}
                onNavigate={navigateTo}
                onOpenEmployeeModal={() => setIsModalOpen(true)}
                onEditEmployee={handleEditEmployee}
                compactMode={compactMode}
                presentationMode={presentationMode}
              />
            </div>
          </div>
        </main>
        <EmployeeModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          language={language}
          onSuccess={handleRefresh}
          employeeToEdit={employeeToEdit}
        />
        <ScopeDirectoryModal
          isOpen={isScopeModalOpen}
          onClose={() => setIsScopeModalOpen(false)}
          user={currentUser}
          language={language}
        />
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
