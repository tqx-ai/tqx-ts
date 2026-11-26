import * as v from 'valibot'

export const integer = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
export const revision = v.pipe(integer, v.minValue(1))
export const finite = v.pipe(
  v.number(),
  v.check((value) => Number.isFinite(value), 'Expected a finite number'),
)
export const id = v.pipe(v.string(), v.regex(/^[0-9a-f]{24}$/))
export const status = v.picklist([
  'preparing',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])
export const date = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/),
  v.check((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, 'Expected a valid YYYY-MM-DD date'),
)
export const time = v.pipe(
  v.string(),
  v.check(
    (s) =>
      v.safeParse(date, s).success ||
      (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) &&
        v.safeParse(date, s.slice(0, 10)).success &&
        Number.isFinite(Date.parse(s))),
    'Expected a date or timezone-aware ISO datetime',
  ),
)
