#!/usr/bin/env node
// 実機検証ハーネス (契約: op-skill の skills/_shared/verify-harness.md)。usage: node <this> start|stop|smoke
// stack 固有の起動・ブラウザ解決・smoke は同じディレクトリの stack.mjs に置く。
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import * as stack from './stack.mjs';

const ROOT = process.cwd();
const DIR = path.join(ROOT, '.verify');
const log = (...a) => console.error('[verify]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function stateFiles() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /^state-.+\.json$/.test(f)).map((f) => path.join(DIR, f));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer().once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// 起動時に子へ渡した VERIFY_RUN_ID を /proc/<pid>/environ で照合する (process.title の書き換えに影響されない)
function identify(pid, runId) {
  try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM' ? 'other' : 'dead'; }
  // init の無いコンテナでは止めたプロセスが zombie のまま残る
  try { if (procState(pid) === 'Z') return 'dead'; } catch { /* 読めなければ下で判定 */ }
  let env;
  try { env = fs.readFileSync(`/proc/${pid}/environ`, 'latin1'); } catch { return 'unknown'; }
  return env.split('\0').includes(`VERIFY_RUN_ID=${runId}`) ? 'ours' : 'other';
}

function statFields(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ');
}
const procState = (pid) => statFields(pid)[0];
const pgrpOf = (pid) => Number(statFields(pid)[2]);

// port を LISTEN しているソケットが、pgid のプロセスグループに属するか
function groupListensOn(pgid, port) {
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set();
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n').slice(1)) {
      const c = line.trim().split(/\s+/);
      if (c[1]?.endsWith(`:${hex}`) && c[3] === '0A') inodes.add(`socket:[${c[9]}]`);
    }
  }
  for (const p of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      if (pgrpOf(p) !== pgid) continue;
      for (const fd of fs.readdirSync(`/proc/${p}/fd`)) {
        if (inodes.has(fs.readlinkSync(`/proc/${p}/fd/${fd}`))) return true;
      }
    } catch { /* 途中で終了したプロセス */ }
  }
  return false;
}

async function killGroup(pid) {
  try { process.kill(-pid, 'SIGTERM'); } catch { /* 既に終了 */ }
  for (let i = 0; i < 50 && identify(pid, '') !== 'dead'; i++) await sleep(200);
  try { process.kill(-pid, 'SIGKILL'); } catch { /* グループが空 */ }
  for (let i = 0; i < 10 && identify(pid, '') !== 'dead'; i++) await sleep(200);
  return identify(pid, '') === 'dead';
}

// 生き残りか照合できない生存 PID があれば state を残して false
async function stopRun(file) {
  const st = readJson(file);
  if (!st?.runId || !Array.isArray(st.pids)) { log(`${file}: not a state file; left as is`); return false; }
  let keep = false;
  for (const p of st.pids) {
    const who = identify(p.pid, st.runId);
    if (who === 'dead') continue;
    if (who === 'other') { log(`pid ${p.pid} (${p.role}) is not ours; not stopped`); continue; }
    if (who === 'unknown') { log(`pid ${p.pid} (${p.role}) is alive but cannot be verified; not stopped`); keep = true; continue; }
    if (!(await killGroup(p.pid))) { log(`pid ${p.pid} (${p.role}) survived stop`); keep = true; }
  }
  if (keep) return false;
  for (const f of [st.output?.auth_state, file]) if (f) fs.rmSync(f, { force: true });
  return true;
}

async function start() {
  fs.mkdirSync(DIR, { recursive: true });
  const ignored = spawn('git', ['check-ignore', '-q', DIR], { stdio: 'ignore' });
  if ((await new Promise((r) => ignored.on('close', r))) !== 0) {
    log(`${path.relative(ROOT, DIR)}/ is not gitignored`);
    process.exit(1);
  }
  const d = new Date();
  const runId = `${d.toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(2).toString('hex')}`;
  const file = path.join(DIR, `state-${runId}.json`);
  const state = { runId, startedAt: d.toISOString(), pids: [] };
  const save = () => fs.writeFileSync(file, JSON.stringify(state));
  save();

  const ctx = {
    root: ROOT, dir: DIR, runId, log, freePort,
    // 子はプロセスグループの leader として起動し、stop はグループごと止める
    launch(role, command, { port = null, env = {}, stdio } = {}) {
      const fd = fs.openSync(path.join(DIR, `${role}-${runId}.log`), 'a');
      const child = spawn(command, {
        shell: true, cwd: ROOT, detached: true, stdio: stdio ?? ['ignore', fd, fd],
        env: { ...process.env, ...env, VERIFY_RUN_ID: runId },
      });
      fs.closeSync(fd);
      if (!child.pid) throw new Error(`${role}: failed to spawn \`${command}\``);
      child.unref();
      state.pids.push({ pid: child.pid, port, role });
      save();
      return child;
    },
    // url に応答が返るまで待ち、応答したのが自分の起動したグループかを bind ポートで確かめる
    async waitReady(url, { pid, port, timeoutMs = 120_000 }) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        if (identify(pid, runId) === 'dead') throw new Error(`${url}: process exited before ready`);
        try { await fetch(url, { signal: AbortSignal.timeout(2000) }); break; } catch { /* まだ */ }
        if (Date.now() > until) throw new Error(`${url}: not ready within ${timeoutMs}ms`);
        await sleep(500);
      }
      if (!groupListensOn(pid, port)) throw new Error(`port ${port} is not bound by the process we started`);
      return url;
    },
  };

  try {
    const out = { run_id: runId, ...(await stack.start(ctx)), pid_file: file };
    state.output = out;
    save();
    process.stdout.write(`${JSON.stringify(out)}\n`);
  } catch (e) {
    log(`start failed: ${e.message}`);
    await stopRun(file);
    process.exit(1);
  }
}

async function stop() {
  let ok = true;
  for (const f of stateFiles()) if (!(await stopRun(f))) ok = false;
  process.exit(ok ? 0 : 1);
}

async function smoke() {
  const live = stateFiles().map(readJson)
    .filter((st) => st?.output && st.pids?.some((p) => identify(p.pid, st.runId) === 'ours'))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!live.length) { log('no running run; run start first'); process.exit(1); }
  try {
    await stack.smoke(live[0].output, { dir: DIR, log });
  } catch (e) {
    log(`smoke failed: ${e.message}`);
    process.exit(1);
  }
}

const commands = { start, stop, smoke };
const cmd = commands[process.argv[2]];
if (!cmd) { log('usage: verify-harness.mjs start|stop|smoke'); process.exit(2); }
await cmd();
