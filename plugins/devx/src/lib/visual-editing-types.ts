export interface SelectedElement {
  devxId: string;       // "src/components/Button.tsx:15:4"
  devxName: string;     // "Button"
  tagName: string;      // "button"
  filePath: string;     // parsed from devxId
  line: number;         // parsed from devxId
  col: number;          // parsed from devxId
  boundingRect: { top: number; left: number; width: number; height: number };
}

export interface PendingChange {
  componentId: string;
  componentName: string;
  filePath: string;
  line: number;
  col?: number;
  styles: StyleChanges;
  textContent?: string;
  insertChild?: { index: number; tagName: string; classes: string; text: string };
  removeChild?: { index: number };
  moveChild?: { fromIndex: number; toIndex: number };
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

export interface VisualEditContext {
  filePath: string;
  line: number;
  componentName: string;
}

export interface SelectedComponent {
  devxId: string;       // "src/components/Button.tsx:15:4"
  devxName: string;     // "Button"
  filePath: string;
  line: number;
}

// === Visual Editing Actions (for undo/redo) ===

export interface StyleAction {
  type: 'update-style';
  devxId: string;
  original: Record<string, string>;  // CSS property → original value
  updated: Record<string, string>;   // CSS property → new value
}

export interface TextAction {
  type: 'edit-text';
  devxId: string;
  original: string;
  updated: string;
}

export interface InsertAction {
  type: 'insert-element';
  devxId: string;           // parent's devxId (element has no devxId yet)
  parentDevxId: string;
  index: number;
  tagName: string;
  defaultClasses: string;
  defaultText: string;
}

export interface RemoveAction {
  type: 'remove-element';
  devxId: string;
  parentDevxId: string;
  index: number;
  tagName: string;
  defaultClasses: string;
  defaultText: string;
}

export interface MoveAction {
  type: 'move-element';
  devxId: string;
  fromParentDevxId: string;
  fromIndex: number;
  toParentDevxId: string;
  toIndex: number;
}

export type VisualAction = StyleAction | TextAction | InsertAction | RemoveAction | MoveAction;
