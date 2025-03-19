# Trex 

[![Docker Build and Up](https://github.com/data2evidence/trex/actions/workflows/docker-build-push.yml/badge.svg)](https://github.com/data2evidence/trex/actions/workflows/docker-build-push.yml) &nbsp;&nbsp; [![NPM build package](https://github.com/data2evidence/trex/actions/workflows/npm-ci.yml/badge.svg)](https://github.com/data2evidence/trex/actions/workflows/npm-ci.yml)

Trex is the runtime environment of D2E

### Please read the [D2E Setup Guide](https://docs.d2e.sg) to setup D2E and Trex

#### Get in contact

Please [click here](https://discord.gg/5XtHky2BZe) to join us in Discord.

#### Plugin Installation
Endpoints:
- `GET trex/plugins` list installed and available plugins
- `POST trex/plugins/:name` installs the `name` plugin
- `PUT trex/plugins/:name` updates the `name` plugin

Seeding plugins:
- Set the `PLUGINS_SEED` env variable with the list of plugins to be installed on startup

Dev mode:
- Mount the plugins in docker and set `PLUGINS_DEV_PATH` to the folder containing the plugins 

#### Plugin Structure

Plugin metadata is stored in the `package.json` file in the trex section. Supported plugins are:
- ui
- functions
- flow (prefect dataflows)


