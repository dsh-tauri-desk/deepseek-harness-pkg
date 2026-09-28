<p align="center">
  <a href="https://github.com/dsh-tauri/deepseek-harness-pkg">
    <img src="public/favicon.svg" width="112" alt="DeepSeek Harness Pkg" />
  </a>
</p>

<h1 align="center">DeepSeek Harness Pkg</h1>

<p align="center">
  <em>Prebuilt, cross-platform packages for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> (<code>dsh</code>) — pinned, patched, and auto-synced from upstream, built by GitHub Actions.</em>
</p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/%40deepseek-ai%2Fdsh?style=flat-square&label=dsh" alt="dsh" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-black?style=flat-square" alt="Windows | macOS | Linux" />
  <img src="https://img.shields.io/badge/pnpm-11-4D6BFE?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm 11" />
  <img src="https://img.shields.io/badge/Node.js-22.19%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22.19+" />
  <img src="https://img.shields.io/github/downloads/dsh-tauri/deepseek-harness-pkg/total?style=flat-square&label=downloads&color=4D6BFE" alt="Downloads" />
</p>
> **Status: developer preview.** The upstream `dsh` is still iterating rapidly with compatibility-breaking changes; this repository tracks it closely and rebuilds automatically.

## What Is This?

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) is an open-source agent harness with a CLI, a web UI, and a plugin architecture. Setting it up normally means installing Node.js and pnpm and building from source.

