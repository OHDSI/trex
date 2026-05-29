import { useState } from "react";
import { CheckCircle2, Loader2, Circle, ListTodo, ChevronDown, ChevronRight } from "lucide-react";
import type { AgentTodo } from "@/lib/types";

interface TodoListProps {
  todos: AgentTodo[];
}

const STATUS_ICON = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  in_progress: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
  pending: <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
};

export function TodoList({ todos }: TodoListProps) {
  const completed = todos.filter((t) => t.status === "completed").length;
  const allDone = completed === todos.length;
  const inProgress = todos.find((t) => t.status === "in_progress");
  const [expanded, setExpanded] = useState(!allDone);

  if (todos.length === 0) return null;
  if (allDone) return null;

  return (
    <div className="mx-3 mb-2 rounded-lg border bg-muted/30 p-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left text-xs"
      >
        <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">
          Tasks ({completed}/{todos.length} completed)
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
        )}
      </button>
      {!expanded && inProgress && (
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground pl-5">
          {STATUS_ICON.in_progress}
          <span>{inProgress.content}</span>
        </div>
      )}
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-2 text-xs pl-1"
            >
              {STATUS_ICON[todo.status]}
              <span
                className={
                  todo.status === "completed"
                    ? "line-through text-muted-foreground"
                    : ""
                }
              >
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
