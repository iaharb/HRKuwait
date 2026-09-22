import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/dbService.ts';
import { User, AttendanceRecord, OfficeLocation, Employee } from '../types/types';
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
      dbService.getEmployeeById(user.id).then(p => p || dbService.getEmployeeByName(user.name))
    ]);

    setHistory(historyData);
    setOfficeLocations(zones);
    if (profile) setEmployeeProfile(profile);

    // Use local date instead of UTC to avoid timezone mismatches (e.g. late night Kuwait vs UTC)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Find today's record specifically for this user
    const todaysRecord = historyData.find(r => r.date === today && r.employeeId === user.id);
    
    console.log("[Attendance Sync] Local Today:", today, "Found:", todaysRecord?.id);
    setActiveRecord(todaysRecord || null);
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

    if (!foundZone) {
      // Create a virtual "Off-Site" zone to allow progression to Face ID
      const virtualZone: OfficeLocation = {
        id: 'offsite',
        name: i18n.language === 'ar' ? 'عمل ميداني / عن بعد' : 'Off-Site / Remote',
        nameArabic: 'عمل ميداني / عن بعد',
        address: 'Outside Perimeter',
        addressArabic: 'خارج النطاق',
        lat: coords.latitude,
        lng: coords.longitude,
        radius: 0
      };
      setActiveZone(virtualZone);
    } else {
      setActiveZone(foundZone);
    }
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
        console.warn("Geolocation failed or denied. Defaulting to Remote mode.", err);
        // Fallback for laptops/testing or denied permissions
        const virtualCoords = { latitude: 0, longitude: 0 } as any;
        setCurrentLocation(virtualCoords);
        setActiveZone({
          id: 'offsite',
          name: i18n.language === 'ar' ? 'عمل عن بعد (GPS غير متاح)' : 'Remote (GPS Unavailable)',
          nameArabic: 'عمل عن بعد (GPS غير متاح)',
          address: 'Unknown',
          addressArabic: 'غير معروف',
          lat: 0,
          lng: 0,
          radius: 0
        });
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClockIn = async () => {
    if (!currentLocation || !activeZone || !isFaceVerified) return;
    if (!currentLocation || !activeZone || !isFaceVerified) {
      console.log("[handleClockIn] Pre-conditions not met:", { currentLocation, activeZone, isFaceVerified });
      notify(t('warning'), t('completeStepsBeforeClockIn'), "warning");
      return;
    }

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const isLate = (hours > 8) || (hours === 8 && minutes > 30);

    const newRecord: Omit<AttendanceRecord, 'id'> = {
      employeeId: user.id,
      employeeName: user.name,
      date: today, // Use local date string
      clockIn: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      location: activeZone.name,
      status: activeZone.id === 'offsite' ? 'Off-Site' : (isLate ? 'Late' : 'On-Site'),
      coordinates: { lat: currentLocation.latitude, lng: currentLocation.longitude },
      source: 'Web'
    };

    try {
      console.log("[handleClockIn] Attempting to log attendance:", newRecord);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
      {showGuide && (
        <div style={{ background: 'var(--cds-background-inverse)', padding: 'var(--cds-spacing-07)', color: 'var(--cds-text-inverse)', border: '1px solid var(--cds-border-subtle)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-07)' }}>
          <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0, borderRadius: '4px' }}>
            📡
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'inherit', marginBottom: 'var(--cds-spacing-02)' }}>{t('guideAttendanceTitle')}</h3>
            <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>{t('guideAttendanceDesc')}</p>
          </div>
          <button
            onClick={dismissGuide}
            className="cds--btn cds--btn--secondary cds--btn--sm"
          >
            {t('gotIt')}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 400px) 1fr', gap: 'var(--cds-spacing-07)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', position: 'relative' }}>
            <h3 style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--cds-spacing-07)' }}>{t('complianceHandshake')}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-06)' }}>
                <div style={{ width: '48px', height: '48px', background: 'var(--cds-layer-01)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', border: '1px solid var(--cds-border-subtle)', flexShrink: 0 }}>
                  {detecting ? '⏳' : (activeZone ? '✅' : '🏢')}
                </div>
                <div>
                  <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('gpsPerimeter')}</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: 600, color: activeZone ? 'var(--cds-text-primary)' : 'var(--cds-text-disabled)' }}>
                    {detecting ? t('syncing') : (activeZone ? activeZone.name : t('unauthorizedZone'))}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-06)' }}>
                <div style={{ width: '48px', height: '48px', background: 'var(--cds-layer-01)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', border: '1px solid var(--cds-border-subtle)', flexShrink: 0 }}>
                  {isScanning ? '📷' : (isFaceVerified ? '🧬' : '👤')}
                </div>
                <div>
                  <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('facialId')}</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: 600, color: isFaceVerified ? 'var(--cds-interactive-01)' : 'var(--cds-text-disabled)' }}>
                    {isScanning ? `${t('verifying')} ${scanProgress}%` : (isFaceVerified ? t('verified') : t('awaitingScan'))}
                  </p>
                </div>
              </div>

              <div style={{ paddingTop: 'var(--cds-spacing-05)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                {(!activeRecord || !activeRecord.clockIn) && (
                  <button
                    onClick={startDetection}
                    disabled={detecting}
                    className="cds--btn cds--btn--primary"
                    style={{ width: '100%' }}
                  >
                    {detecting ? t('refreshGps') : t('validateLocation')}
                  </button>
                )}

                {activeZone && !isFaceVerified && !activeRecord?.clockIn && (
                  <button
                    onClick={startFaceScan}
                    className="cds--btn cds--btn--tertiary"
                    style={{ width: '100%' }}
                  >
                    {t('startFaceRecognition')}
                  </button>
                )}

                {activeZone && isFaceVerified && !activeRecord?.clockIn && (
                  <button
                    onClick={handleClockIn}
                    className="cds--btn cds--btn--primary"
                    style={{ width: '100%', background: 'var(--cds-support-success)', border: 'none' }}
                  >
                    {t('commitClockIn')}
                  </button>
                )}

                {activeRecord?.clockIn && !activeRecord.clockOut && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                    <div style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-layer-01)', borderLeft: '4px solid var(--cds-support-success)' }}>
                      <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-02)' }}>{t('currentShift')}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '2rem', fontWeight: 600 }}>{activeRecord.clockIn}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{activeRecord.location}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleClockOut}
                      className="cds--btn cds--btn--danger"
                      style={{ width: '100%' }}
                    >
                      {isFaceVerified ? t('finishSession') : `${t('stopShift')} (${t('facialId')})`}
                    </button>
                  </div>
                )}
                
                <div style={{ marginTop: 'var(--cds-spacing-08)', paddingTop: 'var(--cds-spacing-06)', borderTop: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                   <button 
                     onClick={() => { localStorage.removeItem('app_user_session'); window.location.reload(); }}
                     style={{ textAlign: 'start', background: 'none', border: 'none', padding: 0, fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', cursor: 'pointer' }}
                   >
                     ↻ {t('syncIssues')}? {t('resetSession')}
                   </button>
                   <button 
                     onClick={() => { setActiveRecord(null); setIsFaceVerified(false); }}
                     style={{ textAlign: 'start', background: 'none', border: 'none', padding: 0, fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-support-error)', textTransform: 'uppercase', cursor: 'pointer' }}
                   >
                     ⚠ {t('forceResetShift')}
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 'var(--cds-spacing-07)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{language === 'ar' ? 'سجل الحضور' : 'Activity Log'}</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{t('monitoringDocs')}</p>
          </div>

          <div style={{ flex: 1 }}>
            <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
              <thead style={{ background: 'var(--cds-layer-01)' }}>
                <tr>
                  <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>{t('date')}</th>
                  <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>{language === 'ar' ? 'الموقع' : 'Location'}</th>
                  <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>{t('clockIn')}</th>
                  <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>{t('clockOut')}</th>
                  <th style={{ fontSize: '0.625rem', fontWeight: 600, textAlign: 'center' }}>Auth</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((rec) => (
                  <tr key={rec.id}>
                    <td style={{ fontSize: '0.75rem', fontWeight: 600 }}>{rec.date}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.75rem' }}>{rec.location}</span>
                        <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{rec.source}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{rec.clockIn}</td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>{rec.clockOut || '--:--'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ width: '24px', height: '24px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem' }}>
                        {rec.source === 'Hardware' ? '📠' : '🧬'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ padding: 'var(--cds-spacing-05)', borderTop: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Page {currentPage} of {totalPages}</span>
             <div style={{ display: 'flex', gap: 'var(--cds-spacing-03)' }}>
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="cds--btn cds--btn--ghost cds--btn--sm">Prev</button>
                <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="cds--btn cds--btn--ghost cds--btn--sm">Next</button>
             </div>
          </div>
        </div>
      </div>

      {/* Biometric Overlay */}
      {isScanning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: 'var(--cds-spacing-07)' }}>
          <div style={{ position: 'relative', width: '280px', height: '280px', border: '2px solid var(--cds-interactive-01)', borderRadius: '50%', overflow: 'hidden', marginBottom: 'var(--cds-spacing-07)' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) brightness(1.2)' }}
            />
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '2px', background: 'var(--cds-interactive-01)', boxShadow: '0 0 15px var(--cds-interactive-01)', animation: 'scan-y 3s linear infinite' }}></div>
          </div>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 'var(--cds-spacing-04)' }}>{t('registryVerification')}</h3>
            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', marginBottom: 'var(--cds-spacing-04)' }}>
               <div style={{ height: '100%', background: 'var(--cds-interactive-01)', width: `${scanProgress}%`, transition: 'width 0.3s ease' }}></div>
            </div>
            <p style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase' }}>{t('alignFaceMatrix')}</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-y {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
};

export default AttendanceView;
