<p align="center">
  <a href="https://github.com/dsh-tauri/deepseek-harness-pkg">
    <img src="public/favicon.svg" width="112" alt="DeepSeek Harness Pkg" />
  </a>
</p>

<h1 align="center">DeepSeek Harness Pkg</h1>

<p align="center">
  <em><a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>（<code>dsh</code>）的跨平台生产依赖包 —— 固定版本，由 GitHub Actions 自动同步构建。</em>
</p>

<p align="center">
  <a href="./README.md">English</a> · <strong>中文</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/%40deepseek-ai%2Fdsh?style=flat-square&label=dsh" alt="dsh" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-black?style=flat-square" alt="Windows | macOS | Linux" />
  <img src="https://img.shields.io/badge/Node.js-22.19%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22.19+" />
  <img src="https://img.shields.io/github/downloads/dsh-tauri/deepseek-harness-pkg/total?style=flat-square&label=downloads&color=4D6BFE" alt="Downloads" />
</p>

> **开发者预览。** 上游迭代较快，可能出现不兼容变更。

## 快速开始

ZIP 包含 `dsh` CLI 与 Web UI 的生产 npm 依赖，不含 Node.js 可执行文件，也不是桌面安装包。

**要求：** 自行安装 Node.js `>=22.19.0` 并加入 `PATH`（CI 使用 `22.22.0`）；使用 ZIP 无需全局安装 pnpm。

从 [Releases](https://github.com/dsh-tauri/deepseek-harness-pkg/releases) 下载对应平台的 ZIP，解压后在解压根目录打开终端。

| 平台 | ZIP |
| --- | --- |
| Windows | `deepseek-harness-pkg-windows.zip` |
| macOS（Apple Silicon） | `deepseek-harness-pkg-macos-arm64.zip` |
| macOS（Intel） | `deepseek-harness-pkg-macos-x64.zip` |
| Linux | `deepseek-harness-pkg-linux.zip` |

Windows（PowerShell）：

```powershell
.\node_modules\.bin\dsh.cmd web
```

macOS / Linux：

```sh
./node_modules/.bin/dsh web
```

默认地址为 `http://127.0.0.1:3080`，请遵循 CLI 输出的认证访问指引。在界面中配置模型提供方/API Key，详见[上游文档](https://github.com/deepseek-ai/deepseek-harness)。

## 本地构建

维护者需要 Node.js `>=22.19.0` 与 pnpm `11.7.0`，版本声明见 [package.json](<package.json>)。当前固定的 `@deepseek-ai/dsh` 版本为 `0.2.1-alpha.1`；桌面应用另按兼容规则选择内核。

```sh
pnpm install
pnpm start              # 使用仓库依赖运行 dsh web
pnpm build              # 将生产依赖部署到 build_dir/
```

`pnpm build` 将上游生产依赖部署到 `build_dir/`，不改写运行时代码；`pnpm start` 并不运行这份部署产物。依赖布局与安装脚本设置见[工作区/构建策略](<pnpm-workspace.yaml>)。

## 发布与同步

两条同步工作流均每 **6 小时**运行，也支持手动输入：可选 `version`（留空自动选择）与 `force`（默认 `false`，用于强制重建）。

| 工作流 | 输入 / 选择规则 | 结果 |
| --- | --- | --- |
| [release.yml](<.github/workflows/release.yml>) | 必填 `dsh_version`：npm 版本或 `latest`；表单默认 `0.1.2-rc.1`，不等于当前固定版本。 | 四个 ZIP；普通 Release `dsh-<version>-<run_id>`（`<version>` 使用输入原值）。 |
| [sync-release.yml](<.github/workflows/sync-release.yml>) | 取 npm 所有已发布版本中 semver 最高者，覆盖所有 dist-tag，不只看 `latest`。 | 调用 npm 发布工作流；仅在发布成功后更新 `main` 的清单与锁文件。 |
| [release-from-source.yml](<.github/workflows/release-from-source.yml>) | 必填 `dsh_version`，不带 `dsh-v`；克隆准确的 `dsh-v<version>` tag，构建并部署运行时依赖闭包。 | 四个 ZIP；预发布 `dsh-src-<version>-<run_id>`；不更新 `main`。 |
| [sync-source-release.yml](<.github/workflows/sync-source-release.yml>) | 选择高于 npm 最高版本的上游 GitHub Release 最高版本。 | 调用源码工作流；除非强制重建，否则跳过已有的源码预发布。 |

npm 预检先[等待真实 tarball 可下载](<scripts/wait-for-npm-version.mjs>)，最多 10 分钟。随后以 `pnpm install --ignore-scripts` [实际安装完整依赖闭包](<scripts/check-dsh-installable.mjs>)，有界重试通过后才启动四平台构建矩阵。

两条发布路径均会[裁剪产物](<scripts/prune-node-modules.mjs>)并确认四个 ZIP 资产已上传。[体积报告](<scripts/check-artifact-size.mjs>)仅供参考，不作为发布门槛。

## 运行时兼容性

本地构建与两条发布路径均保留上游运行时代码。原有 LAN 放行和 Codex HTML 错误展示补丁已移除，避免可选定制因上游代码变化而阻塞打包。主机安全校验和提供方错误展示遵循打包所用的上游版本。Codex 错误因此可能包含原始 HTML 边缘响应正文，请将错误日志视为可能包含敏感信息。

需要 LAN 访问时，请查阅所打包 CLI 的帮助，按对应版本的参数配置。较新的上游版本要求绑定一个具体的本机 IPv4 或 IPv6 地址，而不是 `0.0.0.0` 等通配地址；原 LAN 放行环境变量不再覆盖这一策略。

`--trusted-host` 限制主机信任范围，不是认证机制。请妥善保管上游访问凭据，仅在可信网络启用 LAN。

## 安全与使用

- 仅供个人学习、研究与测试，请勿用于商业用途。
- `dsh` 可执行本地代码：请使用可信、隔离的环境，避免导入不可信配置或插件。
- LAN 暴露会增加风险；切勿向不可信网络开放服务或分享访问令牌。
- 开发者不对使用本项目造成的数据丢失或安全问题负责。

## 相关项目与致谢

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 是上游 CLI/Web/插件项目；[DeepSeek Harness Desktop](https://github.com/dsh-tauri/deepseek-harness-desktop) 将这些依赖包用于桌面应用。

感谢 [n8n-pkg](https://github.com/hairyf/n8n-pkg) 的打包模式、[pnpm](https://pnpm.io/) 的依赖/部署工具，以及 [GitHub Actions](https://github.com/features/actions) 的跨平台构建支持。
