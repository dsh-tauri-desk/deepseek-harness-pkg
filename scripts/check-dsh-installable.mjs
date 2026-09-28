#!/usr/bin/env node
// 确认某个 dsh 版本**整条依赖链**都能装上，再让 build 矩阵 fan-out。
//
// 背景：run 36424634893 —— 上游 12:52 左右开始发 0.2.0-rc.1：dist-tags 一改，
// 根包 @deepseek-ai/dsh 的 packument（版本列表 + dist.tarball）立刻可见，
// resolve-latest-dsh-version.mjs 随即选中它，scripts/wait-for-npm-version.mjs
// 探根包 tarball 也拿到 200 —— 于是 preflight 放行、4 个平台开跑。
// 但同一批子包还在陆续发布：@deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.1
// 直到 12:54:22Z 才进 registry（该包 time.modified 可查），
// `pnpm add @deepseek-ai/dsh@0.2.0-rc.1` 在 12:53:07Z 就报
// ERR_PNPM_NO_MATCHING_VERSION —— 整轮构建白跑。
//
// 所以这里在 fan-out 之前，把 build job 真正要跑的安装先在一个临时目录里试跑
// 一遍：任何一个子包还没上架，安装就会失败。失败按有界轮询重试（默认 8 分钟），
// 等不到的仍明确失败 —— 与 wait-for-npm-version.mjs 同一定位：占一个 runner，
// 而不是四个。探针目录跑完即删，build job 各跑各的 `pnpm add` + `pnpm install`。
//
// 用法:
//   node scripts/check-dsh-installable.mjs --version=0.2.0-rc.1
//   node scripts/check-dsh-installable.mjs --version=0.2.0-rc.1 --timeout-seconds=480 --interval-seconds=20
//
// 退出码: 0 = 可安装；1 = 参数错误、pnpm 不可用或超时仍不可安装。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const label = '[check-dsh-installable]'
// npm 包名/版本只允许这些字符；也保证把 spec 拼进命令时无注入面。
const SAFE_SPEC = /^[A-Za-z0-9@._/-]+$/
// 探测在临时目录里跑，那里没有本地 node_modules，shell 的 PATH 查找不可靠
// （本机 pnpm 只有 .ps1/.cmd 垫片、没有 pnpm 可执行文件，直接 spawn 名字会 ENOENT）。
// 所以先解析成绝对路径：Windows 上按 PATHEXT 找 pnpm.cmd / pnpm.exe / pnpm.bat，
// 其他平台直接信任 PATH 里的 pnpm。
export function findPnpmPath(platform = process.platform, env = process.env) {
  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean)
  if (platform === 'win32') {
    const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    for (const dir of dirs) {
      for (const ext of extensions) {
        const candidate = join(dir, `pnpm${ext.toLowerCase()}`)
        if (existsSync(candidate)) return candidate
        const upper = join(dir, `pnpm${ext}`)
        if (upper !== candidate && existsSync(upper)) return upper
      }
    }
    return null
  }
  for (const dir of dirs) {
    const candidate = join(dir, 'pnpm')
    if (existsSync(candidate)) return candidate
  }
  return null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 临时目录里的探针 package.json（private，避免 pnpm 在无 lockfile 时抱怨）。
export function buildTempPackageJson(pkg, version) {
  return `${JSON.stringify(
    {
      name: 'dsh-installable-probe',
      version: '0.0.0',
      private: true,
      dependencies: { [pkg]: version },
    },
    null,
    2,
  )}\n`
}

// pnpm 的报错很长（含 pid、debug log 路径）。只留下能定位问题的行，避免把 CI
// 日志刷满；一条都匹配不到时退回原始 stderr 的最后几行。
export function pickErrorLines(stderr) {
  const interesting = /ERR_PNPM_|E404|No matching version|not found|ENOTFOUND|ECONNRESET|ETIMEDOUT/i
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => interesting.test(line))
  const picked = [...new Set(lines)].slice(0, 5)
  if (picked.length > 0) return picked.join('\n  ')
  return stderr.split(/\r?\n/).filter(Boolean).slice(-3).join('\n  ') || '（无输出）'
}

