---
sidebar_position: 14
---

# webapi — Embedded OHDSI WebAPI

The `webapi` extension runs the OHDSI WebAPI in-process, backed by the Trex
engine. WebAPI is the REST service behind OHDSI ATLAS — cohort definitions,
concept sets, characterizations, and the rest of the ATLAS backend. Running it
embedded means ATLAS talks to Trex directly instead of a separate WebAPI
deployment with its own database.

It ships as a GraalVM native-image shared library (`libwebapi-native.so`)
loaded on demand. The embedded WebAPI shares the host engine's database handle,
so it sees the same catalog and data as your SQL session — no separate
connection or data copy.

## Functions

All three functions take no arguments and return a status message.

### `webapi_start()`

Start the embedded WebAPI. Hands the current engine's database handle to WebAPI
so it shares the same catalog instance.

**Returns:** VARCHAR — status message. If the native library is missing, returns a clear error string rather than failing to load.

```sql
SELECT webapi_start();
```

### `webapi_stop()`

Stop the embedded WebAPI.

**Returns:** VARCHAR — status message.

```sql
SELECT webapi_stop();
```

### `webapi_status()`

Report whether the embedded WebAPI is running.

**Returns:** VARCHAR — status message.

```sql
SELECT webapi_status();
```

## Operational notes

- **One instance per engine process.** The embedded WebAPI runs inside the
  engine and shares its database handle; stopping the engine stops WebAPI.
- **Native library required.** The functions load `libwebapi-native.so` lazily.
  A dedicated large-stack thread owns the GraalVM isolate and marshals
  start/stop/status calls to it.

## Next steps

- [SQL Reference → atlas](atlas) — build OHDSI cohort definitions and render
  them to SQL directly.
- [SQL Reference → hades](hades) — run OHDSI HADES R analytics against the same
  data.
