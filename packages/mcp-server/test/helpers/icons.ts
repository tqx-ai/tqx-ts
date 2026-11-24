import type { Icon } from '@modelcontextprotocol/server'
import { assert, expect } from 'vitest'

export function expectPngIcons(icons: Icon[]): void {
  expect(icons).toEqual([
    {
      src: expect.stringMatching(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/),
      mimeType: 'image/png',
      sizes: ['48x48'],
    },
  ])
  const [icon] = icons
  assert(icon)
  const png = Buffer.from(icon.src.slice('data:image/png;base64,'.length), 'base64')
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(png.subarray(12, 16).toString()).toBe('IHDR')
  expect(png.readUInt32BE(16)).toBe(48)
  expect(png.readUInt32BE(20)).toBe(48)
}
