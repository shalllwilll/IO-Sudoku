import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/api/queryClient'
import Rules from './Rules'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const rule = (o: object) => ({ id: 'X', name: 'X', primitive: 'capacity', scope: '', parameters: { per: 'cioc', max: 96 }, enabled: true, strength: 'hard', not_enforced_reason: null, builtin: null, ...o })
const rulesOut = (o: object = {}) => ({
  preset: 'plant-default',
  presets: ['plant-default', 'strict'],
  custom: false,
  rules: [rule({ id: 'PS-CAP', name: 'Capacity per CIOC' }), rule({ id: 'PS-CONTIG', name: 'Contiguous blocks', primitive: null, builtin: 'R-BLOCK', parameters: {} })],
  ...o,
})

function mount(handler: (req: Request, body: unknown) => Response | Promise<Response>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (req: Request) => {
    const body = req.method === 'GET' ? undefined : await req.clone().json().catch(() => undefined)
    calls.push({ method: req.method, url: new URL(req.url).pathname, body })
    return handler(req, body)
  }))
  const router = createMemoryRouter([{ path: '/projects/:pid/rules', element: <Rules /> }], { initialEntries: ['/projects/p1/rules'] })
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return calls
}
afterEach(() => vi.unstubAllGlobals())

const base = (req: Request, extra: Record<string, () => Response> = {}) => {
  const path = new URL(req.url).pathname
  if (path.endsWith('/intent')) return extra.intent!()
  if (path.endsWith('/confirm')) return extra.confirm!()
  if (path.endsWith('/lint')) return (extra.lint ?? (() => json(200, { findings: [], dry_run: [{ rule_id: 'PS-CAP', enforced: true, matched_signals: 189, affected_blocks: 15 }] })))()
  if (path.endsWith('/runs')) return json(200, [])
  if (req.method === 'PUT') return (extra.put ?? (() => json(200, rulesOut({ custom: true }))))()
  return json(200, rulesOut())
}

describe('Rules page', () => {
  it('shows rules by strength, dry-run counts, and locks built-in invariants', async () => {
    mount((req) => base(req))
    expect(await screen.findByText('Capacity per CIOC')).toBeInTheDocument()
    expect(await screen.findByText('189 signals · 15 blocks')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Disable PS-CONTIG/ })).toBeDisabled()
    expect(screen.queryByLabelText('Strength of PS-CONTIG')).not.toBeInTheDocument()
  })

  it('saves an edit as a custom rule list', async () => {
    const calls = mount((req) => base(req))
    await screen.findByText('Capacity per CIOC')
    expect(screen.getByRole('button', { name: 'Save rules' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Strength of PS-CAP'), 'soft')
    expect(await screen.findByText('Edited, not saved')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const put = calls.find((c) => c.method === 'PUT')!
    expect((put.body as { rules: { id: string; strength: string }[] }).rules.find((r) => r.id === 'PS-CAP')?.strength).toBe('soft')
  })

  it('blocks saving while lint reports an error', async () => {
    mount((req) => base(req, { lint: () => json(200, { findings: [{ rule_id: 'PS-CAP', severity: 'error', message: 'bad scope' }], dry_run: [] }) }))
    await screen.findByText('Capacity per CIOC')
    await userEvent.selectOptions(screen.getByLabelText('Strength of PS-CAP'), 'soft')
    expect(await screen.findByText('bad scope')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save rules' })).toBeDisabled()
  })

  it('adds a custom rule to the draft', async () => {
    mount((req) => base(req))
    await userEvent.click(await screen.findByRole('button', { name: 'Add rule with the form' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Cap 80')
    await userEvent.selectOptions(within(dialog).getByLabelText('Per'), 'cioc')
    await userEvent.type(within(dialog).getByLabelText('Maximum'), '80')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to draft' }))
    expect(await screen.findByText('Cap 80')).toBeInTheDocument()
    expect(screen.getByText('USR-CAPACITY-1')).toBeInTheDocument()
  })

  it('asks before a preset switch throws away customisation', async () => {
    const calls = mount((req) => base(req))
    await screen.findByText('Capacity per CIOC')
    await userEvent.selectOptions(screen.getByLabelText('Strength of PS-CAP'), 'soft')
    await userEvent.click(screen.getByRole('radio', { name: /strict/i }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/discards your custom rules/)
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('leads with a describe box; a typed sentence becomes a checked template rule that is added only on request', async () => {
    const NEW = rule({ id: 'NL-1', name: 'Keep AIR and DOR on separate CIOCs', primitive: 'separate', parameters: { a: 'io_type = AIR', b: 'io_type = DOR', level: 'cioc' } })
    const calls = mount((req) =>
      base(req, {
        intent: () => json(200, { state: 'preview', intent: 'rule', message: 'ok', locked_rules: [], questions: [], rule_preview: { status: 'ok', message: 'review', rule: NEW, findings: [], dry_run: [{ rule_id: 'NL-1', enforced: true, matched_signals: 40, affected_blocks: 6 }], confidence: 1, source: 'template', applied: false } }),
        confirm: () => json(200, rulesOut()),
      }),
    )
    const box = await screen.findByLabelText('Describe a rule')
    await userEvent.type(box, 'Keep AIR and DOR on separate CIOCs')
    await userEvent.click(screen.getByRole('button', { name: 'Check rule' }))
    expect(await screen.findByText(/Built from a template, no AI/)).toBeInTheDocument()
    expect(screen.getByText(/Touches 40 signals in 6 cable blocks/)).toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/rules/compile/confirm'))).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Add to rules' }))
    expect(await screen.findByText(/Added as NL-1/)).toBeInTheDocument()
    expect(calls.find((c) => c.url.endsWith('/intent'))?.body).toEqual({ request: 'Keep AIR and DOR on separate CIOCs' })
  })

  it('groups locked invariants apart from enforced rules', async () => {
    mount((req) => base(req))
    expect(await screen.findByRole('region', { name: 'Locked rules' })).toHaveTextContent('Contiguous blocks')
    expect(screen.getByRole('region', { name: 'Enforced rules' })).toHaveTextContent('Capacity per CIOC')
  })
})
