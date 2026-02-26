import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";
import { useEffect } from "react";
import { addToast } from "@heroui/react";

import type { Route } from "./+types/root";
import "./app.css";
import { Providers } from "./ui/lib/providers";
import { getFlashSession } from "./flash-session";
import { registerServiceWorker } from "./utils/service-worker-registration";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/pwa-192x192.png" },
];

export const meta: Route.MetaFunction = () => {
  return [
    { title: "Nguvu Leave Management System" },
    { name: "description", content: "Comprehensive leave management system for tracking employee leave requests, balances, and approvals" },
    { name: "keywords", content: "leave management, employee leave, HR, time off, vacation tracking" },
    { name: "theme-color", content: "#2563eb" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title", content: "Nguvu Leave" },
    { name: "application-name", content: "Nguvu Leave" },
    { name: "msapplication-TileColor", content: "#2563eb" },
    { rel: "icon", type: "image/png", href: "/nguvu-favicon.png" },
    { rel: "shortcut icon", type: "image/png", href: "/nguvu-favicon.png" },
    { rel: "apple-touch-icon", type: "image/png", href: "/nguvu-favicon.png" },
    { property: "og:title", content: "Nguvu Leave Management System" },
    { property: "og:description", content: "Comprehensive leave management system for tracking employee leave requests, balances, and approvals" },
    { property: "og:type", content: "website" },
    { property: "og:image", content: "/nguvu-favicon.png" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: "Nguvu Leave Management System" },
    { name: "twitter:description", content: "Comprehensive leave management system for tracking employee leave requests, balances, and approvals" },
    { name: "twitter:image", content: "/nguvu-favicon.png" },
  ];
};

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getFlashSession(request.headers.get("Cookie"));
  const flash = session.get("alert");
  return { flash };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const flash = data?.flash;

  useEffect(() => {
    if (flash) {
      addToast({
        color: flash.status === "error" ? "danger" : "success",
        description: flash.message,
        title:
          flash.title || (flash.status === "error" ? "Error Occurred!" : "Successful"),
      });
    }
  }, [flash]);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: `(function(){
          var DISMISS_KEY='pwa-install-dismissed',DISMISS_MS=604800000,DELAY=60000;
          function dismissed(){try{var d=localStorage.getItem(DISMISS_KEY);return d?Date.now()-parseInt(d)<DISMISS_MS:false}catch(e){return false}}
          function standalone(){return window.matchMedia('(display-mode:standalone)').matches||(navigator.standalone===true)}
          function dismiss(t){t.style.transform='translateY(1rem)';t.style.opacity='0';setTimeout(function(){t.remove()},300);try{localStorage.setItem(DISMISS_KEY,Date.now().toString())}catch(e){}}
          function show(prompt){
            if(!prompt||standalone()||dismissed()||document.getElementById('pwa-install-toast'))return;
            var isDark=document.documentElement.classList.contains('dark');
            var bg=isDark?'#18181b':'white';var border=isDark?'#3f3f46':'#e4e4e7';var sub=isDark?'#a1a1aa':'#71717a';
            var t=document.createElement('div');t.id='pwa-install-toast';
            t.style.cssText='position:fixed;bottom:1.25rem;right:1.25rem;z-index:9999;width:340px;max-width:calc(100vw-2.5rem);border-radius:0.75rem;background:'+bg+';box-shadow:0 25px 50px -12px rgba(0,0,0,.25);border:1px solid '+border+';transition:all .3s ease;transform:translateY(1rem);opacity:0;font-family:Inter,system-ui,sans-serif;color:'+(isDark?'#fafafa':'#18181b');
            t.innerHTML='<button id="pwa-dismiss" style="position:absolute;top:10px;right:10px;padding:4px;border-radius:50%;border:none;cursor:pointer;background:transparent;color:#a1a1aa;line-height:1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><div style="padding:1rem"><div style="display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:0.75rem"><img src="/pwa-192x192.png" alt="Nguvu Leave" style="width:2.5rem;height:2.5rem;border-radius:0.5rem;flex-shrink:0;object-fit:cover"/><div style="padding-right:1rem"><div style="font-size:0.875rem;font-weight:600">Install Nguvu Leave</div><div style="font-size:0.75rem;color:'+sub+';margin-top:2px">Install the app for quick access, offline support, and a native app experience.</div></div></div><button id="pwa-install-btn" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;width:100%;padding:0.5rem 1rem;border:none;border-radius:0.5rem;background:#2563eb;color:white;font-size:0.875rem;font-weight:500;cursor:pointer;font-family:inherit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Install App</button></div>';
            document.body.appendChild(t);
            requestAnimationFrame(function(){t.style.transform='translateY(0)';t.style.opacity='1'});
            document.getElementById('pwa-dismiss').addEventListener('click',function(){dismiss(t)});
            document.getElementById('pwa-install-btn').addEventListener('click',function(){
              prompt.prompt().then(function(){return prompt.userChoice}).then(function(c){if(c.outcome==='accepted'){t.remove();window.__pwaPrompt=null}else{dismiss(t)}}).catch(function(){dismiss(t)});
            });
          }
          function schedule(prompt){if(!standalone()&&!dismissed())setTimeout(function(){show(prompt)},DELAY)}
          window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaPrompt=e;schedule(e)});
          window.addEventListener('appinstalled',function(){var t=document.getElementById('pwa-install-toast');if(t)t.remove();window.__pwaPrompt=null});
        })();`}} />
      </head>
      <body>
        <Providers>
          {children}
          <ScrollRestoration />
          <Scripts />
        </Providers>
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 403) {
      message = "Access Denied";
      details = "data" in error && error.data?.message ? error.data.message : "You don't have permission to access this feature. Please contact your administrator if you believe this is an error.";
    } else if (error.status === 404) {
      message = "404";
      details = "The requested page could not be found.";
    } else {
      message = "Error";
      details = error.statusText || details;
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {message}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            {details}
          </p>
        </div>

        <div className="space-y-4">
          {"status" in error && error.status === 403 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-left">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                About AI Assistant Access
              </h3>
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                The AI Assistant feature is restricted to authorized personnel only.
                If you need access to this feature, please contact your HR department or system administrator.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </a>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center justify-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>

      {stack && import.meta.env.DEV && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">Error Details (Development Mode)</h3>
          <pre className="w-full p-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-x-auto text-sm">
            <code>{stack}</code>
          </pre>
        </div>
      )}
    </main>
  );
}
