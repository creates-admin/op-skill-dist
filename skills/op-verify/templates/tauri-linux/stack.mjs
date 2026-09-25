// Tauri Linux (WebKitGTK + tauri-driver + Xvfb) の stack。TODO の箇所を repo に合わせて直す
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// TODO: 検証する checkout からアプリをビルドするコマンドと、できあがる実行ファイル
const BUILD = 'npm run tauri build -- --debug --no-bundle';
const APPLICATION = 'src-tauri/target/debug/app';
// TODO: smoke で「描画され操作できる」と判断する要素
const SMOKE_SELECTOR = 'body';
const NATIVE_DRIVER = process.env.VERIFY_NATIVE_DRIVER || '/usr/bin/WebKitWebDriver';

function webkitVersion() {
  for (const pkg of ['webkit2gtk-4.1', 'webkit2gtk-4.0']) {
    try { return execFileSync('pkg-config', ['--modversion', pkg], { encoding: 'utf8' }).trim(); } catch { /* 次の候補 */ }
  }
  throw new Error('WebKitGTK is not installed (pkg-config found no webkit2gtk)');
}

// 空いている display 番号は Xvfb 自身に選ばせる (-displayfd)
async function startXvfb(ctx) {
  const child = ctx.launch('xvfb', 'Xvfb -displayfd 3 -screen 0 1280x800x24 -nolisten tcp', {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
  });
  const display = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Xvfb did not report a display')), 30_000);
    child.stdio[3].on('data', (d) => {
      buf += d;
      if (buf.includes('\n')) { clearTimeout(timer); resolve(`:${buf.trim()}`); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Xvfb exited with ${code}`)); });
  });
  child.stdio[3].destroy();
  return display;
}

export async function start(ctx) {
  // stdout は start の JSON 専用なので、ビルドの出力は stderr へ流す
  const build = spawnSync(BUILD, { shell: true, cwd: ctx.root, stdio: ['ignore', 2, 2] });
  if (build.status !== 0) throw new Error(`build failed: \`${BUILD}\``);
  const application = path.resolve(ctx.root, APPLICATION);
  if (!fs.existsSync(application)) throw new Error(`${application} was not built`);

  try { fs.accessSync(NATIVE_DRIVER, fs.constants.X_OK); } catch {
    throw new Error(`${NATIVE_DRIVER} is not executable (set VERIFY_NATIVE_DRIVER)`);
  }

  const display = await startXvfb(ctx);
  const port = await ctx.freePort();
  const nativePort = await ctx.freePort();
  const driver = ctx.launch(
    'tauri-driver',
    `tauri-driver --port ${port} --native-port ${nativePort} --native-driver ${NATIVE_DRIVER}`,
    { port, env: { DISPLAY: display } },
  );
  const endpoint = `http://127.0.0.1:${port}`;
  await ctx.waitReady(`${endpoint}/status`, { pid: driver.pid, port });
  const capabilities = { 'tauri:options': { application } };
  // /status は tauri-driver 単体でも返るので、操作対象 (WebKitWebDriver とアプリ) の起動はセッションを張って確かめる
  const { sessionId } = await wd(endpoint, 'POST', '/session', { capabilities: { alwaysMatch: capabilities } });
  await wd(endpoint, 'DELETE', `/session/${sessionId}`);

  return {
    driver: 'webdriver',
    // TODO: harness が API サーバー等も起動するなら target として足し、op-config の targets にも宣言する
    targets: {},
    auth_state: null,
    browser: { executable_path: NATIVE_DRIVER, version: webkitVersion(), endpoint },
    webdriver_capabilities: capabilities,
  };
}

async function wd(endpoint, method, route, body) {
  const res = await fetch(`${endpoint}${route}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${route}: ${JSON.stringify(json.value)}`);
  return json.value;
}

async function waitVisible(ep, sessionId, selector, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const el = await wd(ep, 'POST', `/session/${sessionId}/element`, { using: 'css selector', value: selector });
      const id = el['element-6066-11e4-a07e-4f66e8c5d8ea'];
      if (await wd(ep, 'GET', `/session/${sessionId}/element/${id}/displayed`)) return;
    } catch (e) {
      if (Date.now() > until) throw e;
    }
    if (Date.now() > until) throw new Error(`${selector}: not visible within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function smoke(out, { dir }) {
  const ep = out.browser.endpoint;
  const { sessionId } = await wd(ep, 'POST', '/session', {
    capabilities: { alwaysMatch: out.webdriver_capabilities },
  });
  try {
    await waitVisible(ep, sessionId, SMOKE_SELECTOR);
    const png = await wd(ep, 'GET', `/session/${sessionId}/screenshot`);
    fs.writeFileSync(path.join(dir, `smoke-${out.run_id}.png`), Buffer.from(png, 'base64'));
  } finally {
    await wd(ep, 'DELETE', `/session/${sessionId}`).catch(() => {});
  }
}
