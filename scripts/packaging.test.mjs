import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

test('local builds only deploy upstream production dependencies', () => {
  const manifest = JSON.parse(read('package.json'))
  assert.equal(manifest.scripts.build, 'pnpm deploy --filter . --prod build_dir --legacy')
  assert.equal(manifest.pnpm?.patchedDependencies, undefined)
  assert.doesNotMatch(read('pnpm-workspace.yaml'), /patchedDependencies|apply-.*patch/)
})

test('release workflows do not apply or require removed runtime patches', () => {
  const workflowDir = new URL('.github/workflows/', root)
  for (const file of readdirSync(workflowDir).filter(file => file.endsWith('.yml'))) {
    const source = read(`.github/workflows/${file}`)
    assert.doesNotMatch(
      source,
      /apply-(?:dsh-web-app|pi-ai-codex-error)-patch|DSH_PKG_ALLOW_LAN|PI_AI_CODEX_HTML_ERROR_SANITIZED/,
      `${file} still depends on a removed runtime patch`,
    )
  }

  const sourceRelease = read('.github/workflows/release-from-source.yml')
  assert.doesNotMatch(sourceRelease, /\bpatches\b/)
  assert.match(sourceRelease, /7z a [^\r\n]+ node_modules package\.json\r?$/m)
  assert.match(sourceRelease, /zip -r [^\r\n]+ node_modules package\.json\r?$/m)
})

test('removed patch scripts and their documentation links stay removed', () => {
  for (const file of [
    'scripts/apply-dsh-web-app-patch.mjs',
    'scripts/apply-pi-ai-codex-error-patch.mjs',
    'scripts/apply-pi-ai-codex-error-patch.test.mjs',
  ]) {
    assert.equal(existsSync(new URL(file, root)), false, `${file} should be removed`)
    for (const doc of ['README.md', 'README.zh.md']) {
      assert.ok(!read(doc).includes(file), `${doc} still links to ${file}`)
    }
  }
})
