import os from "node:os";
import path from "node:path";

export const home = os.homedir();
export const configDir = path.join(home, ".config", "dbridge");
export const configFile = path.join(configDir, "config.json");
export const stateDir = path.join(home, ".local", "state", "dbridge");
export const logDir = path.join(stateDir, "logs");
export const stateFile = path.join(stateDir, "proxies.json");
export const catalogFile = path.join(stateDir, "catalog.json");
export const toolsDir = path.join(home, ".local", "share", "dbridge", "tools");
