// One command: local chain -> deploy PaidInbox -> web app.
import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'

const sh = process.platform === 'win32'
const run = (cmd, args, cwd, name) => {
  const p = spawn(cmd, args, { cwd, shell: sh, stdio: ['ignore', 'pipe', 'pipe'] })
  p.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`))
  p.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`))
  return p
}
async function rpcUp() {
  try {
    const r = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })
    return r.ok
  } catch { return false }
}

const kids = []
if (!(await rpcUp())) {
  const node = spawn('npx', ['hardhat', 'node', '--config', 'hardhat.config.cjs'], { cwd: 'contracts', shell: sh, stdio: 'ignore' })
  kids.push(node)
  for (let i = 0; i < 60 && !(await rpcUp()); i++) await wait(500)
  console.log('[chain] devnet lista en http://127.0.0.1:8545')
}
await new Promise((res, rej) => run('npx', ['hardhat', 'run', 'scripts/deploy.cjs', '--network', 'localhost', '--config', 'hardhat.config.cjs'], 'contracts', 'deploy').on('exit', (c) => (c ? rej(new Error('deploy failed')) : res())))
kids.push(run('npx', ['vite', '--open'], 'web', 'web'))
const stop = () => { kids.forEach((k) => k.kill()); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
