
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { User, UserRole } from '../types/types.ts';

export const useAuth = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        try {
            const savedUser = localStorage.getItem('app_user_session');
            return savedUser ? JSON.parse(savedUser) : null;
        } catch (e) {
            console.error("[useAuth] Failed to parse saved session:", e);
            localStorage.removeItem('app_user_session');
            return null;
        }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (currentUser) {
            localStorage.setItem('app_user_session', JSON.stringify(currentUser));
        } else {
            localStorage.removeItem('app_user_session');
        }
    }, [currentUser]);

    useEffect(() => {
        const fetchAndSyncUser = async (session: any) => {
            if (!session?.user) return null;
            const metadata = session.user.user_metadata;
            let role = metadata.role || 'Employee';

            try {
                // Try to get live role from app_users or employees to bypass stale metadata
                const identifier = session.user.email.split('@')[0].toLowerCase();
                
                // Add a short timeout for the live role sync to prevent hanging the whole auth flow
                const roleSyncPromise = (async () => {
                    const { data: appUser } = await supabase
                        .from('app_users')
                        .select('role')
                        .eq('username', identifier)
                        .single();

                    if (appUser?.role) return appUser.role;

                    const { data: emp } = await supabase
                        .from('employees')
                        .select('role')
                        .eq('email', session.user.email)
                        .single();
                    return emp?.role || role;
                })();

                const timeoutPromise = new Promise<string>((resolve) => 
                    setTimeout(() => resolve(role), 3000)
                );

                role = await Promise.race([roleSyncPromise, timeoutPromise]);
            } catch (e) {
                console.warn("[useAuth] Live role sync failed, using metadata fallback:", e);
            }

            return {
                id: metadata.employee_id || session.user.id,
                name: metadata.name || session.user.email,
                role: role,
                department: metadata.department || 'Global',
                email: session.user.email
            } as User;
        };

        const initializeAuth = async () => {
            // Safety timeout: never stay in loading for more than 5s
            const timer = setTimeout(() => {
                setLoading(false);
                console.warn("[useAuth] Auth initialization timed out - forcing loading to false");
            }, 5000);

            try {
                if (!supabase) {
                    console.error("[useAuth] Supabase client is not configured.");
                    setLoading(false);
                    return;
                }
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    const liveUser = await fetchAndSyncUser(session);
                    if (liveUser) setCurrentUser(liveUser);
                }
            } catch (error) {
                console.error("[useAuth] Failed to initialize auth:", error);
            } finally {
                clearTimeout(timer);
                setLoading(false);
            }
        };
        initializeAuth();

        if (!supabase) return;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            try {
                if (session) {
                    const liveUser = await fetchAndSyncUser(session);
                    if (liveUser) setCurrentUser(liveUser);
                } else {
                    const hasMockSession = localStorage.getItem('app_user_session');
                    if (!hasMockSession) {
                        setCurrentUser(null);
                    }
                }
            } catch (error) {
                console.error("[useAuth] Auth state change handler failed:", error);
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
                setCurrentUser(null);
                localStorage.removeItem('app_user_session');
            }, 1800000); // 30 minutes
        };

        resetTimer();

        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, resetTimer));

        return () => {
            clearTimeout(timeoutId);
            events.forEach(e => window.removeEventListener(e, resetTimer));
        };
    }, [currentUser]);

    const login = (user: User) => {
        let updatedUser = { ...user };
        const roleLower = updatedUser.role.toLowerCase().trim();
        const roleMap: Record<string, string> = {
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
        if (roleMap[roleLower]) updatedUser.role = roleMap[roleLower] as UserRole;
        setCurrentUser(updatedUser);
    };

    const logout = () => {
        setCurrentUser(null);
        localStorage.removeItem('app_user_session');
        supabase.auth.signOut();
    };

    return { currentUser, loading, login, logout, setCurrentUser };
};
