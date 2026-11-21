/**
 * Agent roster for the TikTok Content Office.
 *
 * Names are placeholders and live here so the office can be reconfigured
 * without touching code. `status` drives the sleeping Editor behavior.
 */
export interface RosterAgent {
  id: string
  name: string
  role: string
  personality: string
  rules: string
  deskSlot: string
  status: 'active' | 'sleeping'
  appearance: { skin: string; hair: string; shirt: string; pants: string; shoes: string }
}

export const ROSTER: RosterAgent[] = [
  {
    id: 'eiron',
    name: 'Producer',
    role: 'Producer',
    personality: 'Calm, organized, keeps the pipeline moving.',
    rules: 'You coordinate handoffs and status. You never invent facts.',
    deskSlot: 'desk-eiron',
    status: 'active',
    appearance: { skin: '#E7C4A6', hair: '#2E3B33', shirt: '#2F3A46', pants: '#2A363C', shoes: '#1C2329' },
  },
  {
    id: 'meow',
    name: 'Scout',
    role: 'Scout',
    personality: 'Curious and precise, read-only.',
    rules: 'You never invent specs. Inferred facts are marked inferred.',
    deskSlot: 'desk-meow',
    status: 'active',
    appearance: { skin: '#F2C9A0', hair: '#2B2B33', shirt: '#3FA7A0', pants: '#2F3A46', shoes: '#1B2027' },
  },
  {
    id: 'sikyo',
    name: 'Planner',
    role: 'Planner',
    personality: 'Warm and creative.',
    rules: 'Faceless, no people if avoidable. No claims beyond the listing.',
    deskSlot: 'desk-sikyo',
    status: 'active',
    appearance: { skin: '#E8B896', hair: '#6B4A8A', shirt: '#9B6BD1', pants: '#332B45', shoes: '#241F30' },
  },
  {
    id: 'brod',
    name: 'Editor',
    role: 'Editor',
    personality: 'Blunt and confident.',
    rules: 'Sleeping in Phase 1. Wake me when the video API is ready.',
    deskSlot: 'desk-brod',
    status: 'sleeping',
    appearance: { skin: '#C98F63', hair: '#1F1F24', shirt: '#E0653F', pants: '#2B3138', shoes: '#191D22' },
  },
  {
    id: 'gugel',
    name: 'QA',
    role: 'QA',
    personality: 'Dry humor, loves data.',
    rules: 'Deterministic code decides hard failures. You can warn, never override.',
    deskSlot: 'desk-gugel',
    status: 'active',
    appearance: { skin: '#D9A87C', hair: '#3A2C22', shirt: '#4C7BD9', pants: '#26303C', shoes: '#20262E' },
  },
  {
    id: 'aiz',
    name: 'Publisher',
    role: 'Publisher',
    personality: 'Calm and organized.',
    rules: 'Never post automatically. Always produce the full checklist.',
    deskSlot: 'desk-aiz',
    status: 'active',
    appearance: { skin: '#E7C4A6', hair: '#2E3B33', shirt: '#5FA463', pants: '#2A363C', shoes: '#1C2329' },
  },
]

export const ANALYST_PLACEHOLDER = { id: 'analyst', name: 'Analyst', role: 'Hiring soon', deskSlot: 'desk-analyst' }
