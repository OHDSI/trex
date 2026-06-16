# MRI Backend — Verification Document

## 1. Frontend Contract Check

### Files Examined

| File | Purpose |
|---|---|
| `apps/vue-mri-ui-lib/src/types.d.ts` | TypeScript interface definitions for `IMRIEndpointResultType` and `IMRIEndpointResultCategoryType` |
| `apps/vue-mri-ui-lib/src/components/StackBarChart.vue` | Chart component — calls the barchart endpoint, passes raw response to `postProcessBarChartData`, then to `processResponse` |
| `apps/vue-mri-ui-lib/src/components/helpers/postProcessBarChartData.ts` | Post-processes raw backend response: fills missing Cartesian-product rows, formats binning labels |
| `apps/vue-mri-ui-lib/src/store/modules/chartUtils.ts` | Vuex getters `dataToTraces` and `processResponse` — converts processed response into Plotly traces |
| `apps/vue-mri-ui-lib/src/store/modules/query.ts` | `firePatientCountQuery` at line 943 — reads `data[0]['patient.attributes.pcount']` from the patientcount response |
| `apps/vue-mri-ui-lib/src/utils/AnnotateBM.ts` | Maps between `categoryId` (positional: `x1`, `y1`) and `attributeId` (full config path) in the request; the response must use full config paths |

### Expected Shape (frontend contract)

#### `IMRIEndpointResultType` (`types.d.ts` lines 63–90)

```ts
interface IMRIEndpointResultCategoryType {
  axis: number          // 1 = X, 2 = Y
  id: string            // FULL ATTRIBUTE CONFIG PATH, e.g. "patient.attributes.Age"
  name: string          // display label
  order: string         // "ASC" | "DESC"
  type: string          // "num" | "text"
  value: string         // (optional; used for annotations)
  binsize?: number
}

interface IMRIEndpointResultType {
  data: Array<{ [key: string]: string | number }>  // row keys = category ids (full paths) + measure ids (full paths)
  measures: Array<{ id: string; name: string; type: string; group: number }>
  categories: IMRIEndpointResultCategoryType[]
  totalPatientCount?: number
  postProcessingConfig?: {
    fillMissingValuesEnabled: boolean
    NOVALUE: string
    shouldFormatBinningLabels: boolean
  }
}
```

#### How `category.id` and `measure.id` are consumed

**`processResponse` (chartUtils.ts lines 103–111):**
```ts
const sParent = getters.getMriFrontendConfig.getAttributeByPath(measure.id).sParentPath
measure.name = `${filterCardName} - ${getters.getMriFrontendConfig.getAttributeByPath(measure.id).getName()}`
```
`measure.id` **must** be a full attribute config path like `"patient.attributes.pcount"` so that `getAttributeByPath` can look it up in the frontend config.

**`processResponse` (chartUtils.ts lines 120–128):**
```ts
const oAttributeConfig = getters.getMriFrontendConfig.getAttributeByPath(mCategory.id)
```
`category.id` **must** be a full attribute config path like `"patient.attributes.Age"`.

**`dataToTraces` (chartUtils.ts lines 25–28):**
```ts
const yAttrKey = yAxis[0].id          // e.g. "patient.attributes.Gender"
const yAttrVal = data[yAttrKey]        // reads from data row by full path key
```

**`dataToTraces` (chartUtils.ts lines 47, 60, 63, 75):**
```ts
const measureId = chartData.measures[0].id          // e.g. "patient.attributes.pcount"
xData = category.data.map(data => data[xAxes[0].id]) // e.g. data["patient.attributes.Age"]
y: category.data.map(data => data[measureId]),       // data["patient.attributes.pcount"]
```
Data row keys must match `category.id` and `measure.id` — i.e. full attribute config paths.

**`postProcessBarChartData.ts` (line 68, 76, 139):**
```ts
const range = _getFullValueRange(result.data, category, result.postProcessingConfig.NOVALUE)
// accesses data[category.id] everywhere — keys must match category.id
```

**`renderChart` in `StackBarChart.vue` (lines 261–268):**
```ts
const filterCardPath = category.id.split('.')
filterCardPath.pop()
filterCardPath.pop()
if (filterCardPath.length <= 1) { /* Basic Data */ }
else { const filterCard = this.getChartableFilterCardByInstanceId(filterCardPath.join('.')) }
```
Splits `category.id` on `.` and pops two segments; `filterCardPath.length <= 1` is the "patient attributes" branch. This requires the path to have at least two `.`-separated segments (e.g. `patient.attributes.Age`).

