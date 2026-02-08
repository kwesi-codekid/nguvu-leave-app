// Service Worker Registration for PWA
export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          // Registration successful
          if (registration.active) {
            // Service worker is already active
          } else if (registration.installing) {
            // Service worker is installing
            registration.installing.addEventListener('statechange', () => {
              if (registration.installing?.state === 'activated') {
                // Service worker activated
              }
            });
          } else if (registration.waiting) {
            // Service worker is waiting to be activated
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000); // Check every hour
        })
        .catch((error) => {
          // Registration failed
        });
    });
  }
}

export function unregisterServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        // Unregistration failed
      });
  }
}
