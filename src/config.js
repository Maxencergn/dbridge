import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { configDir, configFile } from "./paths.js";

export function isSystemDatabase(name) {
  return name === "postgres" || name.startsWith("prisma_") || name === "cloudsqladmin";
}

export async function loadConfig() {
  try {
    const config = JSON.parse(await fs.readFile(configFile, "utf8"));
    if (!Array.isArray(config.environments) || config.environments.length === 0) return null;
    return config;
  } catch {
    return null;
  }
}

export async function saveConfig(config) {
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`);
}

export function sortDatabases(names, preferred = []) {
  const rank = (name) => {
    const index = preferred.indexOf(name);
    if (index >= 0) return [0, index];
    if (isSystemDatabase(name)) return [2, name];
    return [1, name];
  };
  return [...names].sort((left, right) => {
    const a = rank(left);
    const b = rank(right);
    if (a[0] !== b[0]) return a[0] - b[0];
    if (typeof a[1] === "number" && typeof b[1] === "number") return a[1] - b[1];
    return String(a[1]).localeCompare(String(b[1]));
  });
}

export function defaultInterface() {
  if (process.platform === "darwin") {
    return { name: "Default application", command: ["open", "{url}"] };
  }
  if (process.platform === "win32") {
    return { name: "Default application", command: ["cmd", "/c", "start", "", "{url}"] };
  }
  return { name: "Default application", command: ["xdg-open", "{url}"] };
}

export function detectInterfaces() {
  const interfaces = [];
  if (process.platform === "darwin") {
    for (const name of ["Beekeeper Studio", "TablePlus", "DBeaver"]) {
      if (!existsSync(`/Applications/${name}.app`)) continue;
      interfaces.push({
        name,
        command: ["open", "-a", name, "{url}"],
        warmup: name === "Beekeeper Studio" ? ["open", "-a", name] : undefined,
        processName: name === "Beekeeper Studio" ? name : undefined,
      });
    }
  }
  interfaces.push(defaultInterface());
  interfaces.push({ name: "Show the URL", command: null });
  return interfaces;
}

export function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}
