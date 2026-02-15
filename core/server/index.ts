// @ts-ignore
import { STATUS_CODE } from "https://deno.land/std/http/status.ts";
import { join } from "jsr:@std/path@^1.0";
import express from "express";
import { createServer } from "node:http";
import { postgraphile } from "postgraphile";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { makePgService } from "postgraphile/adaptors/pg";
import { grafserv } from "postgraphile/grafserv/express/v4";

console.log("main function started");
console.log(Deno.version);

addEventListener("beforeunload", () => {
  console.log("main worker exiting");
});

addEventListener("unhandledrejection", (ev) => {
  console.log(ev);
  ev.preventDefault();
});

const app = express();
const server = createServer(app);

const databaseUrl = Deno.env.get("DATABASE_URL");
if (databaseUrl) {
  const pgl = postgraphile({
    extends: [PostGraphileAmberPreset],
    pgServices: [
      makePgService({
        connectionString: databaseUrl,
        schemas: (Deno.env.get("PG_SCHEMA") || "public").split(","),
      }),
    ],
    grafserv: {
      graphqlPath: "/graphql",
      graphiqlPath: "/graphiql",
      graphiql: true,
    },
  });
  const serv = pgl.createServ(grafserv);
  await serv.addTo(app, server);
  console.log("PostGraphile mounted on /graphql and /graphiql");
} else {
  console.warn("DATABASE_URL not set — PostGraphile disabled");
}

app.get("/_internal/health", (_req, res) => {
  res.status(STATUS_CODE.OK).json({ message: "ok" });
});

app.get("/_internal/metric", async (_req, res) => {
  const metric = await EdgeRuntime.getRuntimeMetrics();
  res.json(metric);
});

app.put("/_internal/upload", async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    const dir = await Deno.makeTempDir();
    const path = join(dir, "index.ts");
    await Deno.writeTextFile(path, body);
    res.json({ path: dir });
  } catch (err) {
    res.status(STATUS_CODE.BadRequest).json(err);
  }
});

app.use("/:service_name", async (req, res) => {
  const serviceName = req.params.service_name;

  // Already handled by express routes above
  if (
    serviceName === "_internal" ||
    serviceName === "graphql" ||
    serviceName === "graphiql"
  ) {
    return;
  }

  let servicePath: string;
  if (serviceName.startsWith("tmp")) {
    try {
      servicePath = await Deno.realPath(`/tmp/${serviceName}`);
    } catch (err) {
      res.status(STATUS_CODE.BadRequest).json(err);
      return;
    }
  } else {
    servicePath = `./examples/${serviceName}`;
  }

  const createWorker = async () => {
    const memoryLimitMb = 150;
    const workerTimeoutMs = 5 * 60 * 1000;
    const noModuleCache = false;
    const envVarsObj = Deno.env.toObject();
    const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);
    const forceCreate = false;
    const cpuTimeSoftLimitMs = 10000;
    const cpuTimeHardLimitMs = 20000;

    return await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      envVars,
      forceCreate,
      cpuTimeSoftLimitMs,
      cpuTimeHardLimitMs,
      context: {
        useReadSyncFileAPI: true,
        unstableSloppyImports: true,
      },
    });
  };

  const callWorker = async (): Promise<Response> => {
    try {
      const worker = await createWorker();
      const controller = new AbortController();
      return await worker.fetch(req, { signal: controller.signal });
    } catch (e) {
      if (e instanceof Deno.errors.WorkerAlreadyRetired) {
        return await callWorker();
      }

      const error = { msg: e.toString() };
      return new Response(JSON.stringify(error), {
        status: STATUS_CODE.InternalServerError,
        headers: { "Content-Type": "application/json" },
      });
    }
  };

  try {
    const workerResponse = await callWorker();
    res.status(workerResponse.status);
    workerResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = await workerResponse.text();
    res.send(body);
  } catch (err) {
    res.status(STATUS_CODE.InternalServerError).json({ msg: String(err) });
  }
});

server.listen(8000, () => {
  console.log("server listening on port 8000");
});
