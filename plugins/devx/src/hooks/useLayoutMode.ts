import { useState, useEffect } from "react";
import type { LayoutMode, PanelAssignment } from "@/lib/types";

const DEFAULT_ASSIGNMENT: PanelAssignment = { left: "chat", right: "preview" };

export function useLayoutMode() {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    (localStorage.getItem("devx-layout") as LayoutMode) || "split",
  );

  const [panelAssignment, setPanelAssignment] = useState<PanelAssignment>(() => {
    try {
      const stored = localStorage.getItem("devx-panel-assignment");
      return stored ? JSON.parse(stored) : DEFAULT_ASSIGNMENT;
    } catch {
      return DEFAULT_ASSIGNMENT;
    }
  });

  useEffect(() => {
    localStorage.setItem("devx-layout", layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    localStorage.setItem("devx-panel-assignment", JSON.stringify(panelAssignment));
  }, [panelAssignment]);

  return { layoutMode, setLayoutMode, panelAssignment, setPanelAssignment };
}
