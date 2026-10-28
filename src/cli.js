import { envFromCatalog, findTarget, loadCatalog } from "./catalog.js";
import { detectInterfaces, isSystemDatabase, loadConfig, saveConfig, slug } from "./config.js";
import { activeAccount, ensureAuth, gcloudJson, login } from "./gcloud.js";
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
dbridge status                running proxies
dbridge open                  reopen the GUI on a running proxy
dbridge open prod speeral
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

async function init(existing) {
  if (!process.stdin.isTTY) throw new Error("dbridge init must be run in a terminal.");
  await ensureTools();
  await ensureAuth();
  if (existing) {
    const answer = await ask("A configuration already exists. Replace it? [y/N] ");
    if (!/^y(es)?$/i.test(answer)) return existing;
  }
  const projects = await gcloudJson(["projects", "list", "--format=json"]);
  const usable = (Array.isArray(projects) ? projects : []).filter((project) => project.projectId);
  if (!usable.length) throw new Error("No GCP project is visible with this account.");
  const indexes = await chooseMany(
    "Projects",
    usable.map((project) => `${project.projectId}  ${project.name || ""}`.trim()),
  );
  const environments = [];
  for (const index of indexes) {
    const project = usable[index];
    const suggestedId = slug(project.projectId) || "project";
    const id = (await ask(`Short id for ${project.projectId} [${suggestedId}]: `)) || suggestedId;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid id: ${id}`);
    const suggestedLabel = project.name || id;
    const label = (await ask(`Label [${suggestedLabel}]: `)) || suggestedLabel;
    environments.push({ id, label, project: project.projectId });
  }
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
  await ensureTools();
  const config = await loadConfig();
  if (config) return config;
  console.log("First run. Configuring projects and the interface.");
  return init(null);
}

async function cmdStart(args) {
  const config = await requireConfig();
  await ensureAuth();
  const catalog = await loadCatalog(config);
  if (args.length === 0) {
    const index = await choose("Environment", config.environments.map((env) => env.label));
    const env = envFromCatalog(catalog, config.environments[index].id);
    const row = await pickDatabase(config, env);
    await launch(config, env, row.instance, row.database);
    return;
  }
  if (args.length === 1) {
    const env = envFromCatalog(catalog, args[0]);
    const row = await pickDatabase(config, env);
    await launch(config, env, row.instance, row.database);
    return;
  }
  if (args.length === 2) {
    const { env, instance, database } = findTarget(catalog, args[0], args[1]);
    await launch(config, env, instance, database);
    return;
  }
  throw new Error("Usage: dbridge start [prod speeral]");
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
  const proxies = await reconcileProxies();
  const items = Object.entries(proxies);
  if (!items.length) {
    console.log("No proxy is running.");
    return;
  }
  if (args.length === 2) {
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
