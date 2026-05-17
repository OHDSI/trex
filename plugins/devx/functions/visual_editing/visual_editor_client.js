/**
 * DevX Visual Editor Client
 * Injected into the user's app iframe via proxy.
 * Handles live style modifications, text editing, and computed style queries.
 * Registers RPC handlers via window.__devxRpc (provided by rpc_bridge.js).
 */
(function () {
  "use strict";

  // Track elements with applied inline styles for reset
  const modifiedElements = new Map(); // devxId → original style string

  function findElementByDevxId(id) {
    return document.querySelector('[data-devx-id="' + CSS.escape(id) + '"]');
  }

  function applyStyles(devxId, styles) {
    const el = findElementByDevxId(devxId);
    if (!el) throw new Error("Element not found: " + devxId);

    // Save original inline style on first modification
    if (!modifiedElements.has(devxId)) {
      modifiedElements.set(devxId, el.getAttribute("style") || "");
    }

    // Apply each style property
    for (var prop in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, prop)) {
        el.style[prop] = styles[prop];
      }
    }
  }

  function getComputedStylesObj(el) {
    const computed = window.getComputedStyle(el);
    return {
      marginTop: computed.marginTop,
      marginRight: computed.marginRight,
      marginBottom: computed.marginBottom,
      marginLeft: computed.marginLeft,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,
      borderWidth: computed.borderWidth,
      borderRadius: computed.borderRadius,
      borderColor: computed.borderColor,
      borderStyle: computed.borderStyle,
      borderTopLeftRadius: computed.borderTopLeftRadius,
      borderTopRightRadius: computed.borderTopRightRadius,
      borderBottomRightRadius: computed.borderBottomRightRadius,
      borderBottomLeftRadius: computed.borderBottomLeftRadius,
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      color: computed.color,
      // Layout
      display: computed.display,
      flexDirection: computed.flexDirection,
      justifyContent: computed.justifyContent,
      alignItems: computed.alignItems,
      gap: computed.gap,
      flexWrap: computed.flexWrap,
      flexGrow: computed.flexGrow,
      flexShrink: computed.flexShrink,
      gridTemplateColumns: computed.gridTemplateColumns,
      gridTemplateRows: computed.gridTemplateRows,
      // Sizing
      width: computed.width,
      height: computed.height,
      minWidth: computed.minWidth,
      maxWidth: computed.maxWidth,
      minHeight: computed.minHeight,
      maxHeight: computed.maxHeight,
      aspectRatio: computed.aspectRatio,
      objectFit: computed.objectFit,
      // Typography
      textAlign: computed.textAlign,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing,
      textDecoration: computed.textDecoration,
      textTransform: computed.textTransform,
      whiteSpace: computed.whiteSpace,
      wordBreak: computed.wordBreak,
      textOverflow: computed.textOverflow,
      // Positioning
      position: computed.position,
      top: computed.top,
      right: computed.right,
      bottom: computed.bottom,
      left: computed.left,
      zIndex: computed.zIndex,
      overflow: computed.overflow,
      // Effects
      opacity: computed.opacity,
      boxShadow: computed.boxShadow,
      cursor: computed.cursor,
      visibility: computed.visibility,
      pointerEvents: computed.pointerEvents,
      userSelect: computed.userSelect,
    };
  }

  function getStyles(devxId) {
    const el = findElementByDevxId(devxId);
    if (!el) throw new Error("Element not found: " + devxId);
    return getComputedStylesObj(el);
  }

  // Reverse Tailwind class → CSS property mapping (used for defined style detection)
  var REVERSE_TW = {
    "mt-": "marginTop", "mr-": "marginRight", "mb-": "marginBottom", "ml-": "marginLeft",
    "pt-": "paddingTop", "pr-": "paddingRight", "pb-": "paddingBottom", "pl-": "paddingLeft",
    "border-": "borderWidth", "rounded": "borderRadius",
    "bg-": "backgroundColor", "text-": "color", "font-": "fontWeight", "font-sans": "fontFamily", "font-serif": "fontFamily", "font-mono": "fontFamily",
    "border-solid": "borderStyle", "border-dashed": "borderStyle", "border-dotted": "borderStyle", "border-none": "borderStyle",
    "rounded-tl-": "borderTopLeftRadius", "rounded-tr-": "borderTopRightRadius", "rounded-br-": "borderBottomRightRadius", "rounded-bl-": "borderBottomLeftRadius",
    // Layout
    "flex": "display", "grid": "display", "block": "display", "inline": "display", "hidden": "display",
    "flex-row": "flexDirection", "flex-col": "flexDirection",
    "justify-": "justifyContent", "items-": "alignItems", "gap-": "gap",
    "flex-wrap": "flexWrap", "flex-nowrap": "flexWrap", "grow": "flexGrow", "shrink": "flexShrink",
    "grid-cols-": "gridTemplateColumns", "grid-rows-": "gridTemplateRows",
    // Sizing
    "w-": "width", "h-": "height",
    "min-w-": "minWidth", "max-w-": "maxWidth", "min-h-": "minHeight", "max-h-": "maxHeight",
    "aspect-": "aspectRatio", "object-": "objectFit",
    // Typography
    "text-left": "textAlign", "text-center": "textAlign", "text-right": "textAlign", "text-justify": "textAlign",
    "leading-": "lineHeight", "tracking-": "letterSpacing",
    "underline": "textDecoration", "line-through": "textDecoration", "no-underline": "textDecoration",
    "uppercase": "textTransform", "lowercase": "textTransform", "capitalize": "textTransform",
    "whitespace-": "whiteSpace", "break-": "wordBreak", "truncate": "textOverflow",
    // Positioning
    "static": "position", "relative": "position", "absolute": "position",
    "fixed": "position", "sticky": "position",
    "top-": "top", "right-": "right", "bottom-": "bottom", "left-": "left",
    "inset-": "top", "z-": "zIndex",
    "overflow-": "overflow",
    // Effects
    "opacity-": "opacity", "shadow": "boxShadow",
    "cursor-": "cursor", "visible": "visibility", "invisible": "visibility",
    "pointer-events-": "pointerEvents", "select-": "userSelect",
  };

  function getDefinedStyleProps(el) {
    var defined = {};
    // Inline styles are explicitly defined
    for (var i = 0; i < el.style.length; i++) {
      var prop = el.style[i];
      // Convert kebab-case to camelCase
      var camel = prop.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      defined[camel] = el.style.getPropertyValue(prop);
    }
    // Check className for Tailwind indicators
    var classes = (typeof el.className === "string" ? el.className : "").split(/\s+/);
    for (var j = 0; j < classes.length; j++) {
      var cls = classes[j];
      if (!cls) continue;
      for (var prefix in REVERSE_TW) {
        if (cls === prefix.slice(0, -1) || cls.startsWith(prefix)) {
          defined[REVERSE_TW[prefix]] = true; // mark as defined (value comes from computed)
          break;
        }
      }
      // Special: text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, etc.
      if (/^text-(xs|sm|base|lg|xl|[2-9]xl)$/.test(cls)) {
        defined["fontSize"] = true;
      }
    }
    return defined;
  }

  function getComputedAndDefinedStyles(devxId) {
    var el = findElementByDevxId(devxId);
    if (!el) throw new Error("Element not found: " + devxId);
    var computed = getComputedStylesObj(el);
    var definedFlags = getDefinedStyleProps(el);
    // Build defined object: only include properties that are explicitly set
    var defined = {};
    for (var prop in definedFlags) {
      if (computed[prop] !== undefined) {
        defined[prop] = computed[prop];
      }
    }
    return { computed: computed, defined: defined };
  }

  function enableTextEditing(devxId) {
    const el = findElementByDevxId(devxId);
    if (!el) throw new Error("Element not found: " + devxId);

    el.setAttribute("contenteditable", "true");
    el.focus();

    // On blur, finalize and remove contenteditable
    function onBlur() {
      el.removeAttribute("contenteditable");
      el.removeEventListener("blur", onBlur);
      // Fire-and-forget event (not RPC) — text finalization is async
      window.parent.postMessage(
        {
          type: "devx-text-finalized",
          devxId: devxId,
          textContent: el.textContent || "",
        },
        "*"
      );
    }

    el.addEventListener("blur", onBlur);
  }

  function resetStyles(devxId) {
    if (devxId) {
      // Reset specific element
      const el = findElementByDevxId(devxId);
      if (el && modifiedElements.has(devxId)) {
        const original = modifiedElements.get(devxId);
        if (original) {
          el.setAttribute("style", original);
        } else {
          el.removeAttribute("style");
        }
        modifiedElements.delete(devxId);
      }
    } else {
      // Reset all modified elements
      modifiedElements.forEach(function (original, id) {
        const el = findElementByDevxId(id);
        if (el) {
          if (original) {
            el.setAttribute("style", original);
          } else {
            el.removeAttribute("style");
          }
        }
      });
      modifiedElements.clear();
    }
  }

  function moveElement(devxId, newParentDevxId, newIndex) {
    var el = findElementByDevxId(devxId);
    if (!el) throw new Error("Element not found: " + devxId);
    var parent = findElementByDevxId(newParentDevxId);
    if (!parent) throw new Error("Parent not found: " + newParentDevxId);
    var ref = parent.children[newIndex] || null;
    // If moving within same parent and element is before ref, adjust
    if (el.parentElement === parent && ref && el.compareDocumentPosition(ref) & Node.DOCUMENT_POSITION_FOLLOWING) {
      // el is before ref, insertBefore works correctly
    }
    parent.insertBefore(el, ref);
  }

  function insertElement(parentDevxId, index, tagName, defaultClasses, defaultText) {
    var parent = findElementByDevxId(parentDevxId);
    if (!parent) throw new Error("Parent not found: " + parentDevxId);
    var el = document.createElement(tagName);
    if (defaultClasses) el.className = defaultClasses;
    if (defaultText) el.textContent = defaultText;
    var ref = parent.children[index] || null;
    parent.insertBefore(el, ref);
    // Return info about the inserted element (no devxId since it's not in source yet)
    return { tagName: tagName, index: index };
  }

  function removeElement(devxId) {
    var el = findElementByDevxId(devxId);
    if (!el) throw new Error("Element not found: " + devxId);
    el.remove();
  }

  function getChildCount(parentDevxId) {
    var parent = findElementByDevxId(parentDevxId);
    if (!parent) throw new Error("Parent not found: " + parentDevxId);
    return parent.children.length;
  }

  function getParentInfo(devxId) {
    var el = findElementByDevxId(devxId);
    if (!el || !el.parentElement) return null;
    // Walk up to find nearest parent with data-devx-id, tracking the child at each level
    var child = el;
    var parent = el.parentElement;
    while (parent && !parent.getAttribute("data-devx-id")) {
      child = parent;
      parent = parent.parentElement;
    }
    if (!parent) return null;
    // child is the direct child of parent that contains el
    var index = Array.from(parent.children).indexOf(child);
    return { parentDevxId: parent.getAttribute("data-devx-id"), index: index };
  }

  function getElementHTML(devxId) {
    var el = findElementByDevxId(devxId);
    if (!el) throw new Error("Element not found: " + devxId);
    return el.outerHTML;
  }

  function pasteHTML(parentDevxId, index, html) {
    var parent = findElementByDevxId(parentDevxId);
    if (!parent) throw new Error("Parent not found: " + parentDevxId);
    // Sanitize: use DOMParser and strip scripts/event handlers
    var doc = new DOMParser().parseFromString(html, "text/html");
    // Remove script tags
    var scripts = doc.querySelectorAll("script");
    for (var s = 0; s < scripts.length; s++) scripts[s].remove();
    // Remove inline event handlers (onclick, onerror, etc.)
    var allEls = doc.body.querySelectorAll("*");
    for (var i = 0; i < allEls.length; i++) {
      var attrs = allEls[i].attributes;
      for (var j = attrs.length - 1; j >= 0; j--) {
        if (attrs[j].name.startsWith("on")) allEls[i].removeAttribute(attrs[j].name);
      }
    }
    var el = doc.body.firstElementChild;
    if (!el) throw new Error("Invalid HTML");
    // Import node into current document
    var imported = document.importNode(el, true);
    var ref = parent.children[index] || null;
    parent.insertBefore(imported, ref);
  }

  function groupElement(devxId) {
    var el = findElementByDevxId(devxId);
    if (!el || !el.parentElement) throw new Error("Element not found: " + devxId);
    var wrapper = document.createElement("div");
    el.parentElement.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  }

  function ungroupElement(devxId) {
    var el = findElementByDevxId(devxId);
    if (!el || !el.parentElement) throw new Error("Element not found: " + devxId);
    var parent = el.parentElement;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }

  function getDomTree() {
    function walk(el, depth) {
      if (depth > 20) return null;
      var devxId = el.getAttribute("data-devx-id") || null;
      var devxName = el.getAttribute("data-devx-name") || el.tagName.toLowerCase();
      var children = [];
      for (var i = 0; i < el.children.length; i++) {
        var child = walk(el.children[i], depth + 1);
        if (child) children.push(child);
      }
      if (!devxId && children.length === 0) return null;
      return {
        devxId: devxId,
        name: devxName,
        tagName: el.tagName.toLowerCase(),
        hasChildren: children.length > 0,
        children: children,
      };
    }
    return walk(document.body, 0)?.children || [];
  }

  // Register RPC handlers (rpc_bridge.js must be loaded first)
  function registerRpcHandlers() {
    if (!window.__devxRpc) return;
    window.__devxRpc.register("getStyles", getStyles);
    window.__devxRpc.register("getComputedAndDefinedStyles", getComputedAndDefinedStyles);
    window.__devxRpc.register("applyStyles", applyStyles);
    window.__devxRpc.register("resetStyles", resetStyles);
    window.__devxRpc.register("enableTextEditing", enableTextEditing);
    window.__devxRpc.register("moveElement", moveElement);
    window.__devxRpc.register("insertElement", insertElement);
    window.__devxRpc.register("removeElement", removeElement);
    window.__devxRpc.register("getChildCount", getChildCount);
    window.__devxRpc.register("getParentInfo", getParentInfo);
    window.__devxRpc.register("getDomTree", getDomTree);
    window.__devxRpc.register("getElementHTML", getElementHTML);
    window.__devxRpc.register("pasteHTML", pasteHTML);
    window.__devxRpc.register("groupElement", groupElement);
    window.__devxRpc.register("ungroupElement", ungroupElement);
  }

  // Try to register immediately, or wait for rpc_bridge.js to load
  if (window.__devxRpc) {
    registerRpcHandlers();
  } else {
    // Poll briefly for rpc_bridge to initialize
    var attempts = 0;
    var interval = setInterval(function () {
      if (window.__devxRpc || attempts > 50) {
        clearInterval(interval);
        if (window.__devxRpc) registerRpcHandlers();
      }
      attempts++;
    }, 50);
  }

  // Legacy postMessage listener — kept for backward compatibility
  window.addEventListener("message", function (e) {
    if (!e.data || !e.data.type) return;
    if (e.source !== window.parent) return;
    // Skip if this is an RPC message (handled by rpc_bridge.js)
    if (e.data.__devx_rpc) return;

    switch (e.data.type) {
      case "modify-devx-component-styles":
        applyStyles(e.data.devxId, e.data.styles);
        break;
      case "get-devx-component-styles":
        // Legacy: send response via postMessage
        try {
          var styles = getStyles(e.data.devxId);
          window.parent.postMessage(
            { type: "devx-component-styles", devxId: e.data.devxId, styles: styles },
            "*"
          );
        } catch (err) {
          window.parent.postMessage(
            { type: "devx-editor-error", error: err.message },
            "*"
          );
        }
        break;
      case "enable-devx-text-editing":
        try { enableTextEditing(e.data.devxId); } catch (err) {
          window.parent.postMessage({ type: "devx-editor-error", error: err.message }, "*");
        }
        break;
      case "reset-devx-component-styles":
        resetStyles(e.data.devxId);
        window.parent.postMessage(
          { type: "devx-styles-reset", devxId: e.data.devxId || null },
          "*"
        );
        break;
    }
  });
})();
