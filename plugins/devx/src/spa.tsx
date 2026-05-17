import React from "react";
import ReactDOMClient from "react-dom/client";
import singleSpaReact from "single-spa-react";
import App from "./App";
// CSS is loaded externally by the host via <link> tag — not imported here
// to avoid Vite injecting it into the document head and breaking host styles.

// Visible in browser console to verify latest build
declare const __BUILD_TIME__: string;
console.log("[devx-spa] loaded, build:", __BUILD_TIME__);

const lifecycles = singleSpaReact({
  React,
  ReactDOMClient,
  rootComponent: App,
  errorBoundary(_err: Error) {
    return <div className="p-4 text-red-500">DevX failed to load</div>;
  },
});

export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;
