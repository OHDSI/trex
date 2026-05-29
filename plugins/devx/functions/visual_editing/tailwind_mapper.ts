// @ts-nocheck - Deno edge function
/**
 * Maps CSS property+value pairs to Tailwind CSS classes.
 * Handles standard Tailwind spacing scale and falls back to arbitrary values.
 */

// Tailwind spacing scale: value in px → Tailwind suffix
const SPACING_SCALE: Record<string, string> = {
  "0px": "0",
  "1px": "px",
  "2px": "0.5",
  "4px": "1",
  "6px": "1.5",
  "8px": "2",
  "10px": "2.5",
  "12px": "3",
  "14px": "3.5",
  "16px": "4",
  "20px": "5",
  "24px": "6",
  "28px": "7",
  "32px": "8",
  "36px": "9",
  "40px": "10",
  "44px": "11",
  "48px": "12",
  "56px": "14",
  "64px": "16",
  "80px": "20",
  "96px": "24",
};

const BORDER_RADIUS_SCALE: Record<string, string> = {
  "0px": "rounded-none",
  "2px": "rounded-sm",
  "4px": "rounded",
  "6px": "rounded-md",
  "8px": "rounded-lg",
  "12px": "rounded-xl",
  "16px": "rounded-2xl",
  "24px": "rounded-3xl",
  "9999px": "rounded-full",
};

const BORDER_WIDTH_SCALE: Record<string, string> = {
  "0px": "border-0",
  "1px": "border",
  "2px": "border-2",
  "4px": "border-4",
  "8px": "border-8",
};

const FONT_SIZE_SCALE: Record<string, string> = {
  "12px": "text-xs",
  "14px": "text-sm",
  "16px": "text-base",
  "18px": "text-lg",
  "20px": "text-xl",
  "24px": "text-2xl",
  "30px": "text-3xl",
  "36px": "text-4xl",
  "48px": "text-5xl",
  "60px": "text-6xl",
};

const FONT_WEIGHT_SCALE: Record<string, string> = {
  "100": "font-thin",
  "200": "font-extralight",
  "300": "font-light",
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  "800": "font-extrabold",
  "900": "font-black",
};

