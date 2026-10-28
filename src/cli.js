import { envFromCatalog, findTarget, loadCatalog } from "./catalog.js";
import { detectInterfaces, isSystemDatabase, loadConfig, saveConfig, slug } from "./config.js";
import { activeAccount, ensureAuth, gcloudJson, login } from "./gcloud.js";
import { ask, choose, chooseMany } from "./menu.js";
import { openInterface } from "./open.js";
import { configFile } from "./paths.js";
import { ensureIamUser, proxyLabel, reconcileProxies, rememberDatabase, startProxy, stopProxy } from "./proxy.js";
import { portOpen } from "./process.js";
import { ensureTools } from "./tools.js";

const HELP = `dbridge list                  commandes
dbridge init                  configure les projets et l'interface
dbridge login                 connexion Google
dbridge start                 choisit un environnement et une base
dbridge start prod
dbridge start prod speeral
dbridge status                proxys en cours
dbridge open                  rouvre l'interface sur un proxy en cours
dbridge open prod speeral
dbridge stop                  arrête un proxy
dbridge stop all
dbridge stop prod speeral
`;

function printConnection(env, instanceName, database, started) {
  console.log();
  console.log(`${env.label} · ${instanceName} · ${database}`);
  console.log(`proxy ${started.reused ? "déjà lancé" : "lancé"}`);
  console.log("host      127.0.0.1");
  console.log(`port      ${started.port}`);
  console.log(`database  ${database}`);
  console.log("ssl       désactivé");
  console.log("Le proxy reste lancé après la fermeture du terminal. dbridge stop pour l'arrêter.");
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
    if (!rows.length) throw new Error(`Aucune base sur ${env.label}.`);
    const proxies = await reconcileProxies();
    const labels = rows.map((row) => {
      const proxy = proxies[row.instance.connectionName];
      const port = proxy ? `  :${proxy.port}` : "";
      return `${row.database.padEnd(22)} ${row.instance.instance}${port}`;
    });
    if (!includeSystem) labels.push("Afficher les bases système");
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
  if (!account) throw new Error("Aucun compte gcloud actif. Lance : dbridge login");
  await ensureIamUser(instance.connectionName, account);
  const started = await startProxy(instance.connectionName, env);
  await rememberDatabase(instance.connectionName, database);
  printConnection(env, instance.instance, database, started);
  await openInterface(account, started.port, database, config.interface);
}

async function init(existing) {
  if (!process.stdin.isTTY) throw new Error("dbridge init doit être lancé dans un terminal.");
  await ensureTools();
  await ensureAuth();
  if (existing) {
    const answer = await ask("Une configuration existe. La remplacer ? [o/N] ");
    if (!/^o(ui)?$/i.test(answer)) return existing;
  }
  const projects = await gcloudJson(["projects", "list", "--format=json"]);
  const usable = (Array.isArray(projects) ? projects : []).filter((project) => project.projectId);
  if (!usable.length) throw new Error("Aucun projet GCP visible avec ce compte.");
  const indexes = await chooseMany(
    "Projets",
    usable.map((project) => `${project.projectId}  ${project.name || ""}`.trim()),
  );
  const environments = [];
  for (const index of indexes) {
    const project = usable[index];
    const suggestedId = slug(project.projectId) || "projet";
    const id = (await ask(`Identifiant court pour ${project.projectId} [${suggestedId}] : `)) || suggestedId;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Identifiant invalide : ${id}`);
    const suggestedLabel = project.name || id;
    const label = (await ask(`Libellé [${suggestedLabel}] : `)) || suggestedLabel;
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
  console.log(`Configuration écrite dans ${configFile}`);
  return config;
}

async function requireConfig() {
  await ensureTools();
  const config = await loadConfig();
  if (config) return config;
  console.log("Première utilisation. Configuration des projets et de l'interface.");
  return init(null);
}

async function cmdStart(args) {
  const config = await requireConfig();
  await ensureAuth();
  const catalog = await loadCatalog(config);
  if (args.length === 0) {
    const index = await choose("Environnement", config.environments.map((env) => env.label));
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
  throw new Error("Utilise : dbridge start [prod speeral]");
}

function describe(config, name, proxy) {
  const env = config?.environments?.find((item) => item.id === proxy.env);
  const label = env?.label || proxy.env || "";
  const database = proxy.database || "base non précisée";
  return `${label} · ${proxy.instance || name} · ${database} · :${proxy.port}`;
}

async function cmdStatus() {
  const proxies = await reconcileProxies();
  const names = Object.keys(proxies);
  if (!names.length) {
    console.log("Aucun proxy en cours.");
    return;
  }
  const config = await loadConfig();
  for (const name of names) console.log(describe(config, name, proxies[name]));
}

async function reopen(config, connectionName, proxy, database) {
  const account = await activeAccount();
  if (!account) throw new Error("Aucun compte gcloud actif. Lance : dbridge login");
  if (!(await portOpen(proxy.port))) throw new Error("Ce proxy ne répond plus. Relance-le avec dbridge start.");
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
    console.log("Aucun proxy en cours.");
    return;
  }
  if (args.length === 2) {
    const catalog = await loadCatalog(config);
    const { instance, database } = findTarget(catalog, args[0], args[1]);
    const proxy = proxies[instance.connectionName];
    if (!proxy) throw new Error(`Aucun proxy pour ${instance.instance}. Lance : dbridge start ${args[0]} ${database}`);
    await reopen(config, instance.connectionName, proxy, database);
    return;
  }
  if (args.length) throw new Error("Utilise : dbridge open [prod speeral]");
  if (items.length === 1) {
    const [name, proxy] = items[0];
    if (!proxy.database) throw new Error("Base inconnue pour ce proxy. Précise : dbridge open prod speeral");
    await reopen(config, name, proxy, proxy.database);
    return;
  }
  const choice = await choose("Rouvrir", items.map(([name, proxy]) => describe(config, name, proxy)));
  const [name, proxy] = items[choice];
  if (!proxy.database) throw new Error("Base inconnue pour ce proxy. Précise : dbridge open prod speeral");
  await reopen(config, name, proxy, proxy.database);
}

async function cmdStop(args) {
  if (args.length === 1 && args[0] === "all") {
    const proxies = await reconcileProxies();
    const names = Object.keys(proxies);
    for (const name of names) await stopProxy(name);
    console.log(names.length ? "Proxys arrêtés." : "Aucun proxy en cours.");
    return;
  }
  if (args.length === 2) {
    const config = await requireConfig();
    const catalog = await loadCatalog(config);
    const { instance } = findTarget(catalog, args[0], args[1]);
    await stopProxy(instance.connectionName);
    console.log(`Proxy arrêté pour ${instance.instance}.`);
    return;
  }
  if (args.length) throw new Error("Utilise : dbridge stop [all | prod speeral]");
  const proxies = await reconcileProxies();
  const items = Object.entries(proxies);
  if (!items.length) {
    console.log("Aucun proxy en cours.");
    return;
  }
  const choice = await choose("Arrêter", items.map(([name, proxy]) => proxyLabel(name, proxy)));
  await stopProxy(items[choice][0]);
  console.log("Proxy arrêté.");
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
    console.log(account || "Connecté.");
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
