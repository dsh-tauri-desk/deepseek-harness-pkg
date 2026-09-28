import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeCodexErrorBody } from './apply-pi-ai-codex-error-patch.mjs'

test('sanitizes an OpenAI block page without leaking markup or client IP', () => {
  const raw = '<!doctype html><html><title>Unable to load site</title><body>Please try again later. [IP:42.200.230.155 | Ray ID:a30f63217c790a04]</body></html>'
  const message = sanitizeCodexErrorBody({
    raw,
    status: 403,
    statusText: 'Forbidden',
    contentType: 'text/html; charset=UTF-8',
  })

  assert.equal(message, 'OpenAI Codex request failed (403): upstream edge returned HTML (Ray ID a30f63217c790a04)')
  assert.doesNotMatch(message, /<html|Unable to load site|42\.200\.230\.155/i)
})

test('prefers a safe cf-ray header and bounds it', () => {
  const message = sanitizeCodexErrorBody({
    raw: '<html>blocked</html>',
    status: 502,
    contentType: 'text/html',
    rayId: `abc-123<script>${'x'.repeat(200)}`,
  })

  assert.match(message, /^OpenAI Codex request failed \(502\): upstream edge returned HTML \(Ray ID abc-123scriptx{0,}/)
  assert.doesNotMatch(message, /[<>]/)
  assert.ok(message.length < 230)
})

test('leaves JSON and ordinary text provider errors untouched', () => {
  assert.equal(sanitizeCodexErrorBody({ raw: '{"error":{"message":"quota"}}', status: 429, contentType: 'application/json' }), null)
  assert.equal(sanitizeCodexErrorBody({ raw: 'gateway unavailable', status: 502, contentType: 'text/plain' }), null)
})

test('detects HTML by prefix when content-type is missing', () => {
  const message = sanitizeCodexErrorBody({ raw: '  <!DOCTYPE HTML><html>blocked</html>', status: 503 })
  assert.equal(message, 'OpenAI Codex request failed (503): upstream edge returned HTML')
})
