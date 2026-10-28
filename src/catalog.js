import fs from "node:fs/promises";
import { sortDatabases } from "./config.js";
import { gcloudJson } from "./gcloud.js";
import { catalogFile, logDir, stateDir } from "./paths.js";

const CACHE_TTL_MS = 60 * 60 * 1000;

export async function ensureState() {
  await fs.mkdir(logDir, { recursive: true });
}

export async function loadCatalog(config, refresh = false) {
  if (!refresh) {
    try {
      const catalog = JSON.parse(await fs.readFile(catalogFile, "utf8"));
      const fresh = Date.now() - catalog.fetchedAt < CACHE_TTL_MS;
      const sameProjects = catalog.projects === projectKey(config);
      if (fresh && sameProjects) return catalog;
    } catch {
      // cache absent
    }
  }
  console.log("Recherche des instances…");
  return fetchCatalog(config);
}

function projectKey(config) {
  return config.environments.map((env) => `${env.id}=${env.project}`).join(",");
}

async function listDatabases(project, instance, preferred) {
  const payload = await gcloudJson([
    "sql",
    "databases",
    "list",
    `--instance=${instance}`,
    `--project=${project}`,
    "--format=json",
  ]);
  const rows = Array.isArray(payload) ? payload : [];
  const names = rows.filter((item) => item?.name).map((item) => item.name);
  return sortDatabases(names, preferred);
}

export async function fetchCatalog(config) {
  const preferred = config.preferredDatabases || [];
  const listed = await Promise.all(
    config.environments.map(async (env) => {
      const payload = await gcloudJson(["sql", "instances", "list", `--project=${env.project}`, "--format=json"]);
      const rows = Array.isArray(payload) ? payload : [];
      const instances = await Promise.all(
        rows
          .filter((item) => item?.name && item?.connectionName)
          .map(async (item) => ({
            instance: item.name,
            connectionName: item.connectionName,
            region: item.region,
            version: item.databaseVersion,
            databases: await listDatabases(env.project, item.name, preferred),
          })),
      );
      instances.sort((a, b) => a.instance.localeCompare(b.instance));
      return { ...env, instances };
    }),
  );
  const catalog = { fetchedAt: Date.now(), projects: projectKey(config), environments: listed };
  await ensureState();
  await fs.writeFile(catalogFile, JSON.stringify(catalog));
  return catalog;
}

export function envFromCatalog(catalog, envId) {
  const env = catalog.environments.find((item) => item.id === envId);
  if (!env) {
    const known = catalog.environments.map((item) => item.id).join(", ");
    throw new Error(`Environnement inconnu. Utilise : ${known}`);
  }
  return env;
}

export function findTarget(catalog, envId, token) {
  const env = envFromCatalog(catalog, envId);
  const byInstance = env.instances.filter(
    (item) => item.instance === token || item.connectionName.endsWith(`:${token}`),
  );
  const byDatabase = env.instances.filter((item) => item.databases.includes(token));
  if (byInstance.length) {
    const instance = byInstance[0];
    const database = instance.databases.includes(token)
      ? token
      : instance.databases.find((name) => !isHidden(name)) || instance.databases[0] || token;
    return { env, instance, database };
  }
  if (byDatabase.length === 1) return { env, instance: byDatabase[0], database: token };
  if (byDatabase.length > 1) {
    const choices = byDatabase.map((item) => `  ${envId} ${item.instance}`).join("\n");
    throw new Error(`Plusieurs instances ont la base ${token} :\n${choices}`);
  }
  const known = env.instances
    .map((item) => `  ${item.instance}: ${item.databases.filter((name) => !isHidden(name)).join(", ")}`)
    .join("\n");
  throw new Error(`Rien ne correspond à ${token} sur ${envId}.\n${known}`);
}

function isHidden(name) {
  return name === "postgres" || name.startsWith("prisma_") || name === "cloudsqladmin";
}
