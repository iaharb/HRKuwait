import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import { fetchProfile } from './lib/api';
import type { LaUser } from './lib/types';
import { Login } from './components/Login';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';
import { NewRequest } from './pages/NewRequest';
import { Requests } from './pages/Requests';
import { RequestDetail } from './pages/RequestDetail';
import { Approvals } from './pages/Approvals';
import { Notifications } from './pages/Notifications';

export type View = 'home' | 'new' | 'requests' | 'detail' | 'approvals' | 'notifications';

interface AppState {
  user: LaUser | null;
  sessionEmail: string | null;
  view: View;
  navigate: (v: View, opts?: { requestId?: string }) => void;
  activeRequestId: string | null;
  refreshTick: number;
  bump: () => void;
  notificationCount: number;
  setNotificationCount: (n: number) => void;
  toast: string | null;
  showToast: (msg: string) => void;
  signOut: () => void;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
};

export default function App() {
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [user, setUser] = useState<LaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('home');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email;
      if (email) {
        setAuthUser(email);
        fetchProfile(email).then((p) => setUser(p));
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      const email = session?.user?.email ?? null;
      setAuthUser(email);
      if (email) fetchProfile(email).then((p) => setUser(p));
      else setUser(null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const navigate = useCallback((v: View, opts?: { requestId?: string }) => {
    if (opts?.requestId) setActiveRequestId(opts.requestId);
    setView(v);
    window.scrollTo(0, 0);
  }, []);

  const bump = useCallback(() => setRefreshTick((t) => t + 1), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((window as any).__toastT);
    (window as any).__toastT = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAuthUser(null);
    setView('home');
  }, []);

  const pushNotificationCount = useCallback((n: number) => setNotificationCount(n), []);

  if (loading) return <div className="loader">Loading…</div>;

  if (!authUser || !user) {
    return (
      <Login onDone={(email, profile) => {
        setAuthUser(email);
        setUser(profile);
        setView('home');
      }} />
    );
  }

  const state: AppState = {
    user,
    sessionEmail: authUser,
    view,
    navigate,
    activeRequestId,
    refreshTick,
    bump,
    notificationCount,
    setNotificationCount: pushNotificationCount,
    toast,
    showToast,
    signOut,
  };

  return (
    <Ctx.Provider value={state}>
      <div className="app">
        <Shell>
          {view === 'home' && <Home />}
          {view === 'new' && <NewRequest />}
          {view === 'requests' && <Requests />}
          {view === 'detail' && activeRequestId && <RequestDetail requestId={activeRequestId} />}
          {view === 'approvals' && <Approvals />}
          {view === 'notifications' && <Notifications />}
        </Shell>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}