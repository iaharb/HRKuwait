import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { Announcement } from '../types/types';
import { useTranslation } from 'react-i18next';

const IntelligentTicker: React.FC = () => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const isAr = language.startsWith('ar');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const fetchAnnouncements = async () => {
    try {
      const data = await dbService.getAnnouncements();

      // Inject AI Draft Alert
      data.unshift({
        id: 'ai-finance-alert',
        title: 'Draft Alert',
        titleArabic: 'تنبيه',
        content: "JV Generator: $0.000 balance detected in current run. Check mapping rules for 'Other Allowances'.",
        contentArabic: "اكتشاف رصيد 0.000. يرجى التحقق من قواعد خريطة الحسابات المالية.",
        priority: 'Urgent',
        createdAt: new Date().toISOString()
      });

      // Duplicate for seamless looping if we have few items
      const items = data.length > 0 && data.length < 3 ? [...data, ...data, ...data] : data;
      setAnnouncements(items);
    } catch (e) {
      console.error("Failed to fetch announcements", e);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 60000);
    return () => clearInterval(interval);
  }, []);

  if (announcements.length === 0) return null;

  return (
    <div className="relative h-8 bg-white border border-slate-200/40 rounded-xl overflow-hidden flex items-center mb-6 shrink-0 shadow-sm" dir={isAr ? 'rtl' : 'ltr'}>
      <div className={`absolute ${isAr ? 'right-0' : 'left-0'} top-0 bottom-0 px-4 bg-indigo-600 text-white flex items-center z-10 font-black text-[8px] uppercase tracking-[0.2em]`}>
        {t('registryIntelligence')}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="animate-ticker-pro py-1">
          {/* Render multiple times to ensure enough width for the loop animation */}
          {[...announcements, ...announcements].map((ann, idx) => {
            const title = isAr && ann.titleArabic ? ann.titleArabic : ann.title;
            const content = isAr && ann.contentArabic ? ann.contentArabic : ann.content;
            return (
              <div key={`${ann.id}-${idx}`} className="inline-flex items-center gap-3 mx-8 text-[10px] font-bold text-slate-500">
                <div className={`w-1.5 h-1.5 rounded-full ${ann.priority === 'Urgent' ? 'bg-rose-500 animate-pulse' : 'bg-indigo-400'}`}></div>
                <span className="text-slate-900 font-black uppercase tracking-tight">{title}</span>
                <span className="opacity-30">/</span>
                <span className="font-medium whitespace-nowrap">{content}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default IntelligentTicker;
