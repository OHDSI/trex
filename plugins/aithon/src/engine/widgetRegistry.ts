import type { Component } from "vue";
import StringWidget from "./widgets/StringWidget.vue";
import BooleanWidget from "./widgets/BooleanWidget.vue";
import DateWidget from "./widgets/DateWidget.vue";
import CodeWidget from "./widgets/CodeWidget.vue";

const PRIMITIVE = new Set([
  "string","markdown","uri","url","id","oid","uuid","canonical","base64Binary",
  "integer","decimal","positiveInt","unsignedInt","boolean","date","dateTime","instant","time","code",
]);

const MAP: Record<string, Component> = {
  boolean: BooleanWidget,
  date: DateWidget, dateTime: DateWidget, instant: DateWidget, time: DateWidget,
  code: CodeWidget,
};

/** Leaf widget for a datatype, or null if it is a complex type (rendered by recursion). */
export function widgetFor(typeCode: string): Component | null {
  if (MAP[typeCode]) return MAP[typeCode];
  if (PRIMITIVE.has(typeCode)) return StringWidget;
  return null; // complex / backbone → recurse
}
