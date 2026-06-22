/**
 * Captures GPS position with a 5-second timeout.
 * Never throws — returns { status, lat, lng, accuracy } or { status: 'denied' | 'unavailable' }.
 */
export function useGPS() {
  return { capture };
}

async function capture() {
  if (!navigator.geolocation) {
    return { status: 'unavailable' };
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ status: 'unavailable' }), 5000);

    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        resolve({
          status:   'captured',
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      err => {
        clearTimeout(timer);
        resolve({ status: err.code === 1 ? 'denied' : 'unavailable' });
      },
      { timeout: 5000, maximumAge: 60000 },
    );
  });
}
