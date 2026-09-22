
import React from 'react';
import { useTranslation } from 'react-i18next';

const Whitepaper: React.FC = () => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  const sections = [
    {
      title: language === 'ar' ? '١. سجل القوى العاملة والامتثال الوطني (PAM)' : '1. Workforce Registry & National Compliance (PAM)',
      icon: '🏛️',
      items: [
        {
          label: language === 'ar' ? 'مراقبة حصة التوطين' : 'Kuwaitization Quota Monitoring',
          desc: language === 'ar' 
            ? 'تتبع حي لنسبة العمالة الوطنية مقابل الوافدة مع تنبيهات ذكية للمديرين عند انخفاض النسبة عن المستهدفات الحكومية المحددة من قبل الهيئة العامة للقوى العاملة.'
            : 'Real-time tracking of National vs. Expat ratios with intelligent alerts when segments fall below government mandates defined by the Public Authority for Manpower.'
        },
        {
          label: language === 'ar' ? 'بروتوكول الرقابة التنفيذية' : 'Executive Oversight Protocol',
          desc: language === 'ar'
            ? 'منطق وصول هرمي يضمن بقاء القيادة العليا (الرئيس التنفيذي) مرئياً لكافة مديري الأقسام لضمان الشفافية الإدارية وسرعة اتخاذ القرار.'
            : 'Hierarchical access logic ensuring top leadership (CEO) remains visible to all Department Managers to maintain administrative transparency and rapid decision-making.'
        },
        {
          label: language === 'ar' ? 'إدارة البدلات والوحدات المالية' : 'Structured Allowance Engine',
          desc: language === 'ar'
            ? 'تخصيص بدلات ثابتة أو مئوية (سكن، سيارة، هاتف) مع منطق حسابي آلي يربطها بالخصومات المالية لضمان دقة كشوف الرواتب.'
            : 'Defined fixed or percentage-based allowances (Housing, Car, Mobile) with automated calculation logic tied to financial deductions for payroll precision.'
        }
      ]
    },
    {
      title: language === 'ar' ? '٢. بروتوكول الحضور البيومتري الذكي' : '2. Biometric Geo-Attendance Protocol',
      icon: '🧬',
      items: [
        {
          label: language === 'ar' ? 'المصادقة ثلاثية الأبعاد' : '3-Step Verification Protocol',
          desc: language === 'ar'
            ? 'دمج التحقق من الموقع الجغرافي (GPS) مع بصمة الوجه (Facial Recognition) قبل تأكيد الحضور في السجل الرسمي، مما يمنع التلاعب الجغرافي.'
            : 'Integration of GPS perimeter validation with Facial Recognition handshakes before committing shifts to the official registry, preventing location spoofing.'
        },
        {
          label: language === 'ar' ? 'ترميز البيانات البيومترية' : 'Biometric Data Encryption',
          desc: language === 'ar'
            ? 'يتم تحويل ملامح الوجه إلى رموز مشفرة غير قابلة للاسترجاع لضمان خصوصية الموظف والامتثال لقوانين حماية البيانات.'
            : 'Facial features are converted into irreversible encrypted hashes to ensure employee privacy and compliance with data protection regulations.'
        }
      ]
    },
    {
      title: language === 'ar' ? '٣. مركز الإجازات وقانون العمل الكويتي' : '3. Leave Hub & Kuwaiti Labor Law',
      icon: '📋',
      items: [
        {
          label: language === 'ar' ? 'منطق المادتين ٦٩ و ٧٠' : 'Article 69/70 Logic',
          desc: language === 'ar'
            ? 'حساب تلقائي للإجازات المرضية والسنوية مع استبعاد العطلات الرسمية وعطلات نهاية الأسبوع بناءً على جدول العمل (٥ أو ٦ أيام).'
            : 'Automated sick/annual calculations with exclusion of Public Holidays and weekends based on work schedule (5 or 6 days).'
        },
        {
          label: language === 'ar' ? 'إجازة الحج (مادة ٤٧)' : 'Haj Leave (Article 47)',
          desc: language === 'ar'
            ? 'تطبيق تلقائي لإجازة الحج مدفوعة الأجر (٢١ يوماً) للموظفين الذين أتموا سنتين من الخدمة، تمنح لمرة واحدة.'
            : 'Automated application of paid Haj Leave (21 days) for employees completing 2 years of service, granted once per career.'
        }
      ]
    },
    {
      title: language === 'ar' ? '٤. محرك الرواتب وحماية الأجور (WPS)' : '4. Payroll Console & WPS Engine',
      icon: '💰',
      items: [
        {
          label: language === 'ar' ? 'تنسيق البنوك الكويتية' : 'Kuwait Bank WPS Export',
          desc: language === 'ar'
            ? 'تصدير كشوف الرواتب بصيغة CSV المتوافقة مع متطلبات البنوك الكويتية ونظام حماية الأجور (نظام الـ WPS).'
            : 'Exporting payroll files in CSV formats strictly compliant with Kuwaiti bank requirements and the Wage Protection System (WPS).'
        },
        {
          label: language === 'ar' ? 'تدقيق مكافأة نهاية الخدمة' : 'EOS Indemnity Audit (Art 51)',
          desc: language === 'ar'
            ? 'محرك حساب نهاية الخدمة بناءً على المادة ٥١، مع التمييز بين الاستقالة وإنهاء الخدمة في المضاعفات المالية بناءً على سنوات الخدمة.'
            : 'Indemnity engine based on Article 51, distinguishing between resignation and termination in financial multipliers based on years of service.'
        }
      ]
    },
    {
      title: language === 'ar' ? '٥. الذكاء الاصطناعي والتحليلات التنبؤية' : '5. Generative AI & Predictive Analytics',
      icon: '✨',
      items: [
        {
          label: language === 'ar' ? 'تحليل التوطين الاستراتيجي' : 'Strategic Nationalization Analysis',
          desc: language === 'ar'
            ? 'استخدام محرك Gemini لتحليل بيانات الموظفين وتقديم توصيات لرفع كفاءة القوى العاملة الوطنية بما يتماشى مع رؤية ٢٠٣٥.'
            : 'Utilizing Gemini AI to analyze workforce data and provide recommendations for optimizing national talent participation in line with Vision 2035.'
        },
        {
          label: language === 'ar' ? 'توقعات توفر القوى العاملة' : 'Workforce Availability Forecasting',
          desc: language === 'ar'
            ? 'خريطة حرارية ذكية تتوقع نقص الموظفين خلال ٣٠ يوماً بناءً على طلبات الإجازات المعتمدة والمعلقة لضمان استمرارية الأعمال.'
            : 'Intelligent heatmaps predicting staffing shortages over a 30-day window based on approved and pending leave requests to ensure business continuity.'
        }
      ]
    }
  ];

  const handleExport = () => {
    const isAr = language === 'ar';
    const content = `
      <!DOCTYPE html>
      <html lang="${language}" dir="${isAr ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Enterprise HR Whitepaper 2025</title>
        <style>
          :root {
            --cds-background: #161616;
            --cds-layer-01: #262626;
            --cds-text-primary: #f4f4f4;
            --cds-text-secondary: #c6c6c6;
            --cds-interactive-01: #0f62fe;
            --cds-border-subtle: #393939;
          }
          body { 
            font-family: monospace; 
            background: var(--cds-background); 
            color: var(--cds-text-primary); 
            margin: 0;
            padding: 40px; 
          }
          .page-container {
            background: var(--cds-background);
            border: 1px solid var(--cds-border-subtle);
            padding: 40px;
            max-width: 900px;
            margin: auto;
            position: relative;
            overflow: hidden;
          }
          .watermark {
            position: absolute;
            top: 20px;
            ${isAr ? 'left: 20px;' : 'right: 20px;'}
            opacity: 0.05;
            font-size: 150px;
            pointer-events: none;
            z-index: 0;
          }
          h1, h2, h3, h4 { margin: 0; color: var(--cds-text-primary); }
          .header { text-align: left; border-bottom: 2px solid var(--cds-border-subtle); padding-bottom: 20px; margin-bottom: 40px; }
          .header-tag { display: inline-block; padding: 4px 12px; background: rgba(15, 98, 254, 0.1); border: 1px solid rgba(15, 98, 254, 0.2); color: var(--cds-interactive-01); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; }
          .section-block { margin-bottom: 40px; padding: 20px; background: var(--cds-layer-01); border: 1px solid var(--cds-border-subtle); }
          .section-header { display: flex; align-items: center; gap: 16px; border-bottom: 1px solid var(--cds-border-subtle); padding-bottom: 16px; margin-bottom: 24px; }
          .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          .item-label { font-size: 12px; font-weight: 700; color: var(--cds-interactive-01); text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
          .item-desc { font-size: 14px; color: var(--cds-text-secondary); line-height: 1.5; }
          .footer { text-align: center; border-top: 1px solid var(--cds-border-subtle); padding-top: 20px; margin-top: 40px; font-size: 10px; color: var(--cds-text-secondary); text-transform: uppercase; }
          
          @media print {
            body { padding: 0; background: white; color: black; }
            .page-container { border: none; width: 100%; max-width: 100%; padding: 20px; background: white; }
            .section-block { background: white; border: 1px solid #ccc; page-break-inside: avoid; }
            .header-tag { border-color: #0f62fe; }
            .item-label { color: black; }
            .item-desc { color: #333; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="page-container">
          <div class="watermark">🇰🇼</div>
          
          <div class="header relative z-10">
             <div class="header-tag">
               Official Registry Protocol v4.0
             </div>
             <h1 style="font-size: 32px; font-weight: 700;">${isAr ? 'الورقة البيضاء للمنصة' : 'SYSTEM_WHITEPAPER_NODE'}</h1>
             <p style="color: var(--cds-text-secondary); font-size: 14px; margin-top: 8px;">
               ${isAr 
                 ? 'المواصفات الفنية لعام ٢٠٢٥ وتطبيقات قانون العمل والامتثال' 
                 : 'Technical Specifications & Kuwait Labor Law Implementation Framework 2025'}
             </p>
          </div>

          <div class="relative z-10">
            ${sections.map((s, idx) => `
              <div class="section-block">
                <div class="section-header">
                  <span style="font-size: 24px;">${s.icon}</span>
                  <h2 style="font-size: 18px; font-weight: 700;">${s.title}</h2>
                </div>
                <div class="section-grid">
                  ${s.items.map(item => `
                    <div>
                      <div class="item-label">
                        <span style="width: 4px; height: 4px; background: var(--cds-interactive-01); display: inline-block;"></span>
                        ${item.label}
                      </div>
                      <div class="item-desc">${item.desc}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>

          <div class="footer relative z-10">
            <p>Generated via Enterprise Registry Node • ${new Date().toLocaleDateString(isAr ? 'ar-KW' : 'en-GB')} • CONFIDENTIAL</p>
          </div>
        </div>
        
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
            }, 800);
          };
        </script>
      </body>
      </html>
    `;

    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Enterprise_HR_Whitepaper_2025_${language}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
      
      <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
           <div style={{ maxWidth: '800px' }}>
             <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--cds-spacing-03)', padding: '4px 12px', background: 'rgba(79, 70, 229, 0.1)', border: '1px solid rgba(79, 70, 229, 0.2)', marginBottom: 'var(--cds-spacing-05)' }}>
               <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                 SYSTEM_ARCHITECTURE_V4.0
               </span>
             </div>
             <h1 style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-04)' }}>
               {language === 'ar' ? 'الورقة البيضاء للمنصة' : 'Workforce Platform Whitepaper'}
             </h1>
             <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', lineHeight: 1.6 }}>
               The Enterprise Registry acts as the central node for Kuwaiti Labor Law compliance. This document outlines the technical implementation of Articles 47, 51, 69, and 70, as well as the AI-Driven Kuwaitization Insight Engine.
             </p>
           </div>
           
           <button 
             onClick={handleExport}
             className="cds--btn cds--btn--primary"
             style={{ height: '48px', padding: '0 var(--cds-spacing-07)', fontFamily: 'monospace', fontSize: '0.75rem', letterSpacing: '0.1em' }}
           >
             {language === 'ar' ? 'تصدير (PDF)' : 'EXPORT_PROTOCOL_PDF'}
           </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--cds-spacing-07)' }}>
        {sections.map((section, idx) => (
          <div key={idx} className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-05)', marginBottom: 'var(--cds-spacing-06)' }}>
              <div style={{ fontSize: '2rem' }}>{section.icon}</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>{section.title}</h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-07)' }}>
              {section.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)', padding: 'var(--cds-spacing-04)', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                    <span style={{ width: '4px', height: '4px', background: 'var(--cds-interactive-01)', display: 'inline-block' }}></span>
                    {item.label}
                  </h4>
                  <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', lineHeight: 1.6 }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', padding: 'var(--cds-spacing-07)', borderTop: '1px solid var(--cds-border-subtle)' }}>
         <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
           SYSTEM_NODE_REGISTRY • OPTIMIZED_FOR_PRIVATE_SECTOR • 2025_STANDARD
         </p>
      </div>

    </div>
  );
};

export default Whitepaper;
