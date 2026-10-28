import { envFromCatalog, findTarget, loadCatalog } from "./catalog.js";
import { detectInterfaces, isLocalEnv, isSystemDatabase, loadConfig, saveConfig, slug } from "./config.js";
import { activeAccount, ensureAuth, gcloudJson, login } from "./gcloud.js";
import { listLocalDatabases } from "./local.js";
import { ask, choose, chooseMany } from "./menu.js";
import { openInterface } from "./open.js";
import { configFile } from "./paths.js";
import { ensureIamUser, proxyLabel, reconcileProxies, rememberDatabase, startProxy, stopProxy } from "./proxy.js";
import { portOpen } from "./process.js";
import { ensureTools } from "./tools.js";

const HELP = `dbridge list                  list commands
dbridge init                  configure projects and the interface
dbridge login                 Google sign-in
dbridge start                 pick an environment and a database
dbridge start prod
dbridge start prod speeral
dbridge start local
dbridge start local speeral
dbridge status                running proxies
dbridge open                  reopen the GUI on a running proxy
dbridge open prod speeral
dbridge open local speeral
dbridge stop                  stop a proxy
dbridge stop all
dbridge stop prod speeral
`;

function printConnection(env, instanceName, database, started) {
  console.log();
  console.log(`${env.label} · ${instanceName} · ${database}`);
  console.log(`proxy ${started.reused ? "already running" : "started"}`);
  console.log("host      127.0.0.1");
  console.log(`port      ${started.port}`);
  console.log(`database  ${database}`);
  console.log("ssl       off");
  console.log("The proxy keeps running after the terminal closes. Run dbridge stop to stop it.");
}

async function databaseRows(env, includeSystem) {
  const rows = [];
  for (const instance of env.instances) {
    for (const name of instance.databases) {
      if (isSystemDatabase(name) && !includeSystem) continue;
      rows.push({ instance, database: name });
    }
  }
  return rows;
}

async function pickDatabase(config, env) {
  let includeSystem = false;
  while (true) {
    const rows = await databaseRows(env, includeSystem);
    if (!rows.length) throw new Error(`No databases on ${env.label}.`);
    const proxies = await reconcileProxies();
    const labels = rows.map((row) => {
      const proxy = proxies[row.instance.connectionName];
      const port = proxy ? `  :${proxy.port}` : "";
      return `${row.database.padEnd(22)} ${row.instance.instance}${port}`;
    });
    if (!includeSystem) labels.push("Show system databases");
    const choice = await choose(env.label, labels);
    if (!includeSystem && choice === rows.length) {
      includeSystem = true;
      continue;
    }
    return rows[choice];
  }
}

async function launch(config, env, instance, database) {
  const account = await ensureAuth();
  if (!account) throw new Error("No active gcloud account. Run: dbridge login");
  await ensureIamUser(instance.connectionName, account);
  const started = await startProxy(instance.connectionName, env);
  await rememberDatabase(instance.connectionName, database);
  printConnection(env, instance.instance, database, started);
  await openInterface(account, started.port, database, config.interface);
}

function envById(config, id) {
  const env = config.environments.find((item) => item.id === id);
  if (!env) {
    const known = config.environments.map((item) => item.id).join(", ");
    throw new Error(`Unknown environment. Use: ${known}`);
  }
  return env;
}

async function askLocal(usedIds) {
  const suggestedId = usedIds.has("local") ? "local-2" : "local";
  const id = (await ask(`Short id [${suggestedId}]: `)) || suggestedId;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid id: ${id}`);
  if (usedIds.has(id)) throw new Error(`Id already used: ${id}`);
  const label = (await ask("Label [Local]: ")) || "Local";
  const host = (await ask("Host [127.0.0.1]: ")) || "127.0.0.1";
  const portText = (await ask("Port [5432]: ")) || "5432";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${portText}`);
  const user = (await ask("User [postgres]: ")) || "postgres";
  const password = await ask("Password: ");
  return { id, label, host, port, user, password };
}

