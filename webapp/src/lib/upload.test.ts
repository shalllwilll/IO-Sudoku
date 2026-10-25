import { describe, expect, it } from 'vitest'
import { checkFile, MAX_BYTES } from './upload'

describe('checkFile', () => {
  it('accepts a normal workbook', () => expect(checkFile({ name: 'MDB.XLSX', size: 1000 })).toBeNull())
  it('rejects other formats, empty and oversized files', () => {
    expect(checkFile({ name: 'a.csv', size: 10 })).toMatch(/\.xlsx/)
    expect(checkFile({ name: 'a.xlsx', size: 0 })).toMatch(/empty/)
    expect(checkFile({ name: 'a.xlsx', size: MAX_BYTES + 1 })).toMatch(/25 MB/)
  })
})
