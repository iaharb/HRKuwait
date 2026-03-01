
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
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { 
            font-family: ${isAr ? "'Cairo'" : "'Plus Jakarta Sans'"}, sans-serif; 
            background: #f8fafc; 
            color: #0f172a; 
            margin: 0;
            padding: 40px; 
          }
          .page-container {
            background: white;
            border-radius: 40px;
            padding: 60px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            max-width: 900px;
            margin: auto;
            position: relative;
            overflow: hidden;
            border: 1px solid #e2e8f0;
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
          @media print {
            body { padding: 0; background: white; }
            .page-container { border: none; box-shadow: none; width: 100%; max-width: 100%; padding: 40px; }
            .no-print { display: none !important; }
            .section-block { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="page-container">
          <div class="watermark">🇰🇼</div>
          
          <header class="text-center space-y-6 border-b-4 border-slate-900 pb-10 mb-12 relative z-10">
             <div class="inline-flex items-center gap-3 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-[0.3em]">
               Official Registry Protocol v4.0
             </div>
             <h1 class="text-5xl font-black tracking-tighter">${isAr ? 'الورقة البيضاء للمنصة' : 'Platform Whitepaper'}</h1>
             <p class="text-slate-500 font-bold text-lg max-w-2xl mx-auto">
               ${isAr 
                 ? 'المواصفات الفنية لعام ٢٠٢٥ وتطبيقات قانون العمل والامتثال' 
                 : 'Technical Specifications & Kuwait Labor Law Implementation Framework 2025'}
             </p>
          </header>

          <div class="space-y-16 relative z-10">
            ${sections.map((s, idx) => `
              <section class="section-block space-y-8">
                <div class="flex items-center gap-5 border-b border-slate-100 pb-4">
                  <span class="text-4xl">${s.icon}</span>
                  <h2 class="text-2xl font-black text-slate-900">${s.title}</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  ${s.items.map(item => `
                    <div class="space-y-2">
                      <h4 class="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        ${item.label}
                      </h4>
                      <p class="text-sm text-slate-600 leading-relaxed font-medium">${item.desc}</p>
                    </div>
                  `).join('')}
                </div>
              </section>
            `).join('')}
          </div>

          <footer class="mt-20 pt-10 border-t border-slate-100 text-center relative z-10">
            <div class="flex items-center justify-center gap-4 mb-4 opacity-50">
               <span class="h-px w-12 bg-slate-300"></span>
               <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confidential Registry Asset</span>
               <span class="h-px w-12 bg-slate-300"></span>
            </div>
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Generated via Enterprise HR Portal • ${new Date().toLocaleDateString(isAr ? 'ar-KW' : 'en-GB')} • Authorized Distribution
            </p>
          </footer>
        </div>
        
        <div class="no-print fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-slate-900 text-white rounded-full shadow-2xl animate-bounce">
           <span class="text-xs font-black uppercase tracking-widest">${isAr ? 'اضغط للطباعة' : 'Click to Print'}</span>
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
    <div className="max-w-5xl mx-auto space-y-16 animate-in fade-in duration-700 pb-32 text-start relative">
      <header className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
           <div className="space-y-4">
             <div className="inline-flex items-center gap-3 px-6 py-2 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em]">
               System Architecture v4.0
             </div>
             <h1 className="text-5xl font-black text-slate-900 tracking-tighter">
               Workforce Platform Whitepaper
             </h1>
           </div>
           
           <button 
             type="button"
             onClick={handleExport}
             className="flex items-center justify-center gap-4 px-10 py-6 bg-slate-900 text-white rounded-[32px] font-black text-[13px] uppercase tracking-[0.15em] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] hover:bg-black hover:scale-[1.02] transition-all active:scale-95 group"
           >
             <span className="text-2xl group-hover:scale-125 transition-transform">📄</span>
             <span>{language === 'ar' ? 'تصدير للطباعة الرسمية (PDF)' : 'Export Official Whitepaper (PDF)'}</span>
           </button>
        </div>

        <p className="text-slate-500 text-lg font-medium max-w-2xl leading-relaxed">
          The Enterprise HR Registry acts as the central node for Kuwaiti Labor Law compliance. This document outlines the technical implementation of **Articles 47, 51, 69, and 70**, as well as our **AI-Driven Kuwaitization Insight Engine**.
        </p>
      </header>

      <div className="bg-white rounded-[64px] border border-slate-200 shadow-2xl shadow-slate-900/5 p-10 md:p-20 space-y-20 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
           <span className="text-[240px] select-none">🇰🇼</span>
        </div>

        {sections.map((section, idx) => (
          <section key={idx} className="space-y-12 relative z-10">
            <div className="flex items-center gap-6 border-b border-slate-100 pb-8">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-4xl shadow-inner border border-slate-100">
                {section.icon}
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">{section.title}</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
              {section.items.map((item, i) => (
                <div key={i} className="space-y-3 group">
                  <h4 className="text-[12px] font-black text-indigo-600 uppercase tracking-[0.1em] flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.4)]"></span>
                    {item.label}
                  </h4>
                  <p className="text-slate-600 text-[15px] leading-relaxed font-medium">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer className="pt-16 border-t border-slate-100 text-center">
           <div className="inline-block px-8 py-3 bg-slate-50 rounded-full border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                Enterprise HR Protocol • Optimized for the Kuwaiti Private Sector • 2025 Standard
              </p>
           </div>
        </footer>
      </div>
    </div>
  );
};

export default Whitepaper;
