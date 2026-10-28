# dbridge

Open a Cloud SQL database through a local proxy, in the GUI you choose. The package stores no passwords: the machine's Google session authenticates the connection.

## Installation

Node.js 20 or newer is required.

```bash
git clone https://github.com/Maxencergn/dbridge.git
cd dbridge
npm link
```

On the first `dbridge start`, `gcloud` and `cloud-sql-proxy` are downloaded into `~/.local/share/dbridge/tools` if they are not already installed. Official archives are checked against their SHA256 checksum.

## First run

`dbridge start` runs setup when there is no configuration yet:

1. install `gcloud` and `cloud-sql-proxy` if they are missing;
2. Google sign-in in the browser;
3. pick the GCP projects;
4. pick the interface (Beekeeper Studio, TablePlus, DBeaver, the app registered for `postgresql://`, or print the URL).

The configuration is written to `~/.config/dbridge/config.json`. `dbridge init` rewrites it.

The Google account must already exist as a Cloud SQL IAM user, with the rights you want on the databases. dbridge can create the IAM user. It does not grant table privileges.

## Commands

```text
dbridge list
dbridge init
dbridge login
dbridge start
dbridge start prod
dbridge start prod speeral
dbridge status
dbridge open
dbridge open prod speeral
dbridge stop
dbridge stop all
dbridge stop prod speeral
```

The proxy keeps running after the terminal closes. `dbridge stop` stops it.

macOS, Windows, and Linux use the same package. The interface is opened with the command stored in the configuration.
