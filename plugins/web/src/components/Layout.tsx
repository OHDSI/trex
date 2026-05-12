import { useSession, authClient } from "@/lib/auth-client";
import { Navigate, Outlet, Link, NavLink, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useWebConfig } from "@/lib/web-config";

export function Layout() {
  const { data: session, isPending } = useSession();
  const { navExtra } = useWebConfig();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  const location = useLocation();
  const isEmbed =
    location.pathname === "/docs" ||
    location.pathname === "/studio" ||
    navExtra.some(
      (item) =>
        location.pathname === item.path ||
        location.pathname.startsWith(item.path + "/"),
    );

  const initials = session.user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="font-semibold text-lg">
            TREX
          </Link>
          <div className="flex items-center gap-4">
            <NavLink to="/docs"
               className={({ isActive }) =>
                 `text-sm transition-colors ${isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`
               }>
              Docs
            </NavLink>
            {session.user.role === "admin" && (
              <NavLink to="/studio"
                 className={({ isActive }) =>
                   `text-sm transition-colors ${isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`
                 }>
                Studio
              </NavLink>
            )}
            {navExtra.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `text-sm transition-colors ${isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {session.user.role === "admin" && (
              <NavLink to="/admin"
                className={({ isActive }) =>
                  `text-sm transition-colors ${isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`
                }>
                Admin
              </NavLink>
            )}
            <Link to="/profile">
              <span className="text-sm text-muted-foreground">
                {session.user.name}
              </span>
            </Link>
            <Avatar className="h-8 w-8">
              <AvatarImage src={session.user.image || undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => authClient.signOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className={isEmbed ? "" : "container mx-auto px-4 py-6"}>
        <Outlet />
      </main>
    </div>
  );
}
