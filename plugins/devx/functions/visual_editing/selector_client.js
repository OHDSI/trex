/**
 * DevX Component Selector Client
 * Injected into the user's app iframe via proxy.
 * Handles hover/click selection of components with data-devx-id attributes.
 * Supports two modes: single-select (toolbar) and multi-select (AI).
 */
(function () {
  "use strict";

  // === Single-select mode (existing toolbar flow) ===
  // State machine: inactive → inspecting → selected
  let state = "inactive";
  let overlayEl = null;
  let labelEl = null;
  let currentTarget = null;
  let selectedTarget = null;
  let rafId = null;

  // === Drag-to-reorder state ===
  let dragState = "idle"; // idle | preparing | dragging
  let dragTarget = null;
  let dragGhost = null;
  let dragIndicator = null;
  let dragOriginalIndex = -1;
  let dragCurrentIndex = -1;
  let dragPrepareTimer = null;
  let dragStartY = 0;
  var DRAG_THRESHOLD = 10;
  var DRAG_PREPARE_MS = 150;

  function createDragHandle() {
    var handle = document.createElement("div");
    handle.id = "__devx-drag-handle";
    handle.style.cssText =
      "position:fixed;z-index:2147483647;width:20px;height:20px;cursor:grab;display:none;" +
      "background:#7c3aed;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;user-select:none;";
    handle.innerHTML = "&#9776;";
    handle.addEventListener("mousedown", onDragHandleMouseDown, true);
    document.body.appendChild(handle);
    return handle;
  }

  var dragHandle = null;

  function showDragHandle(el) {
    if (!dragHandle) dragHandle = createDragHandle();
    var rect = el.getBoundingClientRect();
    dragHandle.style.left = (rect.left - 24) + "px";
    dragHandle.style.top = rect.top + "px";
    dragHandle.style.display = "flex";
  }

  function hideDragHandle() {
    if (dragHandle) dragHandle.style.display = "none";
  }

  function createDragIndicator() {
    var el = document.createElement("div");
    el.id = "__devx-drag-indicator";
    el.style.cssText =
      "position:fixed;z-index:2147483647;height:2px;background:#7c3aed;pointer-events:none;display:none;border-radius:1px;";
    document.body.appendChild(el);
    return el;
  }

  function showDragIndicator(parentEl, index) {
    if (!dragIndicator) dragIndicator = createDragIndicator();
    var children = Array.from(parentEl.children);
    var rect;
    if (index < children.length) {
      rect = children[index].getBoundingClientRect();
      dragIndicator.style.top = (rect.top - 1) + "px";
    } else if (children.length > 0) {
      rect = children[children.length - 1].getBoundingClientRect();
      dragIndicator.style.top = (rect.bottom + 1) + "px";
    } else {
      rect = parentEl.getBoundingClientRect();
      dragIndicator.style.top = (rect.top + 2) + "px";
    }
    var parentRect = parentEl.getBoundingClientRect();
    dragIndicator.style.left = parentRect.left + "px";
    dragIndicator.style.width = parentRect.width + "px";
    dragIndicator.style.display = "block";
  }

  function hideDragIndicator() {
    if (dragIndicator) dragIndicator.style.display = "none";
  }

  function findInsertIndex(parentEl, mouseY) {
    var children = Array.from(parentEl.children);
    for (var i = 0; i < children.length; i++) {
      var rect = children[i].getBoundingClientRect();
      var midpoint = rect.top + rect.height / 2;
      if (mouseY < midpoint) return i;
    }
    return children.length;
  }

  function getChildIndex(el) {
    if (!el.parentElement) return -1;
    return Array.from(el.parentElement.children).indexOf(el);
  }

  function onDragHandleMouseDown(e) {
    if (!selectedTarget) return;
    e.preventDefault();
    e.stopPropagation();
    dragState = "preparing";
    dragTarget = selectedTarget;
    dragStartY = e.clientY;
    dragOriginalIndex = getChildIndex(dragTarget);

    dragPrepareTimer = setTimeout(function () {
      if (dragState === "preparing") {
        startDrag(e.clientX, e.clientY);
      }
    }, DRAG_PREPARE_MS);

    document.addEventListener("mousemove", onDragMouseMove, true);
    document.addEventListener("mouseup", onDragMouseUp, true);
  }

  function startDrag() {
    dragState = "dragging";
    // Create ghost
    dragGhost = dragTarget.cloneNode(true);
    dragGhost.style.cssText += ";position:fixed;opacity:0.5;pointer-events:none;z-index:2147483646;";
    var rect = dragTarget.getBoundingClientRect();
    dragGhost.style.width = rect.width + "px";
    dragGhost.style.left = rect.left + "px";
    dragGhost.style.top = rect.top + "px";
    document.body.appendChild(dragGhost);
    dragTarget.style.opacity = "0.3";
    hideDragHandle();
    hideResizeHandles();
    hideRadiusHandle();
  }

  function onDragMouseMove(e) {
    if (dragState === "preparing") {
      if (Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD) {
        clearTimeout(dragPrepareTimer);
        startDrag();
      }
      return;
    }
    if (dragState !== "dragging" || !dragTarget) return;

    // Move ghost
    if (dragGhost) {
      dragGhost.style.top = (e.clientY - 10) + "px";
    }

    // Show insertion indicator + snap guides
    var parent = dragTarget.parentElement;
    if (parent) {
      dragCurrentIndex = findInsertIndex(parent, e.clientY);
      showDragIndicator(parent, dragCurrentIndex);
      // Show snap guides during drag
      var dragRect = dragTarget.getBoundingClientRect();
      var snaps = getSnapLines(dragRect, parent);
      if (snaps.length > 0) showSnapLineEls(snaps);
      else hideSnapLineEls();
    }
  }

  function onDragMouseUp(e) {
    document.removeEventListener("mousemove", onDragMouseMove, true);
    document.removeEventListener("mouseup", onDragMouseUp, true);
    clearTimeout(dragPrepareTimer);

    if (dragState === "dragging" && dragTarget && dragTarget.parentElement) {
      var newIndex = dragCurrentIndex;
      // Adjust for the element being removed from its original position
      if (dragOriginalIndex < newIndex) newIndex--;
      if (newIndex !== dragOriginalIndex && newIndex >= 0) {
        var parentDevxId = dragTarget.parentElement.getAttribute("data-devx-id") || "";
        var devxId = dragTarget.getAttribute("data-devx-id") || "";
        window.parent.postMessage({
          type: "devx-element-moved",
          devxId: devxId,
          parentDevxId: parentDevxId,
          fromIndex: dragOriginalIndex,
          toIndex: newIndex,
        }, "*");
      }
      // Restore element opacity
      dragTarget.style.opacity = "";
    }

    // Cleanup
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
    hideDragIndicator();
    hideSnapLineEls();
    dragState = "idle";
    dragTarget = null;
    dragCurrentIndex = -1;
    dragOriginalIndex = -1;

    // Re-show drag handle if still selected
    if (selectedTarget) showDragHandle(selectedTarget);
  }

  // === Resize handles ===
  var resizeHandles = [];
  var resizeState = null;

  var HANDLE_POSITIONS = [
    { pos: "top", cursor: "ns-resize", isEdge: true },
    { pos: "right", cursor: "ew-resize", isEdge: true },
    { pos: "bottom", cursor: "ns-resize", isEdge: true },
    { pos: "left", cursor: "ew-resize", isEdge: true },
    { pos: "top-left", cursor: "nwse-resize", isEdge: false },
    { pos: "top-right", cursor: "nesw-resize", isEdge: false },
    { pos: "bottom-left", cursor: "nesw-resize", isEdge: false },
    { pos: "bottom-right", cursor: "nwse-resize", isEdge: false },
  ];

  function createResizeHandles() {
    if (resizeHandles.length > 0) return;
    HANDLE_POSITIONS.forEach(function (cfg) {
      var h = document.createElement("div");
      h.dataset.resizeHandle = cfg.pos;
      var size = cfg.isEdge ? "4" : "8";
      h.style.cssText =
        "position:fixed;z-index:2147483647;background:rgba(124,58,237,0.3);border-radius:1px;display:none;cursor:" + cfg.cursor + ";";
      if (cfg.isEdge) {
        if (cfg.pos === "top" || cfg.pos === "bottom") {
          h.style.width = "32px"; h.style.height = "4px";
        } else {
          h.style.width = "4px"; h.style.height = "32px";
        }
      } else {
        h.style.width = "8px"; h.style.height = "8px";
      }
      h.addEventListener("mousedown", onResizeStart, true);
      document.body.appendChild(h);
      resizeHandles.push(h);
    });
  }

  function positionResizeHandles(rect) {
    if (resizeHandles.length === 0) return;
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var positions = {
      "top": { left: cx - 16, top: rect.top - 2 },
      "bottom": { left: cx - 16, top: rect.top + rect.height - 2 },
      "left": { left: rect.left - 2, top: cy - 16 },
      "right": { left: rect.left + rect.width - 2, top: cy - 16 },
      "top-left": { left: rect.left - 4, top: rect.top - 4 },
      "top-right": { left: rect.left + rect.width - 4, top: rect.top - 4 },
      "bottom-left": { left: rect.left - 4, top: rect.top + rect.height - 4 },
      "bottom-right": { left: rect.left + rect.width - 4, top: rect.top + rect.height - 4 },
    };
    for (var i = 0; i < resizeHandles.length; i++) {
      var h = resizeHandles[i];
      var p = positions[h.dataset.resizeHandle];
      if (p) {
        h.style.left = p.left + "px";
        h.style.top = p.top + "px";
        h.style.display = "block";
      }
    }
  }

  function hideResizeHandles() {
    for (var i = 0; i < resizeHandles.length; i++) {
      resizeHandles[i].style.display = "none";
    }
  }

  var lastResizeClickTime = 0;
  function onResizeStart(e) {
    if (!selectedTarget) return;
    var handle = e.target.dataset.resizeHandle;
    if (!handle) return;

    // Double-click: set to fit-content (or 100% with Alt)
    var now = Date.now();
    if (now - lastResizeClickTime < 300) {
      var autoVal = e.altKey ? "100%" : "fit-content";
      if (handle.includes("left") || handle.includes("right")) {
        selectedTarget.style.width = autoVal;
      } else if (handle.includes("top") || handle.includes("bottom")) {
        selectedTarget.style.height = autoVal;
      }
      positionOverlay(selectedTarget);
      var autoRect = selectedTarget.getBoundingClientRect();
      positionResizeHandles(autoRect);
      window.parent.postMessage({
        type: "devx-element-resized",
        devxId: selectedTarget.getAttribute("data-devx-id") || "",
        width: autoVal === "fit-content" && !handle.includes("left") && !handle.includes("right") ? Math.round(autoRect.width) + "px" : autoVal,
        height: autoVal === "fit-content" && !handle.includes("top") && !handle.includes("bottom") ? Math.round(autoRect.height) + "px" : autoVal,
      }, "*");
      lastResizeClickTime = 0;
      e.preventDefault();
      return;
    }
    lastResizeClickTime = now;

    var rect = selectedTarget.getBoundingClientRect();
    resizeState = {
      handle: handle,
      startX: e.clientX, startY: e.clientY,
      startWidth: rect.width, startHeight: rect.height,
      startLeft: rect.left, startTop: rect.top,
    };
    // Save original inline style for reset
    if (!selectedTarget.__devxOrigStyle) {
      selectedTarget.__devxOrigStyle = selectedTarget.getAttribute("style") || "";
    }
    document.addEventListener("mousemove", onResizeMove, true);
    document.addEventListener("mouseup", onResizeEnd, true);
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function onResizeMove(e) {
    if (!resizeState || !selectedTarget) return;
    var dx = e.clientX - resizeState.startX;
    var dy = e.clientY - resizeState.startY;
    var newWidth = resizeState.startWidth;
    var newHeight = resizeState.startHeight;

    if (resizeState.handle.includes("right")) newWidth += dx;
    if (resizeState.handle.includes("left")) newWidth -= dx;
    if (resizeState.handle.includes("bottom")) newHeight += dy;
    if (resizeState.handle.includes("top")) newHeight -= dy;

    newWidth = Math.max(20, Math.round(newWidth));
    newHeight = Math.max(20, Math.round(newHeight));

    selectedTarget.style.width = newWidth + "px";
    selectedTarget.style.height = newHeight + "px";
    positionOverlay(selectedTarget);
    var rect = selectedTarget.getBoundingClientRect();
    positionResizeHandles(rect);
    // Show snap guides during resize
    var snaps = getSnapLines(rect, selectedTarget.parentElement);
    if (snaps.length > 0) showSnapLineEls(snaps);
    else hideSnapLineEls();
  }

  function onResizeEnd(e) {
    document.removeEventListener("mousemove", onResizeMove, true);
    document.removeEventListener("mouseup", onResizeEnd, true);
    if (!resizeState || !selectedTarget) { resizeState = null; return; }

    var rect = selectedTarget.getBoundingClientRect();
    window.parent.postMessage({
      type: "devx-element-resized",
      devxId: selectedTarget.getAttribute("data-devx-id") || "",
      width: Math.round(rect.width) + "px",
      height: Math.round(rect.height) + "px",
    }, "*");
    resizeState = null;
    hideSnapLineEls();
  }

  // === Snap guides (ported from Onlook, Apache 2.0) ===
  var SNAP_THRESHOLD = 12;
  var SNAP_LINE_EXTENSION = 160;
  var snapLineEls = [];

  function getSnapLines(movingRect, parentEl) {
    var lines = [];
    if (!parentEl) return lines;
    var siblings = Array.from(parentEl.children).filter(function(c) {
      return c !== selectedTarget && c.offsetParent !== null;
    });
    var mCx = movingRect.left + movingRect.width / 2;
    var mCy = movingRect.top + movingRect.height / 2;

    for (var i = 0; i < siblings.length; i++) {
      var r = siblings[i].getBoundingClientRect();
      var sCx = r.left + r.width / 2;
      var sCy = r.top + r.height / 2;

      // Vertical snap lines (X-axis alignment)
      var vChecks = [
        [movingRect.left, r.left], [movingRect.left, r.right],
        [movingRect.right, r.left], [movingRect.right, r.right],
        [mCx, sCx],
      ];
      for (var j = 0; j < vChecks.length; j++) {
        if (Math.abs(vChecks[j][0] - vChecks[j][1]) < SNAP_THRESHOLD) {
          var minY = Math.min(movingRect.top, r.top) - SNAP_LINE_EXTENSION;
          var maxY = Math.max(movingRect.top + movingRect.height, r.top + r.height) + SNAP_LINE_EXTENSION;
          lines.push({ orientation: "vertical", pos: vChecks[j][1], start: minY, end: maxY });
        }
      }
      // Horizontal snap lines (Y-axis alignment)
      var hChecks = [
        [movingRect.top, r.top], [movingRect.top, r.bottom],
        [movingRect.bottom, r.top], [movingRect.bottom, r.bottom],
        [mCy, sCy],
      ];
      for (var k = 0; k < hChecks.length; k++) {
        if (Math.abs(hChecks[k][0] - hChecks[k][1]) < SNAP_THRESHOLD) {
          var minX = Math.min(movingRect.left, r.left) - SNAP_LINE_EXTENSION;
          var maxX = Math.max(movingRect.left + movingRect.width, r.left + r.width) + SNAP_LINE_EXTENSION;
          lines.push({ orientation: "horizontal", pos: hChecks[k][1], start: minX, end: maxX });
        }
      }
    }
    return lines;
  }

  function showSnapLineEls(lines) {
    hideSnapLineEls();
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var el = document.createElement("div");
      el.style.cssText = "position:fixed;z-index:2147483647;background:#ef4444;pointer-events:none;";
      if (line.orientation === "vertical") {
        el.style.left = line.pos + "px";
        el.style.top = (line.start || 0) + "px";
        el.style.width = "1px";
        el.style.height = ((line.end || window.innerHeight) - (line.start || 0)) + "px";
      } else {
        el.style.top = line.pos + "px";
        el.style.left = (line.start || 0) + "px";
        el.style.height = "1px";
        el.style.width = ((line.end || window.innerWidth) - (line.start || 0)) + "px";
      }
      document.body.appendChild(el);
      snapLineEls.push(el);
    }
  }

  function hideSnapLineEls() {
    for (var i = 0; i < snapLineEls.length; i++) snapLineEls[i].remove();
    snapLineEls = [];
  }

  // === Measurement overlay (Alt+hover, ported from Onlook) ===
  var altHeld = false;
  var measurementEls = [];

  document.addEventListener("keydown", function(e) { if (e.key === "Alt") altHeld = true; }, true);
  document.addEventListener("keyup", function(e) { if (e.key === "Alt") { altHeld = false; hideMeasurements(); } }, true);

  function showMeasurements(selRect, hovRect) {
    hideMeasurements();
    // Horizontal gap
    var hFrom = null, hTo = null, hY = null;
    if (hovRect.right <= selRect.left) {
      hFrom = hovRect.right; hTo = selRect.left;
      hY = (Math.max(hovRect.top, selRect.top) + Math.min(hovRect.bottom, selRect.bottom)) / 2;
    } else if (hovRect.left >= selRect.right) {
      hFrom = selRect.right; hTo = hovRect.left;
      hY = (Math.max(hovRect.top, selRect.top) + Math.min(hovRect.bottom, selRect.bottom)) / 2;
    }
    if (hFrom !== null && hTo !== null && hY !== null) {
      createMeasurementLine(hFrom, hY, hTo - hFrom, 1, Math.round(hTo - hFrom));
    }
    // Vertical gap
    var vFrom = null, vTo = null, vX = null;
    if (hovRect.bottom <= selRect.top) {
      vFrom = hovRect.bottom; vTo = selRect.top;
      vX = (Math.max(hovRect.left, selRect.left) + Math.min(hovRect.right, selRect.right)) / 2;
    } else if (hovRect.top >= selRect.bottom) {
      vFrom = selRect.bottom; vTo = hovRect.top;
      vX = (Math.max(hovRect.left, selRect.left) + Math.min(hovRect.right, selRect.right)) / 2;
    }
    if (vFrom !== null && vTo !== null && vX !== null) {
      createMeasurementLine(vX, vFrom, 1, vTo - vFrom, Math.round(vTo - vFrom));
    }
  }

  function createMeasurementLine(x, y, w, h, value) {
    var line = document.createElement("div");
    line.style.cssText = "position:fixed;z-index:2147483647;background:#ef4444;pointer-events:none;";
    line.style.left = x + "px"; line.style.top = y + "px";
    line.style.width = Math.max(1, w) + "px"; line.style.height = Math.max(1, h) + "px";
    document.body.appendChild(line);
    measurementEls.push(line);
    // Label
    var label = document.createElement("div");
    label.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;background:#ef4444;color:#fff;font-size:10px;font-family:system-ui;padding:1px 4px;border-radius:2px;white-space:nowrap;";
    label.textContent = value + "px";
    label.style.left = (x + w / 2 - 12) + "px";
    label.style.top = (y + h / 2 - 8) + "px";
    document.body.appendChild(label);
    measurementEls.push(label);
  }

  function hideMeasurements() {
    for (var i = 0; i < measurementEls.length; i++) measurementEls[i].remove();
    measurementEls = [];
  }

  // === Border-radius drag handle ===
  var radiusHandleEl = null;
  var radiusDragState = null;

  function createRadiusHandle() {
    if (radiusHandleEl) return;
    radiusHandleEl = document.createElement("div");
    radiusHandleEl.style.cssText =
      "position:fixed;z-index:2147483647;width:8px;height:8px;border-radius:50%;background:#7c3aed;border:1px solid #fff;cursor:pointer;display:none;";
    radiusHandleEl.addEventListener("mousedown", onRadiusStart, true);
    document.body.appendChild(radiusHandleEl);
  }

  function positionRadiusHandle(rect) {
    if (!radiusHandleEl) return;
    var offset = Math.min(20, rect.width * 0.25, rect.height * 0.25);
    radiusHandleEl.style.left = (rect.left + offset - 4) + "px";
    radiusHandleEl.style.top = (rect.top + offset - 4) + "px";
    radiusHandleEl.style.display = "block";
  }

  function hideRadiusHandle() {
    if (radiusHandleEl) radiusHandleEl.style.display = "none";
  }

  function onRadiusStart(e) {
    if (!selectedTarget) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var computed = window.getComputedStyle(selectedTarget);
    radiusDragState = {
      startX: e.clientX,
      startY: e.clientY,
      startRadius: parseFloat(computed.borderRadius) || 0,
    };
    document.addEventListener("mousemove", onRadiusMove, true);
    document.addEventListener("mouseup", onRadiusEnd, true);
  }

  function onRadiusMove(e) {
    if (!radiusDragState || !selectedTarget) return;
    var dx = e.clientX - radiusDragState.startX;
    var dy = e.clientY - radiusDragState.startY;
    var delta = Math.max(Math.abs(dx), Math.abs(dy)) * Math.sign(dx + dy);
    var newRadius = Math.max(0, Math.round(radiusDragState.startRadius + delta));
    selectedTarget.style.borderRadius = newRadius + "px";
    positionOverlay(selectedTarget);
    positionResizeHandles(selectedTarget.getBoundingClientRect());
    positionRadiusHandle(selectedTarget.getBoundingClientRect());
  }

  function onRadiusEnd(e) {
    document.removeEventListener("mousemove", onRadiusMove, true);
    document.removeEventListener("mouseup", onRadiusEnd, true);
    if (!radiusDragState || !selectedTarget) { radiusDragState = null; return; }
    var computed = window.getComputedStyle(selectedTarget);
    window.parent.postMessage({
      type: "devx-radius-changed",
      devxId: selectedTarget.getAttribute("data-devx-id") || "",
      borderRadius: computed.borderRadius,
    }, "*");
    radiusDragState = null;
  }

  // === Multi-select mode (AI select flow) ===
  let multiState = "inactive"; // inactive | inspecting
  let multiHoverOverlay = null;
  let multiHoverLabel = null;
  let multiCurrentTarget = null;
  let multiSelections = new Map(); // devxId → { el, overlay, label }
  let multiRafId = null;

  // Walk up DOM tree to find nearest element with data-devx-id
  function findDevxAncestor(el) {
    while (el && el !== document.documentElement) {
      if (el.getAttribute && el.getAttribute("data-devx-id")) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // === Single-select overlay helpers ===

  function createOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement("div");
    overlayEl.id = "__devx-selector-overlay";
    overlayEl.style.cssText =
      "position:fixed;pointer-events:none;border:2px solid #8b5cf6;background:rgba(139,92,246,0.08);z-index:2147483646;transition:all 0.1s ease;display:none;";

    labelEl = document.createElement("div");
    labelEl.id = "__devx-selector-label";
    labelEl.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;background:#8b5cf6;color:#fff;font-size:11px;font-family:system-ui,sans-serif;padding:2px 6px;border-radius:3px;white-space:nowrap;display:none;";

    document.body.appendChild(overlayEl);
    document.body.appendChild(labelEl);
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
    if (labelEl) {
      labelEl.remove();
      labelEl = null;
    }
  }

  function positionOverlay(el) {
    if (!overlayEl || !labelEl || !el) return;
    const rect = el.getBoundingClientRect();

    overlayEl.style.top = rect.top + "px";
    overlayEl.style.left = rect.left + "px";
    overlayEl.style.width = rect.width + "px";
    overlayEl.style.height = rect.height + "px";
    overlayEl.style.display = "block";

    const name = el.getAttribute("data-devx-name") || el.tagName.toLowerCase();
    labelEl.textContent = name;
    labelEl.style.left = rect.left + "px";
    labelEl.style.top = Math.max(0, rect.top - 22) + "px";
    labelEl.style.display = "block";
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.style.display = "none";
    if (labelEl) labelEl.style.display = "none";
  }

  // Reposition on scroll/resize via rAF
  function startRepositionLoop() {
    function update() {
      const target = state === "selected" ? selectedTarget : currentTarget;
      if (target) {
        positionOverlay(target);
        if (state === "selected") {
          positionResizeHandles(target.getBoundingClientRect());
          positionRadiusHandle(target.getBoundingClientRect());
        }
      }
      rafId = requestAnimationFrame(update);
    }
    rafId = requestAnimationFrame(update);
  }

  function stopRepositionLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function onMouseMove(e) {
    if (state === "inspecting") {
      var devxEl = findDevxAncestor(e.target);
      if (devxEl !== currentTarget) {
        currentTarget = devxEl;
        if (devxEl) {
          positionOverlay(devxEl);
        } else {
          hideOverlay();
        }
      }
    }
    // Alt+hover measurement: show distance between selected and hovered element
    if (altHeld && selectedTarget && state === "selected") {
      var hovEl = findDevxAncestor(e.target);
      if (hovEl && hovEl !== selectedTarget) {
        showMeasurements(selectedTarget.getBoundingClientRect(), hovEl.getBoundingClientRect());
      } else {
        hideMeasurements();
      }
    }
  }

  function onClick(e) {
    if (state !== "inspecting") return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const devxEl = findDevxAncestor(e.target);
    if (!devxEl) return;

    state = "selected";
    selectedTarget = devxEl;
    currentTarget = null;

    const rect = devxEl.getBoundingClientRect();
    const devxId = devxEl.getAttribute("data-devx-id") || "";
    const devxName = devxEl.getAttribute("data-devx-name") || devxEl.tagName.toLowerCase();

    // Change overlay to selected style — purple for components, blue for HTML elements
    var isComponent = /^[A-Z]/.test(devxName);
    if (overlayEl) {
      overlayEl.style.borderColor = isComponent ? "#8b5cf6" : "#3b82f6";
      overlayEl.style.borderWidth = "2px";
      overlayEl.style.background = isComponent ? "rgba(139,92,246,0.05)" : "rgba(59,130,246,0.05)";
    }
    if (labelEl) {
      labelEl.style.background = isComponent ? "#8b5cf6" : "#3b82f6";
    }

    // Show drag handle and resize handles for selected element
    showDragHandle(devxEl);
    createResizeHandles();
    positionResizeHandles(rect);
    createRadiusHandle();
    positionRadiusHandle(rect);

    window.parent.postMessage(
      {
        type: "devx-component-selected",
        devxId: devxId,
        devxName: devxName,
        tagName: devxEl.tagName.toLowerCase(),
        boundingRect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      },
      "*"
    );
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (state === "selected") {
        state = "inspecting";
        selectedTarget = null;
        hideOverlay();
        hideDragHandle();
    hideResizeHandles();
    hideRadiusHandle();
        if (overlayEl) {
          overlayEl.style.borderColor = "#8b5cf6";
          overlayEl.style.borderWidth = "2px";
          overlayEl.style.background = "rgba(139,92,246,0.08)";
        }
        window.parent.postMessage({ type: "devx-component-deselected" }, "*");
      } else if (state === "inspecting") {
        deactivate();
        window.parent.postMessage({ type: "devx-selector-closed" }, "*");
      }
    }
  }

  function onContextMenu(e) {
    var devxEl = findDevxAncestor(e.target);
    if (!devxEl) return;
    e.preventDefault();
    e.stopPropagation();
    var rect = devxEl.getBoundingClientRect();
    var devxId = devxEl.getAttribute("data-devx-id") || "";
    var devxName = devxEl.getAttribute("data-devx-name") || devxEl.tagName.toLowerCase();
    window.parent.postMessage({
      type: "devx-context-menu",
      devxId: devxId,
      devxName: devxName,
      tagName: devxEl.tagName.toLowerCase(),
      position: { x: e.clientX, y: e.clientY },
      boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    }, "*");
  }

  function activate() {
    if (state !== "inactive") return;
    state = "inspecting";
    createOverlay();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.body.style.cursor = "crosshair";
    startRepositionLoop();
  }

  function deactivate() {
    state = "inactive";
    currentTarget = null;
    selectedTarget = null;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.body.style.cursor = "";
    stopRepositionLoop();
    removeOverlay();
    hideDragHandle();
    hideResizeHandles();
    hideRadiusHandle();
  }

  // === Multi-select mode helpers ===

  function createMultiHoverOverlay() {
    if (multiHoverOverlay) return;

    multiHoverOverlay = document.createElement("div");
    multiHoverOverlay.id = "__devx-multi-hover-overlay";
    multiHoverOverlay.style.cssText =
      "position:fixed;pointer-events:none;border:2px dashed #6366f1;background:rgba(99,102,241,0.06);z-index:2147483644;transition:all 0.1s ease;display:none;";

    multiHoverLabel = document.createElement("div");
    multiHoverLabel.id = "__devx-multi-hover-label";
    multiHoverLabel.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483645;background:#6366f1;color:#fff;font-size:11px;font-family:system-ui,sans-serif;padding:2px 6px;border-radius:3px;white-space:nowrap;display:none;";

    document.body.appendChild(multiHoverOverlay);
    document.body.appendChild(multiHoverLabel);
  }

  function removeMultiHoverOverlay() {
    if (multiHoverOverlay) { multiHoverOverlay.remove(); multiHoverOverlay = null; }
    if (multiHoverLabel) { multiHoverLabel.remove(); multiHoverLabel = null; }
  }

  function positionMultiHoverOverlay(el) {
    if (!multiHoverOverlay || !multiHoverLabel || !el) return;
    const rect = el.getBoundingClientRect();
    multiHoverOverlay.style.top = rect.top + "px";
    multiHoverOverlay.style.left = rect.left + "px";
    multiHoverOverlay.style.width = rect.width + "px";
    multiHoverOverlay.style.height = rect.height + "px";
    multiHoverOverlay.style.display = "block";

    const name = el.getAttribute("data-devx-name") || el.tagName.toLowerCase();
    const devxId = el.getAttribute("data-devx-id") || "";
    const isSelected = multiSelections.has(devxId);
    multiHoverLabel.textContent = isSelected ? name + " ✓" : name;
    multiHoverLabel.style.left = rect.left + "px";
    multiHoverLabel.style.top = Math.max(0, rect.top - 22) + "px";
    multiHoverLabel.style.display = "block";
  }

  function hideMultiHoverOverlay() {
    if (multiHoverOverlay) multiHoverOverlay.style.display = "none";
    if (multiHoverLabel) multiHoverLabel.style.display = "none";
  }

  function createSelectionOverlay(el, devxId) {
    const overlay = document.createElement("div");
    overlay.className = "__devx-multi-selection-overlay";
    overlay.style.cssText =
      "position:fixed;pointer-events:none;border:2px solid #4f46e5;background:rgba(79,70,229,0.08);z-index:2147483643;";

    const label = document.createElement("div");
    label.className = "__devx-multi-selection-label";
    label.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483644;background:#4f46e5;color:#fff;font-size:10px;font-family:system-ui,sans-serif;padding:1px 5px;border-radius:3px;white-space:nowrap;";

    const name = el.getAttribute("data-devx-name") || el.tagName.toLowerCase();
    label.textContent = name;

    document.body.appendChild(overlay);
    document.body.appendChild(label);

    return { el, overlay, label, devxId };
  }

  function positionSelectionOverlay(entry) {
    const rect = entry.el.getBoundingClientRect();
    entry.overlay.style.top = rect.top + "px";
    entry.overlay.style.left = rect.left + "px";
    entry.overlay.style.width = rect.width + "px";
    entry.overlay.style.height = rect.height + "px";

    entry.label.style.left = rect.left + "px";
    entry.label.style.top = Math.max(0, rect.top - 20) + "px";
  }

  function removeSelectionOverlay(entry) {
    entry.overlay.remove();
    entry.label.remove();
  }

  function clearAllSelections() {
    for (const entry of multiSelections.values()) {
      removeSelectionOverlay(entry);
    }
    multiSelections.clear();
  }

  function sendMultiSelectionUpdate() {
    const components = [];
    for (const [devxId, entry] of multiSelections) {
      const name = entry.el.getAttribute("data-devx-name") || entry.el.tagName.toLowerCase();
      components.push({
        devxId: devxId,
        devxName: name,
        tagName: entry.el.tagName.toLowerCase(),
      });
    }
    window.parent.postMessage(
      { type: "devx-components-selected", components: components },
      "*"
    );
  }

  function startMultiRepositionLoop() {
    function update() {
      if (multiCurrentTarget) {
        positionMultiHoverOverlay(multiCurrentTarget);
      }
      for (const entry of multiSelections.values()) {
        positionSelectionOverlay(entry);
      }
      multiRafId = requestAnimationFrame(update);
    }
    multiRafId = requestAnimationFrame(update);
  }

  function stopMultiRepositionLoop() {
    if (multiRafId) {
      cancelAnimationFrame(multiRafId);
      multiRafId = null;
    }
  }

  function onMultiMouseMove(e) {
    if (multiState !== "inspecting") return;
    const devxEl = findDevxAncestor(e.target);
    if (devxEl !== multiCurrentTarget) {
      multiCurrentTarget = devxEl;
      if (devxEl) {
        positionMultiHoverOverlay(devxEl);
      } else {
        hideMultiHoverOverlay();
      }
    }
  }

  function onMultiClick(e) {
    if (multiState !== "inspecting") return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const devxEl = findDevxAncestor(e.target);
    if (!devxEl) return;

    const devxId = devxEl.getAttribute("data-devx-id") || "";
    if (!devxId) return;

    // Toggle selection
    if (multiSelections.has(devxId)) {
      removeSelectionOverlay(multiSelections.get(devxId));
      multiSelections.delete(devxId);
    } else {
      const entry = createSelectionOverlay(devxEl, devxId);
      positionSelectionOverlay(entry);
      multiSelections.set(devxId, entry);
    }

    sendMultiSelectionUpdate();
  }

  function onMultiKeyDown(e) {
    if (e.key === "Escape") {
      multiDeactivate();
      window.parent.postMessage({ type: "devx-multi-selector-closed" }, "*");
    }
  }

  function multiActivate() {
    if (multiState !== "inactive") return;
    multiState = "inspecting";
    createMultiHoverOverlay();
    document.addEventListener("mousemove", onMultiMouseMove, true);
    document.addEventListener("click", onMultiClick, true);
    document.addEventListener("keydown", onMultiKeyDown, true);
    document.body.style.cursor = "crosshair";
    startMultiRepositionLoop();
  }

  function multiDeactivate() {
    multiState = "inactive";
    multiCurrentTarget = null;
    document.removeEventListener("mousemove", onMultiMouseMove, true);
    document.removeEventListener("click", onMultiClick, true);
    document.removeEventListener("keydown", onMultiKeyDown, true);
    document.body.style.cursor = "";
    stopMultiRepositionLoop();
    removeMultiHoverOverlay();
    clearAllSelections();
  }

  function multiDeselectById(devxId) {
    if (multiSelections.has(devxId)) {
      removeSelectionOverlay(multiSelections.get(devxId));
      multiSelections.delete(devxId);
    }
  }

  // === Insert mode ===
  var insertState = "inactive"; // inactive | selecting
  var insertOverlay = null;
  var insertLabel = null;
  var insertCurrentTarget = null;
  var insertRafId = null;

  function createInsertOverlay() {
    if (insertOverlay) return;
    insertOverlay = document.createElement("div");
    insertOverlay.id = "__devx-insert-overlay";
    insertOverlay.style.cssText =
      "position:fixed;pointer-events:none;border:2px dashed #22c55e;background:rgba(34,197,94,0.08);z-index:2147483646;transition:all 0.1s ease;display:none;";
    insertLabel = document.createElement("div");
    insertLabel.id = "__devx-insert-label";
    insertLabel.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;background:#22c55e;color:#fff;font-size:11px;font-family:system-ui,sans-serif;padding:2px 6px;border-radius:3px;white-space:nowrap;display:none;";
    document.body.appendChild(insertOverlay);
    document.body.appendChild(insertLabel);
  }

  function removeInsertOverlay() {
    if (insertOverlay) { insertOverlay.remove(); insertOverlay = null; }
    if (insertLabel) { insertLabel.remove(); insertLabel = null; }
  }

  function positionInsertOverlay(el) {
    if (!insertOverlay || !insertLabel || !el) return;
    var rect = el.getBoundingClientRect();
    insertOverlay.style.top = rect.top + "px";
    insertOverlay.style.left = rect.left + "px";
    insertOverlay.style.width = rect.width + "px";
    insertOverlay.style.height = rect.height + "px";
    insertOverlay.style.display = "block";
    var name = el.getAttribute("data-devx-name") || el.tagName.toLowerCase();
    insertLabel.textContent = "+ " + name;
    insertLabel.style.left = rect.left + "px";
    insertLabel.style.top = Math.max(0, rect.top - 22) + "px";
    insertLabel.style.display = "block";
  }

  function hideInsertOverlay() {
    if (insertOverlay) insertOverlay.style.display = "none";
    if (insertLabel) insertLabel.style.display = "none";
  }

  function onInsertMouseMove(e) {
    if (insertState !== "selecting") return;
    var devxEl = findDevxAncestor(e.target);
    if (devxEl !== insertCurrentTarget) {
      insertCurrentTarget = devxEl;
      if (devxEl) positionInsertOverlay(devxEl);
      else hideInsertOverlay();
    }
  }

  function onInsertClick(e) {
    if (insertState !== "selecting") return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var devxEl = findDevxAncestor(e.target);
    if (!devxEl) return;
    var parentDevxId = devxEl.getAttribute("data-devx-id") || "";
    var index = devxEl.children.length; // append as last child
    window.parent.postMessage({
      type: "devx-insert-target-selected",
      parentDevxId: parentDevxId,
      index: index,
      boundingRect: {
        top: devxEl.getBoundingClientRect().top,
        left: devxEl.getBoundingClientRect().left,
        width: devxEl.getBoundingClientRect().width,
        height: devxEl.getBoundingClientRect().height,
      },
    }, "*");
    insertDeactivate();
  }

  function onInsertKeyDown(e) {
    if (e.key === "Escape") {
      insertDeactivate();
      window.parent.postMessage({ type: "devx-insert-cancelled" }, "*");
    }
  }

  function startInsertRepositionLoop() {
    function update() {
      if (insertCurrentTarget) positionInsertOverlay(insertCurrentTarget);
      insertRafId = requestAnimationFrame(update);
    }
    insertRafId = requestAnimationFrame(update);
  }

  function insertActivate() {
    if (insertState !== "inactive") return;
    insertState = "selecting";
    createInsertOverlay();
    document.addEventListener("mousemove", onInsertMouseMove, true);
    document.addEventListener("click", onInsertClick, true);
    document.addEventListener("keydown", onInsertKeyDown, true);
    document.body.style.cursor = "cell";
    startInsertRepositionLoop();
  }

  function insertDeactivate() {
    insertState = "inactive";
    insertCurrentTarget = null;
    document.removeEventListener("mousemove", onInsertMouseMove, true);
    document.removeEventListener("click", onInsertClick, true);
    document.removeEventListener("keydown", onInsertKeyDown, true);
    document.body.style.cursor = "";
    if (insertRafId) { cancelAnimationFrame(insertRafId); insertRafId = null; }
    removeInsertOverlay();
  }

  // Listen for messages from parent (DevX) — only accept from parent window
  window.addEventListener("message", function (e) {
    if (!e.data || !e.data.type) return;
    // Only accept messages from our parent frame
    if (e.source !== window.parent) return;

    switch (e.data.type) {
      case "activate-devx-component-selector":
        activate();
        break;
      case "deactivate-devx-component-selector":
        deactivate();
        break;
      case "activate-devx-multi-selector":
        multiActivate();
        break;
      case "deactivate-devx-multi-selector":
        multiDeactivate();
        break;
      case "devx-deselect-component":
        multiDeselectById(e.data.devxId);
        sendMultiSelectionUpdate();
        break;
      case "activate-devx-insert-mode":
        insertActivate();
        break;
      case "deactivate-devx-insert-mode":
        insertDeactivate();
        break;
    }
  });
})();
