# dbridge

Open a Cloud SQL database through a local proxy, or a Postgres server already running on the machine, in the GUI you choose. Cloud SQL uses the machine's Google session. dbridge does not store those passwords.

## Installation

Node.js is not required. The installers download one program for your system.

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Maxencergn/dbridge/main/install.sh | sh
```

Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/Maxencergn/dbridge/main/install.ps1 | iex
```

macOS and Linux install `~/.local/bin/dbridge`. Windows installs `%LOCALAPPDATA%\dbridge\dbridge.exe` and adds that folder to your user PATH. On the first `dbridge start`, `gcloud` and `cloud-sql-proxy` are downloaded into `~/.local/share/dbridge/tools` if they are not already installed. Official archives are checked against their SHA256 checksum.

## First run

`dbridge start` runs setup when there is no configuration yet:

1. install `gcloud` and `cloud-sql-proxy` if they are missing;
2. Google sign-in in the browser;
3. pick the GCP projects;
4. optionally add a local Postgres server;
5. pick the interface (Beekeeper Studio, TablePlus, DBeaver, the app registered for `postgresql://`, or print the URL).

The configuration is written to `~/.config/dbridge/config.json`. `dbridge init` rewrites it.

The Google account must already exist as a Cloud SQL IAM user, with the rights you want on the databases. dbridge can create the IAM user. It does not grant table privileges.

## Local Postgres

A local environment has no GCP project. `dbridge start` connects to it directly: no `gcloud`, no proxy.

```json
{
  "id": "local",
  "label": "Local",
  "host": "127.0.0.1",
  "port": 5432,
  "user": "postgres",
  "password": "postgres"
}
```

`dbridge start local` lists the databases on that server. `psql` must be installed. The password stays in the config file because the GUI needs it.

## Commands

```text
dbridge list
dbridge init
dbridge login
dbridge start
dbridge start prod
dbridge start prod speeral
dbridge start local
dbridge start local speeral
dbridge status
dbridge open
dbridge open prod speeral
dbridge open local speeral
dbridge stop
dbridge stop all
dbridge stop prod speeral
```

The proxy keeps running after the terminal closes. `dbridge stop` stops it.

macOS, Windows, and Linux use the same commands. The interface is opened with the command stored in the configuration.

## From source

Running the source directly needs Node.js 20 or newer, or [Bun](https://bun.sh).

```bash
git clone https://github.com/Maxencergn/dbridge.git
cd dbridge
node bin/dbridge.js list
```

`sh script/build.sh` builds the standalone programs into `dist/`. That step needs Bun.
