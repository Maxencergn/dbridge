import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { gcloud, gcloudJson } from "./gcloud.js";
import { logDir, stateFile } from "./paths.js";
import { killProcess, pidAlive, portFree, portOpen } from "./process.js";
import { proxyBin } from "./tools.js";

const HOST = "127.0.0.1";
const PORTS = Array.from({ length: 67 }, (_, index) => 5433 + index);
const CONNECTION_NAME = /^[A-Za-z0-9-]+:[A-Za-z0-9-]+:[A-Za-z0-9-]+$/;

async function readState() {
  try {
    const data = JSON.parse(await fsp.readFile(stateFile, "utf8"));
    return data && typeof data === "object" ? data : { proxies: {} };
  } catch {
    return { proxies: {} };
  }
}

async function writeState(state) {
  await fsp.mkdir(path.dirname(stateFile), { recursive: true });
  await fsp.writeFile(stateFile, JSON.stringify(state, null, 2));
}

export async function reconcileProxies() {
  const state = await readState();
  const proxies = state.proxies || {};
  const alive = {};
  for (const [name, proxy] of Object.entries(proxies)) {
    if (Number.isInteger(proxy.pid) && pidAlive(proxy.pid) && (await portOpen(proxy.port))) {
      alive[name] = proxy;
    }
  }
  if (Object.keys(alive).length !== Object.keys(proxies).length) {
    state.proxies = alive;
    await writeState(state);
  }
  return alive;
}

function logPath(connectionName) {
  return path.join(logDir, `${connectionName.replaceAll(":", "_")}.log`);
}

async function readLog(file) {
  try {
    const lines = (await fsp.readFile(file, "utf8")).split(/\r?\n/);
    return lines.slice(-40).join("\n");
  } catch {
    return "";
  }
}

function proxyError(text) {
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("Usage:") || line.startsWith("Flags:") || line.startsWith("Available Commands:")) break;
    if (line.startsWith("WARNING:")) continue;
    lines.push(line);
  }
  return lines.join("\n").trim() || "The proxy did not start.";
}

async function allocatePort(reserved) {
  for (const port of PORTS) {
    if (reserved.has(port) || !(await portFree(port))) continue;
    return port;
  }
  throw new Error("No free port between 5433 and 5499.");
}

export async function stopProxy(connectionName) {
  if (!CONNECTION_NAME.test(connectionName)) throw new Error("Invalid connection name.");
  const state = await readState();
  const proxy = state.proxies?.[connectionName];
  if (!proxy) return;
  if (Number.isInteger(proxy.pid) && pidAlive(proxy.pid)) {
    killProcess(proxy.pid);
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if (!pidAlive(proxy.pid)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  delete state.proxies[connectionName];
  await writeState(state);
}

export async function rememberDatabase(connectionName, database) {
  const state = await readState();
  if (!state.proxies?.[connectionName]) return;
  state.proxies[connectionName].database = database;
  await writeState(state);
}

export async function startProxy(connectionName, env) {
  if (!CONNECTION_NAME.test(connectionName)) throw new Error("Invalid connection name.");
  if (!connectionName.startsWith(`${env.project}:`)) {
    throw new Error("This environment does not match the instance.");
  }
  const bin = await proxyBin();
  if (!bin) throw new Error("cloud-sql-proxy was not found.");
  let proxies = await reconcileProxies();
  const project = connectionName.split(":")[0];
  const existing = proxies[connectionName];
  if (existing && (!existing.iamAuth || existing.quotaProject !== project)) {
    await stopProxy(connectionName);
    proxies = await reconcileProxies();
  } else if (existing) {
    return { ...existing, connectionName, reused: true };
  }

  const port = await allocatePort(new Set(Object.values(proxies).map((proxy) => proxy.port)));
  const file = logPath(connectionName);
  await fsp.mkdir(logDir, { recursive: true });
  const log = fs.openSync(file, "w");
  const child = spawn(
    bin,
    ["--auto-iam-authn", "--quota-project", project, "--port", String(port), connectionName],
    { detached: true, stdio: ["ignore", log, log], windowsHide: true },
  );
  child.unref();
  fs.closeSync(log);

  let ready = false;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!pidAlive(child.pid)) break;
    if ((await portOpen(port)) && (await readLog(file)).includes("ready for new connections")) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) {
    if (pidAlive(child.pid)) killProcess(child.pid);
    throw new Error(proxyError(await readLog(file)));
  }

  const proxy = {
    pid: child.pid,
    port,
    instance: connectionName.split(":")[2],
    env: env.id,
    project: env.project,
    startedAt: new Date().toISOString().slice(0, 19),
    iamAuth: true,
    quotaProject: env.project,
    database: null,
  };
  const state = await readState();
  state.proxies = state.proxies || {};
  state.proxies[connectionName] = proxy;
  await writeState(state);
  return { ...proxy, connectionName, reused: false };
}

export async function ensureIamUser(connectionName, email) {
  const [project, , instance] = connectionName.split(":");
  const users = await gcloudJson(["sql", "users", "list", `--instance=${instance}`, `--project=${project}`, "--format=json"]);
  const rows = Array.isArray(users) ? users : [];
  if (rows.some((user) => user.name === email && user.type === "CLOUD_IAM_USER")) return;
  console.log(`Adding ${email} as an IAM user of ${instance}…`);
  try {
    await gcloud([
      "sql",
      "users",
      "create",
      email,
      `--instance=${instance}`,
      `--project=${project}`,
      "--type=CLOUD_IAM_USER",
    ]);
  } catch (error) {
    if (!String(error.message).toLowerCase().includes("already exists")) throw error;
  }
}

export function proxyLabel(name, proxy) {
  const database = proxy.database || "database not set";
  return `${proxy.env || ""} · ${proxy.instance || name} · ${database} · :${proxy.port}`;
}
