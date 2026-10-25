const connectors =
  /^(?:node:sqlite|bun:sqlite|(?:@[^/]+\/)?(?:redis|ioredis|mongodb|mongoose|pg|postgres|mysql|mysql2|sqlite|sqlite3|better-sqlite3|knex|sequelize|typeorm|prisma|client)(?:\/|$)|@prisma\/client(?:\/|$)|dotenv(?:\/|$))/

export function assertMemoryImport(id: string): void {
  if (connectors.test(id))
    throw new Error('Memory-only checks deny persistence/environment connectors')
}

export function memoryOnlyError(): never {
  throw new Error('Memory-only checks deny file writes, subprocesses and non-fixture connections')
}
