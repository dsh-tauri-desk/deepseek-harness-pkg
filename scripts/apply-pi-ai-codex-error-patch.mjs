#!/usr/bin/env node
// Prevent OpenAI/Cloudflare HTML block pages from being forwarded verbatim as
// Codex provider errors. The patch is applied to the deployed pi-ai artifact so
// it remains effective while DSH consumes pi-ai as a transitive dependency.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const PATCH_MARKER = 'PI_AI_CODEX_HTML_ERROR_SANITIZED'

export function sanitizeCodexErrorBody({ raw, status, statusText, contentType = '', rayId = '' }) {
  const body = String(raw ?? '')
  const html = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType)
    || /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body)
  if (!html)
    return null

  const safeRayId = String(rayId || body.match(/\bRay ID\s*[:|]\s*([a-z\d-]{6,})/i)?.[1] || '')
    .trim()
    .replace(/[^a-z\d-]/gi, '')
    .slice(0, 128)
  const statusLabel = status ? String(status) : (statusText || 'unknown status')
  const correlation = safeRayId ? ` (Ray ID ${safeRayId})` : ''
  return `OpenAI Codex request failed (${statusLabel}): upstream edge returned HTML${correlation}`
}

export function patchPiAiCodexSource(source) {
  if (source.includes(PATCH_MARKER))
    return source

  const oldCall = `                    const fakeResponse = new Response(errorText, {
                        status: response.status,
                        statusText: response.statusText,
                    });
                    const info = await parseErrorResponse(fakeResponse);`
  const newCall = `                    // ${PATCH_MARKER}: retain headers/status and sanitize edge HTML.
                    const info = await parseErrorResponse(response, errorText);`
  if (!source.includes(oldCall))
    throw new Error('pi-ai Codex non-OK response handling changed; update this patch')

  const oldParser = `async function parseErrorResponse(response) {
    const raw = await response.text();
    let message = raw || response.statusText || "Request failed";`
  const newParser = `async function parseErrorResponse(response, suppliedRaw) {
    const raw = suppliedRaw ?? await response.text();
    const contentType = response.headers.get("content-type") || "";
    const isHtml = /(?:text\\/html|application\\/xhtml\\+xml)/i.test(contentType)
        || /^\\s*(?:<!doctype\\s+html\\b|<html\\b)/i.test(raw);
    if (isHtml) {
        const rawRayId = response.headers.get("cf-ray")
            || raw.match(/\\bRay ID\\s*[:|]\\s*([a-z\\d-]{6,})/i)?.[1]
            || "";
        const rayId = rawRayId.trim().replace(/[^a-z\\d-]/gi, "").slice(0, 128);
        const correlation = rayId ? \` (Ray ID \${rayId})\` : "";
        return {
            message: \`OpenAI Codex request failed (\${response.status || response.statusText || "unknown status"}): upstream edge returned HTML\${correlation}\`,
            friendlyMessage: undefined,
        };
    }
    let message = raw || response.statusText || "Request failed";`
  if (!source.includes(oldParser))
    throw new Error('pi-ai Codex error parser changed; update this patch')

  return source.replace(oldCall, newCall).replace(oldParser, newParser)
}

export function applyPatch(file) {
  const abs = resolve(file)
  const source = readFileSync(abs, 'utf8')
  const patched = patchPiAiCodexSource(source)
  if (patched === source) {
    console.log(`already patched: ${abs}`)
    return false
  }
  writeFileSync(abs, patched)
  console.log(`patched: ${abs}`)
  return true
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedAsScript) {
  const fileArg = process.argv.find(arg => arg.startsWith('--file='))
  applyPatch(fileArg
    ? fileArg.slice('--file='.length)
    : 'node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js')
}
