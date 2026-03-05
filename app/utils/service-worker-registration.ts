// Service Worker Registration for PWA
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // In dev mode, VitePWA serves the SW from /dev-sw.js?dev-sw
  // which internally loads from dev-dist/sw.js
  // In production, the SW is at /sw.js
  const swPath = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js';

  navigator.serviceWorker.register(swPath, {
    type: 'classic',
    scope: '/',
  })
    .then((registration) => {
      console.log('SW registered successfully:', registration.scope);

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    })
    .catch((error) => {
      console.error('SW registration failed:', error);
    });
}

export function unregisterServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error('SW unregistration failed:', error);
      });
  }
}
