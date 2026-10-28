export const PROXY_VERSION = "2.26.2";
export const GCLOUD_VERSION = "590.0.1";

const platformKey = `${process.platform}-${process.arch}`;

export const PROXY_BUILDS = {
  "darwin-arm64": {
    file: "cloud-sql-proxy.darwin.arm64",
    sha256: "8bb59840174bbd7f2c29e740235dd1bbce8eff87082fdec8083b6dc6c9fc76a2",
  },
  "darwin-x64": {
    file: "cloud-sql-proxy.darwin.amd64",
    sha256: "8a2182d3168ce5a46ce0684907af7f723daa07b80f959d8118323735ab1b86e1",
  },
  "linux-arm64": {
    file: "cloud-sql-proxy.linux.arm64",
    sha256: "f93d277d7f14b973c1aa3e6b4727559712789e8a62ccaab89208955203af3de6",
  },
  "linux-x64": {
    file: "cloud-sql-proxy.linux.amd64",
    sha256: "787d23b4b396186f307b6b274c94099d25b15a81b7e60c91ceed18c07558e9d7",
  },
  "win32-x64": {
    file: "cloud-sql-proxy.x64.exe",
    sha256: "41cfddfe79fdb5eb89a42c8c76149384eb1c564cfcaa7369a3261c95a5338b35",
  },
  "win32-arm64": {
    file: "cloud-sql-proxy.x64.exe",
    sha256: "41cfddfe79fdb5eb89a42c8c76149384eb1c564cfcaa7369a3261c95a5338b35",
  },
};

export const GCLOUD_ARCHIVES = {
  "darwin-arm64": {
    file: "google-cloud-cli-590.0.1-darwin-arm.tar.gz",
    sha256: "02f20618f43b9147e049a73fec37ab71b586b0dc6a242fa6ca835229cb5e542f",
  },
  "darwin-x64": {
    file: "google-cloud-cli-590.0.1-darwin-x86_64.tar.gz",
    sha256: "32e41cdb54d3946bcd5d29bd2bd9f3d8923bf1578e8ecc94d0999f2f18f2f0f1",
  },
  "linux-arm64": {
    file: "google-cloud-cli-590.0.1-linux-arm.tar.gz",
    sha256: "fd760d8b1c2c4c484d7b659964994b07aaefddc6ac4350e681940477dbdbb22c",
  },
  "linux-x64": {
    file: "google-cloud-cli-590.0.1-linux-x86_64.tar.gz",
    sha256: "d1ae7be7e12c4e7d8286fab4774f5441020aca89dc7793ddacbace8d11d20f06",
  },
  "win32-x64": {
    file: "google-cloud-sdk-590.0.1-windows-x86_64-bundled-python.zip",
    sha256: "38dad2c60c8507a2042e419ac9293e66b9f96156226c6cda92dcb1c4e8c65cf2",
  },
  "win32-arm64": {
    file: "google-cloud-sdk-590.0.1-windows-x86_64-bundled-python.zip",
    sha256: "38dad2c60c8507a2042e419ac9293e66b9f96156226c6cda92dcb1c4e8c65cf2",
  },
};

export function proxyBuild() {
  const build = PROXY_BUILDS[platformKey];
  if (!build) {
    throw new Error(`cloud-sql-proxy has no binary for ${platformKey}.`);
  }
  return build;
}

export function gcloudArchive() {
  const archive = GCLOUD_ARCHIVES[platformKey];
  if (!archive) {
    throw new Error(`gcloud has no archive for ${platformKey}.`);
  }
  return archive;
}

export function proxyUrl(file) {
  return `https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v${PROXY_VERSION}/${file}`;
}

export function gcloudUrl(file) {
  return `https://storage.googleapis.com/cloud-sdk-release/${file}`;
}
