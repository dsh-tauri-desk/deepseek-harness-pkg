<p align="center">
  <a href="https://github.com/dsh-tauri/deepseek-harness-pkg">
    <img src="public/favicon.svg" width="112" alt="DeepSeek Harness Pkg" />
  </a>
</p>

<h1 align="center">DeepSeek Harness Pkg</h1>

<p align="center">
  <em>Cross-platform production dependency bundles for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> (<code>dsh</code>) — pinned and auto-synced by GitHub Actions.</em>
</p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/%40deepseek-ai%2Fdsh?style=flat-square&label=dsh" alt="dsh" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-black?style=flat-square" alt="Windows | macOS | Linux" />
  <img src="https://img.shields.io/badge/Node.js-22.19%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22.19+" />
  <img src="https://img.shields.io/github/downloads/dsh-tauri/deepseek-harness-pkg/total?style=flat-square&label=downloads&color=4D6BFE" alt="Downloads" />
</p>

> **Developer preview.** Upstream changes rapidly and may break compatibility.

## Quick start

These ZIPs contain production npm dependencies for the `dsh` CLI and web UI, not a Node.js binary or a desktop installer.

**Requirements:** external Node.js `>=22.19.0` on `PATH` (CI uses `22.22.0`); no global pnpm installation is needed to use a ZIP.

Download the matching ZIP from [Releases](https://github.com/dsh-tauri/deepseek-harness-pkg/releases), extract it, and open a terminal in the extracted root.

| Platform | ZIP |
| --- | --- |
| Windows | `deepseek-harness-pkg-windows.zip` |
| macOS (Apple Silicon) | `deepseek-harness-pkg-macos-arm64.zip` |
| macOS (Intel) | `deepseek-harness-pkg-macos-x64.zip` |
| Linux | `deepseek-harness-pkg-linux.zip` |

Windows (PowerShell):

```powershell
.\node_modules\.bin\dsh.cmd web
```

macOS / Linux:

```sh
./node_modules/.bin/dsh web
```

The default address is `http://127.0.0.1:3080`; follow the CLI's authenticated access instructions. Configure a model provider/API key in the UI; see the [upstream docs](https://github.com/deepseek-ai/deepseek-harness).

## Local build

For maintainers: Node.js `>=22.19.0` and pnpm `11.7.0`, as declared in [package.json](<package.json>). The current `@deepseek-ai/dsh` pin is `0.2.1-alpha.1`; the desktop app selects its own compatible core version.

```sh
pnpm install
pnpm start              # Run dsh web using repository dependencies
pnpm build              # Deploy production dependencies to build_dir/
```

`pnpm build` deploys upstream production dependencies to `build_dir/` without rewriting runtime code; `pnpm start` does not run that deployed output. See the [workspace/build policy](<pnpm-workspace.yaml>) for dependency layout and install-script settings.

## Releases and synchronization

Both sync workflows run every **6 hours** and support manual inputs: optional `version` (empty = automatic selection) and `force` (default `false`) to rebuild.

| Workflow | Input / selection | Result |
| --- | --- | --- |
| [release.yml](<.github/workflows/release.yml>) | Required `dsh_version`: an npm version or `latest`; form default `0.1.2-rc.1` is not the current pin. | Four ZIPs; regular release `dsh-<version>-<run_id>` (`<version>` uses the input verbatim). |
| [sync-release.yml](<.github/workflows/sync-release.yml>) | Highest semver among all published npm versions, covering all dist-tags, not only `latest`. | Calls the npm release workflow; updates `main`'s manifest and lockfile only after successful publication. |
| [release-from-source.yml](<.github/workflows/release-from-source.yml>) | Required `dsh_version` without `dsh-v`; clones the exact `dsh-v<version>` tag and builds/deploys its runtime closure. | Four ZIPs; pre-release `dsh-src-<version>-<run_id>`; does not update `main`. |
| [sync-source-release.yml](<.github/workflows/sync-source-release.yml>) | Highest upstream GitHub release version newer than the highest npm version. | Calls the source workflow; skips an existing source pre-release unless forced. |

npm preflight [waits for the actual tarball](<scripts/wait-for-npm-version.mjs>) for up to 10 minutes. It then [installs the complete dependency closure](<scripts/check-dsh-installable.mjs>) with `pnpm install --ignore-scripts` and bounded retries before starting the four-platform matrix.

Both release paths [prune the output](<scripts/prune-node-modules.mjs>) and verify four uploaded ZIP assets. [Size reports](<scripts/check-artifact-size.mjs>) are informational, not release gates.

## Runtime compatibility

Local builds and both release paths preserve upstream runtime code. The former LAN override and Codex HTML-error patches have been removed so optional customizations do not block packaging when upstream code changes. Host safety checks and provider error formatting now follow the bundled upstream versions. Codex errors may therefore include raw HTML edge-response bodies; treat error logs as potentially sensitive.

For LAN access, consult the bundled CLI's help for its version-specific flags. Recent upstream releases require one concrete local IPv4 or IPv6 address rather than a wildcard such as `0.0.0.0`; the former LAN opt-in environment variable no longer overrides that policy.

`--trusted-host` limits host trust, not authentication. Keep upstream access credentials private and enable LAN access only on trusted networks.

## Security and use

- For personal learning, research, and testing only; please do not use commercially.
- `dsh` can execute local code: use a trusted, isolated environment and avoid untrusted configurations or plugins.
- LAN exposure increases risk; never expose the service to untrusted networks or share access tokens.
- Developers are not liable for data loss or security issues arising from use.

## Related projects and credits

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is the upstream CLI/web/plugin project; [DeepSeek Harness Desktop](https://github.com/dsh-tauri/deepseek-harness-desktop) consumes these bundles as a desktop app.

Thanks to [n8n-pkg](https://github.com/hairyf/n8n-pkg) for the packaging pattern, [pnpm](https://pnpm.io/) for dependency/deploy tooling, and [GitHub Actions](https://github.com/features/actions) for cross-platform builds.
