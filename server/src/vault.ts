import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { AgentPreview, PlanBlock, AgentNeeds } from '@hive/shared'

const VAULT_DIR = resolve(
  process.cwd(),
  process.env.OBSIDIAN_VAULT_PATH ?? 'data/vault',
)

function ensureDir(filePath: string): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function getVaultPath(): string {
  return VAULT_DIR
}

export function initVault(): void {
  if (!existsSync(VAULT_DIR)) {
    mkdirSync(VAULT_DIR, { recursive: true })
  }
  const subdirs = ['Agents', 'Relationships', 'Daily', 'Lessons', 'Tasks']
  for (const sub of subdirs) {
    const p = resolve(VAULT_DIR, sub)
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true })
    }
  }

  // Vault Root README / Canvas index
  const indexFile = resolve(VAULT_DIR, 'README.md')
  if (!existsSync(indexFile)) {
    writeFileSync(
      indexFile,
      `# Hive — AI Agents Second Brain 🧠

Welcome to the Obsidian Second Brain vault for Hive office agents.

## 👥 Agents
- [[Meow]] — Researcher
- [[Gugel]] — Analyst
- [[Sikyo]] — Writer
- [[Brod]] — Strategist
- [[Aiz]] — Coordinator

## 📂 Vault Structure
- **Agents/**: Detailed profiles, live needs, daily schedules, and memory logs.
- **Relationships/**: Inter-agent interactions, affinity scores, and conversation transcripts.
- **Daily/**: Office day journals and milestone notes.
- **Lessons/**: Knowledge and lessons learned from executed tasks.
- **Tasks/**: Task execution logs and deliverables.
`,
      'utf8',
    )
  }
}

function formatTime(minutes: number): string {
  const m = Math.floor(((minutes % 1440) + 1440) % 1440)
  const hh = Math.floor(m / 60)
  const mm = m % 60
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const displayH = hh % 12 === 0 ? 12 : hh % 12
  return `${displayH}:${String(mm).padStart(2, '0')} ${ampm}`
}

export function syncAgentToVault(
  agent: AgentPreview,
  currentSim?: {
    activity: string
    mood: string
    needs?: AgentNeeds
    plan?: PlanBlock[]
    talkingWith?: string | null
  },
): void {
  initVault()
  const filePath = resolve(VAULT_DIR, 'Agents', `${agent.name}.md`)
  ensureDir(filePath)

  const mood = currentSim?.mood ?? agent.mood
  const activity = currentSim?.activity ?? agent.activity
  const plan = currentSim?.plan ?? agent.plan ?? []
  const needs = currentSim?.needs ?? agent.needs ?? {
    energy: 85,
    hunger: 70,
    social: 60,
    fun: 75,
  }
  const traits = agent.traits ?? ['workaholic']

  const relationshipsMd =
    agent.relationships && Object.keys(agent.relationships).length > 0
      ? Object.entries(agent.relationships)
          .map(([colleagueId, note]) => {
            const capName = colleagueId.charAt(0).toUpperCase() + colleagueId.slice(1)
            return `- [[${capName}]]: ${note}`
          })
          .join('\n')
      : '- *No colleague notes logged yet.*'

  const planMd =
    plan.length > 0
      ? plan
          .map(
            (b) =>
              `- [${b.done ? 'x' : ' '}] ${b.label} (${formatTime(b.startMinute)} – ${formatTime(b.endMinute)})`,
          )
          .join('\n')
      : '- *No active schedule for today.*'

  const lessonsMd =
    agent.lessons.length > 0
      ? agent.lessons.map((l, i) => `${i + 1}. ${l}`).join('\n')
      : '- *No recorded lessons yet.*'

  const content = `---
id: ${agent.id}
name: ${agent.name}
role: ${agent.role}
traits: [${traits.join(', ')}]
mood: ${mood}
activity: ${activity}
energy: ${Math.round(needs.energy)}
hunger: ${Math.round(needs.hunger)}
social: ${Math.round(needs.social)}
fun: ${Math.round(needs.fun)}
desk: [${agent.desk.x}, ${agent.desk.y}]
tags:
  - agent
  - ${agent.role.toLowerCase()}
  - hive
last_updated: "${new Date().toISOString()}"
---

# ${agent.name} — ${agent.role}

> ${agent.personality}

## 🧠 Inner State & Needs
- **Mood**: \`${mood}\`
- **Current Activity**: \`${activity}\`
- **⚡ Energy**: ${Math.round(needs.energy)}/100
- **🥪 Hunger**: ${Math.round(needs.hunger)}/100
- **💬 Social**: ${Math.round(needs.social)}/100
- **🎮 Fun**: ${Math.round(needs.fun)}/100

## 📅 Today's Plan
${planMd}

## 🤝 Relationships & Network
${relationshipsMd}

## 💡 Lessons Learned
${lessonsMd}
`

  writeFileSync(filePath, content, 'utf8')
}

export function recordConversationToVault(
  agentAName: string,
  agentBName: string,
  topic: string,
  turns: Array<{ speakerName: string; text: string; at: number }>,
): void {
  initVault()
  const names = [agentAName, agentBName].sort()
  const fileName = `${names[0]} and ${names[1]}.md`
  const filePath = resolve(VAULT_DIR, 'Relationships', fileName)
  ensureDir(filePath)

  const dateStr = new Date().toISOString().slice(0, 10)
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const transcript = turns
    .map((t) => `**[[${t.speakerName}]]**: "${t.text}"`)
    .join('\n\n')

  const entry = `
### 💬 Sync: ${topic} (${dateStr} ${timeStr})
Participants: [[${names[0]}]] & [[${names[1]}]]

${transcript}

---
`

  if (!existsSync(filePath)) {
    const header = `---
type: relationship
participants: [${names.map((n) => `[[${n}]]`).join(', ')}]
tags:
  - relationship
  - hive
---

# Dialogue Log: [[${names[0]}]] & [[${names[1]}]]

`
    writeFileSync(filePath, header + entry, 'utf8')
  } else {
    appendFileSync(filePath, entry, 'utf8')
  }
}

export function recordTaskToVault(
  agentName: string,
  prompt: string,
  result: string,
  lesson?: string | null,
): void {
  initVault()
  const dateStr = new Date().toISOString().slice(0, 10)
  const taskSlug = `task-${Date.now()}`
  const filePath = resolve(VAULT_DIR, 'Tasks', `${taskSlug}.md`)
  ensureDir(filePath)

  const content = `---
agent: [[${agentName}]]
date: "${dateStr}"
status: done
tags:
  - task
  - deliverable
---

# Task for [[${agentName}]]

## 📥 Prompt
${prompt}

## 📤 Result
${result}

${lesson ? `## 💡 Lesson Learned\n- ${lesson}` : ''}
`
  writeFileSync(filePath, content, 'utf8')

  if (lesson) {
    const lessonPath = resolve(VAULT_DIR, 'Lessons', `${agentName}-lessons.md`)
    ensureDir(lessonPath)
    const appendText = `- [[${agentName}]] (${dateStr}): ${lesson}\n`
    if (!existsSync(lessonPath)) {
      writeFileSync(lessonPath, `# Knowledge Vault: [[${agentName}]]\n\n${appendText}`, 'utf8')
    } else {
      appendFileSync(lessonPath, appendText, 'utf8')
    }
  }
}

export function getAgentVaultNote(agentName: string): string | null {
  initVault()
  const filePath = resolve(VAULT_DIR, 'Agents', `${agentName}.md`)
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, 'utf8')
}
