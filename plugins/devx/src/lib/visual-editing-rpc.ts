/**
 * DevX Visual Editing RPC — parent-side
 * Typed, promise-based RPC layer for communicating with the iframe bridge.
 *
 * Usage:
 *   const rpc = createIframeRpc(iframeRef.current);
 *   const styles = await rpc.call('getStyles', 'src/Button.tsx:15:4');
 */

export interface ComputedStyles {
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  borderWidth: string;
  borderRadius: string;
  borderColor: string;
  borderStyle: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomRightRadius: string;
  borderBottomLeftRadius: string;
  backgroundColor: string;
  backgroundImage: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  // Layout
  display: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  gap: string;
  flexWrap: string;
  flexGrow: string;
  flexShrink: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  // Sizing
  width: string;
  height: string;
  minWidth: string;
  maxWidth: string;
  minHeight: string;
  maxHeight: string;
  aspectRatio: string;
  objectFit: string;
  // Typography
  textAlign: string;
  lineHeight: string;
  letterSpacing: string;
  textDecoration: string;
  textTransform: string;
  whiteSpace: string;
  wordBreak: string;
  textOverflow: string;
  // Positioning
  position: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  zIndex: string;
  overflow: string;
  // Effects
  opacity: string;
  boxShadow: string;
  cursor: string;
  visibility: string;
  pointerEvents: string;
  userSelect: string;
}

export interface DomTreeNode {
  devxId: string | null;
  name: string;
  tagName: string;
  hasChildren: boolean;
  children: DomTreeNode[];
}

export interface ComputedAndDefinedStyles {
  computed: ComputedStyles;
  defined: Partial<ComputedStyles>;
}

export interface IframeRpc {
  /** Call a named method on the iframe with arguments */
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  /** Convenience typed methods */
  getStyles(devxId: string): Promise<ComputedStyles>;
  getComputedAndDefinedStyles(devxId: string): Promise<ComputedAndDefinedStyles>;
  applyStyles(devxId: string, styles: Record<string, string>): Promise<void>;
  resetStyles(devxId: string | null): Promise<void>;
  enableTextEditing(devxId: string): Promise<void>;
  moveElement(devxId: string, newParentDevxId: string, newIndex: number): Promise<void>;
  insertElement(parentDevxId: string, index: number, tagName: string, defaultClasses: string, defaultText: string): Promise<{ tagName: string; index: number } | null>;
  removeElement(devxId: string): Promise<void>;
  getChildCount(parentDevxId: string): Promise<number>;
  getParentInfo(devxId: string): Promise<{ parentDevxId: string; index: number } | null>;
  getDomTree(): Promise<DomTreeNode[]>;
  getElementHTML(devxId: string): Promise<string>;
  pasteHTML(parentDevxId: string, index: number, html: string): Promise<void>;
  groupElement(devxId: string): Promise<void>;
  ungroupElement(devxId: string): Promise<void>;
  /** Dispose listener */
  destroy(): void;
}

let callIdCounter = 0;

export function createIframeRpc(iframe: HTMLIFrameElement | null): IframeRpc {
  const pendingCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  function handleMessage(e: MessageEvent) {
    if (!e.data?.__devx_rpc_reply) return;
    if (e.source !== iframe?.contentWindow) return;

    const pending = pendingCalls.get(e.data.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingCalls.delete(e.data.id);

    if (e.data.error) {
      pending.reject(new Error(e.data.error));
    } else {
      pending.resolve(e.data.result);
    }
  }

  window.addEventListener("message", handleMessage);

  function call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    if (!iframe?.contentWindow) {
      return Promise.reject(new Error("iframe not available"));
    }

    const id = `__devx_rpc_${++callIdCounter}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCalls.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 10000);

      pendingCalls.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      iframe.contentWindow!.postMessage(
        { __devx_rpc: true, id, method, args },
        "*",
      );
    });
  }

  function destroy() {
    window.removeEventListener("message", handleMessage);
    for (const [, pending] of pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error("RPC destroyed"));
    }
    pendingCalls.clear();
  }

  return {
    call,
    getStyles: (devxId) => call<ComputedStyles>("getStyles", devxId),
    getComputedAndDefinedStyles: (devxId) => call<ComputedAndDefinedStyles>("getComputedAndDefinedStyles", devxId),
    applyStyles: (devxId, styles) => call<void>("applyStyles", devxId, styles),
    resetStyles: (devxId) => call<void>("resetStyles", devxId),
    enableTextEditing: (devxId) => call<void>("enableTextEditing", devxId),
    moveElement: (devxId, newParentDevxId, newIndex) => call<void>("moveElement", devxId, newParentDevxId, newIndex),
    insertElement: (parentDevxId, index, tagName, defaultClasses, defaultText) =>
      call<{ tagName: string; index: number } | null>("insertElement", parentDevxId, index, tagName, defaultClasses, defaultText),
    removeElement: (devxId) => call<void>("removeElement", devxId),
    getChildCount: (parentDevxId) => call<number>("getChildCount", parentDevxId),
    getParentInfo: (devxId) => call<{ parentDevxId: string; index: number } | null>("getParentInfo", devxId),
    getDomTree: () => call<DomTreeNode[]>("getDomTree"),
    getElementHTML: (devxId) => call<string>("getElementHTML", devxId),
    pasteHTML: (parentDevxId, index, html) => call<void>("pasteHTML", parentDevxId, index, html),
    groupElement: (devxId) => call<void>("groupElement", devxId),
    ungroupElement: (devxId) => call<void>("ungroupElement", devxId),
    destroy,
  };
}
