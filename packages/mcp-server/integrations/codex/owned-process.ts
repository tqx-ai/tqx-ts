import assert from 'node:assert/strict'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

function exited(child: ChildProcessWithoutNullStreams) {
  return !child.pid || child.exitCode !== null || child.signalCode !== null
}
async function waitForExit(child: ChildProcessWithoutNullStreams, milliseconds: number) {
  const deadline = Date.now() + milliseconds
  while (!exited(child) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 25))
}
export async function closeOwnedProcess(child: ChildProcessWithoutNullStreams) {
  if (!exited(child)) {
    child.stdin.end()
    await waitForExit(child, 1500)
  }
  if (!exited(child)) {
    child.kill()
    await waitForExit(child, 1500)
  }
  assert(exited(child), 'Owned client process did not exit; stop acceptance and inspect its PID')
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
  child.unref()
}
