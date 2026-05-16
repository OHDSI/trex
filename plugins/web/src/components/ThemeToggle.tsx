import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** 3-state toggle: light → dark → system → light. Hydration-safe. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Render a placeholder of the same size to prevent layout shift before hydration.
    return <Button variant="ghost" size="icon" aria-hidden className="size-9" />;
  }

  const current = theme ?? "system";
  const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  const label = `Theme: ${current}. Click to switch to ${next}.`;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="size-9"
    >
      <Icon className="size-4" />
    </Button>
  );
}
