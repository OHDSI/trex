import React, { useEffect } from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import { createStorageSlot } from "@docusaurus/theme-common";

function ThemeBridge() {
  useEffect(() => {
    const storage = createStorageSlot("theme");
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.type !== "trex:theme") return;
      if (d.theme === "light" || d.theme === "dark") {
        // Mirror what useColorMode().setColorMode() does internally:
        // 1) set the <html data-theme="..."> attribute so styles update immediately
        // 2) write to localStorage; Docusaurus listens for changes and syncs React state
        document.documentElement.setAttribute("data-theme", d.theme);
        document.documentElement.setAttribute("data-theme-choice", d.theme);
        storage.set(d.theme);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
  return null;
}

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrowserOnly>{() => <ThemeBridge />}</BrowserOnly>
      {children}
    </>
  );
}
