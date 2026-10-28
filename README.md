# dbridge

Ouvre une base Cloud SQL à travers un proxy local, dans l'interface que tu choisis. Le paquet ne stocke aucun mot de passe : la session Google de la machine authentifie la connexion.

## Installation

Node.js 20 ou plus récent est requis.

```bash
git clone https://github.com/maxence-speeral/dbridge.git
cd dbridge
npm link
```

Au premier `dbridge start`, `gcloud` et `cloud-sql-proxy` sont téléchargés dans `~/.local/share/dbridge/tools` s'ils ne sont pas déjà installés. Les archives officielles sont vérifiées par leur somme SHA256.

## Première utilisation

`dbridge start` enchaîne le setup s'il n'y a pas encore de configuration :

1. installation de `gcloud` et `cloud-sql-proxy` s'ils manquent ;
2. connexion Google dans le navigateur ;
3. choix des projets GCP ;
4. choix de l'interface (Beekeeper Studio, TablePlus, DBeaver, l'application enregistrée pour `postgresql://`, ou l'affichage de l'URL).

La configuration est écrite dans `~/.config/dbridge/config.json`. `dbridge init` la refait.

Le compte Google doit déjà exister comme utilisateur Cloud SQL IAM, avec les droits voulus sur les bases. dbridge peut créer l'utilisateur IAM, il n'accorde pas les droits sur les tables.

## Commandes

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

Le proxy reste lancé après la fermeture du terminal. `dbridge stop` l'arrête.

macOS, Windows et Linux utilisent le même paquet. L'ouverture de l'interface passe par la commande enregistrée dans la configuration.