async function init(existing) {
  if (!process.stdin.isTTY) throw new Error("dbridge init must be run in a terminal.");
  if (existing) {
    const answer = await ask("A configuration already exists. Replace it? [y/N] ");
    if (!/^y(es)?$/i.test(answer)) return existing;
  }
  const environments = [];
  const cloudAnswer = await ask("Configure Cloud SQL projects? [Y/n] ");
  if (!/^n(o)?$/i.test(cloudAnswer)) {
    await ensureTools();
    await ensureAuth();
    const projects = await gcloudJson(["projects", "list", "--format=json"]);
    const usable = (Array.isArray(projects) ? projects : []).filter((project) => project.projectId);
    if (!usable.length) throw new Error("No GCP project is visible with this account.");
    const indexes = await chooseMany(
      "Projects",
      usable.map((project) => `${project.projectId}  ${project.name || ""}`.trim()),
    );
    for (const index of indexes) {
      const project = usable[index];
      const suggestedId = slug(project.projectId) || "project";
      const id = (await ask(`Short id for ${project.projectId} [${suggestedId}]: `)) || suggestedId;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid id: ${id}`);
      const suggestedLabel = project.name || id;
      const label = (await ask(`Label [${suggestedLabel}]: `)) || suggestedLabel;
      environments.push({ id, label, project: project.projectId });
    }
  }
  const localAnswer = await ask("Add a local Postgres? [y/N] ");
  if (/^y(es)?$/i.test(localAnswer)) {
    environments.push(await askLocal(new Set(environments.map((env) => env.id))));
  }
  if (!environments.length) throw new Error("Nothing to configure.");
  const interfaces = detectInterfaces();
  const picked = await choose("Interface", interfaces.map((item) => item.name));
  const config = {
    environments,
    interface: interfaces[picked],
    preferredDatabases: existing?.preferredDatabases || [],
  };
  await saveConfig(config);
  console.log(`Configuration written to ${configFile}`);
  return config;
}

async function requireConfig() {
  const config = await loadConfig();
  if (config) return config;
  console.log("First run. Configuring projects and the interface.");
  return init(null);
}

function printLocal(env, database) {
  console.log();
  console.log(`${env.label} · ${env.host}:${env.port} · ${database}`);
  console.log(`host      ${env.host}`);
  console.log(`port      ${env.port}`);
  console.log(`database  ${database}`);
  console.log("ssl       off");
}

async function startLocal(config, env, databaseName) {
  const names = await listLocalDatabases(env, config.preferredDatabases);
  let database = databaseName;
  if (!database) {
    const synthetic = {
      ...env,
      instances: [{ instance: `${env.host}:${env.port}`, connectionName: `local:${env.id}`, databases: names }],
    };
    const row = await pickDatabase(config, synthetic);
    database = row.database;
  } else if (!names.includes(database)) {
    throw new Error(`Nothing matches ${database} on ${env.id}.\n  ${names.filter((name) => !isSystemDatabase(name)).join(", ")}`);
  }
  printLocal(env, database);
  await openInterface(env.user, env.port, database, config.interface, {
    password: env.password ?? "",
    host: env.host,
  });
}

async function startCloud(config, envId, databaseName) {
  await ensureTools();
  await ensureAuth();
  const catalog = await loadCatalog(config);
  if (!databaseName) {
    const env = envFromCatalog(catalog, envId);
    const row = await pickDatabase(config, env);
    await launch(config, env, row.instance, row.database);
    return;
  }
  const { env, instance, database } = findTarget(catalog, envId, databaseName);
  await launch(config, env, instance, database);
}

async function cmdStart(args) {
  const config = await requireConfig();
  if (args.length > 2) throw new Error("Usage: dbridge start [prod speeral]");
  if (args.length === 0) {
    const index = await choose("Environment", config.environments.map((env) => env.label));
    const env = config.environments[index];
    if (isLocalEnv(env)) {
      await startLocal(config, env);
      return;
    }
    await startCloud(config, env.id);
    return;
  }
  const env = envById(config, args[0]);
  if (isLocalEnv(env)) {
    await startLocal(config, env, args[1]);
    return;
  }
  await startCloud(config, env.id, args[1]);
}

function describe(config, name, proxy) {
  const env = config?.environments?.find((item) => item.id === proxy.env);
  const label = env?.label || proxy.env || "";
  const database = proxy.database || "database not set";
  return `${label} · ${proxy.instance || name} · ${database} · :${proxy.port}`;
}

async function cmdStatus() {
  const proxies = await reconcileProxies();
  const names = Object.keys(proxies);
  if (!names.length) {
    console.log("No proxy is running.");
    return;
  }
  const config = await loadConfig();
  for (const name of names) console.log(describe(config, name, proxies[name]));
}

async function reopen(config, connectionName, proxy, database) {
  const account = await activeAccount();
  if (!account) throw new Error("No active gcloud account. Run: dbridge login");
  if (!(await portOpen(proxy.port))) throw new Error("This proxy is no longer responding. Start it again with dbridge start.");
  await rememberDatabase(connectionName, database);
  const env = config.environments.find((item) => item.id === proxy.env);
  console.log(`${env?.label || proxy.env} · ${proxy.instance} · ${database}`);
  console.log(`127.0.0.1:${proxy.port}`);
  await openInterface(account, proxy.port, database, config.interface);
}

async function cmdOpen(args) {
  const config = await requireConfig();
  if (args.length === 2) {
    const selected = envById(config, args[0]);
    if (isLocalEnv(selected)) {
      await startLocal(config, selected, args[1]);
      return;
    }
  }
  const proxies = await reconcileProxies();
  const items = Object.entries(proxies);
  if (!items.length) {
    console.log("No proxy is running.");
    return;
  }
  if (args.length === 2) {
    await ensureTools();
    const catalog = await loadCatalog(config);
    const { instance, database } = findTarget(catalog, args[0], args[1]);
    const proxy = proxies[instance.connectionName];
    if (!proxy) throw new Error(`No proxy for ${instance.instance}. Run: dbridge start ${args[0]} ${database}`);
    await reopen(config, instance.connectionName, proxy, database);
    return;
  }
  if (args.length) throw new Error("Usage: dbridge open [prod speeral]");
  if (items.length === 1) {
    const [name, proxy] = items[0];
    if (!proxy.database) throw new Error("Unknown database for this proxy. Specify: dbridge open prod speeral");
    await reopen(config, name, proxy, proxy.database);
    return;
  }
  const choice = await choose("Reopen", items.map(([name, proxy]) => describe(config, name, proxy)));
  const [name, proxy] = items[choice];
  if (!proxy.database) throw new Error("Unknown database for this proxy. Specify: dbridge open prod speeral");
  await reopen(config, name, proxy, proxy.database);
}

async function cmdStop(args) {
  if (args.length === 1 && args[0] === "all") {
    const proxies = await reconcileProxies();
    const names = Object.keys(proxies);
    for (const name of names) await stopProxy(name);
    console.log(names.length ? "Proxies stopped." : "No proxy is running.");
    return;
  }
  if (args.length === 2) {
    const config = await requireConfig();
    const selected = envById(config, args[0]);
    if (isLocalEnv(selected)) {
      console.log("Local databases do not use a proxy.");
      return;
    }
    await ensureTools();
    const catalog = await loadCatalog(config);
    const { instance } = findTarget(catalog, args[0], args[1]);
    await stopProxy(instance.connectionName);
    console.log(`Proxy stopped for ${instance.instance}.`);
    return;
  }
  if (args.length) throw new Error("Usage: dbridge stop [all | prod speeral]");
  const proxies = await reconcileProxies();
  const items = Object.entries(proxies);
  if (!items.length) {
    console.log("No proxy is running.");
    return;
  }
  const choice = await choose("Stop", items.map(([name, proxy]) => proxyLabel(name, proxy)));
  await stopProxy(items[choice][0]);
  console.log("Proxy stopped.");
}

export async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === "list" || command === "help" || command === "-h" || command === "--help") {
    console.log(HELP.trimEnd());
    return;
  }
  if (command === "init") {
    await init(await loadConfig());
    return;
  }
  if (command === "login") {
    await ensureTools();
    await login();
    const account = await ensureAuth();
    console.log(account || "Signed in.");
    return;
  }
  if (command === "start") {
    await cmdStart(args);
    return;
  }
  if (command === "status") {
    await cmdStatus();
    return;
  }
  if (command === "open") {
    await cmdOpen(args);
    return;
  }
  if (command === "stop") {
    await cmdStop(args);
    return;
  }
  console.log(HELP.trimEnd());
  process.exitCode = 1;
}
