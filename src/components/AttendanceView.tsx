import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/dbService.ts';
import { User, AttendanceRecord, OfficeLocation, Employee } from '../types.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

interface AttendanceViewProps {
  user: User;
}

const AttendanceView: React.FC<AttendanceViewProps> = ({ user }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { notify } = useNotifications();
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);
  const [currentLocation, setCurrentLocation] = useState<GeolocationCoordinates | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [activeRecord, setActiveRecord] = useState<AttendanceRecord | null>(null);
  const [activeZone, setActiveZone] = useState<OfficeLocation | null>(null);
  const [employeeProfile, setEmployeeProfile] = useState<Employee | null>(null);
  const [showGuide, setShowGuide] = useState(!localStorage.getItem('guide_attendance_seen'));

  // Biometric State
  const [isScanning, setIsScanning] = useState(false);
  const [isFaceVerified, setIsFaceVerified] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanProgress, setScanProgress] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    const [historyData, zones, profile] = await Promise.all([
      dbService.getAttendanceRecords({ employeeId: user.id }),
      dbService.getOfficeLocations(),
      dbService.getEmployeeByName(user.name)
    ]);
    setHistory(historyData);
    setOfficeLocations(zones);
    if (profile) setEmployeeProfile(profile);

    const today = new Date().toISOString().split('T')[0];
    const todaysRecord = historyData.find(r => r.date === today);
    if (todaysRecord) setActiveRecord(todaysRecord);
  };

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem('guide_attendance_seen', 'true');
  };

  const startFaceScan = async () => {
    if (!employeeProfile?.faceToken) {
      notify(t('warning'), t('faceNotEnrolled'), "warning");
      return;
    }

    setIsScanning(true);
    setIsFaceVerified(false);
    setScanProgress(0);

    let activeStream: MediaStream | null = null;

    try {
      activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = activeStream;
      }

      let progress = 0;
      const intervalId = setInterval(() => {
        progress += 4;
        setScanProgress(progress);
        if (progress >= 100) {
          clearInterval(intervalId);
          setIsFaceVerified(true);
          setIsScanning(false);
          if (activeStream) activeStream.getTracks().forEach(track => track.stop());
          notify(t('verified'), t('officialRecord'), "success");
        }
      }, 1000);

    } catch (err) {
      notify(t('critical'), t('biometricHandshake'), "error");
      setIsScanning(false);
      if (activeStream) activeStream.getTracks().forEach(track => track.stop());
    }
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const checkZone = (coords: GeolocationCoordinates) => {
    const foundZone = officeLocations.find(loc => {
      const distance = getDistance(coords.latitude, coords.longitude, loc.lat, loc.lng);
      return distance <= loc.radius;
    });
    setActiveZone(foundZone || null);
    return foundZone;
  };

  const startDetection = () => {
    setDetecting(true);
    setIsFaceVerified(false);
    if (!navigator.geolocation) {
      notify(t('critical'), t('unknown'), "error");
      setDetecting(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation(pos.coords);
        checkZone(pos.coords);
        setDetecting(false);
      },
      (err) => {
        notify(t('critical'), t('unauthorizedZone'), "error");
        setDetecting(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleClockIn = async () => {
    if (!currentLocation || !activeZone || !isFaceVerified) return;

    const now = new Date();
    const newRecord: Omit<AttendanceRecord, 'id'> = {
      employeeId: user.id,
      employeeName: user.name,
      date: now.toISOString().split('T')[0],
      clockIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      location: activeZone.name,
      status: 'On-Site',
      coordinates: { lat: currentLocation.latitude, lng: currentLocation.longitude },
      source: 'Web'
    };

    try {
      const saved = await dbService.logAttendance(newRecord);
      setActiveRecord(saved);
      notify(t('success'), `${t('startShift')}: ${activeZone.name}`, "success");
      setIsFaceVerified(false);
      setIsScanning(false);
      await fetchData();
    } catch (err: any) {
      notify(t('critical'), t('unknown'), "error");
    }
  };

  const handleClockOut = async () => {
    if (!isFaceVerified) {
      await startFaceScan();
      return;
    }
    const now = new Date();
    const clockOutTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    try {
      await dbService.clockOutAttendance(user.id, clockOutTime);
      notify(t('success'), t('finishSession'), "info");
      setIsFaceVerified(false);
      setIsScanning(false);
      await fetchData();
    } catch (err) {
      notify(t('critical'), t('unknown'), "error");
    }
  };

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const paginatedData = history.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20 max-w-6xl mx-auto">
      {showGuide && (
        <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-xl shadow-indigo-500/10 flex flex-col md:flex-row items-center gap-8 border border-indigo-500/20 animate-in slide-in-from-top-4 duration-500 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">✨</div>
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center text-3xl shrink-0">📡</div>
          <div className="flex-1 space-y-2 text-start">
            <h3 className="text-xl font-black tracking-tight">{t('guideAttendanceTitle')}</h3>
            <p className="text-indigo-50 font-medium leading-relaxed opacity-90">{t('guideAttendanceDesc')}</p>
          </div>
          <button
            onClick={dismissGuide}
            className="px-8 py-3 bg-white text-indigo-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95 shadow-lg"
          >
            {t('gotIt')}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-10">
        <div className="lg:w-[450px] space-y-8">
          <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-xl shadow-slate-900/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <span className="text-[140px]">🤳</span>
            </div>

            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-10">{t('complianceHandshake')}</h3>

            <div className="space-y-8 relative z-10">
              <div className="flex items-center gap-6">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl shadow-inner ${activeZone ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}>
                  {detecting ? '⏳' : (activeZone ? '✅' : '🏢')}
                </div>
                <div className="flex-1 text-start">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('gpsPerimeter')}</p>
                  <p className={`text-xl font-black ${activeZone ? 'text-slate-900' : 'text-slate-300'}`}>
                    {detecting ? t('syncing') : (activeZone ? activeZone.name : t('unauthorizedZone'))}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl shadow-inner ${isFaceVerified ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-300'}`}>
                  {isScanning ? '📷' : (isFaceVerified ? '🧬' : '👤')}
                </div>
                <div className="flex-1 text-start">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('facialId')}</p>
                  <p className={`text-xl font-black ${isFaceVerified ? 'text-indigo-900' : 'text-slate-300'}`}>
                    {isScanning ? `${t('verifying')} ${scanProgress}%` : (isFaceVerified ? t('verified') : t('awaitingScan'))}
                  </p>
                </div>
              </div>

              <div className="pt-4 space-y-4">
                {!activeRecord?.clockIn && (
                  <button
                    onClick={startDetection}
                    disabled={detecting}
                    className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 active:scale-95 transition-all hover:bg-black disabled:opacity-50"
                  >
                    {detecting ? t('refreshGps') : t('validateLocation')}
                  </button>
                )}

                {activeZone && !isFaceVerified && !activeRecord?.clockIn && (
                  <button
                    onClick={startFaceScan}
                    className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 active:scale-95 transition-all hover:bg-indigo-700 animate-in slide-in-from-top-4"
                  >
                    {t('startFaceRecognition')}
                  </button>
                )}

                {activeZone && isFaceVerified && !activeRecord?.clockIn && (
                  <button
                    onClick={handleClockIn}
                    className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-emerald-600/30 active:scale-95 transition-all hover:bg-emerald-700 animate-in zoom-in-95"
                  >
                    {t('commitClockIn')}
                  </button>
                )}

                {activeRecord?.clockIn && !activeRecord.clockOut && (
                  <div className="space-y-4">
                    <div className="bg-emerald-600 p-8 rounded-[40px] text-white shadow-xl shadow-emerald-600/20">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">{t('currentShift')}</p>
                      <div className="flex items-end justify-between">
                        <h4 className="text-4xl font-black tracking-tight">{activeRecord.clockIn}</h4>
                        <p className="text-xs font-bold mb-1">{activeRecord.location}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleClockOut}
                      className="w-full py-5 bg-white border-2 border-slate-200 text-slate-800 rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all active:scale-95"
                    >
                      {isFaceVerified ? t('finishSession') : `${t('stopShift')} (${t('facialId')})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-8 flex flex-col">
          <div className="bg-white rounded-[48px] border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px]">
            <div className="p-10 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center text-start">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">{language === 'ar' ? 'رادار النشاط' : 'Activity Radar'}</h3>
                <p className="text-xs text-slate-500 font-medium">{t('monitoringDocs')}</p>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest sticky top-0 border-b border-slate-100">
                  <tr>
                    <th className="px-10 py-6">{t('date')}</th>
                    <th className="px-10 py-6">{language === 'ar' ? 'المصدر' : 'Source'}</th>
                    <th className="px-10 py-6">{t('startShift')}</th>
                    <th className="px-10 py-6">{t('stopShift')}</th>
                    <th className="px-10 py-6">{t('facialId')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedData.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-10 py-6 font-black text-slate-900">{rec.date}</td>
                      <td className="px-10 py-6">
                        <div className="flex flex-col text-start">
                          <span className="text-sm font-bold text-slate-700">{rec.location}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest ${rec.source === 'Hardware' ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {rec.source === 'Hardware' ? (language === 'ar' ? '📠 جهاز بصمة' : '📠 Hardware') : (rec.source === 'Mobile' ? (language === 'ar' ? '📱 هاتف' : '📱 Mobile') : (language === 'ar' ? '💻 واجهة الويب' : '💻 Web'))}
                          </span>
                        </div>
                      </td>
                      <td className="px-10 py-6 font-mono text-sm font-black text-slate-600">{rec.clockIn}</td>
                      <td className="px-10 py-6 font-mono text-sm font-black text-slate-400">{rec.clockOut || '--:--'}</td>
                      <td className="px-10 py-6">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs ${rec.source === 'Hardware' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                          {rec.source === 'Hardware' ? '📠' : '🧬'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {isScanning && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/95 backdrop-blur-md animate-in fade-in duration-300 p-6">
          <div className="max-w-4xl w-full text-center space-y-12">
            <div className="flex flex-col md:flex-row items-center justify-center gap-12">
              <div className="relative">
                <div className="w-72 h-72 rounded-full border-4 border-indigo-500/50 p-2 overflow-hidden relative shadow-[0_0_40px_rgba(99,102,241,0.2)]">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover rounded-full grayscale brightness-110"
                  />
                  <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.8)] animate-scan-y opacity-70"></div>
                </div>
                <p className="mt-4 text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t('verifying')}</p>
                <div className="absolute -top-4 -left-4 w-12 h-12 border-t-4 border-l-4 border-indigo-500 rounded-tl-3xl"></div>
                <div className="absolute -top-4 -right-4 w-12 h-12 border-t-4 border-r-4 border-indigo-500 rounded-tr-3xl"></div>
                <div className="absolute -bottom-4 -left-4 w-12 h-12 border-b-4 border-l-4 border-indigo-500 rounded-bl-3xl"></div>
                <div className="absolute -bottom-4 -right-4 w-12 h-12 border-b-4 border-r-4 border-indigo-500 rounded-br-3xl"></div>
              </div>

              <div className="flex flex-col items-center">
                <div className="w-40 h-40 rounded-3xl border-2 border-white/10 p-1 bg-white/5 overflow-hidden shadow-inner">
                  {employeeProfile?.faceToken ? (
                    <img src={employeeProfile.faceToken} className="w-full h-full object-cover rounded-2xl grayscale opacity-60" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-600 text-xs">---</div>
                  )}
                </div>
                <div className="mt-6 space-y-2 text-start">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 rounded-full border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">{t('syncing')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 max-w-md mx-auto">
              <h3 className="text-3xl font-black text-white tracking-widest uppercase">{t('registryVerification')}</h3>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] animate-pulse">{t('alignFaceMatrix')}</p>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes scan-y {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        .animate-scan-y {
          animation: scan-y 2.5s ease-in-out infinite;
        }
      `}} />
    </div>
  );
};

export default AttendanceView;