// Full Tailwind color palette for matching
const TAILWIND_COLORS: Record<string, string> = {
  "#000000": "black", "#ffffff": "white",
  // Slate
  "#f8fafc": "slate-50", "#f1f5f9": "slate-100", "#e2e8f0": "slate-200", "#cbd5e1": "slate-300",
  "#94a3b8": "slate-400", "#64748b": "slate-500", "#475569": "slate-600", "#334155": "slate-700",
  "#1e293b": "slate-800", "#0f172a": "slate-900",
  // Gray
  "#f9fafb": "gray-50", "#f3f4f6": "gray-100", "#e5e7eb": "gray-200", "#d1d5db": "gray-300",
  "#9ca3af": "gray-400", "#6b7280": "gray-500", "#4b5563": "gray-600", "#374151": "gray-700",
  "#1f2937": "gray-800", "#111827": "gray-900",
  // Red
  "#fef2f2": "red-50", "#fee2e2": "red-100", "#fecaca": "red-200", "#fca5a5": "red-300",
  "#f87171": "red-400", "#ef4444": "red-500", "#dc2626": "red-600", "#b91c1c": "red-700",
  "#991b1b": "red-800", "#7f1d1d": "red-900",
  // Orange
  "#fff7ed": "orange-50", "#ffedd5": "orange-100", "#fed7aa": "orange-200", "#fdba74": "orange-300",
  "#fb923c": "orange-400", "#f97316": "orange-500", "#ea580c": "orange-600", "#c2410c": "orange-700",
  "#9a3412": "orange-800", "#7c2d12": "orange-900",
  // Yellow
  "#fefce8": "yellow-50", "#fef9c3": "yellow-100", "#fef08a": "yellow-200", "#fde047": "yellow-300",
  "#facc15": "yellow-400", "#eab308": "yellow-500", "#ca8a04": "yellow-600", "#a16207": "yellow-700",
  "#854d0e": "yellow-800", "#713f12": "yellow-900",
  // Green
  "#f0fdf4": "green-50", "#dcfce7": "green-100", "#bbf7d0": "green-200", "#86efac": "green-300",
  "#4ade80": "green-400", "#22c55e": "green-500", "#16a34a": "green-600", "#15803d": "green-700",
  "#166534": "green-800", "#14532d": "green-900",
  // Blue
  "#eff6ff": "blue-50", "#dbeafe": "blue-100", "#bfdbfe": "blue-200", "#93c5fd": "blue-300",
  "#60a5fa": "blue-400", "#3b82f6": "blue-500", "#2563eb": "blue-600", "#1d4ed8": "blue-700",
  "#1e40af": "blue-800", "#1e3a8a": "blue-900",
  // Indigo
  "#eef2ff": "indigo-50", "#e0e7ff": "indigo-100", "#c7d2fe": "indigo-200", "#a5b4fc": "indigo-300",
  "#818cf8": "indigo-400", "#6366f1": "indigo-500", "#4f46e5": "indigo-600", "#4338ca": "indigo-700",
  "#3730a3": "indigo-800", "#312e81": "indigo-900",
  // Purple
  "#faf5ff": "purple-50", "#f3e8ff": "purple-100", "#e9d5ff": "purple-200", "#d8b4fe": "purple-300",
  "#c084fc": "purple-400", "#a855f7": "purple-500", "#9333ea": "purple-600", "#7e22ce": "purple-700",
  "#6b21a8": "purple-800", "#581c87": "purple-900",
  // Pink
  "#fdf2f8": "pink-50", "#fce7f3": "pink-100", "#fbcfe8": "pink-200", "#f9a8d4": "pink-300",
  "#f472b6": "pink-400", "#ec4899": "pink-500", "#db2777": "pink-600", "#be185d": "pink-700",
  "#9d174d": "pink-800", "#831843": "pink-900",
};

type SpacingDirection = "top" | "right" | "bottom" | "left";

function spacingClass(
  type: "m" | "p",
  direction: SpacingDirection,
  value: string,
): string {
  const dirMap: Record<SpacingDirection, string> = {
    top: "t",
    right: "r",
    bottom: "b",
    left: "l",
  };
  const prefix = type + dirMap[direction];
  const scale = SPACING_SCALE[value];
  if (scale !== undefined) {
    return `${prefix}-${scale}`;
  }
  return `${prefix}-[${value}]`;
}

function colorClass(prefix: string, value: string): string {
  const hex = normalizeColor(value);
  if (hex && TAILWIND_COLORS[hex]) {
    return `${prefix}-${TAILWIND_COLORS[hex]}`;
  }
  if (hex) {
    return `${prefix}-[${hex}]`;
  }
  return `${prefix}-[${value}]`;
}

function normalizeColor(value: string): string | null {
  // Handle hex colors
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return value.toLowerCase();
  }
  // Handle rgb/rgba
  const rgbMatch = value.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return null;
}

// Layout maps
const DISPLAY_MAP: Record<string, string> = {
  "block": "block", "flex": "flex", "grid": "grid",
  "inline": "inline", "inline-flex": "inline-flex",
  "inline-block": "inline-block", "none": "hidden",
};

const FLEX_DIRECTION_MAP: Record<string, string> = {
  "row": "flex-row", "row-reverse": "flex-row-reverse",
  "column": "flex-col", "column-reverse": "flex-col-reverse",
};

const JUSTIFY_MAP: Record<string, string> = {
  "flex-start": "justify-start", "flex-end": "justify-end",
  "center": "justify-center", "space-between": "justify-between",
  "space-around": "justify-around", "space-evenly": "justify-evenly",
};

