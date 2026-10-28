import { spawn } from "node:child_process";

const PLACEHOLDER_PASSWORD = "iam";

export function postgresUrl(username, port, database) {
  return `postgresql://${encodeURIComponent(username)}:${PLACEHOLDER_PASSWORD}@127.0.0.1:${port}/${encodeURIComponent(database)}?sslmode=disable`;
}

function commandRunning(processName) {
  if (!processName || process.platform === "win32") return false;
  try {
    const result = spawn("pgrep", ["-x", processName], { stdio: "ignore" });
    return new Promise((resolve) => {
      result.on("close", (code) => resolve(code === 0));
      result.on("error", () => resolve(false));
    });
  } catch {
    return false;
  }
}

function launch(command) {
  const [bin, ...args] = command;
  const child = spawn(bin, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

export async function openInterface(email, port, database, iface) {
  const url = postgresUrl(email, port, database);
  if (!iface?.command) {
    console.log(url);
    return;
  }
  if (iface.warmup && iface.processName && !(await commandRunning(iface.processName))) {
    launch(iface.warmup);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !(await commandRunning(iface.processName))) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  launch(iface.command.map((part) => part.replaceAll("{url}", url)));
  console.log(`${iface.name} s'ouvre sur ${database} avec ${email}.`);
}
