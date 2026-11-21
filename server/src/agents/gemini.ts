/**
 * Gemini REST client.
 *
 * We call the plain `generateContent` endpoint with `fetch` instead of pulling
 * in an SDK: one less dependency, and the request shape is easy to inspect.
 * The API key never leaves this process — it is read from the environment and
 * only ever sent in the `x-goog-api-key` header.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Statuses worth a second attempt. 4xx other than 429 are our fault, not luck. */
const RETRYABLE = new Set([429, 500, 502, 503, 504])

export class GeminiError extends Error {
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  error?: { message?: string; status?: string }
  promptFeedback?: { blockReason?: string }
}

export interface GenerateJsonInput {
  system: string
  user: string
  model?: string
  maxOutputTokens?: number
  timeoutMs?: number
}

export interface GenerateTextInput {
  system: string
  user: string
  model?: string
  maxOutputTokens?: number
  timeoutMs?: number
  temperature?: number
}

export interface VisionImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  data: string
}

/** Text generation with selected extracted frames attached as Gemini vision input. */
export async function generateVisionText(input: GenerateTextInput & { images: VisionImage[] }): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set on the server. Add it to .env and restart.', 500)
  const model = input.model?.trim() || getCheapModel()
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: 'user', parts: [
      { text: input.user },
      ...input.images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })),
    ] }],
    generationConfig: { temperature: input.temperature ?? 0.2, maxOutputTokens: input.maxOutputTokens ?? 1000 },
  })
  let lastError: unknown = new GeminiError('Gemini request failed.')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body, signal: AbortSignal.timeout(input.timeoutMs ?? 45_000) })
      if (!response.ok) throw new GeminiError(readError(await response.text().catch(() => ''), `Gemini returned HTTP ${response.status}.`), response.status)
      const data = (await response.json()) as GeminiResponse
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? ''
      if (!text) throw new GeminiError(data.promptFeedback?.blockReason ? `Gemini blocked the prompt (${data.promptFeedback.blockReason}).` : 'Gemini returned an empty response.')
      return text
    } catch (error) {
      lastError = error
      const status = error instanceof GeminiError ? error.status : 0
      if ((!status && attempt < 2) || RETRYABLE.has(status) && attempt < 2) await sleep(600 * 2 ** attempt)
      else break
    }
  }
  if (lastError instanceof GeminiError) throw lastError
  throw new GeminiError('Could not reach the Gemini API.', 502)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getTaskModel(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest'
}

export function getCheapModel(): string {
  return (
    process.env.GEMINI_MODEL_CHEAP?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    'gemini-flash-latest'
  )
}

/** Pull Google's error message out of a failed response without leaking the key. */
function readError(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body) as GeminiResponse
    return parsed.error?.message ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Generate plain text from Gemini with model fallback and retries.
 */
export async function generateText(input: GenerateTextInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new GeminiError(
      'GEMINI_API_KEY is not set on the server. Add it to .env and restart.',
      500,
    )
  }

  const model = input.model?.trim() || getCheapModel()
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: 'user', parts: [{ text: input.user }] }],
    generationConfig: {
      temperature: input.temperature ?? 0.8,
      maxOutputTokens: input.maxOutputTokens ?? 120,
    },
  })

  let lastError: unknown = new GeminiError('Gemini request failed.')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body,
        signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new GeminiError(
          readError(text, `Gemini returned HTTP ${response.status}.`),
          response.status,
        )
      }

      const data = (await response.json()) as GeminiResponse
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim() ?? ''

      if (!text) {
        const blocked = data.promptFeedback?.blockReason
        throw new GeminiError(
          blocked
            ? `Gemini blocked the prompt (${blocked}).`
            : 'Gemini returned an empty response. Try again.',
        )
      }

      return text
    } catch (error) {
      lastError = error
      const status = error instanceof GeminiError ? error.status : 0
      const retryable = status === 0 || RETRYABLE.has(status)
      if (!retryable || attempt === 2) break
      await sleep(500 * 2 ** attempt)
    }
  }

  if (lastError instanceof GeminiError) throw lastError
  if (lastError instanceof Error && lastError.name === 'TimeoutError') {
    throw new GeminiError('Gemini took too long to answer.', 504)
  }
  throw new GeminiError('Could not reach the Gemini API.', 502)
}

/**
 * Ask Gemini for a JSON object described by `responseSchema`, returning the raw
 * text (already validated to be non-empty). Retries 429/5xx with backoff.
 */
export async function generateJson(input: GenerateJsonInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new GeminiError(
      'GEMINI_API_KEY is not set on the server. Add it to .env and restart.',
      500,
    )
  }

  const model = input.model?.trim() || getTaskModel()
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: 'user', parts: [{ text: input.user }] }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: input.maxOutputTokens ?? 420,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          result: {
            type: 'STRING',
            description: 'The answer shown to the teammate who sent the task.',
          },
          lesson: {
            type: 'STRING',
            nullable: true,
            description: 'One durable sentence worth remembering, or null.',
          },
        },
        required: ['result'],
      },
    },
  })

  let lastError: unknown = new GeminiError('Gemini request failed.')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body,
        signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new GeminiError(
          readError(text, `Gemini returned HTTP ${response.status}.`),
          response.status,
        )
      }

      const data = (await response.json()) as GeminiResponse
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim() ?? ''

      if (!text) {
        const blocked = data.promptFeedback?.blockReason
        throw new GeminiError(
          blocked
            ? `Gemini blocked the prompt (${blocked}).`
            : 'Gemini returned an empty response. Try again.',
        )
      }

      return text
    } catch (error) {
      lastError = error
      const status = error instanceof GeminiError ? error.status : 0
      const retryable = status === 0 || RETRYABLE.has(status)
      if (!retryable || attempt === 2) break
      await sleep(600 * 2 ** attempt)
    }
  }

  if (lastError instanceof GeminiError) throw lastError
  if (lastError instanceof Error && lastError.name === 'TimeoutError') {
    throw new GeminiError('Gemini took too long to answer.', 504)
  }
  throw new GeminiError('Could not reach the Gemini API.', 502)
}

export interface ParsedTaskResult {
  result: string
  lesson: string | null
}

/**
 * `responseMimeType: application/json` normally gives clean JSON, but models
 * occasionally wrap it in a code fence. Accept both, then fall back to the raw
 * text rather than failing the whole task.
 */
export function parseTaskResult(text: string): ParsedTaskResult {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

  const candidates = [cleaned]
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as { result?: unknown; lesson?: unknown }
      if (typeof value.result === 'string' && value.result.trim()) {
        return {
          result: value.result.trim(),
          lesson:
            typeof value.lesson === 'string' && value.lesson.trim()
              ? value.lesson.trim()
              : null,
        }
      }
    } catch {
      // try the next candidate
    }
  }

  return { result: cleaned, lesson: null }
}
