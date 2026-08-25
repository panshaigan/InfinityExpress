/**
 * Aggregate component-install-times.jsonl → cost / costScale on InstallSequence.xml.
 *
 * Usage:
 *   node scripts/cost-from-metrics.mjs              # dry-run (default)
 *   node scripts/cost-from-metrics.mjs --write
 *   node scripts/cost-from-metrics.mjs --metrics path --xml path
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Components that scale with prior install stack; prefer linear fit when ≥2 samples. */
const STACK_SENSITIVE_IDS = new Set(['EET_end:0', 'iwd_eet_end:0'])

/** Slope below this → treat as flat (median cost, no costScale), unless stack-sensitive. */
const WEAK_SLOPE = 0.02

const ELIGIBLE = new Set(['succeeded', 'succeededWithWarnings'])

/**
 * @typedef {{
 *   componentId: string
 *   runId: string
 *   wallMs: number
 *   finishedAt: string
 * }} TimingSample
 */

/**
 * @typedef {{
 *   componentId: string
 *   samples: number
 *   cost: number
 *   costScale: number | null
 *   note: string
 * }} CostProposal
 */

function parseArgs(argv) {
  let metrics = join(root, 'metrics', 'component-install-times.jsonl')
  let xml = join(root, 'src', 'data', 'InstallSequence.xml')
  let write = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--write') write = true
    else if (a === '--dry-run') write = false
    else if (a === '--metrics') metrics = resolve(argv[++i] ?? '')
    else if (a === '--xml') xml = resolve(argv[++i] ?? '')
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/cost-from-metrics.mjs [--dry-run|--write] [--metrics path] [--xml path]`)
      process.exit(0)
    } else {
      console.error(`Unknown arg: ${a}`)
      process.exit(1)
    }
  }
  return { metrics, xml, write }
}

/**
 * @param {string} path
 * @returns {TimingSample[]}
 */
function loadSamples(path) {
  const text = readFileSync(path, 'utf8')
  /** @type {TimingSample[]} */
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    let row
    try {
      row = JSON.parse(t)
    } catch {
      continue
    }
    if (!ELIGIBLE.has(row.status)) continue
    const componentId = typeof row.componentId === 'string' ? row.componentId.trim() : ''
    const runId = typeof row.runId === 'string' ? row.runId.trim() : ''
    const wallMs = Number(row.wallMs)
    const finishedAt = typeof row.finishedAt === 'string' ? row.finishedAt : ''
    if (!componentId || !runId || !Number.isFinite(wallMs) || wallMs < 0) continue
    out.push({ componentId, runId, wallMs, finishedAt })
  }
  return out
}

/**
 * @param {TimingSample[]} samples
 * @returns {Map<string, { wallSec: number, priorWallSec: number }[]>}
 */
function samplesWithPrior(samples) {
  /** @type {Map<string, TimingSample[]>} */
  const byRun = new Map()
  for (const s of samples) {
    let list = byRun.get(s.runId)
    if (!list) {
      list = []
      byRun.set(s.runId, list)
    }
    list.push(s)
  }

  /** @type {Map<string, { wallSec: number, priorWallSec: number }[]>} */
  const byComponent = new Map()
  for (const list of byRun.values()) {
    list.sort((a, b) => {
      const ta = Date.parse(a.finishedAt)
      const tb = Date.parse(b.finishedAt)
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb
      return 0
    })
    let priorMs = 0
    for (const s of list) {
      const wallSec = s.wallMs / 1000
      const priorWallSec = priorMs / 1000
      let pts = byComponent.get(s.componentId)
      if (!pts) {
        pts = []
        byComponent.set(s.componentId, pts)
      }
      pts.push({ wallSec, priorWallSec })
      priorMs += s.wallMs
    }
  }
  return byComponent
}

/**
 * @param {number[]} xs
 * @returns {number}
 */
function median(xs) {
  const a = [...xs].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  if (a.length % 2 === 1) return a[mid]
  return (a[mid - 1] + a[mid]) / 2
}

/**
 * Ordinary least squares: y ≈ a + b * x
 * @param {{ wallSec: number, priorWallSec: number }[]} pts
 * @returns {{ a: number, b: number } | null}
 */
function linearFit(pts) {
  const n = pts.length
  if (n < 2) return null
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumXY = 0
  for (const p of pts) {
    sumX += p.priorWallSec
    sumY += p.wallSec
    sumXX += p.priorWallSec * p.priorWallSec
    sumXY += p.priorWallSec * p.wallSec
  }
  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-12) {
    return { a: sumY / n, b: 0 }
  }
  const b = (n * sumXY - sumX * sumY) / denom
  const a = (sumY - b * sumX) / n
  return { a, b }
}

/**
 * @param {string} componentId
 * @param {{ wallSec: number, priorWallSec: number }[]} pts
 * @returns {CostProposal}
 */
function proposeCost(componentId, pts) {
  const walls = pts.map((p) => p.wallSec)
  const med = median(walls)
  if (pts.length === 1) {
    return {
      componentId,
      samples: 1,
      cost: Math.max(1, Math.round(walls[0])),
      costScale: null,
      note: 'single-sample',
    }
  }

  const fit = linearFit(pts)
  const priors = pts.map((p) => p.priorWallSec)
  const priorRange = Math.max(...priors) - Math.min(...priors)
  const stackSensitive = STACK_SENSITIVE_IDS.has(componentId)
  // Reject ray-through-origin fits: need real intercept vs median and enough prior spread.
  const interceptOk = fit != null && fit.a >= Math.max(1, 0.2 * med)
  const priorSpreadOk = priorRange >= Math.max(30, 0.15 * med)
  const slopeOk = fit != null && fit.b >= WEAK_SLOPE
  const preferFit =
    fit != null &&
    fit.b >= 0.001 &&
    interceptOk &&
    (stackSensitive ? priorSpreadOk || slopeOk : slopeOk && priorSpreadOk)

  if (preferFit && fit != null) {
    const cost = Math.max(1, Math.round(fit.a))
    const costScale = Math.max(1, Math.round(fit.b * 1000))
    return {
      componentId,
      samples: pts.length,
      cost,
      costScale,
      note: stackSensitive ? 'stack-sensitive-fit' : 'linear-fit',
    }
  }

  return {
    componentId,
    samples: pts.length,
    cost: Math.max(1, Math.round(med)),
    costScale: null,
    note:
      fit != null && !interceptOk
        ? 'bad-intercept-median'
        : fit != null && fit.b < WEAK_SLOPE
          ? 'weak-slope-median'
          : 'median',
  }
}

/**
 * @param {string} attrs
 * @param {string} name
 * @returns {string | null}
 */
function getAttr(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')
  const m = attrs.match(re)
  return m ? m[2] : null
}

/**
 * @param {string} attrs
 * @param {string} name
 * @returns {string}
 */
function removeAttr(attrs, name) {
  return attrs
    .replace(new RegExp(`\\s+${name}\\s*=\\s*(["']).*?\\1`, 'gi'), '')
    .replace(/\s+$/g, ' ')
    .replace(/^\s+/, ' ')
}

/**
 * @param {string} attrs
 * @param {string} name
 * @param {string} value
 * @returns {string}
 */
function setAttr(attrs, name, value) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')
  const quoted = value.includes('"') ? `'${value}'` : `"${value}"`
  if (re.test(attrs)) {
    return attrs.replace(re, `${name}=${quoted}`)
  }
  const trimmed = attrs.replace(/\s+$/, '')
  return `${trimmed} ${name}=${quoted} `
}

/**
 * @param {string} xml
 * @param {Map<string, CostProposal>} proposals
 * @returns {{ xml: string, updated: number, skipped: number }}
 */
function applyProposals(xml, proposals) {
  let updated = 0
  let skipped = 0
  const next = xml.replace(/<component\b([^>]*?)(\/?)>/g, (full, rawAttrs, slash) => {
    const id = getAttr(rawAttrs, 'id')
    if (!id) return full
    const proposal = proposals.get(id)
    if (!proposal) {
      skipped++
      return full
    }
    let attrs = rawAttrs
    attrs = setAttr(attrs, 'cost', String(proposal.cost))
    if (proposal.costScale != null) {
      attrs = setAttr(attrs, 'costScale', String(proposal.costScale))
    } else {
      attrs = removeAttr(attrs, 'costScale')
    }
    // Normalize trailing space before /> or >
    attrs = attrs.replace(/\s+$/, ' ')
    updated++
    return `<component${attrs}${slash}>`
  })
  return { xml: next, updated, skipped }
}

function main() {
  const { metrics, xml: xmlPath, write } = parseArgs(process.argv.slice(2))
  const samples = loadSamples(metrics)
  const byComponent = samplesWithPrior(samples)
  /** @type {CostProposal[]} */
  const proposals = []
  for (const [componentId, pts] of [...byComponent.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    proposals.push(proposeCost(componentId, pts))
  }
  const map = new Map(proposals.map((p) => [p.componentId, p]))

  console.log('componentId\tsamples\tcost\tcostScale\tnote')
  for (const p of proposals) {
    console.log(
      `${p.componentId}\t${p.samples}\t${p.cost}\t${p.costScale ?? ''}\t${p.note}`,
    )
  }
  console.error(
    `\n${proposals.length} components from ${samples.length} samples (${metrics})`,
  )

  if (!write) {
    console.error('Dry-run only. Pass --write to update InstallSequence.xml.')
    return
  }

  const xml = readFileSync(xmlPath, 'utf8')
  const { xml: out, updated } = applyProposals(xml, map)
  writeFileSync(xmlPath, out)
  console.error(`Wrote cost/costScale on ${updated} <component> tags → ${xmlPath}`)
}

main()