**patientcount response (`query.ts` line 943):**
```ts
commit(types.SET_TOTAL_PATIENT_COUNT, {
  totalPatientCount: response.data.data[0]['patient.attributes.pcount'],
})
```
The patientcount endpoint must return `data[0]['patient.attributes.pcount']`, not `data[0]['pcount']`.

### Verdict: **MISMATCH**

Our backend (`assembleBarchart` / `compileBarchart`) returns positional identifiers (`x1`, `y1`, `pcount`); the frontend requires **full attribute config paths** everywhere.

| Field | Our backend returns | Frontend expects | Impact |
|---|---|---|---|
| `categories[*].id` | `"x1"`, `"y1"` | `"patient.attributes.Age"`, `"patient.attributes.Gender"` | `getAttributeByPath` returns undefined → crash in `processResponse`; `renderChart` path-split logic breaks |
| `measures[0].id` | `"pcount"` | `"patient.attributes.pcount"` | `getAttributeByPath` returns undefined → crash in `processResponse` |
| `data[*]` row keys | `{ x1: 30, y1: "male", pcount: 5 }` | `{ "patient.attributes.Age": 30, "patient.attributes.Gender": "male", "patient.attributes.pcount": 5 }` | `dataToTraces` reads wrong (undefined) values; Plotly traces are all empty |
| patientcount `data[0]` key | `{ pcount: N }` | `{ "patient.attributes.pcount": N }` | `firePatientCountQuery` reads undefined → patient count shows `--` |

### Required Changes

Both `compileBarchart` and `assembleBarchart` need to receive the full attribute config path (the `attributeId` from the incoming `axisSelection`) alongside the positional `categoryId` (`x1`, `y1`), and use the full path as the column alias and the key in the assembled response.

**In `handlers/barchart.ts`**: Pass `axisSelection[*].attributeId` alongside `axisSelection[*].categoryId` into `ifrToElm` so that `ElmAxis.id` is set to the full attribute path.

**In `elm/types.ts`**: `ElmAxis.id` should carry the full config path (e.g. `"patient.attributes.Age"`), not the positional `x1`.

**In `ifr/to_elm.ts`**: When building `ElmAxis`, set `id = axis.attributeId` (the full path from the request), not `axis.categoryId`.

**In `elm/compiler.ts` (`compileBarchart`)**: The `AS "${ax.id}"` alias will then be the full path, e.g. `AS "patient.attributes.Age"`. This is safe because DuckDB supports any quoted identifier.

**In `postprocess/barchart.ts` (`assembleBarchart`)**:
- `categories[*].id` will naturally become the full path (it already uses `ax.id`).
- `measures[0].id` must change from `"pcount"` to `"patient.attributes.pcount"`.
- Data row keys will become full paths automatically since the SQL column aliases change.

**In `handlers/patientcount.ts`**: Change the result key from `"pcount"` to `"patient.attributes.pcount"` in the returned data row.

---

## 2. Live Smoke Test

### Prerequisites

- A running trex instance with the prometheus plugin loaded.
- Dataset ID `ds1` registered in trex.
- DuckDB schema for `ds1` seeded with:
  - `patient` table: rows with `id`, `_raw` containing at least `birthDate` (e.g. `"1990-01-01"`) and `gender` (e.g. `"male"` / `"female"`), `_is_deleted = false`.
  - `condition` table: rows with `_raw` containing `subject.reference = "Patient/<patient_id>"` and `code.coding[0].code`, `_is_deleted = false`.
- The trex API is reachable at `http://localhost:8080` (adjust host/port as needed).
- `curl` and `base64` available on the test machine.

> **Note on mriquery encoding**: The frontend compresses the JSON bookmark with zlib deflate and base64-encodes it. The backend decoder (`functions-mri/mriquery/decode.ts`) also accepts plain (non-compressed) JSON for convenience. For manual testing you can pass the raw JSON object directly as the `mriquery` parameter value without compression.

---

### Check 1 — getMyConfig

Verify the prometheus plugin returns a valid analytics config for `ds1`.

```bash
curl -s \
  'http://localhost:8080/trex/analytics-svc/pa/services/analytics.xsjs?action=getMyConfig&datasetId=ds1' \
  | jq .
```