// 在临时目录里把真实安装命令试跑一遍。返回 { ok, detail } / { ok: false, fatal }，
// 不抛异常：轮询要靠返回值判断，而不是靠异常穿透。
//
// 探测目录固定放系统临时目录（tmpdir），**不**放仓库里：pnpm 会向上找
// pnpm-workspace.yaml，放进仓库就继承了本仓的 nodeLinker/hoisted 设置，解析的是
// 本仓的依赖图而不是目标版本（实测放在仓库根下会卡住十几分钟）。
//
// 必须用**真安装**（而不是 `--lockfile-only`）：lockfile-only 只解析根包的
// packument 就成功，拿不到子包缺失（实测 0.2.0-rc.1 在 lockfile-only 下直接通过，
// 而真安装才复现 ERR_PNPM_NO_MATCHING_VERSION）。`--ignore-scripts` 只跳过
// postinstall，不影响“所有需要下载的包都存在”这件事。
export function runCheck({ pkg, version, pnpmPath = findPnpmPath() }) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-installable-'))
  try {
    writeFileSync(join(dir, 'package.json'), buildTempPackageJson(pkg, version))
    if (!pnpmPath) {
      return {
        ok: false,
        fatal: 'PATH 里找不到 pnpm，preflight 需要先执行 pnpm/action-setup',
        detail: '',
      }
    }
    const options = {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
    // Node 拒绝直接 spawn .cmd/.bat（CVE-2024-27980 起抛 EINVAL），必须经 shell；
    // 路径来自 findPnpmPath 的绝对路径，参数是受控字面量，无注入面。
    // Windows 上 shell 是 cmd.exe，直接 spawn 一个 .mjs 会落到文件关联、退出码
    // 失真，所以只要经 shell 就统一走单字符串形式。
    if (process.platform === 'win32' || /\.(cmd|bat)$/i.test(pnpmPath)) {
      execFileSync(`"${pnpmPath}" install --ignore-scripts`, { ...options, shell: true })
    } else {
      execFileSync(pnpmPath, ['install', '--ignore-scripts'], options)
    }
    return { ok: true, detail: '' }
  } catch (err) {
    return { ok: false, detail: pickErrorLines(`${err.stderr || ''}${err.stdout || ''}`) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const pkg = argValue('package', '@deepseek-ai/dsh')
  const version = argValue('version', '')
  const timeoutSeconds = Number(argValue('timeout-seconds', '480'))
  const intervalSeconds = Number(argValue('interval-seconds', '20'))

  if (!version) {
    console.error(`${label} 必须提供 --version=<版本>，例如 --version=0.2.0-rc.1`)
    return 1
  }
  for (const [name, value] of [
    ['--package', pkg],
    ['--version', version],
  ]) {
    if (!SAFE_SPEC.test(value)) {
      console.error(`${label} ${name} 含非法字符：${JSON.stringify(value)}`)
      return 1
    }
  }
  for (const [name, value] of [
    ['--timeout-seconds', timeoutSeconds],
    ['--interval-seconds', intervalSeconds],
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      console.error(`${label} ${name} 必须是正数`)
      return 1
    }
  }

  const spec = `${pkg}@${version}`
  const deadline = Date.now() + timeoutSeconds * 1000
  let attempt = 0
  let lastDetail = '未知'

  // 先试一次再睡：健康时（绝大多数情况）这里零等待通过。
  while (true) {
    attempt += 1
    const result = runCheck({ pkg, version })
    if (result.fatal) {
      console.error(`${label} ${result.fatal}`)
      return 1
    }
    if (result.ok) {
      console.log(`${label} ${spec} 依赖链可解析（第 ${attempt} 次探测）`)
      return 0
    }
    lastDetail = result.detail

    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const waitMs = Math.min(intervalSeconds * 1000, remaining)
    console.log(
      `${label} 第 ${attempt} 次未就绪：${lastDetail}；${Math.round(waitMs / 1000)}s 后重试`
        + `（剩余 ${Math.round(remaining / 1000)}s）`,
    )
    await sleep(waitMs)
  }

  console.error(`${label} 等待 ${timeoutSeconds}s 后 ${spec} 仍装不上：${lastDetail}`)
  console.error(
    `${label} 通常是上游这一版还没发全（子包晚于根包进 registry：run 36424634893）。`
      + '待该版本发全后重跑本 workflow 即可。',
  )
  return 1
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await main()
}
