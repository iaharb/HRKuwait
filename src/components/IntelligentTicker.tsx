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
    <div style={{ position: 'relative', height: '24px', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', overflow: 'hidden', display: 'flex', alignItems: 'center', marginBottom: 'var(--cds-spacing-04)', flexShrink: 0 }} dir={isAr ? 'rtl' : 'ltr'}>
      <div style={{ 
        position: 'absolute', 
        [isAr ? 'right' : 'left']: 0, 
        top: 0, 
        bottom: 0, 
        padding: '0 var(--cds-spacing-04)', 
        background: 'var(--cds-interactive-01)', 
        color: '#ffffff', 
        display: 'flex', 
        alignItems: 'center', 
        zIndex: 10, 
        fontSize: '0.625rem', 
        fontWeight: 600, 
        textTransform: 'uppercase', 
        letterSpacing: '0.1em' 
      }}>
        {t('registryIntelligence')}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div className="animate-ticker-pro">
          {/* Render multiple times to ensure enough width for the loop animation */}
          {[...announcements, ...announcements].map((ann, idx) => {
            const title = isAr && ann.titleArabic ? ann.titleArabic : ann.title;
            const content = isAr && ann.contentArabic ? ann.contentArabic : ann.content;
            return (
              <div key={`${ann.id}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--cds-spacing-03)', margin: '0 var(--cds-spacing-07)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: ann.priority === 'Urgent' ? 'var(--cds-text-error)' : 'var(--cds-interactive-01)' }}></div>
                <span style={{ color: 'var(--cds-text-primary)', fontWeight: 600, textTransform: 'uppercase' }}>{title}</span>
                <span style={{ opacity: 0.3 }}>/</span>
                <span style={{ fontWeight: 400, whiteSpace: 'nowrap' }}>{content}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default IntelligentTicker;
