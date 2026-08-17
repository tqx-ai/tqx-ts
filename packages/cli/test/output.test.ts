import { afterEach, describe, expect, it, vi } from 'vitest'

import { TqxApiError, TqxProtocolError } from '@tqx-ai/sdk'

import { Output, errorDetails } from '../src/output'

class BufferOutput {
  value = ''

  write(chunk: string): void {
    this.value += chunk
  }
}

class TtyBufferOutput extends BufferOutput {
  readonly isTTY = true
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Output', () => {
  it('uses ANSI colors only in color mode', () => {
    const colorBuffer = new BufferOutput()
    const plainBuffer = new BufferOutput()

    new Output('color', colorBuffer, colorBuffer).success({ status: 'ok', valid: true })
    new Output('plain', plainBuffer, plainBuffer).success({ status: 'ok', valid: true })

    expect(colorBuffer.value).toContain('\u001b[')
    expect(plainBuffer.value).not.toContain('\u001b[')
    expect(plainBuffer.value).toContain('status')
  })

  it('emits machine-readable JSON without ANSI codes', () => {
    const buffer = new BufferOutput()
    const createdAt = '2026-07-22T11:14:16.050000Z'
    new Output('json', buffer, buffer).success({ status: 'ok', created_at: createdAt })

    expect(JSON.parse(buffer.value)).toEqual({ status: 'ok', created_at: createdAt })
    expect(buffer.value).not.toContain('\u001b[')
  })

  it('renders API timestamps in the current system timezone', () => {
    const buffer = new BufferOutput()
    const timestamp = '2026-07-22T11:14:16.050000Z'
    const instant = new Date(timestamp)
    const offsetMinutes = -instant.getTimezoneOffset()
    const sign = offsetMinutes >= 0 ? '+' : '-'
    const absoluteOffset = Math.abs(offsetMinutes)
    const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`

    new Output('plain', buffer, buffer).success({
      created_at: timestamp,
      updated_at: timestamp,
    })

    expect(buffer.value).toContain(offset)
    expect(buffer.value).not.toContain(timestamp)
  })

  it('renders timestamps in tabular results in the current system timezone', () => {
    const buffer = new BufferOutput()
    const timestamp = '2026-07-22T11:14:16.050000Z'

    new Output('plain', buffer, buffer).success({
      items: [{ order_id: 'order-1', submitted_at: timestamp }],
    })

    expect(buffer.value).not.toContain(timestamp)
    expect(buffer.value).toContain('order-1')
  })

  it('explains that signal state is separate from order status', () => {
    const buffer = new BufferOutput()

    new Output('plain', buffer, buffer).success({
      signal_id: 'signal-1',
      state: 'ACCEPTED',
      order_id: 'order-1',
      order_status: null,
    })

    expect(buffer.value).toContain('state is the signal lifecycle, not the order status')
    expect(buffer.value).toContain('ACCEPTED does not mean submitted or filled')
  })

  it('explains that operation acknowledgements are not final order states', () => {
    const buffer = new BufferOutput()

    new Output('plain', buffer, buffer).success({ order_id: 'order-1', accepted: true })

    expect(buffer.value).toContain('accepted confirms only that the operation request was accepted')
    expect(buffer.value).toContain('final state')
  })

  it('animates and clears a loading indicator on an interactive terminal', () => {
    vi.useFakeTimers()
    const stdout = new TtyBufferOutput()
    const stderr = new TtyBufferOutput()
    const indicator = new Output('plain', stdout, stderr).loading()

    expect(stderr.value).toBe('\r⠋ Loading...')
    vi.advanceTimersByTime(80)
    expect(stderr.value).toContain('\r⠙ Loading...')

    indicator.stop()
    expect(stderr.value.endsWith('\r\u001b[2K')).toBe(true)
  })

  it('does not show loading output in JSON mode or when stderr is redirected', () => {
    const jsonBuffer = new TtyBufferOutput()
    const redirectedBuffer = new BufferOutput()

    new Output('json', jsonBuffer, jsonBuffer).loading().stop()
    new Output('plain', redirectedBuffer, redirectedBuffer).loading().stop()

    expect(jsonBuffer.value).toBe('')
    expect(redirectedBuffer.value).toBe('')
  })

  it('preserves API error data in JSON and human-readable output', () => {
    const data = {
      signal_id: 'signal-rejected',
      state: 'REJECTED',
      error_code: 'ORDER_INSERT_ERROR_20001',
      broker_error_id: 20001,
    }
    const error = new TqxApiError(
      'insufficient funds',
      409,
      'insufficient_funds',
      'request-1',
      data,
    )
    const jsonBuffer = new BufferOutput()
    const plainBuffer = new BufferOutput()

    new Output('json', jsonBuffer, jsonBuffer).error(error)
    new Output('plain', plainBuffer, plainBuffer).error(error)

    expect(JSON.parse(jsonBuffer.value)).toEqual({
      error: {
        message: 'insufficient funds',
        code: 'insufficient_funds',
        status: 409,
        request_id: 'request-1',
        data,
      },
    })
    expect(plainBuffer.value).toContain('\n  data:\n    {\n      "signal_id": "signal-rejected",\n')
    expect(plainBuffer.value).not.toContain('data: {')
    expect(plainBuffer.value).toContain('signal_id')
    expect(plainBuffer.value).toContain('REJECTED')
  })

  it('adds retry guidance for version conflicts in plain output without changing JSON', () => {
    const data = {
      detail: {
        code: 'version_conflict',
        latest_version_id: 244,
        base_version_id: 243,
      },
    }
    const error = new TqxApiError('Version conflict', 409, 'http_409', 'request-2', data)
    const jsonBuffer = new BufferOutput()
    const plainBuffer = new BufferOutput()

    new Output('json', jsonBuffer, jsonBuffer).error(error)
    new Output('plain', plainBuffer, plainBuffer).error(error)

    expect(JSON.parse(jsonBuffer.value)).toEqual({
      error: {
        message: 'Version conflict',
        code: 'http_409',
        status: 409,
        request_id: 'request-2',
        data,
      },
    })
    expect(plainBuffer.value).toContain('latest_version_id: 244')
    expect(plainBuffer.value).toContain('--baseVersionId=244')
    expect(plainBuffer.value).toContain('--confirmRebase')
  })

  it('omits null API error data for compact legacy errors', () => {
    const details = errorDetails(new TqxApiError('invalid API key', 401, 'invalid_api_key', null))

    expect(details).not.toHaveProperty('data')
  })

  it('renders protocol error diagnostics without response content', () => {
    const error = new TqxProtocolError(
      'The TQX API returned a non-JSON response',
      502,
      'request-non-json',
      'text/html',
      'https://api.example.test/pandaApi/agent_quant/api/factors',
    )
    const jsonBuffer = new BufferOutput()
    const plainBuffer = new BufferOutput()

    new Output('json', jsonBuffer, jsonBuffer).error(error)
    new Output('plain', plainBuffer, plainBuffer).error(error)

    expect(JSON.parse(jsonBuffer.value)).toEqual({
      error: {
        message: 'The TQX API returned a non-JSON response',
        code: 'protocol_error',
        status: 502,
        request_id: 'request-non-json',
        content_type: 'text/html',
        url: 'https://api.example.test/pandaApi/agent_quant/api/factors',
      },
    })
    expect(plainBuffer.value).toContain('(HTTP 502, text/html, request request-non-json)')
    expect(plainBuffer.value).toContain(
      'url: https://api.example.test/pandaApi/agent_quant/api/factors',
    )
  })
})
