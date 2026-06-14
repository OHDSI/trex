import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface CrumbSibling {
  id: string;
  label: string;
}

export interface Crumb {
  key: string;
  label: string;
  icon?: React.ElementType;
  /** Click the text to navigate to this level (omit for the current/last crumb). */
  onNavigate?: () => void;
  /** If provided, the crumb shows a chevron that opens a sibling switcher. */
  siblings?: CrumbSibling[];
  onSwitch?: (id: string) => void;
  onNew?: () => void;
  newLabel?: string;
}

export function Breadcrumb({ crumbs, actions }: { crumbs: Crumb[]; actions?: React.ReactNode }) {
  return (
    <nav className="flex items-center gap-0.5 px-3 h-9 border-b shrink-0 text-sm">
      {crumbs.map((c, i) => {
        const Icon = c.icon;
        const isLast = i === crumbs.length - 1;
        return (
          <div key={c.key} className="flex items-center gap-0.5 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-30" />}
            <button
              type="button"
              onClick={c.onNavigate}
              disabled={!c.onNavigate}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1 truncate",
                c.onNavigate && "hover:bg-accent",
                isLast && "font-semibold",
                !c.onNavigate && "cursor-default",
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
              <span className="truncate">{c.label}</span>
            </button>
            {c.siblings && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded-md p-1 hover:bg-accent" aria-label={`Switch ${c.label}`}>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {c.siblings.map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => c.onSwitch?.(s.id)}>
                      <span className="truncate">{s.label}</span>
                    </DropdownMenuItem>
                  ))}
                  {c.onNew && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={c.onNew}>
                        <Plus className="h-3.5 w-3.5 mr-2" />
                        {c.newLabel ?? "New"}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}
      {actions && <div className="ml-auto flex items-center">{actions}</div>}
    </nav>
  );
}
