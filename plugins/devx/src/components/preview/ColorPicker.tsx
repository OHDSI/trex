import { useState, useRef, useEffect } from "react";

const TW_PALETTE: { name: string; shades: Record<string, string> }[] = [
  { name: "slate", shades: { "50": "#f8fafc", "100": "#f1f5f9", "200": "#e2e8f0", "300": "#cbd5e1", "400": "#94a3b8", "500": "#64748b", "600": "#475569", "700": "#334155", "800": "#1e293b", "900": "#0f172a" } },
  { name: "red", shades: { "50": "#fef2f2", "100": "#fee2e2", "200": "#fecaca", "300": "#fca5a5", "400": "#f87171", "500": "#ef4444", "600": "#dc2626", "700": "#b91c1c", "800": "#991b1b", "900": "#7f1d1d" } },
  { name: "orange", shades: { "50": "#fff7ed", "100": "#ffedd5", "200": "#fed7aa", "300": "#fdba74", "400": "#fb923c", "500": "#f97316", "600": "#ea580c", "700": "#c2410c", "800": "#9a3412", "900": "#7c2d12" } },
  { name: "yellow", shades: { "50": "#fefce8", "100": "#fef9c3", "200": "#fef08a", "300": "#fde047", "400": "#facc15", "500": "#eab308", "600": "#ca8a04", "700": "#a16207", "800": "#854d0e", "900": "#713f12" } },
  { name: "green", shades: { "50": "#f0fdf4", "100": "#dcfce7", "200": "#bbf7d0", "300": "#86efac", "400": "#4ade80", "500": "#22c55e", "600": "#16a34a", "700": "#15803d", "800": "#166534", "900": "#14532d" } },
  { name: "blue", shades: { "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe", "300": "#93c5fd", "400": "#60a5fa", "500": "#3b82f6", "600": "#2563eb", "700": "#1d4ed8", "800": "#1e40af", "900": "#1e3a8a" } },
  { name: "indigo", shades: { "50": "#eef2ff", "100": "#e0e7ff", "200": "#c7d2fe", "300": "#a5b4fc", "400": "#818cf8", "500": "#6366f1", "600": "#4f46e5", "700": "#4338ca", "800": "#3730a3", "900": "#312e81" } },
  { name: "purple", shades: { "50": "#faf5ff", "100": "#f3e8ff", "200": "#e9d5ff", "300": "#d8b4fe", "400": "#c084fc", "500": "#a855f7", "600": "#9333ea", "700": "#7e22ce", "800": "#6b21a8", "900": "#581c87" } },
  { name: "pink", shades: { "50": "#fdf2f8", "100": "#fce7f3", "200": "#fbcfe8", "300": "#f9a8d4", "400": "#f472b6", "500": "#ec4899", "600": "#db2777", "700": "#be185d", "800": "#9d174d", "900": "#831843" } },
];

// Build reverse lookup: hex → "color-shade"
const HEX_TO_TW: Record<string, string> = {};
for (const family of TW_PALETTE) {
  for (const [shade, hex] of Object.entries(family.shades)) {
    HEX_TO_TW[hex.toLowerCase()] = `${family.name}-${shade}`;
  }
}
HEX_TO_TW["#000000"] = "black";
HEX_TO_TW["#ffffff"] = "white";

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value || "#000000");
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setHexInput(value || "#000000"); }, [value]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleHexSubmit = () => {
    if (/^#[0-9a-fA-F]{3,8}$/.test(hexInput)) {
      onChange(hexInput);
    }
  };

  const twName = HEX_TO_TW[value?.toLowerCase()] || null;

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      {/* Swatch + label button */}
      <button
        type="button"
        className="h-6 flex items-center gap-1 px-1 border rounded bg-background hover:bg-muted text-[10px] w-full"
        onClick={() => setOpen(!open)}
      >
        <span
          className="w-4 h-4 rounded border shrink-0"
          style={{ backgroundColor: value || "#000000" }}
        />
        <span className="truncate flex-1 text-left">
          {twName || value || "#000000"}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-[220px] bg-popover border rounded-lg shadow-xl p-2 text-[10px]">
          {/* Hex input */}
          <div className="flex gap-1 mb-2">
            <input
              type="text"
              className="h-6 text-[10px] px-1 border rounded bg-background flex-1"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleHexSubmit(); }}
              onBlur={handleHexSubmit}
            />
            <button
              type="button"
              className="h-6 px-2 text-[10px] border rounded bg-muted hover:bg-muted/80"
              onClick={() => nativeRef.current?.click()}
            >
              Pick
            </button>
            <input
              ref={nativeRef}
              type="color"
              className="sr-only"
              value={value || "#000000"}
              onChange={(e) => { onChange(e.target.value); setHexInput(e.target.value); }}
            />
          </div>

          {/* Black & white */}
          <div className="flex gap-0.5 mb-1">
            <button
              type="button"
              className="w-5 h-5 rounded border border-border"
              style={{ backgroundColor: "#ffffff" }}
              title="white"
              onClick={() => { onChange("#ffffff"); setHexInput("#ffffff"); }}
            />
            <button
              type="button"
              className="w-5 h-5 rounded border border-border"
              style={{ backgroundColor: "#000000" }}
              title="black"
              onClick={() => { onChange("#000000"); setHexInput("#000000"); }}
            />
          </div>

          {/* Tailwind palette grid */}
          {TW_PALETTE.map((family) => (
            <div key={family.name} className="flex gap-0.5 mb-0.5">
              {Object.entries(family.shades).map(([shade, hex]) => (
                <button
                  key={shade}
                  type="button"
                  className={`w-5 h-5 rounded transition-transform hover:scale-125 ${
                    value?.toLowerCase() === hex.toLowerCase() ? "ring-2 ring-primary ring-offset-1" : ""
                  }`}
                  style={{ backgroundColor: hex }}
                  title={`${family.name}-${shade}`}
                  onClick={() => { onChange(hex); setHexInput(hex); setOpen(false); }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Export for use in tailwind_mapper */
export { HEX_TO_TW };
