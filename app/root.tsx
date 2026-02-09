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
import { PWAInstallPrompt } from "./components/pwa-install-prompt";
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
    
    // Register service worker for PWA functionality
    registerServiceWorker();
  }, [flash]);

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
      </head>
      <body>
        <Providers>
          {children}
          <PWAInstallPrompt />
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
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
