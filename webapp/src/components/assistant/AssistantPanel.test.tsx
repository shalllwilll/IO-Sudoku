import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import { useAssistant } from '@/state/assistant'
import { AssistantPanel } from './AssistantPanel'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const RULE = { id: 'R-AI-1', name: 'Keep AIR and DOR apart', strength: 'hard', primitive: 'separate', scope: '', parameters: { a: 'io_type = AIR', b: 'io_type = DOR', level: 'CIOC' }, enabled: true, not_enforced_reason: null, builtin: null }

let calls: { path: string; body?: unknown }[] = []
function mount(intent: unknown, ai = true) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (req: Request) => {
    const path = new URL(req.url).pathname
    const body = req.method === 'POST' ? await req.clone().json() : undefined
    calls.push({ path, body })
    if (path.endsWith('/ai/status')) return json({ ai_available: ai, models: [] })
    if (path.endsWith('/intent')) return json(intent)
    if (path.endsWith('/rules/compile/confirm')) return json({ rules: [RULE] })
    return json({})
  }))
  useAssistant.setState({ open: true })
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/projects/p1/rules']}>
        <Routes>
          <Route path="/projects/:pid/*" element={<AssistantPanel />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const ask = async (text: string) => {
  await userEvent.type(screen.getByLabelText('Ask the allocation copilot'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
}
beforeEach(() => useAssistant.setState({ open: false }))
afterEach(() => vi.unstubAllGlobals())

describe('AssistantPanel', () => {
  it('previews a rule and only saves it after an explicit add', async () => {
    mount({ state: 'preview', intent: 'rule', message: 'ok', locked_rules: [], questions: [], rule_preview: { status: 'ok', message: 'Compiled.', rule: RULE, findings: [], dry_run: [{ rule_id: 'R-AI-1', matched_signals: 12, affected_blocks: 3 }], confidence: 0.9, source: 'ai', applied: false } })
    await ask('Keep AIR and DOR on separate CIOCs')
    expect(await screen.findByText('Keep AIR and DOR apart')).toBeInTheDocument()
    expect(screen.getByText(/Touches 12 signals in 3 cable blocks/)).toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/rules/compile/confirm'))).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Add to rules' }))
    expect(await screen.findByText(/Added as R-AI-1/)).toBeInTheDocument()
    expect(calls.find((c) => c.path.endsWith('/rules/compile/confirm'))?.body).toEqual({ rule: RULE })
  })

  it('shows a locked-rule conflict without offering to add anything', async () => {
    mount({ state: 'conflict', intent: 'conflict', message: 'A and B may not share a CIOC.', locked_rules: ['R-SEG'], questions: [], rule_preview: null })
    await ask('Let A and B share a CIOC')
    expect(await screen.findByText('This rule is locked')).toBeInTheDocument()
    expect(screen.getByText('R-SEG')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to rules' })).not.toBeInTheDocument()
  })

  it('treats AI being off as a normal state', async () => {
    mount({ state: 'unavailable', intent: 'rule', message: 'AI is not configured.', locked_rules: [], questions: [], rule_preview: null }, false)
    expect(await screen.findByText('Checked template preview')).toBeInTheDocument()
    await ask('Keep AIR and DOR on separate CIOCs')
    expect(await screen.findByRole('link', { name: 'Build the rule with the form instead' })).toBeInTheDocument()
  })

  it('blocks adding a rule with error findings', async () => {
    mount({ state: 'preview', intent: 'rule', message: 'x', locked_rules: [], questions: [], rule_preview: { status: 'ok', message: 'Compiled.', rule: RULE, findings: [{ severity: 'error', message: 'contradicts R-SEG' }], dry_run: [], confidence: 0.5, source: 'ai', applied: false } })
    await ask('something risky')
    expect(await screen.findByText('contradicts R-SEG')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to rules' })).toBeDisabled()
  })
})
