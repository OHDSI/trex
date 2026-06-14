// Polyfill ResizeObserver for jsdom (needed by Vuetify VProgressCircular)
if (typeof ResizeObserver === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
