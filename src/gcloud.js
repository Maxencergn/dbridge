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
    return "La session gcloud a expiré. Lance : dbridge login";
  }
  return cleaned || "gcloud a échoué.";
}

function parseJson(stdout) {
  const text = stdout.trim();
  const starts = [text.indexOf("["), text.indexOf("{")].filter((index) => index >= 0);
  if (!starts.length) throw new Error(text || "réponse gcloud vide");
  return JSON.parse(text.slice(Math.min(...starts)));
}

export async function gcloud(args, timeout = 90_000) {
  const bin = await gcloudBin();
  if (!bin) throw new Error("gcloud est introuvable. Lance : dbridge start");
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
  if (!bin) throw new Error("gcloud est introuvable.");
  const account = await activeAccount();
  const args = ["auth", "login", "--launch-browser", "--force", "--update-adc"];
  if (account) args.splice(2, 0, account);
  const result = await run(bin, args, { timeout: 300_000 });
  if (result.code !== 0) throw new Error("Login gcloud interrompu.");
}

export async function ensureAuth() {
  if (!(await tokenOk())) {
    if (!process.stdin.isTTY) throw new Error("Session gcloud expirée. Lance : dbridge login");
    console.log("Session gcloud expirée. Ouverture du login Google…");
    await login();
    if (!(await tokenOk())) throw new Error("La session gcloud est toujours invalide.");
  }
  if (await adcOk()) return activeAccount();
  if (!process.stdin.isTTY) throw new Error("Identifiants Google locaux expirés. Lance : dbridge login");
  console.log("Le proxy a besoin d'un login Google local. Ouverture du navigateur…");
  const bin = await gcloudBin();
  const result = await run(bin, ["auth", "application-default", "login"], { timeout: 300_000 });
  if (result.code !== 0 || !(await adcOk())) throw new Error("Le login Google local n'a pas abouti.");
  return activeAccount();
}
