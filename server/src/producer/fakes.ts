/**
 * Tier A fake agent outputs.
 *
 * The brief's rule is "Fakes first, real integrations second" (§21): the Job
 * Drawer needs something to show before Meow, Sikyo, Gugel and Aiz can call
 * Gemini in Tier B. Every fake is clearly labelled in the UI with a FAKE
 * banner — the fake text itself says so — and the real agents replace these
 * generators one-for-one (same function names, same output shapes, real
 * Gemini + Zod inside).
 *
 * What is NOT faked, even in Tier A: the deterministic technical checks
 * (duration/aspect/resolution/fps) always run on real ffprobe data.
 */
import type {
  PostKit,
  ProbeVerdict,
  ProductCard,
  ProductCategory,
  QAReport,
  QAVerdict,
  VideoBrief,
} from '@hive/shared'
import type { VideoChecks } from '../media/validation'

const FAKE_NOTE = 'FAKE Tier A output — the real agent (Gemini) replaces this in Tier B.'

// ── Meow (Scout) ────────────────────────────────────────────────────────────

export interface ProductIntakeInput {
  title: string
  category: ProductCategory
  sourceUrl: string | null
  /** Pasted listing text. Treated as untrusted data; never echoed as claims. */
  text: string
}

/** Fake Product Card. Never invents specs: listing fields stay empty unless given. */
export function fakeProductCard(productId: string, jobTitle: string, input: ProductIntakeInput): ProductCard {
  return {
    productId,
    title: input.title || jobTitle,
    category: input.category,
    sourceUrl: input.sourceUrl,
    affiliateUrl: null, // Tier B: Meow finds the affiliate link
    price: null, // never invented
    currency: null,
    colors: [], // never invented
    sizes: [], // never invented
    materialsListed: [],
    // Verbatim listing claims only — in Tier A the boss pastes the listing text;
    // sentences from it are not auto-parsed yet, so nothing is claimed.
    listingClaims: input.text.trim() ? [input.text.trim().slice(0, 280)] : [],
    sellingPoints: [],
    targetAudience: 'TikTok viewers browsing apparel (Tier B: Meow sharpens this)',
    season: null,
    hookIdeas: [
      'See it move — zero effort',
      'One garment, three angles',
      'Your next everyday favorite',
    ],
    riskFlags: [],
    scores: null, // scoring is a Tier B agent call
    dataConfidence: 'inferred',
    notes: FAKE_NOTE,
  }
}

// ── Sikyo (Planner) ─────────────────────────────────────────────────────────

