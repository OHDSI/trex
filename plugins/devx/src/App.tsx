import { useLayoutEffect, useRef, useState } from "react";
import { BrowserRouter, MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import ChatPage from "@/pages/ChatPage";
import SettingsPage from "@/pages/SettingsPage";
import AppDetailsPage from "@/pages/AppDetailsPage";

const defaultBasename = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AppProps {
  basePath?: string;
}

export default function App({ basePath }: AppProps = {}) {
  // When embedded via single-spa, use MemoryRouter to avoid
  // conflicting with the host app's BrowserRouter.
  const embedded = !!basePath;
  const Router = embedded ? MemoryRouter : BrowserRouter;
  const routerProps = embedded ? {} : { basename: defaultBasename };

  // Standalone: devx owns the whole viewport (100vh). Embedded in the trex web
  // shell it sits below a top nav, so its full-height pages must fill only the
  // space BELOW the nav — otherwise they overflow and the whole shell scrolls by
  // the nav height. We measure the wrapper's own distance from the viewport top
  // (= the nav height, including its border) and fill the rest, so this stays
  // correct regardless of the nav's exact height. The calc() seeds a sane height
  // before measurement (3.5rem = the nav's h-14) to avoid a first-paint flash.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [embeddedHeight, setEmbeddedHeight] = useState<string>("calc(100vh - 3.5rem)");

  useLayoutEffect(() => {
    if (!embedded) return;
    const measure = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setEmbeddedHeight(`${Math.max(0, window.innerHeight - top)}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [embedded]);

  return (
    <Router {...routerProps}>
      <div
        ref={wrapperRef}
        className={embedded ? undefined : "h-screen"}
        style={embedded ? { height: embeddedHeight } : undefined}
      >
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/apps/:id" element={<AppDetailsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <Toaster />
    </Router>
  );
}
