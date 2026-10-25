import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = fileURLToPath(new URL('./', import.meta.url))
export async function packageDistribution(output: string) {
  const directory = resolve(output)
  await mkdir(directory, { recursive: true })
  const entries = [
    ['INSTALL_WITH_CODEX.md', 'INSTALL_LOCAL_PLUGIN_WITH_CODEX.md'],
    ['tqx-callback-login.mjs', 'callback-login.mjs'],
    ['tqx-environment-source.mjs', 'deployment-environment.mjs'],
    ['START_HERE.md', 'distribution-start.md'],
  ] as const
  const files: Record<string, Buffer> = {}
  for (const [name, source] of entries) files[name] = await readFile(resolve(base, source))
  files['PUBLIC-CONNECTION.example.json'] = Buffer.from(
    `${JSON.stringify({ environment: 'test', resource: null, issuer: null, webOrigin: null }, null, 2)}\n`,
  )
  const checksums: Record<string, string> = {}
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(resolve(directory, name), bytes)
    checksums[name] = createHash('sha256').update(bytes).digest('hex')
  }
  await writeFile(
    resolve(directory, 'CHECKSUMS.json'),
    `${JSON.stringify({ format: 'TQX Codex onboarding guide kit; not plugin upload archive', sourceOnly: true, files: checksums }, null, 2)}\n`,
  )
  return { directory, checksums, fileCount: Object.keys(files).length + 1 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2]
  if (!output) throw new Error('Provide the explicitly chosen local distribution output directory')
  console.log(JSON.stringify(await packageDistribution(output)))
}
