// Service Worker Registration for PWA
// NOTE: Do NOT wrap in a 'load' event listener — by the time React hydrates,
// the load event has already fired, so the callback would never execute.
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              // New service worker activated
            }
          });
        }
      });

      // Check for updates every hour
      setInterval(() => registration.update(), 60 * 60 * 1000);
    })
    .catch(() => {
      // Registration failed — likely no sw.js available (e.g. dev mode without devOptions)
    });
}

export function unregisterServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch(() => {});
}
