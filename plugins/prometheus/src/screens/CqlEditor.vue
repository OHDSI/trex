<template>
  <AtlasPageShell eyebrow="CQL" title="CQL Editor">
    <template #actions>
      <AtlasButton variant="primary" data-run :loading="running" @click="run">Run</AtlasButton>
    </template>

    <AtlasAlert v-if="error" data-error severity="danger" :title="error" class="mb-4" />

    <div ref="editorEl" class="cql-editor" />

    <div v-if="result" class="mt-4">
      <div class="text-subtitle-2 mb-2">Results</div>
      <table class="result-table">
        <thead>
          <tr><th>Name</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr v-for="(param, i) in resultParams" :key="i">
            <td class="param-name">{{ param.name }}</td>
            <td class="param-value">{{ param.display }}</td>
          </tr>
        </tbody>
      </table>
      <details class="mt-3">
        <summary class="text-caption text-medium-emphasis" style="cursor:pointer">Raw JSON</summary>
        <pre class="raw-json">{{ JSON.stringify(result, null, 2) }}</pre>
      </details>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { AtlasPageShell, AtlasButton, AtlasAlert } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";
import { formatFhirValue } from "@/utils/fhirDisplay";

const props = defineProps<{ dataset: string }>();
const { client } = useFhir(props.dataset);

const editorEl = ref<HTMLElement | null>(null);
const running = ref(false);
const error = ref("");
const result = ref<any>(null);

// Keep editor text in a ref so tests can read/write it without CodeMirror
const editorText = ref(`library Demo version '1.0.0'
using FHIR version '4.0.1'
context Patient
define "All Patients": [Patient]`);

let view: any = null;

onMounted(async () => {
  try {
    const [
      { EditorView, keymap, lineNumbers },
      { defaultKeymap },
      { EditorState },
    ] = await Promise.all([
      import("@codemirror/view"),
      import("@codemirror/commands"),
      import("@codemirror/state"),
    ]);

    const monoTheme = EditorView.theme({
      "&": { fontFamily: "monospace", fontSize: "13px", border: "1px solid rgba(var(--v-border-color), var(--v-border-opacity))", borderRadius: "6px" },
      ".cm-content": { padding: "8px 0", minHeight: "180px" },
      ".cm-line": { padding: "0 8px" },
      ".cm-gutters": { borderRight: "1px solid rgba(var(--v-border-color), var(--v-border-opacity))", background: "rgba(var(--v-theme-surface-variant, 245,245,245), 0.5)" },
    });

    view = new EditorView({
      state: EditorState.create({
        doc: editorText.value,
        extensions: [
          lineNumbers(),
          keymap.of(defaultKeymap),
          monoTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              editorText.value = update.state.doc.toString();
            }
          }),
        ],
      }),
      parent: editorEl.value!,
    });
  } catch {
    // CodeMirror may fail in jsdom; editorText ref still works as fallback
  }
});

onBeforeUnmount(() => {
  view?.destroy();
});

function getEditorText(): string {
  if (view) return view.state.doc.toString();
  return editorText.value;
}

interface ParsedParam { name: string; display: string; }

function tryParse(s: unknown): unknown {
  if (typeof s !== "string") return s;
  const t = s.trim();
  if (!(t.startsWith("{") || t.startsWith("[") || t.startsWith("\""))) return s;
  try { return JSON.parse(t); } catch { return s; }
}

// Render a single value/part readably: CQL returns FHIR resources as (sometimes
// double-) JSON-encoded valueStrings; unwrap them and humanize.
function valueDisplay(v: unknown): string {
  // unwrap a part/sub-parameter to its value
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as any;
    if (o.resource) return valueDisplay(o.resource);
    const vk = Object.keys(o).find((k) => k.startsWith("value"));
    if (vk && o.resourceType === undefined) return valueDisplay(o[vk]);
  }
  // parse JSON strings (handle double-encoding)
  let parsed = tryParse(v);
  if (typeof parsed === "string") parsed = tryParse(parsed);
  if (parsed && typeof parsed === "object" && (parsed as any).resourceType) {
    const r = parsed as any;
    const label = formatFhirValue(r.name ?? r.code ?? r.title ?? r.text) || r.id || "";
    return label ? `${r.resourceType}: ${label}` : r.resourceType;
  }
  return formatFhirValue(parsed) || (typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed));
}

const resultParams = computed<ParsedParam[]>(() => {
  if (!result.value?.parameter) return [];
  return (result.value.parameter as any[]).map((p) => {
    const name = p.name ?? "";
    // A define result is usually a list: either p.part[] or a value* that is an array.
    const valueKey = Object.keys(p).find((k) => k.startsWith("value"));
    const raw = p.resource ?? p.part ?? (valueKey ? p[valueKey] : undefined);
    let items: unknown[];
    const parsedRaw = tryParse(raw);
    if (Array.isArray(parsedRaw)) items = parsedRaw;
    else if (Array.isArray(raw)) items = raw;
    else items = raw === undefined ? [] : [raw];
    const rendered = items.map(valueDisplay).filter(Boolean);
    const display = rendered.length > 1
      ? `${rendered.length} results — ${rendered.join("; ")}`
      : rendered.join("; ");
    return { name, display };
  });
});

async function run() {
  error.value = "";
  result.value = null;
  running.value = true;
  try {
    const text = getEditorText();
    result.value = await client.runCql(props.dataset, text);
  } catch (e) {
    error.value = e instanceof FhirError ? e.message : String(e);
  } finally {
    running.value = false;
  }
}
</script>

<style scoped>
.cql-editor :deep(.cm-editor) {
  width: 100%;
}
.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.result-table th,
.result-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity, 0.12));
}
.result-table th {
  font-weight: 600;
  background: rgba(var(--v-theme-surface-variant, 245,245,245), 0.6);
}
.param-name { font-weight: 500; white-space: nowrap; }
.param-value { font-family: monospace; }
.raw-json {
  font-size: 12px;
  background: rgba(var(--v-theme-surface-variant, 245,245,245), 0.5);
  border-radius: 4px;
  padding: 10px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
