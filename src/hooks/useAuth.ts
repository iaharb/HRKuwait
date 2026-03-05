
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { User, UserRole } from '../types/types.ts';

export const useAuth = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        const savedUser = localStorage.getItem('app_user_session');
        return savedUser ? JSON.parse(savedUser) : null;
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
        const initializeAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const metadata = session.user.user_metadata;
                setCurrentUser({
                    id: metadata.employee_id || session.user.id,
                    name: metadata.name || session.user.email,
                    role: metadata.role || 'Employee',
                    department: metadata.department || 'Global',
                    email: session.user.email
                } as User);
            }
            setLoading(false);
        };
        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const metadata = session.user.user_metadata;
                setCurrentUser({
                    id: metadata.employee_id || session.user.id,
                    name: metadata.name || session.user.email,
                    role: metadata.role || 'Employee',
                    department: metadata.department || 'Global',
                    email: session.user.email
                } as User);
            } else {
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
