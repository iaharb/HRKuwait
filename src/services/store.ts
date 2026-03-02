
import { create } from 'zustand';
import { User, Notification } from '../types/types.ts';

interface AppState {
    currentUser: User | null;
    setCurrentUser: (user: User | null) => void;
    notifications: Notification[];
    setNotifications: (notifications: Notification[]) => void;
    compactMode: boolean;
    setCompactMode: (mode: boolean) => void;
    theme: 'shadcn' | 'glass';
    setTheme: (theme: 'shadcn' | 'glass') => void;
}

export const useStore = create<AppState>((set) => ({
    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),
    notifications: [],
    setNotifications: (notifications) => set({ notifications }),
    compactMode: localStorage.getItem('ui_compact') === 'true',
    setCompactMode: (mode) => {
        localStorage.setItem('ui_compact', mode.toString());
        set({ compactMode: mode });
    },
    theme: (localStorage.getItem('app_theme') as any) || 'glass',
    setTheme: (theme) => {
        localStorage.setItem('app_theme', theme);
        set({ theme });
    },
}));
