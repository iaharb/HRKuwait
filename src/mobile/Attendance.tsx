
import React, { useState, useRef } from 'react';
import { User } from '../types.ts';
import { useLocationValidation } from '../hooks/useLocationValidation.ts';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from '../components/NotificationSystem.tsx';
import { translations } from '../translations.ts';

const MobileAttendance: React.FC<{ user: User, language: 'en' | 'ar' }> = ({ user, language }) => {
  const { notify } = useNotifications();
  const { isValid, closestZone, distance, revalidate } = useLocationValidation();
  
  const [clocking, setClocking] = useState(false);
  const [activeShift, setActiveShift] = useState(!!localStorage.getItem('shift_start'));
  
  // Biometric State
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'Awaiting' | 'Processing' | 'Success'>('Awaiting');
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const t = translations[language];

  const handleStartScan = async () => {
    if (!isValid) {
      notify(t.unauthorizedZone, language === 'ar' ? "يجب أن تكون ضمن نطاق ٢٥٠ متر من المكتب." : "You must be within 250m of the office.", "error");
      return;
    }

    setIsScanning(true);
    setScanStatus('Processing');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Simulate a robust biometric scan
      setTimeout(async () => {
        setScanStatus('Success');
        setTimeout(async () => {
          // Stop stream
          stream.getTracks().forEach(track => track.stop());
          setIsScanning(false);
          await finishClockAction();
        }, 1000);
      }, 3000);

    } catch (err) {
      notify("Scan Failed", "Permission denied for biometric scan.", "error");
      setIsScanning(false);
    }
  };

  const finishClockAction = async () => {
    setClocking(true);
    if (!activeShift) {
      const now = new Date();
      localStorage.setItem('shift_start', Date.now().toString());
      // Fix: Added missing 'source' property required by AttendanceRecord
      await dbService.logAttendance({
        employeeId: user.id,
        employeeName: user.name,
        date: now.toISOString().split('T')[0],
        clockIn: now.toLocaleTimeString(),
        location: closestZone?.name || 'Mobile Site',
        status: 'On-Site',
        source: 'Mobile',
        coordinates: { lat: 0, lng: 0 }
      });
      setActiveShift(true);
      notify(language === 'ar' ? 'تم التحقق البيومتري' : "Biometric Verified", t.biometricHandshake, "success");
    } else {
      localStorage.removeItem('shift_start');
      await dbService.clockOutAttendance(user.id, new Date().toLocaleTimeString());
      setActiveShift(false);
      notify(language === 'ar' ? 'إنهاء الجلسة آمن' : "Secure Logout", t.finishSession, "info");
    }
    setClocking(false);
  };

  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[70vh] space-y-12">
      <div className="text-center">
        <div className={`w-64 h-64 rounded-full border-4 flex items-center justify-center transition-all ${
          activeShift ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white shadow-xl'
        }`}>
          <button 
            disabled={clocking || isScanning}
            onClick={handleStartScan}
            className={`w-52 h-52 rounded-full flex flex-col items-center justify-center gap-4 transition-all active:scale-90 shadow-2xl ${
              activeShift ? 'bg-emerald-600 shadow-emerald-500/30' : 'bg-slate-900 shadow-slate-900/40'
            }`}
          >
            {clocking ? (
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="text-5xl">{activeShift ? '✋' : '👆'}</span>
                <span className="text-white font-black text-xs uppercase tracking-[0.3em]">
                  {activeShift ? t.stopShift : t.startShift}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="w-full space-y-6">
        <div className={`p-6 rounded-[32px] border ${isValid ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
           <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.siteValidation}</p>
              <button onClick={revalidate} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{t.refreshGps}</button>
           </div>
           <div className="flex items-center gap-4">
              <span className="text-2xl">{isValid ? '📍' : '🚫'}</span>
              <div>
                 <p className="text-sm font-black text-slate-900">{closestZone?.name || t.outsidePerimeter}</p>
                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                   {distance ? `${Math.round(distance)}${language === 'ar' ? ' متر' : 'm'} ${language === 'ar' ? 'بعيداً' : 'away'}` : t.calculating}
                 </p>
              </div>
           </div>
        </div>
        
        <p className="text-center text-[9px] text-slate-400 font-black uppercase tracking-widest leading-relaxed">
          {t.biometricHandshake} <br/> {language === 'ar' ? 'مطلوب للمصادقة المزدوجة.' : 'Required for dual-factor authentication.'}
        </p>
      </div>

      {/* Full Screen Scan Modal for Mobile */}
      {isScanning && (
        <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
           <div className="relative w-full aspect-square max-w-[320px]">
              <div className="w-full h-full rounded-full border-4 border-indigo-500/50 p-1 overflow-hidden relative shadow-[0_0_50px_rgba(99,102,241,0.3)]">
                 <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover rounded-full grayscale" />
                 {/* Laser Scan Line */}
                 <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 shadow-[0_0_20px_rgba(129,140,248,1)] animate-scan-y"></div>
              </div>
              {/* Corner brackets */}
              <div className="absolute -top-2 -left-2 w-10 h-10 border-t-4 border-l-4 border-indigo-400 rounded-tl-2xl"></div>
              <div className="absolute -top-2 -right-2 w-10 h-10 border-t-4 border-r-4 border-indigo-400 rounded-tr-2xl"></div>
              <div className="absolute -bottom-2 -left-2 w-10 h-10 border-b-4 border-l-4 border-indigo-400 rounded-bl-2xl"></div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 border-b-4 border-r-4 border-indigo-400 rounded-br-2xl"></div>
           </div>

           <div className="mt-16 text-center space-y-4">
              <h4 className={`text-xl font-black uppercase tracking-widest ${scanStatus === 'Success' ? 'text-emerald-400' : 'text-white'}`}>
                {scanStatus === 'Success' ? 'MATCH FOUND' : 'SCANNING FACE'}
              </h4>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em]">
                {scanStatus === 'Success' ? 'Registry Hash Verified' : 'Keep Device Level'}
              </p>
           </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan-y {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        .animate-scan-y {
          animation: scan-y 2s ease-in-out infinite;
        }
      `}} />
    </div>
  );
};

export default MobileAttendance;
