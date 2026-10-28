import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable, PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GCLOUD_VERSION, gcloudArchive, gcloudUrl, proxyBuild, proxyUrl } from "./checksums.js";
import { toolsDir } from "./paths.js";
import { commandExists, run } from "./process.js";

function bundledGcloud() {
  const name = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  return path.join(toolsDir, "google-cloud-sdk", "bin", name);
}

function bundledProxy() {
  const name = process.platform === "win32" ? "cloud-sql-proxy.exe" : "cloud-sql-proxy";
  return path.join(toolsDir, "bin", name);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function gcloudBin() {
  const bundled = bundledGcloud();
  if (await exists(bundled)) return bundled;
  return commandExists("gcloud");
}

export async function proxyBin() {
  const bundled = bundledProxy();
  if (await exists(bundled)) return bundled;
  return commandExists("cloud-sql-proxy");
}

async function download(url, destination, sha256) {
  if (!sha256) throw new Error(`Missing checksum for ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const hash = createHash("sha256");
  const checker = new PassThrough();
  checker.on("data", (chunk) => hash.update(chunk));
  await pipeline(Readable.fromWeb(response.body), checker, createWriteStream(destination));
  const got = hash.digest("hex");
  if (got !== sha256) {
    await fs.rm(destination, { force: true });
    throw new Error(`Checksum mismatch for ${path.basename(destination)}.`);
  }
}

async function extract(archive) {
  const result = await run("tar", ["-xf", archive, "-C", toolsDir], { timeout: 180_000 });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Extraction failed.");
  }
}

export async function ensureTools() {
  await fs.mkdir(toolsDir, { recursive: true });
  if (!(await gcloudBin())) await installGcloud();
  if (!(await proxyBin())) await installProxy();
  const gcloud = await gcloudBin();
  const proxy = await proxyBin();
  if (!gcloud || !proxy) throw new Error("gcloud or cloud-sql-proxy was not found after installation.");
  return { gcloud, proxy };
}

async function installProxy() {
  const build = proxyBuild();
  const archive = path.join(toolsDir, "bin", path.basename(build.file));
  console.log("Downloading cloud-sql-proxy…");
  await download(proxyUrl(build.file), archive, build.sha256);
  const destination = bundledProxy();
  if (archive !== destination) await fs.rename(archive, destination);
  if (process.platform !== "win32") await fs.chmod(destination, 0o755);
  console.log("cloud-sql-proxy installed.");
}

async function installGcloud() {
  const archiveInfo = gcloudArchive();
  const archive = path.join(toolsDir, archiveInfo.file);
  console.log(`Downloading gcloud ${GCLOUD_VERSION}…`);
  await download(gcloudUrl(archiveInfo.file), archive, archiveInfo.sha256);
  await fs.rm(path.join(toolsDir, "google-cloud-sdk"), { recursive: true, force: true });
  console.log("Extracting gcloud…");
  await extract(archive);
  await fs.rm(archive, { force: true });
  const installer = path.join(toolsDir, "google-cloud-sdk", process.platform === "win32" ? "install.bat" : "install.sh");
  const result =
    process.platform === "win32"
      ? await run("cmd.exe", ["/d", "/s", "/c", installer, "--quiet"], { timeout: 180_000 })
      : await run(
          "bash",
          [installer, "--quiet", "--usage-reporting", "false", "--path-update", "false", "--command-completion", "false"],
          { timeout: 180_000 },
        );
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "gcloud installation failed.");
  }
  console.log("gcloud installed.");
}
