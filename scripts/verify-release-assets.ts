/**
 * Verifies one standalone release binary and its gzip asset against SHA256SUMS.
 *
 * Why: `tqx self-update` and manual installs prefer the `.gz` asset and trust SHA256SUMS, so a
 * bad compression step or a checksum that does not match the published file would break upgrades
 * or install the wrong bytes. This check runs before the GitHub Release is created. It only reads
 * files, so it can check any platform's assets on any machine.
 *
 * Usage: bun scripts/verify-release-assets.ts <release-assets-dir> <asset-name>
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const [directory, assetName] = process.argv.slice(2)
if (!directory || !assetName) {
  process.stderr.write('Usage: bun scripts/verify-release-assets.ts <dir> <asset-name>\n')
  process.exit(2)
}

const checksums = new Map<string, string>()
for (const line of readFileSync(join(directory, 'SHA256SUMS'), 'utf8').split(/\r?\n/)) {
  const [hash, name] = line.trim().split(/\s+/, 2)
  if (hash && name) checksums.set(name.replace(/^\*/, ''), hash.toLowerCase())
}

const raw = readFileSync(join(directory, assetName))
const compressedName = `${assetName}.gz`
const compressed = readFileSync(join(directory, compressedName))

expect(checksums.get(assetName) === sha256(raw), `SHA256SUMS matches ${assetName}`)
expect(checksums.get(compressedName) === sha256(compressed), `SHA256SUMS matches ${compressedName}`)
expect(gunzipSync(compressed).equals(raw), `${compressedName} decompresses to ${assetName}`)
process.stdout.write(
  `${assetName}: ${mebibytes(raw.length)} raw, ${mebibytes(compressed.length)} gzip\n`,
)

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function mebibytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function expect(condition: boolean, name: string): void {
  if (!condition) {
    process.stderr.write(`not ok - ${name}\n`)
    process.exit(1)
  }
  process.stdout.write(`ok - ${name}\n`)
}
