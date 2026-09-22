import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'glass' | 'shadcn' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        return (localStorage.getItem('ui_theme') as Theme) || 'glass';
    });

    useEffect(() => {
        localStorage.setItem('ui_theme', theme);
        const root = window.document.documentElement;
        root.classList.remove('theme-glass', 'theme-shadcn', 'theme-dark');
        root.classList.add(`theme-${theme}`);
        // Wire data attribute for Carbon tokens
        root.setAttribute('data-carbon-theme', theme === 'dark' ? 'g100' : 'white');
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => {
            if (prev === 'glass') return 'dark';
            if (prev === 'dark') return 'shadcn';
            return 'glass';
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
};