/** Fake Video Brief: 3 shots × ~6s, faceless, prompts ready for the external tool. */
export function fakeBrief(product: ProductCard): VideoBrief {
  const garment = product.title || 'the garment'
  return {
    durationTarget: 18,
    aspect: '9:16',
    resolution: '1080x1920',
    concept: `Slow-motion reveal of ${garment}: hanger → details → flat lay. No people, no talking.`,
    style: 'clean commercial b-roll, soft daylight, gentle motion',
    palette: 'from the product photos (kept exact — no color grading drift)',
    shots: [
      {
        shotId: 's1',
        sourceImage: null, // Tier B: Meow's chosen hero image
        description: `Garment on a wooden hanger against a plain wall, slow push-in.`,
        cameraMotion: 'slow push-in',
        setting: 'hanger',
        imageToVideoPrompt: `Cinematic 9:16 b-roll. ${garment} hanging on a wooden hanger against a soft neutral wall. Slow push-in camera move over 6 seconds. Natural window light, fabric gently still. No people, no faces, no text.`,
        textToVideoPrompt: `Cinematic 9:16 vertical. Close look at ${garment} on a hanger, plain bright wall, slow push-in, soft daylight, commercial apparel b-roll. No people.`,
        negativeHints: ['no faces', 'no people', 'no invented text or logos', 'keep exact garment color'],
        onScreenText: null,
        transition: 'cut',
      },
      {
        shotId: 's2',
        sourceImage: null,
        description: `Macro pass over fabric and seams (details that prove quality).`,
        cameraMotion: 'orbit fabric close-up',
        setting: 'flat lay',
        imageToVideoPrompt: `Macro fabric close-up of ${garment}, orbiting camera move over 6 seconds, visible weave and stitching, soft light rake across the textile. No hands, no people, no text.`,
        textToVideoPrompt: `Macro 9:16 vertical shot of ${garment} fabric, orbit close-up, visible stitching and texture, soft studio light. No hands, no people.`,
        negativeHints: ['no hands', 'no faces', 'no invented text or logos', 'keep exact garment color'],
        onScreenText: null,
        transition: 'cut',
      },
      {
        shotId: 's3',
        sourceImage: null,
        description: `Final flat lay with the garment centered, slow pull-back.`,
        cameraMotion: 'pull-back',
        setting: 'flat lay',
        imageToVideoPrompt: `Top-down flat lay of ${garment} perfectly centered on a light neutral surface, slow pull-back over 6 seconds, even soft light, clean commercial finish. No people, no props with text.`,
        textToVideoPrompt: `Top-down 9:16 flat lay of ${garment}, centered, light neutral background, slow pull-back, clean commercial apparel video. No people.`,
        negativeHints: ['no faces', 'no people', 'no invented text or logos', 'keep exact garment color'],
        onScreenText: null,
        transition: null,
      },
    ],
    hookText: 'This one moves.',
    musicMood: 'chill acoustic / soft indie',
    bpmRange: [90, 110],
    doNotDo: [
      'No people, no faces, no hands',
      'No claims the listing does not make',
      'No color grading that changes the garment color',
      'Keep 15-20s, 9:16, no audio track',
    ],
    qaChecklist: [
      'Garment color matches the product photos',
      'No faces or identifiable people',
      'No invented logos, text or brand marks',
      'All three briefed shots are present',
      'Duration, aspect, resolution, fps within spec',
    ],
  }
}

// ── Gugel (QA) ──────────────────────────────────────────────────────────────

export interface FakeQAResult {
  report: QAReport
  /** True when the requested verdict was overridden by a hard technical failure. */
  forced: boolean
}

/**
 * Fake QA report. Code checks (duration/aspect/resolution/fps) are REAL,
 * computed from the probe verdict. Vision checks are fake marks labelled
 * as such. Principle: hard technical failures can never be overridden —
 * asking for "pass" while hard failures exist is forced to "reject".
 */
