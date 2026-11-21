/** Tier B Aiz: Gemini generates a human-review Post Kit; it never posts. */
import { z } from 'zod'
import type { PostKit, ProductCard, VideoBrief } from '@hive/shared'
import { generateText, getCheapModel } from '../agents/gemini'

const Output = z.object({
  caption: z.string().max(2200), altCaptions: z.array(z.string()).max(3), hashtags: z.array(z.string()).min(3).max(5),
  searchKeyword: z.string(), commissionNote: z.string(), musicMood: z.string(), bpmRange: z.tuple([z.number(), z.number()]), searchKeywords: z.array(z.string()),
  checklist: z.array(z.string()), coverFrame: z.number().min(0),
})
function parseJson(text: string): unknown { const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); try { return JSON.parse(clean) } catch { const a = clean.indexOf('{'); const b = clean.lastIndexOf('}'); if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1)); throw new Error('Publisher returned invalid JSON.') } }

export async function createPostKit(product: ProductCard, brief: VideoBrief | null, duration: number, windows: string[], timezone: string): Promise<PostKit> {
  const raw = await generateText({ model: getCheapModel(), temperature: 0.35, maxOutputTokens: 1100, system: 'You are Aiz, a TikTok apparel publisher. Return only JSON. Never invent product claims, prices, commissions, links, or brand facts. Keep captions concise and human-reviewable. Posting is always manual.', user: `Product Card: ${JSON.stringify(product)}\nVideo Brief: ${JSON.stringify(brief)}\nVideo duration: ${duration}\nPosting windows: ${JSON.stringify(windows)}\nTimezone: ${timezone}` })
  const output = Output.parse(parseJson(raw))
  return { caption: output.caption, altCaptions: output.altCaptions, hashtags: output.hashtags, basket: { productTitle: product.title, searchKeyword: output.searchKeyword, productLink: product.affiliateUrl ?? product.sourceUrl ?? '', commissionNote: output.commissionNote }, music: { mood: output.musicMood, bpmRange: output.bpmRange, searchKeywords: output.searchKeywords, localTrackId: null }, coverFrame: Math.min(Math.max(0, output.coverFrame), Math.max(0, duration)), schedule: { recommendedSlots: windows.slice(0, 3), timezone }, checklist: output.checklist }
}
