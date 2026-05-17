import { useState, useEffect } from "react";

const VERBS = ["Thinking", "Reasoning", "Analyzing", "Processing", "Considering"];
const CYCLE_MS = 4000;

export function StreamingLoader() {
  const [verbIndex, setVerbIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVerbIndex((i) => (i + 1) % VERBS.length);
    }, CYCLE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.8s" }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground transition-opacity duration-300">
        {VERBS[verbIndex]}...
      </span>
    </div>
  );
}