const ALIGN_MAP: Record<string, string> = {
  "flex-start": "items-start", "flex-end": "items-end",
  "center": "items-center", "stretch": "items-stretch",
  "baseline": "items-baseline",
};

// Typography maps
const TEXT_ALIGN_MAP: Record<string, string> = {
  "left": "text-left", "center": "text-center",
  "right": "text-right", "justify": "text-justify",
};

const TEXT_DECORATION_MAP: Record<string, string> = {
  "underline": "underline", "line-through": "line-through",
  "overline": "overline", "none": "no-underline",
};

const TEXT_TRANSFORM_MAP: Record<string, string> = {
  "uppercase": "uppercase", "lowercase": "lowercase",
  "capitalize": "capitalize", "none": "normal-case",
};

const LINE_HEIGHT_SCALE: Record<string, string> = {
  "1": "leading-none", "1.25": "leading-tight", "1.375": "leading-snug",
  "1.5": "leading-normal", "1.625": "leading-relaxed", "2": "leading-loose",
};

const LETTER_SPACING_SCALE: Record<string, string> = {
  "-0.05em": "tracking-tighter", "-0.025em": "tracking-tight",
  "0em": "tracking-normal", "0.025em": "tracking-wide",
  "0.05em": "tracking-wider", "0.1em": "tracking-widest",
};

// Sizing maps
const WIDTH_KEYWORDS: Record<string, string> = {
  "auto": "w-auto", "100%": "w-full", "100vw": "w-screen",
  "min-content": "w-min", "max-content": "w-max", "fit-content": "w-fit",
};

const HEIGHT_KEYWORDS: Record<string, string> = {
  "auto": "h-auto", "100%": "h-full", "100vh": "h-screen",
  "min-content": "h-min", "max-content": "h-max", "fit-content": "h-fit",
};

// Positioning maps
const POSITION_MAP: Record<string, string> = {
  "static": "static", "relative": "relative", "absolute": "absolute",
  "fixed": "fixed", "sticky": "sticky",
};

const Z_INDEX_SCALE: Record<string, string> = {
  "auto": "z-auto", "0": "z-0", "10": "z-10", "20": "z-20",
  "30": "z-30", "40": "z-40", "50": "z-50",
};

const OVERFLOW_MAP: Record<string, string> = {
  "auto": "overflow-auto", "hidden": "overflow-hidden",
  "visible": "overflow-visible", "scroll": "overflow-scroll",
};

// Extended property maps
const FONT_FAMILY_MAP: Record<string, string> = {
  "sans-serif": "font-sans", "serif": "font-serif", "monospace": "font-mono",
};

const BORDER_STYLE_MAP: Record<string, string> = {
  "solid": "border-solid", "dashed": "border-dashed",
  "dotted": "border-dotted", "none": "border-none",
};

const FLEX_WRAP_MAP: Record<string, string> = {
  "wrap": "flex-wrap", "nowrap": "flex-nowrap", "wrap-reverse": "flex-wrap-reverse",
};

const GRID_COLS_SCALE: Record<string, string> = {
  "none": "grid-cols-none",
  "1": "grid-cols-1", "2": "grid-cols-2", "3": "grid-cols-3",
  "4": "grid-cols-4", "5": "grid-cols-5", "6": "grid-cols-6",
  "12": "grid-cols-12",
};

const GRID_ROWS_SCALE: Record<string, string> = {
  "none": "grid-rows-none",
  "1": "grid-rows-1", "2": "grid-rows-2", "3": "grid-rows-3",
  "4": "grid-rows-4", "5": "grid-rows-5", "6": "grid-rows-6",
};

const ASPECT_RATIO_MAP: Record<string, string> = {
  "auto": "aspect-auto", "1 / 1": "aspect-square", "16 / 9": "aspect-video",
};

