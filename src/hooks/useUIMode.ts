
import { useState, useEffect } from 'react';

export const useUIMode = () => {
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(window.innerWidth < 1024 ? 'mobile' : 'desktop');
    const [compactMode, setCompactMode] = useState(localStorage.getItem('ui_compact') === 'true');
    const [presentationMode, setPresentationMode] = useState(false);

    useEffect(() => {
        localStorage.setItem('ui_compact', compactMode.toString());
    }, [compactMode]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 1024 && viewMode === 'desktop') setViewMode('mobile');
            else if (window.innerWidth >= 1024 && viewMode === 'mobile' && !localStorage.getItem('force_mobile')) setViewMode('desktop');
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [viewMode]);

    const toggleViewMode = () => {
        const nextMode = viewMode === 'desktop' ? 'mobile' : 'desktop';
        setViewMode(nextMode);
        if (nextMode === 'mobile') localStorage.setItem('force_mobile', 'true');
        else localStorage.removeItem('force_mobile');
    };

    return {
        viewMode,
        setViewMode,
        compactMode,
        setCompactMode,
        presentationMode,
        setPresentationMode,
        toggleViewMode
    };
};
