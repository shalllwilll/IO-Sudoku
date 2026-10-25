import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReportDoc } from '@/api/queries'
import { ReportView } from './ReportView'

const doc: ReportDoc = {
  kind: 'tq',
  title: 'Technical query report',
  subtitle: 'Sample plant',
  meta: [['Run', 'abc123']],
  sections: [{ heading: 'Summary', text: ['3 queries'], figures: [{ label: 'Open', value: '2', hint: '' }], tables: [{ title: 'Queries', columns: ['ID', 'Status'], rows: [['TQ-1', 'open'], ['TQ-2', null]] }] }],
}

describe('ReportView', () => {
  it('lays out the cover, figures and tables, and offers print and xlsx', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReportView doc={doc} xlsx="/x.xlsx" />)
    expect(screen.getByRole('heading', { name: 'Technical query report' })).toBeInTheDocument()
    expect(screen.getByText('abc123')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TQ-1' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download \.xlsx/i })).toHaveAttribute('href', '/x.xlsx')
    await userEvent.click(screen.getByRole('button', { name: /print/i }))
    expect(print).toHaveBeenCalled()
  })
})