const OBJECT_FIT_MAP: Record<string, string> = {
  "cover": "object-cover", "contain": "object-contain", "fill": "object-fill",
  "none": "object-none", "scale-down": "object-scale-down",
};

const CURSOR_MAP: Record<string, string> = {
  "default": "cursor-default", "pointer": "cursor-pointer", "move": "cursor-move",
  "text": "cursor-text", "not-allowed": "cursor-not-allowed", "grab": "cursor-grab",
};

const VISIBILITY_MAP: Record<string, string> = {
  "visible": "visible", "hidden": "invisible",
};

const POINTER_EVENTS_MAP: Record<string, string> = {
  "none": "pointer-events-none", "auto": "pointer-events-auto",
};

const USER_SELECT_MAP: Record<string, string> = {
  "none": "select-none", "text": "select-text", "all": "select-all", "auto": "select-auto",
};

const WHITE_SPACE_MAP: Record<string, string> = {
  "normal": "whitespace-normal", "nowrap": "whitespace-nowrap",
  "pre": "whitespace-pre", "pre-wrap": "whitespace-pre-wrap",
};

const WORD_BREAK_MAP: Record<string, string> = {
  "normal": "break-normal", "break-all": "break-all", "keep-all": "break-keep",
};

const GRADIENT_DIRECTION_MAP: Record<string, string> = {
  "to right": "bg-gradient-to-r", "to left": "bg-gradient-to-l",
  "to bottom": "bg-gradient-to-b", "to top": "bg-gradient-to-t",
  "to bottom right": "bg-gradient-to-br", "to bottom left": "bg-gradient-to-bl",
  "to top right": "bg-gradient-to-tr", "to top left": "bg-gradient-to-tl",
};

// Effects maps
const OPACITY_SCALE: Record<string, string> = {
  "0": "opacity-0", "0.05": "opacity-5", "0.1": "opacity-10",
  "0.2": "opacity-20", "0.25": "opacity-25", "0.3": "opacity-30",
  "0.4": "opacity-40", "0.5": "opacity-50", "0.6": "opacity-60",
  "0.7": "opacity-70", "0.75": "opacity-75", "0.8": "opacity-80",
  "0.9": "opacity-90", "0.95": "opacity-95", "1": "opacity-100",
};

const SHADOW_MAP: Record<string, string> = {
  "none": "shadow-none", "sm": "shadow-sm", "md": "shadow-md",
  "lg": "shadow-lg", "xl": "shadow-xl", "2xl": "shadow-2xl",
};

function sizingClass(prefix: string, value: string, keywords: Record<string, string>): string {
  if (keywords[value]) return keywords[value];
  const scale = SPACING_SCALE[value];
  if (scale !== undefined) return `${prefix}-${scale}`;
  return `${prefix}-[${value}]`;
}

/** Conflicting class prefixes for deduplication */
const SPACING_PREFIXES = [
  "mt-", "mr-", "mb-", "ml-", "mx-", "my-", "m-",
  "pt-", "pr-", "pb-", "pl-", "px-", "py-", "p-",
];
const STYLE_PREFIXES = [
  "border-", "rounded-", "bg-", "text-", "font-",
  ...SPACING_PREFIXES,
  // Layout — use trailing dash for prefix matching; bare words are exact-match only
  "flex-row", "flex-col",
  "justify-", "items-", "gap-",
  // Sizing
  "w-", "h-", "min-w-", "max-w-", "min-h-", "max-h-",
  // Typography
  "text-left", "text-center", "text-right", "text-justify",
  "leading-", "tracking-",
  "underline", "line-through", "no-underline", "overline",
  "uppercase", "lowercase", "capitalize", "normal-case",
  // Border extended
  "border-solid", "border-dashed", "border-dotted", "border-none",
  "rounded-tl-", "rounded-tr-", "rounded-br-", "rounded-bl-",
  // Layout extended
  "flex-wrap", "flex-nowrap", "grow", "shrink",
  "grid-cols-", "grid-rows-",
  // Sizing extended
  "aspect-", "object-",
  // Positioning
  "static", "relative", "absolute", "fixed", "sticky",
  "top-", "right-", "bottom-", "left-", "inset-",
  "z-", "overflow-",
  // Effects extended
  "cursor-", "visible", "invisible", "pointer-events-", "select-",
  "opacity-", "shadow",
  // Typography extended
  "whitespace-", "break-", "truncate", "text-ellipsis", "text-clip",
  // Gradient
  "bg-gradient-", "from-", "to-",
  // Font
  "font-sans", "font-serif", "font-mono",
];

