import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildTempPackageJson,
  findPnpmPath,
  pickErrorLines,
  runCheck,
} from './check-dsh-installable.mjs'

// 假 pnpm：成功路径退出 0，失败路径退出 1 并输出一段带噪音的 pnpm 风格报错。
// 写成 .cmd / sh 启动器（而不是 .mjs）：Windows 上直接 spawn .mjs 会落到文件
// 关联、退出码失真，而真实 pnpm 就是 .cmd，这样才走到和线上同一条命令路径。
function fakePnpm(dir, exitCode) {
  const quote = (s) => (/\s/.test(s) ? `"${s}"` : s)
  const script = join(dir, `fake-pnpm-${exitCode}.mjs`)
  writeFileSync(
    script,
    `console.log('Progress: resolved 1, reused 0, downloaded 0, added 0')
console.error('Progress: totally normal noise that must not be reported')
console.error('[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for @deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.1')
console.error('[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for @deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.1')
process.exit(${exitCode})
`,
  )
  const launcher =
    process.platform === 'win32'
      ? join(dir, `fake-pnpm-${exitCode}.cmd`)
      : join(dir, `fake-pnpm-${exitCode}.sh`)
  writeFileSync(
    launcher,
    process.platform === 'win32'
      ? `@echo off\r\n${quote(process.execPath)} ${quote(script)} %*\r\n`
      : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} "$@"\n`,
  )
  return launcher
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-installable-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('buildTempPackageJson pins the requested package exactly', () => {
  const json = JSON.parse(buildTempPackageJson('@deepseek-ai/dsh', '0.2.0-rc.1'))
  assert.equal(json.private, true)
  assert.deepEqual(json.dependencies, { '@deepseek-ai/dsh': '0.2.0-rc.1' })
})

test('pickErrorLines keeps only locatable errors and dedupes them', () => {
  const picked = pickErrorLines(
    [
      'Progress: resolved 1',
      '[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for @deepseek-ai/dsh-foo@0.2.0-rc.1',
      '[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for @deepseek-ai/dsh-foo@0.2.0-rc.1',
      'at /home/runner/.local/share/pnpm/store',
    ].join('\n'),
  )
  assert.equal(
    picked,
    '[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for @deepseek-ai/dsh-foo@0.2.0-rc.1',
  )
})

test('pickErrorLines falls back to the tail when nothing matches', () => {
  assert.equal(pickErrorLines('first\nsecond\nthird'), 'first\n  second\n  third')
  assert.equal(pickErrorLines(''), '（无输出）')
})

test('findPnpmPath resolves pnpm from PATH using PATHEXT on Windows', () => {
  withTempDir((dir) => {
    if (process.platform === 'win32') {
      const fake = join(dir, 'pnpm.exe')
      writeFileSync(fake, 'not really a binary')
      assert.equal(findPnpmPath('win32', { PATH: dir, PATHEXT: '.CMD;.EXE' }), fake)
      assert.equal(findPnpmPath('win32', { PATH: dir, PATHEXT: '.CMD' }), null)
    } else {
      const fake = join(dir, 'pnpm')
      writeFileSync(fake, '#!/bin/sh\n')
      assert.equal(findPnpmPath('linux', { PATH: dir }), fake)
    }
    assert.equal(findPnpmPath(process.platform, { PATH: '' }), null)
  })
})

test('runCheck reports success without leaking probe output', () => {
  withTempDir((dir) => {
    const result = runCheck({
      pkg: '@deepseek-ai/dsh',
      version: '0.2.0-rc.1',
      pnpmPath: fakePnpm(dir, 0),
    })
    assert.deepEqual(result, { ok: true, detail: '' })
  })
})

test('runCheck surfaces the pnpm error line and cleans up the probe directory', () => {
  withTempDir((dir) => {
    const result = runCheck({
      pkg: '@deepseek-ai/dsh',
      version: '0.2.0-rc.1',
      pnpmPath: fakePnpm(dir, 1),
    })
    assert.equal(result.ok, false)
    assert.match(result.detail, /ERR_PNPM_NO_MATCHING_VERSION/)
    assert.match(result.detail, /dsh-client-ui-settings-account/)
    assert.doesNotMatch(result.detail, /totally normal noise/)
  })
})

test('runCheck fails fatally when pnpm is missing', () => {
  withTempDir((dir) => {
    const result = runCheck({
      pkg: '@deepseek-ai/dsh',
      version: '0.2.0-rc.1',
      pnpmPath: null,
    })
    assert.equal(result.ok, false)
    assert.match(result.fatal, /pnpm/)
  })
})
