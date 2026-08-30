import { defineComponent as v, computed as u, useAttrs as B, createBlock as f, openBlock as d, mergeProps as A, createSlots as h, withCtx as y, renderSlot as m, normalizeProps as p, guardReactiveProps as b, renderList as V, resolveDynamicComponent as R, normalizeClass as P, ref as F, watch as U, nextTick as M, unref as I, createElementVNode as S, createVNode as D, createElementBlock as k, createCommentVNode as C, toDisplayString as L, useSlots as N, createTextVNode as E } from "vue";
import { VAlert as Y } from "vuetify/components/VAlert";
import { VAutocomplete as G } from "vuetify/components/VAutocomplete";
import { VAvatar as H } from "vuetify/components/VAvatar";
import { VBadge as W } from "vuetify/components/VBadge";
import { VBanner as j } from "vuetify/components/VBanner";
import { VBtn as q } from "vuetify/components/VBtn";
import { VCheckbox as J } from "vuetify/components/VCheckbox";
import { VChip as K } from "vuetify/components/VChip";
import { VCol as Q, VContainer as X, VRow as Z, VSpacer as x } from "vuetify/components/VGrid";
import { VDataTable as ee } from "vuetify/components/VDataTable";
import { VDialog as te, VCard as ae, VDivider as le, VTextarea as re, VTextField as se } from "vuetify/components";
import { VDivider as oe } from "vuetify/components/VDivider";
import { VIcon as ie } from "vuetify/components/VIcon";
import { VList as ne, VListItem as de } from "vuetify/components/VList";
import { VMenu as ue } from "vuetify/components/VMenu";
import { VPagination as ce } from "vuetify/components/VPagination";
import { VProgressCircular as fe } from "vuetify/components/VProgressCircular";
import { VProgressLinear as me } from "vuetify/components/VProgressLinear";
import { VRadio as ve } from "vuetify/components/VRadio";
import { VRadioGroup as pe } from "vuetify/components/VRadioGroup";
import { VSelect as be } from "vuetify/components/VSelect";
import { VSkeletonLoader as ye } from "vuetify/components/VSkeletonLoader";
import { VSnackbar as ge } from "vuetify/components/VSnackbar";
import { VSwitch as he } from "vuetify/components/VSwitch";
import { VTab as $e, VTabs as Ae } from "vuetify/components/VTabs";
import { VTooltip as Ve } from "vuetify/components/VTooltip";
const w = {
  color: {
    primary: "#1f425a",
    primaryDarken: "#163349",
    accent: "#eb6622",
    surface: "#ffffff",
    surfaceVariant: "#f6f7f9",
    onSurface: "rgba(0,0,0,.87)",
    onSurfaceVariant: "rgba(0,0,0,.62)",
    outline: "rgba(0,0,0,.12)",
    outlineVariant: "rgba(0,0,0,.06)",
    info: "#2196f3",
    success: "#4caf50",
    warning: "#fb8c00",
    danger: "#ff5252"
  },
  radius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" },
  density: { default: "compact" },
  elevation: {
    ambient: "0 1px 3px rgba(15,23,42,.08)",
    diffuse: "0 8px 24px rgba(15,23,42,.08)"
  },
  motion: { fast: "120ms ease", med: "160ms ease", slow: "240ms ease" },
  z: { dropdown: 1e3, dialog: 2e3, snackbar: 3e3 }
};
function ht(e) {
  return {
    theme: {
      defaultTheme: "light",
      themes: {
        light: {
          colors: {
            primary: e || w.color.primary,
            "primary-darken-1": w.color.primaryDarken,
            secondary: "#424242",
            accent: "#2d5f7f",
            error: w.color.danger,
            info: w.color.info,
            success: w.color.success,
            warning: w.color.warning,
            orange: w.color.accent,
            background: w.color.surfaceVariant,
            surface: w.color.surface,
            "surface-variant": w.color.surfaceVariant,
            "on-surface": w.color.onSurface,
            "on-surface-variant": w.color.onSurfaceVariant,
            outline: w.color.outline,
            "outline-variant": w.color.outlineVariant
          }
        }
      }
    },
    defaults: {
      VBtn: {
        variant: "flat",
        color: "primary",
        rounded: "lg",
        style: "text-transform: none; letter-spacing: 0;"
      },
      VCard: { variant: "flat", rounded: "lg" },
      VTextField: { variant: "outlined", density: w.density.default, rounded: "md" },
      VSelect: { variant: "outlined", density: w.density.default, rounded: "md" },
      VAutocomplete: { variant: "outlined", density: w.density.default, rounded: "md" },
      VDialog: { rounded: "lg" },
      VChip: { variant: "tonal", rounded: "md", density: w.density.default },
      VAlert: { variant: "tonal", rounded: "md" }
    }
  };
}
const $t = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasAlert",
  props: {
    severity: { default: "info" },
    title: { default: void 0 },
    closable: { type: Boolean, default: !1 },
    variant: { default: "tonal" },
    prependIcon: { default: void 0 }
  },
  emits: ["close"],
  setup(e) {
    const t = e, r = {
      info: "info",
      success: "success",
      warning: "warning",
      danger: "error"
    }, l = {
      info: "mdi-information",
      success: "mdi-check-circle",
      warning: "mdi-alert",
      danger: "mdi-alert-circle"
    }, a = u(() => r[t.severity]), s = u(() => t.prependIcon ?? l[t.severity]), c = B(), i = u(() => {
      const { type: o, color: n, ...g } = c;
      return g;
    });
    return (o, n) => (d(), f(Y, A({
      type: a.value,
      title: e.title,
      variant: e.variant,
      closable: e.closable,
      icon: s.value
    }, i.value, {
      "onClick:close": n[0] || (n[0] = (g) => o.$emit("close"))
    }), h({
      default: y(() => [
        m(o.$slots, "default")
      ]),
      _: 2
    }, [
      o.$slots.prepend ? {
        name: "prepend",
        fn: y(() => [
          m(o.$slots, "prepend")
        ]),
        key: "0"
      } : void 0,
      o.$slots.append ? {
        name: "append",
        fn: y(() => [
          m(o.$slots, "append")
        ]),
        key: "1"
      } : void 0
    ]), 1040, ["type", "title", "variant", "closable", "icon"]));
  }
}), At = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasAutocomplete",
  props: {
    modelValue: { default: void 0 },
    items: {},
    label: { default: void 0 },
    hint: { default: void 0 },
    error: { default: void 0 },
    required: { type: Boolean, default: !1 },
    disabled: { type: Boolean, default: !1 },
    itemTitle: { default: "title" },
    itemValue: { default: "value" },
    multiple: { type: Boolean, default: !1 },
    clearable: { type: Boolean, default: !1 },
    placeholder: { default: void 0 },
    noFilter: { type: Boolean, default: !1 }
  },
  emits: ["update:modelValue", "update:search", "blur", "focus"],
  setup(e) {
    const t = e, r = u(() => {
      if (t.label)
        return t.required ? `${t.label} *` : t.label;
    }), l = u(() => t.error ? [t.error] : void 0), a = u(() => !!t.error), s = B(), c = u(() => {
      const { density: i, ...o } = s;
      return o;
    });
    return (i, o) => (d(), f(G, A({
      "model-value": e.modelValue,
      items: e.items,
      label: r.value,
      hint: e.hint,
      "error-messages": l.value,
      disabled: e.disabled,
      "item-title": e.itemTitle,
      "item-value": e.itemValue,
      multiple: e.multiple,
      clearable: e.clearable,
      placeholder: e.placeholder,
      "no-filter": e.noFilter,
      "aria-required": e.required ? "true" : void 0,
      "aria-invalid": a.value ? "true" : void 0,
      density: "compact"
    }, c.value, {
      "onUpdate:modelValue": o[0] || (o[0] = (n) => i.$emit("update:modelValue", n)),
      "onUpdate:search": o[1] || (o[1] = (n) => i.$emit("update:search", n)),
      onBlur: o[2] || (o[2] = (n) => i.$emit("blur", n)),
      onFocus: o[3] || (o[3] = (n) => i.$emit("focus", n))
    }), null, 16, ["model-value", "items", "label", "hint", "error-messages", "disabled", "item-title", "item-value", "multiple", "clearable", "placeholder", "no-filter", "aria-required", "aria-invalid"]));
  }
}), Vt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasAvatar",
  setup(e) {
    return (t, r) => (d(), f(H, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), wt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasBadge",
  setup(e) {
    return (t, r) => (d(), f(W, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Bt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasBanner",
  setup(e) {
    return (t, r) => (d(), f(j, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), kt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasButton",
  props: {
    variant: { default: "primary" },
    size: { default: "md" },
    tone: { default: void 0 },
    loading: { type: Boolean },
    disabled: { type: Boolean },
    icon: { default: void 0 },
    iconPosition: { default: "start" },
    type: { default: "button" },
    toggle: { type: Boolean, default: !1 }
  },
  emits: ["click"],
  setup(e) {
    const t = e, r = {
      primary: { color: "primary", variant: "flat" },
      secondary: { color: "primary", variant: "outlined" },
      tonal: { color: "primary", variant: "tonal" },
      danger: { color: "error", variant: "flat" },
      ghost: { variant: "text" },
      link: { variant: "plain" }
    }, l = {
      primary: "primary",
      neutral: void 0,
      warning: "warning",
      danger: "error",
      success: "success",
      info: "info"
    }, a = B(), s = u(() => {
      if (!t.toggle)
        return t.tone ? l[t.tone] : (r[t.variant] ?? r.primary).color;
    }), c = u(() => {
      if (!t.toggle)
        return (r[t.variant] ?? r.primary).variant;
    }), i = u(() => {
      if (t.size === "xs") return "x-small";
      if (t.size === "sm") return "small";
      if (t.size === "lg") return "large";
    }), o = u(() => {
      const { color: n, variant: g, size: $, ..._ } = a;
      return _;
    });
    return (n, g) => (d(), f(q, A({
      color: s.value,
      variant: c.value,
      size: i.value,
      loading: e.loading,
      disabled: e.disabled,
      type: e.type,
      "prepend-icon": e.iconPosition === "start" ? e.icon : void 0,
      "append-icon": e.iconPosition === "end" ? e.icon : void 0
    }, o.value, {
      onClick: g[0] || (g[0] = ($) => n.$emit("click", $))
    }), {
      default: y(() => [
        m(n.$slots, "default")
      ]),
      _: 3
    }, 16, ["color", "variant", "size", "loading", "disabled", "type", "prepend-icon", "append-icon"]));
  }
}), we = /* @__PURE__ */ v({
  __name: "AtlasCard",
  props: {
    tag: { default: "div" },
    interactive: { type: Boolean, default: !1 },
    padding: { default: "md" }
  },
  setup(e) {
    return (t, r) => (d(), f(R(e.tag), {
      class: P([
        "atlas-card",
        e.interactive && "atlas-card--interactive",
        `atlas-card--padding-${e.padding}`
      ])
    }, {
      default: y(() => [
        m(t.$slots, "default", {}, void 0, !0)
      ]),
      _: 3
    }, 8, ["class"]));
  }
}), z = (e, t) => {
  const r = e.__vccOpts || e;
  for (const [l, a] of t)
    r[l] = a;
  return r;
}, Be = /* @__PURE__ */ z(we, [["__scopeId", "data-v-206f5c90"]]), Ct = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasCheckbox",
  props: {
    modelValue: { type: Boolean, default: !1 },
    label: { default: void 0 },
    disabled: { type: Boolean, default: !1 },
    error: { default: void 0 },
    indeterminate: { type: Boolean, default: !1 },
    required: { type: Boolean, default: !1 }
  },
  emits: ["update:modelValue"],
  setup(e) {
    const t = e, r = u(() => t.error ? [t.error] : void 0), l = u(() => !!t.error), a = B(), s = u(() => {
      const { density: c, ...i } = a;
      return i;
    });
    return (c, i) => (d(), f(J, A({
      "model-value": e.modelValue,
      label: e.label,
      disabled: e.disabled,
      "error-messages": r.value,
      indeterminate: e.indeterminate,
      "aria-required": e.required ? "true" : void 0,
      "aria-invalid": l.value ? "true" : void 0,
      "aria-checked": e.indeterminate ? "mixed" : void 0,
      density: "compact"
    }, s.value, {
      "onUpdate:modelValue": i[0] || (i[0] = (o) => c.$emit("update:modelValue", !!o))
    }), null, 16, ["model-value", "label", "disabled", "error-messages", "indeterminate", "aria-required", "aria-invalid", "aria-checked"]));
  }
}), _t = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasChip",
  props: {
    tone: { default: void 0 },
    size: { default: "md" },
    closable: { type: Boolean, default: !1 },
    disabled: { type: Boolean, default: !1 },
    prependIcon: { default: void 0 }
  },
  emits: ["click", "close"],
  setup(e) {
    const t = e, r = {
      neutral: void 0,
      primary: "primary",
      info: "info",
      success: "success",
      warning: "warning",
      danger: "error"
    }, l = B(), a = u(() => {
      if (t.tone !== void 0) return r[t.tone];
      const i = l.color;
      return typeof i == "string" ? i : void 0;
    }), s = u(() => {
      if (t.size === "xs") return "x-small";
      if (t.size === "sm") return "small";
    }), c = u(() => {
      const { color: i, size: o, density: n, ...g } = l;
      return g;
    });
    return (i, o) => (d(), f(K, A({
      color: a.value,
      size: s.value,
      closable: e.closable,
      disabled: e.disabled,
      "prepend-icon": e.prependIcon,
      density: "compact"
    }, c.value, {
      onClick: o[0] || (o[0] = (n) => i.$emit("click", n)),
      "onClick:close": o[1] || (o[1] = (n) => i.$emit("close", n))
    }), {
      default: y(() => [
        m(i.$slots, "default")
      ]),
      _: 3
    }, 16, ["color", "size", "closable", "disabled", "prepend-icon"]));
  }
}), Tt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasCol",
  setup(e) {
    return (t, r) => (d(), f(Q, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), St = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasContainer",
  setup(e) {
    return (t, r) => (d(), f(X, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Lt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasDataTable",
  props: {
    headers: {},
    items: {},
    loading: { type: Boolean, default: !1 },
    itemsPerPage: { default: 10 },
    page: { default: 1 },
    sortBy: { default: () => [] },
    height: { default: void 0 },
    fixedHeader: { type: Boolean, default: !1 },
    hideDefaultFooter: { type: Boolean, default: !1 },
    noDataText: { default: void 0 },
    loadingText: { default: void 0 },
    caption: { default: void 0 }
  },
  emits: ["update:page", "update:itemsPerPage", "update:sortBy"],
  setup(e) {
    const t = B(), r = u(() => {
      const { density: l, ...a } = t;
      return a;
    });
    return (l, a) => (d(), f(ee, A({
      headers: e.headers,
      items: e.items,
      loading: e.loading,
      "items-per-page": e.itemsPerPage,
      page: e.page,
      "sort-by": e.sortBy,
      height: e.height,
      "fixed-header": e.fixedHeader,
      "hide-default-footer": e.hideDefaultFooter,
      "no-data-text": e.noDataText,
      "loading-text": e.loadingText,
      "aria-label": e.caption,
      density: "compact"
    }, r.value, {
      "onUpdate:page": a[0] || (a[0] = (s) => l.$emit("update:page", s)),
      "onUpdate:itemsPerPage": a[1] || (a[1] = (s) => l.$emit("update:itemsPerPage", s)),
      "onUpdate:sortBy": a[2] || (a[2] = (s) => l.$emit("update:sortBy", s))
    }), h({ _: 2 }, [
      V(l.$slots, (s, c) => ({
        name: c,
        fn: y((i) => [
          m(l.$slots, c, p(b(i ?? {})))
        ])
      }))
    ]), 1040, ["headers", "items", "loading", "items-per-page", "page", "sort-by", "height", "fixed-header", "hide-default-footer", "no-data-text", "loading-text", "aria-label"]));
  }
}), ke = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasIconButton",
  props: {
    icon: {},
    ariaLabel: {},
    variant: { default: "tonal" },
    size: { default: "md" },
    tone: { default: "neutral" },
    loading: { type: Boolean },
    disabled: { type: Boolean }
  },
  emits: ["click"],
  setup(e) {
    const t = e, r = {
      primary: "primary",
      neutral: void 0,
      danger: "error"
    }, l = u(() => ({
      color: r[t.tone],
      variant: t.variant,
      size: t.size === "sm" ? "small" : t.size === "lg" ? "large" : void 0
    })), a = B(), s = u(() => {
      const { color: c, size: i, icon: o, variant: n, ...g } = a;
      return g;
    });
    return (c, i) => (d(), f(q, A({
      icon: e.icon,
      color: l.value.color,
      variant: l.value.variant,
      size: l.value.size,
      loading: e.loading,
      disabled: e.disabled,
      "aria-label": e.ariaLabel
    }, s.value, {
      onClick: i[0] || (i[0] = (o) => c.$emit("click", o))
    }), null, 16, ["icon", "color", "variant", "size", "loading", "disabled", "aria-label"]));
  }
}), Ce = { class: "atlas-dialog__header" }, _e = { class: "atlas-dialog__title-block" }, Te = { class: "atlas-dialog__eyebrow-row" }, Se = { class: "text-eyebrow" }, Le = {
  key: 1,
  class: "atlas-dialog__subtitle"
}, Pe = { class: "atlas-dialog__body" }, qe = {
  key: 0,
  class: "atlas-dialog__actions"
}, ze = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasDialog",
  props: {
    modelValue: { type: Boolean },
    eyebrow: { default: "" },
    title: { default: void 0 },
    subtitle: { default: void 0 },
    maxWidth: { default: 560 },
    width: { default: void 0 },
    persistent: { type: Boolean, default: !1 },
    showClose: { type: Boolean, default: !0 },
    closeLabel: { default: void 0 },
    chromeless: { type: Boolean, default: !1 }
  },
  emits: ["update:modelValue", "close"],
  setup(e, { emit: t }) {
    const r = e, l = t, a = `atlas-dialog-title-${Math.random().toString(36).slice(2, 10)}`, s = u(() => r.closeLabel ?? "Close dialog"), c = B(), i = u(() => {
      const { "max-width": $, maxWidth: _, persistent: T, width: He, ...O } = c;
      return O;
    }), o = F(null);
    U(
      () => r.modelValue,
      ($, _) => {
        if ($ && !_) {
          const T = typeof document < "u" ? document.activeElement : null;
          o.value = T && typeof T.focus == "function" ? T : null;
          return;
        }
        if (!$ && _) {
          const T = o.value;
          o.value = null, T && typeof T.focus == "function" && M(() => {
            try {
              T.focus();
            } catch {
            }
          });
        }
      },
      { immediate: !0 }
    );
    function n($) {
      l("update:modelValue", $), $ || l("close");
    }
    function g() {
      l("update:modelValue", !1), l("close");
    }
    return ($, _) => (d(), f(I(te), A({
      "model-value": e.modelValue,
      "max-width": e.maxWidth,
      persistent: e.persistent,
      width: e.width,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": e.title ? a : void 0
    }, i.value, { "onUpdate:modelValue": n }), {
      default: y(() => [
        e.chromeless ? m($.$slots, "default", { key: 0 }, void 0, !0) : (d(), f(I(ae), {
          key: 1,
          class: "atlas-dialog__card"
        }, {
          default: y(() => [
            S("header", Ce, [
              S("div", _e, [
                S("div", Te, [
                  S("span", Se, L(e.eyebrow), 1),
                  _[0] || (_[0] = S("span", { class: "atlas-dialog__accent-rule" }, null, -1))
                ]),
                e.title ? (d(), k("h2", {
                  key: 0,
                  id: a,
                  class: "atlas-dialog__title"
                }, L(e.title), 1)) : C("", !0),
                e.subtitle ? (d(), k("p", Le, L(e.subtitle), 1)) : C("", !0)
              ]),
              e.showClose ? (d(), f(ke, A({
                key: 0,
                icon: "mdi-close",
                variant: "text",
                size: "sm",
                tone: "neutral"
              }, { ariaLabel: s.value }, { onClick: g }), null, 16)) : C("", !0)
            ]),
            D(I(le)),
            S("div", Pe, [
              m($.$slots, "default", {}, void 0, !0)
            ]),
            $.$slots.actions ? (d(), k("div", qe, [
              m($.$slots, "actions", {}, void 0, !0)
            ])) : C("", !0)
          ]),
          _: 3
        }))
      ]),
      _: 3
    }, 16, ["model-value", "max-width", "persistent", "width", "aria-labelledby"]));
  }
}), Pt = /* @__PURE__ */ z(ze, [["__scopeId", "data-v-827e435e"]]), qt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasDivider",
  setup(e) {
    return (t, r) => (d(), f(oe, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Ie = /* @__PURE__ */ v({
  __name: "AtlasFab",
  props: {
    icon: {},
    ariaLabel: {},
    color: { default: "primary" },
    disabled: { type: Boolean, default: !1 }
  },
  emits: ["click"],
  setup(e) {
    return (t, r) => (d(), f(q, A({
      icon: e.icon,
      color: e.color,
      "aria-label": e.ariaLabel,
      title: e.ariaLabel,
      disabled: e.disabled,
      size: "large",
      elevation: "6",
      class: "atlas-fab"
    }, t.$attrs, {
      onClick: r[0] || (r[0] = (l) => t.$emit("click", l))
    }), null, 16, ["icon", "color", "aria-label", "title", "disabled"]));
  }
}), zt = /* @__PURE__ */ z(Ie, [["__scopeId", "data-v-74c3e205"]]), It = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasIcon",
  setup(e) {
    return (t, r) => (d(), f(ie, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Et = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasList",
  setup(e) {
    const t = B(), r = u(() => {
      const { density: l, ...a } = t;
      return a;
    });
    return (l, a) => (d(), f(ne, A({ density: "compact" }, r.value), h({ _: 2 }, [
      V(l.$slots, (s, c) => ({
        name: c,
        fn: y((i) => [
          m(l.$slots, c, p(b(i ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Rt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasListItem",
  setup(e) {
    const t = B(), r = u(() => {
      const { density: l, ...a } = t;
      return a;
    });
    return (l, a) => (d(), f(de, A({ density: "compact" }, r.value), h({ _: 2 }, [
      V(l.$slots, (s, c) => ({
        name: c,
        fn: y((i) => [
          m(l.$slots, c, p(b(i ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Dt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasMenu",
  setup(e) {
    return (t, r) => (d(), f(ue, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Ee = { class: "page-wrapper" }, Re = { class: "page-header__text" }, De = {
  key: 0,
  class: "page-header__eyebrow-row"
}, Oe = {
  key: 0,
  class: "text-eyebrow"
}, Fe = {
  key: 1,
  class: "page-header__accent-rule"
}, Ue = {
  key: 3,
  class: "page-header__subtitle text-page-subtitle"
}, Me = {
  key: 4,
  class: "page-header__subtitle text-page-subtitle"
}, Ne = {
  key: 0,
  class: "page-header__actions"
}, Ye = { class: "page-card__body" }, Ge = /* @__PURE__ */ v({
  __name: "AtlasPageShell",
  props: {
    title: {},
    subtitle: {},
    hero: { type: Boolean },
    compact: { type: Boolean },
    eyebrow: {}
  },
  setup(e) {
    const t = e, r = N(), l = u(
      () => !!(t.title || r.title || r.actions || r.subtitle)
    );
    return (a, s) => (d(), k("div", Ee, [
      D(Be, {
        class: "page-card",
        padding: "lg"
      }, {
        default: y(() => [
          l.value ? (d(), k("div", {
            key: 0,
            class: P([
              "page-header",
              { "page-header--hero": e.hero, "page-header--hero-compact": e.hero && e.compact }
            ])
          }, [
            S("div", Re, [
              e.hero && (e.eyebrow || e.title) ? (d(), k("div", De, [
                e.eyebrow ? (d(), k("span", Oe, L(e.eyebrow), 1)) : C("", !0),
                e.hero ? (d(), k("span", Fe)) : C("", !0)
              ])) : C("", !0),
              a.$slots.title ? (d(), k("div", {
                key: 1,
                class: P(
                  e.hero ? "page-header__title page-header__title--hero" : "page-header__title text-page-title"
                )
              }, [
                m(a.$slots, "title", {}, void 0, !0)
              ], 2)) : e.title ? (d(), k("h1", {
                key: 2,
                class: P(
                  e.hero ? "page-header__title page-header__title--hero" : "page-header__title text-page-title"
                )
              }, L(e.title), 3)) : C("", !0),
              a.$slots.subtitle ? (d(), k("div", Ue, [
                m(a.$slots, "subtitle", {}, void 0, !0)
              ])) : e.subtitle ? (d(), k("p", Me, L(e.subtitle), 1)) : C("", !0)
            ]),
            a.$slots.actions ? (d(), k("div", Ne, [
              m(a.$slots, "actions", {}, void 0, !0)
            ])) : C("", !0)
          ], 2)) : C("", !0),
          S("div", Ye, [
            m(a.$slots, "default", {}, void 0, !0)
          ])
        ]),
        _: 3
      })
    ]));
  }
}), Ot = /* @__PURE__ */ z(Ge, [["__scopeId", "data-v-72620bac"]]), Ft = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasPagination",
  setup(e) {
    const t = B(), r = u(() => {
      const { density: l, ...a } = t;
      return a;
    });
    return (l, a) => (d(), f(ce, A({ density: "compact" }, r.value), h({ _: 2 }, [
      V(l.$slots, (s, c) => ({
        name: c,
        fn: y((i) => [
          m(l.$slots, c, p(b(i ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Ut = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasProgressCircular",
  setup(e) {
    return (t, r) => (d(), f(fe, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Mt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasProgressLinear",
  setup(e) {
    return (t, r) => (d(), f(me, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Nt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasRadio",
  props: {
    value: {},
    label: { default: void 0 },
    disabled: { type: Boolean, default: !1 }
  },
  setup(e) {
    return (t, r) => (d(), f(ve, A({
      value: e.value,
      label: e.label,
      disabled: e.disabled
    }, t.$attrs), null, 16, ["value", "label", "disabled"]));
  }
}), Yt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasRadioGroup",
  props: {
    modelValue: { default: void 0 },
    label: { default: void 0 },
    inline: { type: Boolean, default: !1 },
    error: { default: void 0 },
    disabled: { type: Boolean, default: !1 },
    required: { type: Boolean, default: !1 }
  },
  emits: ["update:modelValue"],
  setup(e) {
    const t = e, r = u(() => {
      if (t.label)
        return t.required ? `${t.label} *` : t.label;
    }), l = u(() => t.error ? [t.error] : void 0), a = u(() => !!t.error), s = B(), c = u(() => {
      const { density: i, ...o } = s;
      return o;
    });
    return (i, o) => (d(), f(pe, A({
      "model-value": e.modelValue,
      label: r.value,
      inline: e.inline,
      "error-messages": l.value,
      disabled: e.disabled,
      "aria-required": e.required ? "true" : void 0,
      "aria-invalid": a.value ? "true" : void 0,
      density: "compact"
    }, c.value, {
      "onUpdate:modelValue": o[0] || (o[0] = (n) => i.$emit("update:modelValue", n))
    }), {
      default: y(() => [
        m(i.$slots, "default")
      ]),
      _: 3
    }, 16, ["model-value", "label", "inline", "error-messages", "disabled", "aria-required", "aria-invalid"]));
  }
}), Gt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasRow",
  setup(e) {
    return (t, r) => (d(), f(Z, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Ht = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasSelect",
  props: {
    modelValue: { default: void 0 },
    items: {},
    label: { default: void 0 },
    hint: { default: void 0 },
    error: { default: void 0 },
    required: { type: Boolean, default: !1 },
    disabled: { type: Boolean, default: !1 },
    itemTitle: { default: "title" },
    itemValue: { default: "value" },
    multiple: { type: Boolean, default: !1 },
    clearable: { type: Boolean, default: !1 },
    placeholder: { default: void 0 }
  },
  emits: ["update:modelValue", "blur", "focus"],
  setup(e) {
    const t = e, r = u(() => {
      if (t.label)
        return t.required ? `${t.label} *` : t.label;
    }), l = u(() => t.error ? [t.error] : void 0), a = u(() => !!t.error), s = B(), c = u(() => {
      const { density: i, ...o } = s;
      return o;
    });
    return (i, o) => (d(), f(be, A({
      "model-value": e.modelValue,
      items: e.items,
      label: r.value,
      hint: e.hint,
      "error-messages": l.value,
      disabled: e.disabled,
      "item-title": e.itemTitle,
      "item-value": e.itemValue,
      multiple: e.multiple,
      clearable: e.clearable,
      placeholder: e.placeholder,
      "aria-required": e.required ? "true" : void 0,
      "aria-invalid": a.value ? "true" : void 0,
      density: "compact"
    }, c.value, {
      "onUpdate:modelValue": o[0] || (o[0] = (n) => i.$emit("update:modelValue", n)),
      onBlur: o[1] || (o[1] = (n) => i.$emit("blur", n)),
      onFocus: o[2] || (o[2] = (n) => i.$emit("focus", n))
    }), null, 16, ["model-value", "items", "label", "hint", "error-messages", "disabled", "item-title", "item-value", "multiple", "clearable", "placeholder", "aria-required", "aria-invalid"]));
  }
}), Wt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasSkeleton",
  setup(e) {
    return (t, r) => (d(), f(ye, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), jt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasSnackbar",
  props: {
    modelValue: { type: Boolean },
    severity: { default: "info" },
    text: { default: void 0 },
    timeout: { default: 5e3 },
    location: { default: "bottom" },
    closable: { type: Boolean, default: !0 }
  },
  emits: ["update:modelValue"],
  setup(e) {
    const t = e, r = {
      info: "info",
      success: "success",
      warning: "warning",
      danger: "error"
    }, l = u(() => r[t.severity]), a = u(() => t.severity === "danger"), s = u(() => a.value ? "alert" : "status"), c = u(() => a.value ? "assertive" : "polite"), i = B(), o = u(() => {
      const { color: n, ...g } = i;
      return g;
    });
    return (n, g) => (d(), f(ge, A({
      "model-value": e.modelValue,
      color: l.value,
      timeout: e.timeout,
      location: e.location,
      role: s.value,
      "aria-live": c.value
    }, o.value, {
      "onUpdate:modelValue": g[1] || (g[1] = ($) => n.$emit("update:modelValue", $))
    }), h({
      default: y(() => [
        m(n.$slots, "default", {}, () => [
          E(L(e.text), 1)
        ])
      ]),
      _: 2
    }, [
      n.$slots.actions || e.closable ? {
        name: "actions",
        fn: y(() => [
          m(n.$slots, "actions"),
          e.closable && !n.$slots.actions ? (d(), f(q, {
            key: 0,
            variant: "text",
            onClick: g[0] || (g[0] = ($) => n.$emit("update:modelValue", !1))
          }, {
            default: y(() => [...g[2] || (g[2] = [
              E(" Close ", -1)
            ])]),
            _: 1
          })) : C("", !0)
        ]),
        key: "0"
      } : void 0
    ]), 1040, ["model-value", "color", "timeout", "location", "role", "aria-live"]));
  }
}), Jt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasSpacer",
  setup(e) {
    return (t, r) => (d(), f(x, p(b(t.$attrs)), null, 16));
  }
}), Kt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasSwitch",
  props: {
    modelValue: { type: Boolean, default: !1 },
    label: { default: void 0 },
    disabled: { type: Boolean, default: !1 },
    tone: { default: "primary" },
    error: { default: void 0 },
    required: { type: Boolean, default: !1 }
  },
  emits: ["update:modelValue"],
  setup(e) {
    const t = e, r = {
      primary: "primary",
      success: "success",
      danger: "error"
    }, l = u(() => r[t.tone]), a = u(() => t.error ? [t.error] : void 0), s = u(() => !!t.error), c = B(), i = u(() => {
      const { density: o, color: n, ...g } = c;
      return g;
    });
    return (o, n) => (d(), f(he, A({
      "model-value": e.modelValue,
      label: e.label,
      disabled: e.disabled,
      color: l.value,
      "error-messages": a.value,
      "aria-required": e.required ? "true" : void 0,
      "aria-invalid": s.value ? "true" : void 0,
      density: "compact"
    }, i.value, {
      "onUpdate:modelValue": n[0] || (n[0] = (g) => o.$emit("update:modelValue", !!g))
    }), null, 16, ["model-value", "label", "disabled", "color", "error-messages", "aria-required", "aria-invalid"]));
  }
}), Qt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasTab",
  setup(e) {
    return (t, r) => (d(), f($e, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Xt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasTabs",
  setup(e) {
    const t = B(), r = u(() => {
      const { density: l, ...a } = t;
      return a;
    });
    return (l, a) => (d(), f(Ae, A({ density: "compact" }, r.value), h({ _: 2 }, [
      V(l.$slots, (s, c) => ({
        name: c,
        fn: y((i) => [
          m(l.$slots, c, p(b(i ?? {})))
        ])
      }))
    ]), 1040));
  }
}), Zt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasTextField",
  props: {
    modelValue: { default: void 0 },
    label: { default: void 0 },
    hint: { default: void 0 },
    error: { default: void 0 },
    required: { type: Boolean, default: !1 },
    disabled: { type: Boolean, default: !1 },
    readonly: { type: Boolean, default: !1 },
    type: { default: "text" },
    placeholder: { default: void 0 },
    prependIcon: { default: void 0 },
    appendIcon: { default: void 0 },
    multiline: { type: Boolean, default: !1 },
    rows: { default: 3 }
  },
  emits: ["update:modelValue", "blur", "focus"],
  setup(e) {
    const t = e, r = u(() => t.multiline ? re : se), l = u(() => {
      if (t.label)
        return t.required ? `${t.label} *` : t.label;
    }), a = u(() => t.error ? [t.error] : void 0), s = u(() => !!t.error), c = B(), i = u(() => {
      const { density: o, ...n } = c;
      return n;
    });
    return (o, n) => (d(), f(R(r.value), A({
      "model-value": e.modelValue,
      label: l.value,
      hint: e.hint,
      "error-messages": a.value,
      disabled: e.disabled,
      readonly: e.readonly,
      type: e.multiline ? void 0 : e.type,
      placeholder: e.placeholder,
      "prepend-inner-icon": e.prependIcon,
      "append-inner-icon": e.appendIcon,
      rows: e.multiline ? e.rows : void 0,
      "aria-required": e.required ? "true" : void 0,
      "aria-invalid": s.value ? "true" : void 0,
      density: "compact"
    }, i.value, {
      "onUpdate:modelValue": n[0] || (n[0] = (g) => o.$emit("update:modelValue", g)),
      onBlur: n[1] || (n[1] = (g) => o.$emit("blur", g)),
      onFocus: n[2] || (n[2] = (g) => o.$emit("focus", g))
    }), h({ _: 2 }, [
      V(o.$slots, (g, $) => ({
        name: $,
        fn: y((_) => [
          m(o.$slots, $, p(b(_ ?? {})))
        ])
      }))
    ]), 1040, ["model-value", "label", "hint", "error-messages", "disabled", "readonly", "type", "placeholder", "prepend-inner-icon", "append-inner-icon", "rows", "aria-required", "aria-invalid"]));
  }
}), xt = /* @__PURE__ */ v({
  inheritAttrs: !1,
  __name: "AtlasTooltip",
  setup(e) {
    return (t, r) => (d(), f(Ve, p(b(t.$attrs)), h({ _: 2 }, [
      V(t.$slots, (l, a) => ({
        name: a,
        fn: y((s) => [
          m(t.$slots, a, p(b(s ?? {})))
        ])
      }))
    ]), 1040));
  }
});
export {
  $t as AtlasAlert,
  At as AtlasAutocomplete,
  Vt as AtlasAvatar,
  wt as AtlasBadge,
  Bt as AtlasBanner,
  kt as AtlasButton,
  Be as AtlasCard,
  Ct as AtlasCheckbox,
  _t as AtlasChip,
  Tt as AtlasCol,
  St as AtlasContainer,
  Lt as AtlasDataTable,
  Pt as AtlasDialog,
  qt as AtlasDivider,
  zt as AtlasFab,
  It as AtlasIcon,
  ke as AtlasIconButton,
  Et as AtlasList,
  Rt as AtlasListItem,
  Dt as AtlasMenu,
  Ot as AtlasPageShell,
  Ft as AtlasPagination,
  Ut as AtlasProgressCircular,
  Mt as AtlasProgressLinear,
  Nt as AtlasRadio,
  Yt as AtlasRadioGroup,
  Gt as AtlasRow,
  Ht as AtlasSelect,
  Wt as AtlasSkeleton,
  jt as AtlasSnackbar,
  Jt as AtlasSpacer,
  Kt as AtlasSwitch,
  Qt as AtlasTab,
  Xt as AtlasTabs,
  Zt as AtlasTextField,
  xt as AtlasTooltip,
  ht as buildVuetifyOptions,
  w as tokens
};
