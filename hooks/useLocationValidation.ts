
import { useState, useEffect } from 'react';
import { OfficeLocation } from '../types.ts';
import { OFFICE_LOCATIONS } from '../constants.tsx';

export const useLocationValidation = () => {
  const [isValid, setIsValid] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [closestZone, setClosestZone] = useState<OfficeLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  };

  const validate = () => {
    if (!navigator.geolocation) {
      setError("Location services unsupported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        let minD = Infinity;
        let foundZone = null;

        OFFICE_LOCATIONS.forEach(zone => {
          const d = calculateDistance(latitude, longitude, zone.lat, zone.lng);
          if (d < minD) {
            minD = d;
            foundZone = zone;
          }
        });

        setDistance(minD);
        setClosestZone(foundZone);
        setIsValid(foundZone ? minD <= foundZone.radius : false);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    validate();
  }, []);

  return { isValid, distance, closestZone, error, revalidate: validate };
};
