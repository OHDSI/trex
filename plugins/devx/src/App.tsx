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
  const Router = basePath ? MemoryRouter : BrowserRouter;
  const routerProps = basePath ? {} : { basename: defaultBasename };

  return (
    <Router {...routerProps}>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/apps/:id" element={<AppDetailsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </Router>
  );
}
