import { useState, useEffect } from 'react';
import { Button } from '@heroui/react';
import { Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture the event at module level so it's never missed,
// even if it fires before React hydrates.
let earlyPromptEvent: BeforeInstallPromptEvent | null = null;
const earlyListeners: Array<(e: BeforeInstallPromptEvent) => void> = [];

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    earlyPromptEvent = e as BeforeInstallPromptEvent;
    earlyListeners.forEach((fn) => fn(earlyPromptEvent!));
  });
}

function onPromptCaptured(fn: (e: BeforeInstallPromptEvent) => void) {
  earlyListeners.push(fn);
  // If already captured before this listener was added, fire immediately
  if (earlyPromptEvent) {
    fn(earlyPromptEvent);
  }
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    onPromptCaptured((e) => {
      setDeferredPrompt(e);
    });

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      earlyPromptEvent = null;
      setIsStandalone(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          earlyPromptEvent = null;
        }
      } catch (error) {
        // Installation failed, continue silently
      }
    }
  };

  if (isStandalone || !deferredPrompt) {
    return null;
  }

  return (
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