export function fakeQAReport(
  verdict: QAVerdict,
  probeVerdict: ProbeVerdict,
  frames: string[],
  _checks: VideoChecks,
): FakeQAResult {
  const realChecks = [
    { id: 'tech-duration', ok: !probeVerdict.hardFailures.some((f) => f.message.startsWith('Duration')) },
    { id: 'tech-aspect', ok: !probeVerdict.hardFailures.some((f) => f.message.startsWith('Aspect')) },
    {
      id: 'tech-resolution',
      ok: !probeVerdict.hardFailures.some((f) => f.message.startsWith('Resolution')),
    },
    { id: 'tech-fps', ok: !probeVerdict.hardFailures.some((f) => f.message.startsWith('Frame rate')) },
  ]

  const forced = verdict === 'pass' && probeVerdict.hardFailures.length > 0
  const effective: QAVerdict = forced ? 'reject' : verdict

  const checks = [
    ...realChecks.map((c, i) => ({
      id: c.id,
      result: c.ok ? ('pass' as const) : ('fail' as const),
      severity: i === 0 ? ('critical' as const) : i < 3 ? ('critical' as const) : ('critical' as const),
      evidence: [],
      note: `${c.id.replace('-tech-', 'Technical: ')} — ${c.ok ? 'within spec' : 'outside spec (see probe)'}`,
    })),
    // Vision checks: FAKE in Tier A.
    { id: 'vision-color', result: 'pass' as const, severity: 'critical' as const, evidence: frames.slice(0, 1), note: `FAKE — no vision model in Tier A. ${FAKE_NOTE}` },
    { id: 'vision-silhouette', result: 'pass' as const, severity: 'critical' as const, evidence: frames.slice(0, 1), note: `FAKE — no vision model in Tier A. ${FAKE_NOTE}` },
    { id: 'vision-logos', result: 'pass' as const, severity: 'critical' as const, evidence: frames.slice(1, 2), note: `FAKE — no vision model in Tier A. ${FAKE_NOTE}` },
    { id: 'vision-faces', result: 'pass' as const, severity: 'critical' as const, evidence: frames.slice(1, 2), note: `FAKE — no vision model in Tier A. ${FAKE_NOTE}` },
    { id: 'vision-artifacts', result: 'pass' as const, severity: 'major' as const, evidence: frames.slice(2, 4), note: `FAKE — no vision model in Tier A. ${FAKE_NOTE}` },
  ]

  const criticalFails = checks.filter((c) => c.severity === 'critical' && c.result === 'fail')
  let score: number
  if (effective === 'pass') score = criticalFails.length === 0 ? 92 : 74
  else if (effective === 'fixable') score = 62
  else score = 35
  // Pass needs >= 80 AND no critical failure (brief 9.5 thresholds).
  if (effective === 'pass' && (score < 80 || criticalFails.length > 0)) score = 85

  const report: QAReport = {
    verdict: effective,
    score,
    checks,
    fixInstructions:
      effective === 'fixable'
        ? [
            'FAKE fix instructions (Tier A) — real Gugel steps arrive in Tier B:',
            '1. Re-shoot the shot flagged by the probe result.',
            '2. Keep camera stillness; avoid hard cuts mid-clip.',
            '3. Re-upload; this was QA cycle of 3 max.',
          ]
        : effective === 'reject'
          ? forced
            ? [
                `Technical hard failure blocked "pass": ${probeVerdict.hardFailures.map((f) => f.message).join(' ')}`,
                'Fix the source video (duration/aspect/resolution/fps) and re-upload.',
                '(In Tier B the real QA vision model adds per-shot detail.)',
              ]
            : ['FAKE reject (Tier A) — see probe result for details.']
          : [],
    aiLabelRecommended: true,
    confidence: effective === 'pass' ? 0.9 : 0.6,
  }

  return { report, forced }
}

// ── Aiz (Publisher) ─────────────────────────────────────────────────────────

/** Fake Post Kit. Posting stays human-in-the-loop: this never posts anything. */
export function fakePostKit(
  product: ProductCard,
  brief: VideoBrief | null,
  coverFrame: number,
  postingWindows: string[],
  timezone: string,
): PostKit {
  const hook = brief?.hookText ?? 'This one moves.'
  const title = product.title || 'the product'
  const windowList = postingWindows.length > 0 ? postingWindows : ['12:00', '19:00', '21:00']
  return {
    caption: `${hook}\n\n${title}\n\nDrop a 🔥 if you wear it.`,
    altCaptions: [
      `${hook} ${title} — link in basket.`,
      `POV: you found ${title}. ${hook}`,
    ],
    hashtags: ['#apparel', '#ootd', '#tiktokmademedobuy', '#fitcheck'],
    basket: {
      productTitle: title,
      searchKeyword: title.toLowerCase(),
      productLink: product.affiliateUrl ?? product.sourceUrl ?? '',
      commissionNote: 'Add affiliate disclosure note here (Tier B: scraped from the affiliate program).',
    },
    music: {
      mood: brief?.musicMood ?? 'chill acoustic',
      bpmRange: brief?.bpmRange ?? [90, 110],
      searchKeywords: ['chill', 'aesthetic', 'slow'],
      localTrackId: null,
    },
    coverFrame,
    schedule: {
      recommendedSlots: windowList.slice(0, 3),
      timezone,
    },
    checklist: [
      'Turn on AI-generated content label (required)',
      'Turn on commercial content disclosure (required)',
      'Add yellow basket with the product link',
      'Add sound in-app (music plan above)',
      'Confirm privacy setting (public)',
    ],
  }
}