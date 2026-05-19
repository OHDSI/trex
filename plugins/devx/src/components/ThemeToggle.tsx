import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, cycle } = useTheme();

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "system" ? "System theme" : `${theme} theme`;

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cycle} title={label}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