This repository (inspired by [n8n-pkg](https://github.com/hairyf/n8n-pkg)) removes that friction: it pins an upstream npm release, patches the dependency closure, and publishes ready-to-run `node_modules` bundles for Windows, macOS (Apple Silicon + Intel), and Linux. Consumers just download a zip from the [Releases](https://github.com/dsh-tauri/deepseek-harness-pkg/releases) page, unzip, and run `dsh web`.

## Features

| | |
| --- | --- |
| **Pinned & reproducible** | A pnpm workspace pins a single upstream version (`@deepseek-ai/dsh`), with a committed lockfile. |
| **Patched dependency closure** | A build-time script applies a LAN-access switch to `dsh web` inside the dependency closure. |
| **Cross-platform artifacts** | CI builds bundles for Windows, macOS (arm64 + x64), and Linux and publishes them as GitHub Releases. |
| **Auto-sync with upstream** | A scheduled workflow watches npm for new `dsh` versions and triggers a rebuild automatically. |
| **Self-contained output** | Each artifact is a plain npm project — unzip, run the `dsh` binary inside `node_modules`, done. |

## Quick Start

1. Download the artifact for your platform from the [Releases](https://github.com/dsh-tauri/deepseek-harness-pkg/releases) page.
2. Unzip the archive.
3. Run:

```sh
# Windows
node_modules\.bin\dsh.cmd web

# macOS / Linux
./node_modules/.bin/dsh web
```

The web UI opens at `http://127.0.0.1:3080`. On first use, configure a model provider (API key) in the UI — see the [official DeepSeek Harness docs](https://github.com/deepseek-ai/deepseek-harness).

> Requirements: Node.js `>=22.19.0` (CI builds use 22.22.0). The artifact is a plain npm project, so no global pnpm installation is needed.

## Repository Structure

```text
.
├── .github/workflows/
│   ├── release.yml                 # npm-based cross-platform build + release
│   ├── release-from-source.yml     # source build + pre-release for GitHub-only versions
│   ├── sync-release.yml            # scheduled npm check that auto-triggers builds
│   └── sync-source-release.yml     # scheduled GitHub Release check for source builds
├── scripts/
│   ├── apply-dsh-web-app-patch.mjs               # idempotent LAN-switch patch (fails loudly if the upstream guard changes)
│   ├── apply-pi-ai-codex-error-patch.mjs         # sanitizes upstream HTML Codex errors
│   ├── check-artifact-size.mjs                   # reports release asset sizes (never blocks)
│   ├── check-dsh-installable.mjs                 # resolves the whole dependency closure before fanning out builds
│   ├── check-workflows.mjs                       # local self-check of .github/workflows/*.yml
│   ├── selftest-check-workflows.mjs              # reverse tests for check-workflows.mjs
│   ├── delete-stale-drafts.mjs                   # clears leftover draft releases so re-runs are idempotent
│   ├── prune-node-modules.mjs                    # slims node_modules before packaging + size report
│   ├── resolve-latest-dsh-version.mjs            # semver-highest published npm version across all dist-tags
│   ├── resolve-latest-github-release-version.mjs # semver-highest upstream GitHub Release version
│   ├── wait-for-npm-version.mjs                  # polls npm until a just-published version's tarball is downloadable
│   └── zip-footprint.mjs                         # size breakdown of a built zip (read-only)
├── public/
│   └── favicon.svg                 # README logo
├── pnpm-workspace.yaml             # nodeLinker / build policy (pnpm 11 settings)
├── package.json                    # pinned @deepseek-ai/dsh version
└── pnpm-lock.yaml                  # lockfile
```

## Local Build

Requirements: Node.js `>=22.19` (recommended 24), pnpm `11.x` (the repo declares `packageManager: pnpm@11.7.0`).

```sh
pnpm install            # install dependencies
pnpm start              # run dsh web directly (http://127.0.0.1:3080)
pnpm build              # produce the prod deployment directory build_dir/
```

## Release

Open the repository's Actions page and manually trigger **Build and Release DeepSeek Harness**:

- `dsh_version` (required): the dsh version to package. The Actions form pre-fills the literal default declared in `release.yml`; `package.json` pins the version this repository currently tracks. Use `latest` or another explicit version when needed.

The build creates a GitHub Release named `dsh-<version>-<run_id>` with four platform zips:

| Platform | Artifact |
| --- | --- |
| Windows | `deepseek-harness-pkg-windows.zip` |
| macOS (Apple Silicon) | `deepseek-harness-pkg-macos-arm64.zip` |
| macOS (Intel) | `deepseek-harness-pkg-macos-x64.zip` |
| Linux | `deepseek-harness-pkg-linux.zip` |

## Patches

### dsh-web-app: LAN access (default off)

Upstream `dsh web` rejects `--host 0.0.0.0` for security reasons (it would expose the remote-code-execution surface to the network). A build-time patch script (`scripts/apply-dsh-web-app-patch.mjs`) turns this into an **explicit environment-variable switch**:

```sh
# still rejected by default
dsh web --host 0.0.0.0            # error

# allow explicitly after acknowledging the risk (dangerous: exposes local RCE to the network)
DSH_PKG_ALLOW_LAN=1 dsh web --host 0.0.0.0 --trusted-host <LAN-IP>:3080
```

> ⚠️ Security warning: `--host 0.0.0.0` lets any device on your LAN access your sessions and tool execution. Use it only in trusted networks and pair it with `--trusted-host` to restrict the `/api` trust domain.

### pi-ai: bounded Codex edge errors

OpenAI or Cloudflare may return an HTML block page from the Codex endpoint. Upstream pi-ai otherwise forwards that complete page—including markup and the client IP—as the model error. `scripts/apply-pi-ai-codex-error-patch.mjs` preserves normal JSON/text provider errors, but replaces HTML responses with a bounded diagnostic containing the HTTP status and a sanitized Ray ID when available.

### How the patches are applied

`scripts/apply-dsh-web-app-patch.mjs` is applied idempotently during packaging (see the "Apply runtime patches" step in `release.yml` / `release-from-source.yml`): it only needs the upstream guard line to exist, and fails loudly with a message to update the script if upstream changes it. There is no pnpm `patchedDependencies` entry anymore — the previous `patches/dsh-web-app@0.1.0-rc.6.patch` was removed when it went stale.

## Auto-sync Upstream Releases

The repository has two complementary scheduled workflows:

- **npm path — `sync-release.yml`**: checks every 6 hours and can also be triggered manually. It resolves the **semver-highest published version** through `scripts/resolve-latest-dsh-version.mjs`, covering all npm dist-tags (`latest`, `next`, …), then calls `release.yml`. After a successful npm release it updates `main` and the lockfile.
- **GitHub-only path — `sync-source-release.yml`**: checks every 6 hours whether the semver-highest upstream GitHub Release is newer than npm `@deepseek-ai/dsh`. If npm has not published that version yet, it calls `release-from-source.yml`, which clones the exact `dsh-v<version>` tag, runs `pnpm install` and `pnpm run build`, deploys the built workspace closure, and publishes four platform archives as a GitHub **pre-release**. These source pre-releases do not update `main`, because the version is not installable from npm yet.
- **Idempotency**: source releases use `dsh-src-<version>-<run_id>` tags. The source watcher skips a version already released this way, while the npm watcher ignores pre-releases so the two paths do not trigger each other repeatedly.
- **Publication propagation**: a freshly published version can show up in the npm packument before its tarball is downloadable, which makes `pnpm add` fail with `ERR_PNPM_FETCH_404`. `release.yml` therefore runs a `preflight` job first — `scripts/wait-for-npm-version.mjs` polls the tarball URL (up to 10 minutes) and only then fans out to the four platform builds.
- **Partial publishes**: upstream publishes ~150 `@deepseek-ai/dsh-*` sub-packages per release. The root package's packument and tarball can be live while sub-packages are still missing, which fails with `ERR_PNPM_NO_MATCHING_VERSION` (run `36424634893`: `dsh-client-ui-settings-account@0.2.0-rc.1` landed ~2 minutes after the sync picked the version). So `preflight` also runs `scripts/check-dsh-installable.mjs`, which installs the version in a scratch directory (`pnpm install --ignore-scripts`) with bounded retries before the matrix starts.
- **Patch tolerance**: `scripts/apply-dsh-web-app-patch.mjs` idempotently re-applies the LAN switch to the shipped `dsh-web-app`; if upstream changes the relevant guard, it fails loudly with a message to update the script.

For a manual source build, trigger **Build and Pre-release DeepSeek Harness from Source** and provide the upstream release version, without the `dsh-v` prefix (for example `0.1.2-alpha.1`).

Workflow reference:

```mermaid
flowchart LR
    N[npm @deepseek-ai/dsh highest published version] --> S[sync-release.yml every 6h]
    S -->|new npm version| R[release.yml workflow_call]
    GHR[Upstream GitHub Release] --> SS[sync-source-release.yml every 6h]
    SS -->|new version not on npm| SR[release-from-source.yml workflow_call]
    R --> W[Windows build]
    SR --> W
    R --> M[macOS arm64 build]
    SR --> M
    R --> I[macOS x64 build]
    SR --> I
    R --> L[Linux build]
    SR --> L
    W --> G[GitHub Release]
    M --> G
    I --> G
    L --> G
    SR --> PR[GitHub pre-release]
```

## Security Notes

- This project is for personal learning, research, and testing only — please do not use it commercially.
- `dsh` is an agent harness with **local code execution capability**. Run it only in a trusted, isolated environment, and never import untrusted configurations or plugins from unknown sources.
- The LAN-access patch (`DSH_PKG_ALLOW_LAN=1`) is dangerous by design — only enable it on trusted networks.
- The developers are not liable for any data loss or security issues arising from the use of this project.

## Related Projects

| Project | Purpose |
| --- | --- |
| [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | The upstream `dsh` (CLI + web UI + plugin architecture) |
| [deepseek-harness-desktop](https://github.com/dsh-tauri/deepseek-harness-desktop) | One-click desktop app that consumes these prebuilt bundles |
| [n8n-pkg](https://github.com/hairyf/n8n-pkg) | Reference packaging repository this project is based on |

## Acknowledgements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — the upstream project
- [n8n-pkg](https://github.com/hairyf/n8n-pkg) — the packaging pattern
- [pnpm](https://pnpm.io/) — workspace, patching, and deploy tooling
- [GitHub Actions](https://github.com/features/actions) — cross-platform CI builds and releases