**Expected shape:**
```json
[
  {
    "meta": {
      "configId": "fhir-ds1",
      "configVersion": "1"
    },
    "chartOptions": { ... },
    "patient": {
      "attributes": {
        "Age": { "type": "num", ... },
        "Gender": { "type": "text", ... },
        "pcount": { "type": "num", "measure": true, ... }
      }
    }
  }
]
```

Checks:
- Response is an array with at least one element.
- `[0].meta.configId == "fhir-ds1"`.
- `[0].patient.attributes` contains `Age` (type `"num"`) and `Gender` (type `"text"`).

**Actual output:**
```
PASTE ACTUAL OUTPUT HERE
```

---

### Check 2 — patientcount

Verify the total patient count endpoint returns the correct format.

Build the mriquery JSON (plain, uncompressed):

```bash
MRIQUERY=$(cat <<'EOF'
{"datasetId":"ds1","filter":{"configMetadata":{"id":"fhir-ds1","version":"1"},"cards":{"type":"BooleanContainer","op":"AND","content":[]}},"axisSelection":[]}
EOF
)

curl -s \
  "http://localhost:8080/trex/analytics-svc/api/services/population/json/patientcount?mriquery=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip()))' <<< "$MRIQUERY")&datasetId=ds1" \
  | jq .
```

**Expected shape:**
```json
{
  "data": [
    { "patient.attributes.pcount": 216 }
  ]
}
```

Checks:
- `data` is an array with one element.
- `data[0]["patient.attributes.pcount"]` is a positive integer equal to the total number of patients in `ds1`.

**Actual output:**
```
PASTE ACTUAL OUTPUT HERE
```

---

### Check 3 — barchart (Age × Gender)

Verify the barchart endpoint returns the MRI-compatible response shape with full attribute config paths.

Build the mriquery JSON (plain, uncompressed):

```bash
MRIQUERY=$(cat <<'EOF'
{
  "datasetId": "ds1",
  "filter": {
    "configMetadata": { "id": "fhir-ds1", "version": "1" },
    "cards": { "type": "BooleanContainer", "op": "AND", "content": [] }
  },
  "axisSelection": [
    { "categoryId": "x1", "attributeId": "patient.attributes.Age", "binsize": "10" },
    { "categoryId": "y1", "attributeId": "patient.attributes.Gender", "binsize": "n/a" }
  ]
}
EOF
)

curl -s \
  "http://localhost:8080/trex/analytics-svc/api/services/population/json/barchart?mriquery=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip()))' <<< "$MRIQUERY")&datasetId=ds1" \
  | jq .
```

**Expected shape (after the MISMATCH fix is applied):**
```json
{
  "data": [
    { "patient.attributes.Age": 0, "patient.attributes.Gender": "female", "patient.attributes.pcount": 0 },
    { "patient.attributes.Age": 0, "patient.attributes.Gender": "male",   "patient.attributes.pcount": 3 },
    ...
  ],
  "categories": [
    {
      "id": "patient.attributes.Age",
      "name": "Age",
      "type": "num",
      "axis": 1,
      "binsize": 10,
      "order": "ASC"
    },
    {
      "id": "patient.attributes.Gender",
      "name": "Gender",
      "type": "text",
      "axis": 2,
      "order": "ASC"
    }
  ],
  "measures": [
    { "id": "patient.attributes.pcount", "name": "Patient Count", "type": "measure", "group": 1 }
  ],
  "totalPatientCount": 216,
  "postProcessingConfig": {
    "fillMissingValuesEnabled": true,
    "NOVALUE": "NO_VALUE",
    "shouldFormatBinningLabels": true
  }
}
```

Checks:
- `categories[0].id == "patient.attributes.Age"`, `categories[0].type == "num"`, `categories[0].binsize == 10`, `categories[0].axis == 1`.
- `categories[1].id == "patient.attributes.Gender"`, `categories[1].type == "text"`, `categories[1].axis == 2`.
- `measures[0].id == "patient.attributes.pcount"`.
- `data` rows are keyed by `"patient.attributes.Age"`, `"patient.attributes.Gender"`, `"patient.attributes.pcount"`.
- `totalPatientCount` equals the value returned by Check 2.
- `postProcessingConfig.fillMissingValuesEnabled == true` and `postProcessingConfig.shouldFormatBinningLabels == true` (the frontend's `postProcessBarChartData` uses both flags).

**Actual output:**
```
PASTE ACTUAL OUTPUT HERE
```
