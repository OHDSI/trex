import { waitfor } from "./utils.ts";

export const REGISTERED_FLOWS: Array<{
  name: string;
  entrypoint: string;
  image: string;
  tags: string[];
}> = [];

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(
          `Fetch failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${e}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function hasWorkerPool(prefectApiUrl: string, poolName: string): Promise<boolean> {
  const resp = await fetch(`${prefectApiUrl}/work_pools/${poolName}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (resp.status < 200 || resp.status > 202) {
    console.log(`${poolName} pool is not found`);
    return false;
  }
  return true;
}

async function ensureConcurrencyLimit(
  prefectApiUrl: string,
  name: string,
  limitVar: string
) {
  try {
    let limit: number;
    const envVal = Deno.env.get(limitVar);
    if (envVal) {
      limit = parseInt(envVal, 10);
      console.log(`Using env var ${limitVar} for concurrency limit ${name}: ${limit}`);
    } else {
      limit = parseInt(limitVar, 10) || 1;
      console.log(`Using default value ${limit} for concurrency limit ${name}`);
    }

    const getRes = await fetch(
      `${prefectApiUrl}/concurrency_limits/?tag=${name}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    let existingId: string | null = null;
    if (getRes.status === 200) {
      const data = await getRes.json();
      if (data.length > 0) {
        existingId = data[0].id;
        console.log(`Found existing concurrency limit ${name} with id ${existingId}`);
      }
    }

    if (existingId) {
      const updateRes = await fetch(
        `${prefectApiUrl}/concurrency_limits/${existingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concurrency_limit: limit }),
        }
      );
      if (updateRes.ok) {
        console.log(`Concurrency limit ${name} updated to ${limit}`);
      } else {
        console.error(
          `Error updating concurrency limit ${name}: ${updateRes.status}`
        );
      }
    } else {
      const createRes = await fetch(
        `${prefectApiUrl}/concurrency_limits/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: name, concurrency_limit: limit }),
        }
      );
      if (createRes.status === 409) {
        console.log(`Concurrency limit ${name} already exists`);
      } else if (createRes.ok) {
        console.log(`Concurrency limit ${name} created with limit ${limit}`);
      } else {
        console.error(
          `Error creating concurrency limit ${name}: ${createRes.status}`
        );
      }
    }
  } catch (e) {
    console.error(`Exception in ensureConcurrencyLimit for ${name}: ${e}`);
  }
}

interface PluginMeta {
  name: string; // full npm name, e.g. @data2evidence/d2e-flows
  version: string;
  dir: string; // install dir the plugin was scanned from
}

interface PluginArtifact {
  path: string; // storage object path: flow-plugins/<short-name>/<version>.tgz
  sha256: string;
  name: string; // npm short name (worker cache key)
  version: string;
}

/**
 * Publish the plugin's retained tarball (written by tpm next to the install
 * tree as `.tarballs/<name>-<version>.tgz` + `.sha256`) to @trex/storage and
 * return the artifact reference stamped into each deployment's job variables.
 * The worker (run-flow.sh/provision-envs.sh) resolves deployment ->
 * plugin_artifact -> fetch -> sha256-verify -> provision. Best-effort: any
 * failure returns null and deployments register without the ref (workers then
 * fall back to their baked plugin cache).
 *
 * Requires TREX_STORAGE_URL (e.g. http://localhost:8001/plugins/trex/storage-api)
 * and TREX_STORAGE_SERVICE_KEY; publication is skipped when unset.
 */
async function publishPluginArtifact(
  meta: PluginMeta
): Promise<PluginArtifact | null> {
  const storageUrl = Deno.env.get("TREX_STORAGE_URL");
  const serviceKey = Deno.env.get("TREX_STORAGE_SERVICE_KEY");
  if (!storageUrl || !serviceKey) {
    console.log(
      "TREX_STORAGE_URL/TREX_STORAGE_SERVICE_KEY not set — flow plugin artifacts not published"
    );
    return null;
  }
  try {
    const shortName = meta.name.includes("/")
      ? meta.name.slice(meta.name.indexOf("/") + 1)
      : meta.name;
    const fileStem = `${meta.name.replaceAll("/", "__")}-${meta.version}`;

    // tpm writes .tarballs at the install root; the plugin dir is either
    // <root>/<name> or <root>/@scope/<name>, so probe both ancestors. Bundled
    // plugin images retain tarballs the same way (see the d2e trex image).
    let tgzPath: string | null = null;
    for (const up of ["..", "../.."]) {
      const candidate = `${meta.dir}/${up}/.tarballs/${fileStem}.tgz`;
      try {
        await Deno.stat(candidate);
        tgzPath = candidate;
        break;
      } catch (_) {
        /* keep probing */
      }
    }
    if (!tgzPath) {
      console.log(
        `No retained tarball for ${meta.name}@${meta.version} — artifact not published`
      );
      return null;
    }

    const sha256 = (await Deno.readTextFile(`${tgzPath}.sha256`)).trim();
    const objectPath = `flow-plugins/${shortName}/${meta.version}.tgz`;
    const base = storageUrl.replace(/\/$/, "");
    // Both headers on purpose: trex's authContext accepts service_role keys
    // only via `apikey` (middleware/auth-context.ts), while the embedded
    // supabase-storage validates `Authorization` internally — same secret.
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    };

    // Idempotent bucket creation (409 = already exists).
    const bucketRes = await fetch(`${base}/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "flow-plugins", id: "flow-plugins" }),
    });
    if (!bucketRes.ok && bucketRes.status !== 409) {
      console.error(
        `flow-plugins bucket creation failed: ${bucketRes.status} ${await bucketRes.text()}`
      );
      return null;
    }

    // Upsert the object: same sha -> overwrite is a semantic no-op; new
    // version -> new key. Tarballs are small (sources + lockfiles only).
    const bytes = await Deno.readFile(tgzPath);
    const uploadRes = await fetch(`${base}/object/${objectPath}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/gzip",
        "x-upsert": "true",
      },
      body: bytes,
    });
    if (!uploadRes.ok) {
      console.error(
        `artifact upload failed for ${meta.name}@${meta.version}: ${uploadRes.status} ${await uploadRes.text()}`
      );
      return null;
    }

    console.log(
      `>FLOW< Published plugin artifact ${objectPath} (sha256 ${sha256.slice(0, 12)}…)`
    );
    return { path: objectPath, sha256, name: shortName, version: meta.version };
  } catch (e) {
    console.error(`artifact publication error for ${meta.name}:`, e);
    return null;
  }
}

export async function addPlugin(value: any, meta?: PluginMeta) {
  const prefectApiUrl = Deno.env.get("PREFECT_API_URL");
  if (!prefectApiUrl) {
    console.log("PREFECT_API_URL not set — skipping flow plugins");
    return;
  }

  try {
    const healthUrl =
      Deno.env.get("PREFECT_HEALTH_CHECK") || `${prefectApiUrl}/health`;
    await waitfor(healthUrl);

    const poolName = Deno.env.get("PREFECT_POOL") || "default";
    while (!(await hasWorkerPool(prefectApiUrl, poolName))) {
      console.log("Waiting for creation of worker pool ...");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const imageTag = Deno.env.get("PLUGINS_IMAGE_TAG") || "latest";
    const pullPolicy = Deno.env.get("PLUGINS_PULL_POLICY") || "IfNotPresent";
    const dockerVolumes = Deno.env.get("PREFECT_DOCKER_VOLUMES") || "[]";
    const dockerNetwork = Deno.env.get("PREFECT_DOCKER_NETWORK") || "";
    let customImageRepo: any = {};
    try {
      customImageRepo = JSON.parse(
        Deno.env.get("PLUGINS_FLOW_CUSTOM_REPO_IMAGE_CONFIG") || "{}"
      );
    } catch (_) {}

    if (!value.flows) return;

    // Published once per plugin; every deployment below carries the same ref.
    const pluginArtifact = meta ? await publishPluginArtifact(meta) : null;

    for (const f of value.flows) {
      const res = await fetchWithRetry(`${prefectApiUrl}/flows/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name }),
      });

      if (res.status < 200 || res.status > 202) {
        console.error(
          `Error creating flow ${f.name} - ${res.status} ${res.statusText}`
        );
        try {
          console.error(JSON.stringify(await res.json()));
        } catch (_) {
          // ignore
        }
        continue;
      }

      const jres = await res.json();

      const getFinalImageName = (valueImage: any, flowImage: any) => {
        let finalImage = flowImage;
        if (valueImage) {
          if (
            customImageRepo.current &&
            customImageRepo.new
          ) {
            finalImage = `${valueImage.replace(
              customImageRepo.current,
              customImageRepo.new
            )}:${imageTag}`;
          } else {
            finalImage = `${valueImage}:${imageTag}`;
          }
        }
        return finalImage;
      };

      if (f.concurrencyLimitOptions) {
        for (const option of f.concurrencyLimitOptions) {
          await ensureConcurrencyLimit(prefectApiUrl, option.tag, option.limit);
        }
      }

      let volumes: any;
      try {
        volumes = JSON.parse(dockerVolumes);
      } catch (_) {
        volumes = [];
      }

      const body: any = {
        name: f.name,
        flow_id: jres.id,
        work_pool_name: poolName,
        work_queue_name: "default",
        entrypoint: f.entrypoint,
        enforce_parameter_schema: false,
        job_variables: {
          image: getFinalImageName(value.image, f.image),
          image_pull_policy: pullPolicy,
          volumes,
          networks: dockerNetwork ? [dockerNetwork] : [],
        },
        tags: f.tags,
      };

      // Deployment-attached artifact: couples this deployment to the exact
      // plugin tarball it was registered from. Process workers resolve it
      // (fetch from @trex/storage, sha256-verify, provision the pixi env);
      // the docker worker's template ignores it.
      if (pluginArtifact) {
        body.job_variables.plugin_artifact = pluginArtifact;
      }

      // If the flow declares a deployment command, apply it to job_variables so the
      // Prefect docker worker runs it instead of the image's default CMD. d2e's HANA
      // flows rely on this to `uv pip install sqlalchemy-hana` at runtime before
      // executing; without it they fail with
      //   sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:hana.hdbcli
      // (Ported from the pre-migration d2e flow deploy — OHDSI/d2e #2488.)
      if (f.command) {
        body.job_variables.command = f.command;
      }

      if (f.parameter_openapi_schema) {
        body.parameter_openapi_schema = f.parameter_openapi_schema;
      }
      if (
        f.concurrencyLimitName &&
        f.concurrencyLimit &&
        f.concurrencyLimit > 0
      ) {
        body.concurrency_options = {
          concurrency_limit_name: f.concurrencyLimitName,
          collision_strategy: "ENQUEUE",
        };
      }

      const res2 = await fetchWithRetry(`${prefectApiUrl}/deployments/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res2.status < 200 || res2.status > 202) {
        console.error(
          `Error creating deployment ${f.name} - ${res2.status} ${res2.statusText}`
        );
        try {
          console.error(JSON.stringify(await res2.json()));
        } catch (_) {
          // ignore
        }
      } else {
        console.log(`>FLOW< Successfully deployed ${f.name}`);
        REGISTERED_FLOWS.push({
          name: f.name,
          entrypoint: f.entrypoint || "",
          image: body.job_variables?.image || "",
          tags: f.tags || [],
        });
      }
    }
  } catch (e) {
    console.error("Flow plugin error:", e);
  }
}
