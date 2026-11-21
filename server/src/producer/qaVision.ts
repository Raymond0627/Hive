/** Tier B Gugel: Gemini vision review layered on deterministic checks. */
import { z } from 'zod'
import type { ProbeVerdict, QAReport, QAVerdict } from '@hive/shared'
import { generateVisionText, getCheapModel, type VisionImage } from '../agents/gemini'

const Output = z.object({
  verdict: z.enum(['pass', 'fixable', 'reject']),
  score: z.number().min(0).max(100),
  checks: z.array(z.object({ id: z.string(), result: z.enum(['pass', 'fail', 'warn']), severity: z.enum(['critical', 'major', 'warning', 'info']), evidence: z.array(z.string()).default([]), note: z.string() })),
  fixInstructions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
})

function parseJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(clean) } catch { const a = clean.indexOf('{'); const b = clean.lastIndexOf('}'); if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1)); throw new Error('QA returned invalid JSON.') }
}

export async function visionQA(probeVerdict: ProbeVerdict, frames: VisionImage[], frameRefs: string[]): Promise<QAReport> {
  const raw = await generateVisionText({
    model: getCheapModel(), images: frames, maxOutputTokens: 1400,
    system: 'You are Gugel, apparel video QA. Return only JSON. Review the attached frames for exact garment color consistency, faces/people/hands, invented text/logos, visual artifacts, and whether the product is recognizable. Do not invent product facts. A hard technical failure in the supplied report must remain a rejection.',
    user: `Deterministic technical report: ${JSON.stringify(probeVerdict)}\nFrame references in order: ${JSON.stringify(frameRefs)}\nReturn verdict, score, checks, fixInstructions, confidence. Pass requires no critical failure and score >= 80.`,
  })
  const parsed = Output.parse(parseJson(raw))
  const hardFail = probeVerdict.hardFailures.length > 0
  const verdict: QAVerdict = hardFail ? 'reject' : parsed.verdict
  return { ...parsed, verdict, aiLabelRecommended: true, checks: parsed.checks.map((check) => ({ ...check, evidence: check.evidence.map((ref) => frameRefs.includes(ref) ? ref : frameRefs[0] ?? ref) })) }
}