/** Exact-match conflict groups: classes that conflict with each other but don't share a prefix */
const EXACT_MATCH_GROUPS: string[][] = [
  ["block", "flex", "grid", "inline", "inline-flex", "inline-block", "hidden"],
  ["static", "relative", "absolute", "fixed", "sticky"],
  ["visible", "invisible"],
  ["underline", "line-through", "overline", "no-underline"],
  ["uppercase", "lowercase", "capitalize", "normal-case"],
  ["flex-wrap", "flex-nowrap", "flex-wrap-reverse"],
];

/**
 * Remove conflicting classes from an existing className string.
 * E.g., if adding "pt-4", remove any existing "pt-*" class.
 */
export function deduplicateClasses(
  existingClasses: string,
  newClasses: string[],
): string {
  const existing = existingClasses.split(/\s+/).filter(Boolean);
  const prefixesToRemove = new Set<string>();
  const exactsToRemove = new Set<string>();

  for (const newClass of newClasses) {
    // Check exact-match groups first
    for (const group of EXACT_MATCH_GROUPS) {
      if (group.includes(newClass)) {
        for (const member of group) exactsToRemove.add(member);
        break;
      }
    }
    // Find which prefix this new class matches
    for (const prefix of STYLE_PREFIXES) {
      if (newClass.startsWith(prefix) || newClass === prefix.slice(0, -1)) {
        prefixesToRemove.add(prefix);
        break;
      }
    }
    // Handle exact matches like "rounded" or "border"
    if (newClass === "rounded" || newClass.startsWith("rounded-")) {
      prefixesToRemove.add("rounded");
    }
    if (newClass === "border" || newClass.match(/^border-\d/)) {
      prefixesToRemove.add("border-");
      prefixesToRemove.add("border");
    }
  }

  const filtered = existing.filter((cls) => {
    // Check exact-match removals
    if (exactsToRemove.has(cls)) return false;
    // Check prefix removals
    for (const prefix of prefixesToRemove) {
      if (cls.startsWith(prefix) || cls === prefix.slice(0, -1)) {
        return false;
      }
    }
    return true;
  });

  // Deduplicate within newClasses — keep last occurrence per prefix/group
  const deduped: string[] = [];
  for (let i = newClasses.length - 1; i >= 0; i--) {
    const cls = newClasses[i];
    const hasConflict = deduped.some((existing) => {
      // Check exact-match groups
      for (const group of EXACT_MATCH_GROUPS) {
        if (group.includes(cls) && group.includes(existing)) return true;
      }
      // Check prefix conflict
      for (const prefix of STYLE_PREFIXES) {
        if (cls.startsWith(prefix) && existing.startsWith(prefix)) return true;
      }
      return false;
    });
    if (!hasConflict) deduped.unshift(cls);
  }

  return [...filtered, ...deduped].join(" ");
}

