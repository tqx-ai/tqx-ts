import { afterAll } from 'vitest'
import { installMemoryGuards } from './memory-guards'

const guards = installMemoryGuards()
afterAll(() => guards.restore())
