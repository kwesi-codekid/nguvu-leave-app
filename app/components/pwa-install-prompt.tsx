import { useState, useEffect } from 'react';
import { Button } from '@heroui/react';
import { Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running on iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);
    
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    const handleAppInstalled = () => {
      setShowInstallButton(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          setShowInstallButton(false);
          setDeferredPrompt(null);
        }
      } catch (error) {
        // Installation failed, continue silently
      }
    }
  };

  // Don't show if already installed
  if (isStandalone) {
    return null;
  }

  // Only show install button if we have a deferred prompt (PWA can be installed)
  if (!deferredPrompt) {
    return null;
  }

  return (
    /* Floating Install Button */
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        color="primary"
        size="lg"
        radius="full"
        startContent={<Smartphone size={20} />}
        onClick={handleInstallClick}
        className="shadow-lg animate-bounce"
      >
        Install App
      </Button>
    </div>
  );
}
