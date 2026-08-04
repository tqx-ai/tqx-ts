import { describe, expect, it } from 'vitest'

import { isRecord } from '../../src/utils/basic/type-guard'

describe('isRecord', () => {
  it('accepts objects and rejects null and arrays', () => {
    expect(isRecord({ key: 'value' })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
  })
})
