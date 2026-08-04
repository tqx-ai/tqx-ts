export function uniqueById<T extends { id: number }>(items: readonly T[]): T[] {
  const seen = new Set<number>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function compareDescending(left: number, right: number): number {
  return left === right ? 0 : left > right ? -1 : 1
}
