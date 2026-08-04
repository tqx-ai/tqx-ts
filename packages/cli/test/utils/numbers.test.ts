import { describe, expect, it } from 'vitest'

import { CliUsageError } from '../../src/utils/errors'
import { optionalFloat, optionalNumber } from '../../src/utils/numbers'

describe('numeric CLI utilities', () => {
  it('parses optional integers', () => {
    expect(optionalNumber(undefined)).toBeUndefined()
    expect(optionalNumber('-42')).toBe(-42)
  })

  it('rejects non-integers', () => {
    expect(() => optionalNumber('1.5')).toThrow(CliUsageError)
    expect(() => optionalNumber('1.5')).toThrow('Expected an integer, received 1.5')
  })

  it('parses optional finite numbers', () => {
    expect(optionalFloat(undefined)).toBeUndefined()
    expect(optionalFloat('1.5')).toBe(1.5)
  })

  it('rejects non-finite numbers', () => {
    expect(() => optionalFloat('Infinity')).toThrow(CliUsageError)
    expect(() => optionalFloat('Infinity')).toThrow('Expected a number, received Infinity')
  })
})
