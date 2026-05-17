import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PromptTemplate } from "@/lib/types";

interface PromptTemplateMenuProps {
  templates: PromptTemplate[];
  onSelect: (content: string) => void;
}

export function PromptTemplateMenu({ templates, onSelect }: PromptTemplateMenuProps) {
  if (templates.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Prompt templates">
          <BookOpen className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-60 overflow-auto">
        {templates.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => onSelect(t.content)}>
            <span className="truncate">{t.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