export interface StyleChanges {
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
  padding?: { top?: string; right?: string; bottom?: string; left?: string };
  border?: {
    width?: string; radius?: string; color?: string; style?: string;
    topLeftRadius?: string; topRightRadius?: string;
    bottomRightRadius?: string; bottomLeftRadius?: string;
  };
  backgroundColor?: string;
  background?: {
    type?: 'solid' | 'gradient';
    gradientDirection?: string;
    gradientFrom?: string;
    gradientTo?: string;
  };
  text?: {
    fontFamily?: string; fontSize?: string; fontWeight?: string; color?: string;
    textAlign?: string; lineHeight?: string; letterSpacing?: string;
    textDecoration?: string; textTransform?: string;
    whiteSpace?: string; wordBreak?: string; textOverflow?: string;
  };
  layout?: {
    display?: string; flexDirection?: string; justifyContent?: string;
    alignItems?: string; gap?: string;
    flexWrap?: string; flexGrow?: string; flexShrink?: string;
    gridTemplateColumns?: string; gridTemplateRows?: string;
  };
  sizing?: {
    width?: string; height?: string;
    minWidth?: string; maxWidth?: string;
    minHeight?: string; maxHeight?: string;
    aspectRatio?: string; objectFit?: string;
  };
  positioning?: {
    position?: string;
    top?: string; right?: string; bottom?: string; left?: string;
    zIndex?: string; overflow?: string;
  };
  effects?: {
    cursor?: string; visibility?: string;
    pointerEvents?: string; userSelect?: string;
  };
  opacity?: string;
  boxShadow?: string;
}

/**
 * Convert a StyleChanges object into an array of Tailwind classes.
 */
