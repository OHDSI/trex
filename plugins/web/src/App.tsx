import * as React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { useSession } from "@/lib/auth-client";
import { GraphQLProvider } from "@/lib/graphql-client";
import { UI_BASE_PATH } from "@/lib/config";
import { Layout } from "@/components/Layout";
import { AdminLayout } from "@/components/AdminLayout";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ResetPassword } from "@/pages/ResetPassword";
import { VerifyEmail } from "@/pages/VerifyEmail";
import { Consent } from "@/pages/Consent";
import { Profile } from "@/pages/Profile";
import { Users } from "@/pages/admin/Users";
import { UserDetail } from "@/pages/admin/UserDetail";
import { Apps } from "@/pages/admin/Apps";
import { AppDetail } from "@/pages/admin/AppDetail";
import { Databases } from "@/pages/admin/Databases";
import { DatabaseDetail } from "@/pages/admin/DatabaseDetail";
import { Sessions } from "@/pages/admin/Sessions";
import { Roles } from "@/pages/admin/Roles";
import { RoleDetail } from "@/pages/admin/RoleDetail";
import { Plugins } from "@/pages/admin/Plugins";
import { SsoProviders } from "@/pages/admin/SsoProviders";
import { Services } from "@/pages/admin/Services";
import { TrexDB } from "@/pages/admin/TrexDB";
import { Extensions } from "@/pages/admin/Extensions";
import { Migrations } from "@/pages/admin/Migrations";
import { ChangePassword } from "@/pages/ChangePassword";
import { CliLogin } from "@/pages/CliLogin";
import { EtlPipelines } from "@/pages/admin/EtlPipelines";
import { AuthSettings } from "@/pages/admin/AuthSettings";
import { RuntimeSettings } from "@/pages/admin/RuntimeSettings";
import { Transforms } from "@/pages/admin/Transforms";
import { Functions } from "@/pages/admin/Functions";
import { Flows } from "@/pages/admin/Flows";
import { UiPlugins } from "@/pages/admin/UiPlugins";
import { Logs } from "@/pages/admin/Logs";
import AgentRuns from "@/pages/admin/AgentRuns";
import AgentRunDetail from "@/pages/admin/AgentRunDetail";
import { Subscriptions } from "@/pages/admin/Subscriptions";
import { Analytics } from "@/pages/admin/Analytics";
import { AnalyticsDetail } from "@/pages/admin/AnalyticsDetail";
import { EmbedPage } from "@/pages/EmbedPage";
import { SingleSpaMount } from "@/pages/SingleSpaMount";
import { WebConfigContext, useFetchedWebConfig } from "@/lib/web-config";

function HomeRedirect() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  return <Navigate to={session ? "/profile" : "/login"} replace />;
}

function AdminOnly({ children }: { children: React.ReactElement }) {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  if (!session?.user || (session.user as any).role !== "admin") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold">403 Forbidden</h2>
          <p className="text-muted-foreground mt-2">
            You do not have permission to access this page.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { config, loaded } = useFetchedWebConfig();
  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  return (
    <WebConfigContext.Provider value={config}>
    <GraphQLProvider>
    <BrowserRouter basename={UI_BASE_PATH}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/consent" element={<Consent />} />
        <Route path="/cli/login" element={<CliLogin />} />
        <Route path="/change-password" element={<ChangePassword />} />

        <Route element={<Layout />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/docs" element={<EmbedPage plugin="docs" />} />
          <Route path="/studio" element={<AdminOnly><EmbedPage plugin="studio" /></AdminOnly>} />
          {config.navExtra.map((item) => (
            <Route
              key={item.path}
              path={`${item.path}/*`}
              element={
                <SingleSpaMount
                  plugin={item.plugin}
                  basePath={`${UI_BASE_PATH}${item.path}`}
                />
              }
            />
          ))}

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="apps" element={<Apps />} />
            <Route path="apps/:id" element={<AppDetail />} />
            <Route path="roles" element={<Roles />} />
            <Route path="roles/:id" element={<RoleDetail />} />
            <Route path="databases" element={<Databases />} />
            <Route path="databases/:id" element={<DatabaseDetail />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="plugins" element={<Plugins />} />
            <Route path="services" element={<Services />} />
            <Route path="etl" element={<EtlPipelines />} />
            <Route path="transforms" element={<Transforms />} />
            <Route path="trexdb" element={<TrexDB />} />
            <Route path="extensions" element={<Extensions />} />
            <Route path="migrations" element={<Migrations />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="analytics/:id" element={<AnalyticsDetail />} />
            <Route path="sso" element={<SsoProviders />} />
            <Route path="auth-settings" element={<AuthSettings />} />
            <Route path="runtime-settings" element={<RuntimeSettings />} />
            <Route path="functions" element={<Functions />} />
            <Route path="flows" element={<Flows />} />
            <Route path="ui" element={<UiPlugins />} />
            <Route path="logs" element={<Logs />} />
            <Route path="agent-runs" element={<AgentRuns />} />
            <Route path="agent-runs/:id" element={<AgentRunDetail />} />
          </Route>
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
    </GraphQLProvider>
    </WebConfigContext.Provider>
  );
}
