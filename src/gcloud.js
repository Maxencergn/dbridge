import { gcloudBin } from "./tools.js";
import { run } from "./process.js";

export function cleanGcloudError(text) {
  const lines = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("WARNING:")) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line.startsWith("ERROR:")) skipping = false;
      else continue;
    }
    lines.push(line);
  }
  const cleaned = lines.join("\n").trim();
  if (cleaned.includes("Reauthentication failed") || cleaned.includes("problem refreshing your current auth")) {
    return "The gcloud session has expired. Run: dbridge login";
  }
  return cleaned || "gcloud failed.";
}

function parseJson(stdout) {
  const text = stdout.trim();
  const starts = [text.indexOf("["), text.indexOf("{")].filter((index) => index >= 0);
  if (!starts.length) throw new Error(text || "empty gcloud response");
  return JSON.parse(text.slice(Math.min(...starts)));
}

export async function gcloud(args, timeout = 90_000) {
  const bin = await gcloudBin();
  if (!bin) throw new Error("gcloud was not found. Run: dbridge start");
  const result = await run(bin, args, { timeout });
  if (result.code !== 0) throw new Error(cleanGcloudError(result.stderr || result.stdout));
  return result.stdout;
}

export async function gcloudJson(args, timeout = 90_000) {
  return parseJson(await gcloud(args, timeout));
}

export async function activeAccount() {
  try {
    const stdout = await gcloud(["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"], 20_000);
    return stdout.trim().split(/\r?\n/).find(Boolean) || null;
  } catch {
    return null;
  }
}

async function tokenOk() {
  const bin = await gcloudBin();
  if (!bin) return false;
  const result = await run(bin, ["auth", "print-access-token"], { timeout: 25_000 });
  return result.code === 0 && Boolean(result.stdout.trim());
}

async function adcOk() {
  const bin = await gcloudBin();
  if (!bin) return false;
  const result = await run(bin, ["auth", "application-default", "print-access-token"], { timeout: 25_000 });
  return result.code === 0 && Boolean(result.stdout.trim());
}

export async function login() {
  const bin = await gcloudBin();
  if (!bin) throw new Error("gcloud was not found.");
  const account = await activeAccount();
  const args = ["auth", "login", "--launch-browser", "--force", "--update-adc"];
  if (account) args.splice(2, 0, account);
  const result = await run(bin, args, { timeout: 300_000 });
  if (result.code !== 0) throw new Error("gcloud sign-in was interrupted.");
}

export async function ensureAuth() {
  if (!(await tokenOk())) {
    if (!process.stdin.isTTY) throw new Error("The gcloud session has expired. Run: dbridge login");
    console.log("The gcloud session has expired. Opening Google sign-in…");
    await login();
    if (!(await tokenOk())) throw new Error("The gcloud session is still invalid.");
  }
  if (await adcOk()) return activeAccount();
  if (!process.stdin.isTTY) throw new Error("Local Google credentials have expired. Run: dbridge login");
  console.log("The proxy needs a local Google sign-in. Opening the browser…");
  const bin = await gcloudBin();
  const result = await run(bin, ["auth", "application-default", "login"], { timeout: 300_000 });
  if (result.code !== 0 || !(await adcOk())) throw new Error("Local Google sign-in did not complete.");
  return activeAccount();
}