export function stylesToTailwindClasses(changes: StyleChanges): string[] {
  const classes: string[] = [];

  if (changes.margin) {
    for (const [dir, val] of Object.entries(changes.margin)) {
      if (val) classes.push(spacingClass("m", dir as SpacingDirection, val));
    }
  }

  if (changes.padding) {
    for (const [dir, val] of Object.entries(changes.padding)) {
      if (val) classes.push(spacingClass("p", dir as SpacingDirection, val));
    }
  }

  if (changes.border) {
    if (changes.border.width) {
      const bw = BORDER_WIDTH_SCALE[changes.border.width];
      classes.push(bw || `border-[${changes.border.width}]`);
    }
    if (changes.border.radius) {
      const br = BORDER_RADIUS_SCALE[changes.border.radius];
      classes.push(br || `rounded-[${changes.border.radius}]`);
    }
    if (changes.border.color) {
      classes.push(colorClass("border", changes.border.color));
    }
    if (changes.border.style) {
      const bs = BORDER_STYLE_MAP[changes.border.style];
      if (bs) classes.push(bs);
    }
    if (changes.border.topLeftRadius) {
      const br = BORDER_RADIUS_SCALE[changes.border.topLeftRadius];
      classes.push(br ? br.replace("rounded", "rounded-tl") : `rounded-tl-[${changes.border.topLeftRadius}]`);
    }
    if (changes.border.topRightRadius) {
      const br = BORDER_RADIUS_SCALE[changes.border.topRightRadius];
      classes.push(br ? br.replace("rounded", "rounded-tr") : `rounded-tr-[${changes.border.topRightRadius}]`);
    }
    if (changes.border.bottomRightRadius) {
      const br = BORDER_RADIUS_SCALE[changes.border.bottomRightRadius];
      classes.push(br ? br.replace("rounded", "rounded-br") : `rounded-br-[${changes.border.bottomRightRadius}]`);
    }
    if (changes.border.bottomLeftRadius) {
      const br = BORDER_RADIUS_SCALE[changes.border.bottomLeftRadius];
      classes.push(br ? br.replace("rounded", "rounded-bl") : `rounded-bl-[${changes.border.bottomLeftRadius}]`);
    }
  }

  if (changes.backgroundColor) {
    classes.push(colorClass("bg", changes.backgroundColor));
  }

  // Background gradient
  if (changes.background?.type === "gradient") {
    if (changes.background.gradientDirection) {
      const gd = GRADIENT_DIRECTION_MAP[changes.background.gradientDirection];
      if (gd) classes.push(gd);
    }
    if (changes.background.gradientFrom) {
      classes.push(colorClass("from", changes.background.gradientFrom));
    }
    if (changes.background.gradientTo) {
      classes.push(colorClass("to", changes.background.gradientTo));
    }
  }

  if (changes.text) {
    if (changes.text.fontFamily) {
      const ff = FONT_FAMILY_MAP[changes.text.fontFamily];
      classes.push(ff || `font-['${changes.text.fontFamily.replace(/'/g, "")}']`);
    }
    if (changes.text.fontSize) {
      const fs = FONT_SIZE_SCALE[changes.text.fontSize];
      classes.push(fs || `text-[${changes.text.fontSize}]`);
    }
    if (changes.text.fontWeight) {
      const fw = FONT_WEIGHT_SCALE[changes.text.fontWeight];
      classes.push(fw || `font-[${changes.text.fontWeight}]`);
    }
    if (changes.text.color) {
      classes.push(colorClass("text", changes.text.color));
    }
    if (changes.text.textAlign) {
      const ta = TEXT_ALIGN_MAP[changes.text.textAlign];
      if (ta) classes.push(ta);
    }
    if (changes.text.lineHeight) {
      const lh = LINE_HEIGHT_SCALE[changes.text.lineHeight];
      classes.push(lh || `leading-[${changes.text.lineHeight}]`);
    }
    if (changes.text.letterSpacing) {
      const ls = LETTER_SPACING_SCALE[changes.text.letterSpacing];
      classes.push(ls || `tracking-[${changes.text.letterSpacing}]`);
    }
    if (changes.text.textDecoration) {
      const td = TEXT_DECORATION_MAP[changes.text.textDecoration];
      if (td) classes.push(td);
    }
    if (changes.text.textTransform) {
      const tt = TEXT_TRANSFORM_MAP[changes.text.textTransform];
      if (tt) classes.push(tt);
    }
    if (changes.text.whiteSpace) {
      const ws = WHITE_SPACE_MAP[changes.text.whiteSpace];
      if (ws) classes.push(ws);
    }
    if (changes.text.wordBreak) {
      const wb = WORD_BREAK_MAP[changes.text.wordBreak];
      if (wb) classes.push(wb);
    }
    if (changes.text.textOverflow === "ellipsis") {
      classes.push("truncate");
    }
  }

  // Layout
  if (changes.layout) {
    if (changes.layout.display) {
      const d = DISPLAY_MAP[changes.layout.display];
      if (d) classes.push(d);
    }
    if (changes.layout.flexDirection) {
      const fd = FLEX_DIRECTION_MAP[changes.layout.flexDirection];
      if (fd) classes.push(fd);
    }
    if (changes.layout.justifyContent) {
      const jc = JUSTIFY_MAP[changes.layout.justifyContent];
      if (jc) classes.push(jc);
    }
    if (changes.layout.alignItems) {
      const ai = ALIGN_MAP[changes.layout.alignItems];
      if (ai) classes.push(ai);
    }
    if (changes.layout.gap) {
      const scale = SPACING_SCALE[changes.layout.gap];
      classes.push(scale !== undefined ? `gap-${scale}` : `gap-[${changes.layout.gap}]`);
    }
    if (changes.layout.flexWrap) {
      const fw = FLEX_WRAP_MAP[changes.layout.flexWrap];
      if (fw) classes.push(fw);
    }
    if (changes.layout.flexGrow) {
      classes.push(changes.layout.flexGrow === "0" ? "grow-0" : "grow");
    }
    if (changes.layout.flexShrink) {
      classes.push(changes.layout.flexShrink === "0" ? "shrink-0" : "shrink");
    }
    if (changes.layout.gridTemplateColumns) {
      const gc = GRID_COLS_SCALE[changes.layout.gridTemplateColumns];
      classes.push(gc || `grid-cols-[${changes.layout.gridTemplateColumns}]`);
    }
    if (changes.layout.gridTemplateRows) {
      const gr = GRID_ROWS_SCALE[changes.layout.gridTemplateRows];
      classes.push(gr || `grid-rows-[${changes.layout.gridTemplateRows}]`);
    }
  }

  // Sizing
  if (changes.sizing) {
    if (changes.sizing.width) classes.push(sizingClass("w", changes.sizing.width, WIDTH_KEYWORDS));
    if (changes.sizing.height) classes.push(sizingClass("h", changes.sizing.height, HEIGHT_KEYWORDS));
    if (changes.sizing.minWidth) classes.push(sizingClass("min-w", changes.sizing.minWidth, {}));
    if (changes.sizing.maxWidth) classes.push(sizingClass("max-w", changes.sizing.maxWidth, {}));
    if (changes.sizing.minHeight) classes.push(sizingClass("min-h", changes.sizing.minHeight, {}));
    if (changes.sizing.maxHeight) classes.push(sizingClass("max-h", changes.sizing.maxHeight, {}));
    if (changes.sizing.aspectRatio) {
      const ar = ASPECT_RATIO_MAP[changes.sizing.aspectRatio];
      classes.push(ar || `aspect-[${changes.sizing.aspectRatio}]`);
    }
    if (changes.sizing.objectFit) {
      const of_ = OBJECT_FIT_MAP[changes.sizing.objectFit];
      if (of_) classes.push(of_);
    }
  }

  // Positioning
  if (changes.positioning) {
    if (changes.positioning.position) {
      const pos = POSITION_MAP[changes.positioning.position];
      if (pos) classes.push(pos);
    }
    if (changes.positioning.top) {
      const scale = SPACING_SCALE[changes.positioning.top];
      classes.push(scale !== undefined ? `top-${scale}` : `top-[${changes.positioning.top}]`);
    }
    if (changes.positioning.right) {
      const scale = SPACING_SCALE[changes.positioning.right];
      classes.push(scale !== undefined ? `right-${scale}` : `right-[${changes.positioning.right}]`);
    }
    if (changes.positioning.bottom) {
      const scale = SPACING_SCALE[changes.positioning.bottom];
      classes.push(scale !== undefined ? `bottom-${scale}` : `bottom-[${changes.positioning.bottom}]`);
    }
    if (changes.positioning.left) {
      const scale = SPACING_SCALE[changes.positioning.left];
      classes.push(scale !== undefined ? `left-${scale}` : `left-[${changes.positioning.left}]`);
    }
    if (changes.positioning.zIndex) {
      const zi = Z_INDEX_SCALE[changes.positioning.zIndex];
      classes.push(zi || `z-[${changes.positioning.zIndex}]`);
    }
    if (changes.positioning.overflow) {
      const ov = OVERFLOW_MAP[changes.positioning.overflow];
      if (ov) classes.push(ov);
    }
  }

  // Effects
  if (changes.effects) {
    if (changes.effects.cursor) {
      const cu = CURSOR_MAP[changes.effects.cursor];
      if (cu) classes.push(cu);
    }
    if (changes.effects.visibility) {
      const vi = VISIBILITY_MAP[changes.effects.visibility];
      if (vi) classes.push(vi);
    }
    if (changes.effects.pointerEvents) {
      const pe = POINTER_EVENTS_MAP[changes.effects.pointerEvents];
      if (pe) classes.push(pe);
    }
    if (changes.effects.userSelect) {
      const us = USER_SELECT_MAP[changes.effects.userSelect];
      if (us) classes.push(us);
    }
  }

  // Opacity
  if (changes.opacity) {
    const op = OPACITY_SCALE[changes.opacity];
    classes.push(op || `opacity-[${changes.opacity}]`);
  }

  // Box Shadow
  if (changes.boxShadow) {
    const sh = SHADOW_MAP[changes.boxShadow];
    if (sh) classes.push(sh);
  }

  return classes;
}
