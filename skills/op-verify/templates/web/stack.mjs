// Web (Playwright) の stack。TODO の箇所を repo に合わせて直す
import { createRequire } from 'node:module';
import path from 'node:path';

// TODO: target ごとの起動コマンド。ポートは harness が空きを選んで渡す (固定しない)。
// 取れないときに別ポートへ逃げる dev server は strict 指定にする (逃げると bind ポート照合で起動失敗になる)
const TARGETS = [
  { name: 'site', command: (port) => `npm run dev -- --port ${port} --strictPort`, path: '/' },
];
// TODO: smoke で「描画され操作できる」と判断する要素
const SMOKE_SELECTOR = 'body';

function playwright() {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
    try { return req(name); } catch { /* 次の候補 */ }
  }
  throw new Error('playwright is not installed in this repo');
}

// 起動を確かめたブラウザを返す。Playwright 同梱版と合わないときは VERIFY_BROWSER で実行ファイルを指す
async function resolveBrowser() {
  const { chromium } = playwright();
  const executablePath = process.env.VERIFY_BROWSER || chromium.executablePath();
  const browser = await chromium.launch({ executablePath });
  const version = browser.version();
  await browser.close();
  return { executable_path: executablePath, version, endpoint: null };
}

export async function start(ctx) {
  const targets = {};
  for (const t of TARGETS) {
    const port = await ctx.freePort();
    const child = ctx.launch(t.name, t.command(port), { port, env: { PORT: String(port) } });
    targets[t.name] = await ctx.waitReady(`http://127.0.0.1:${port}${t.path}`, { pid: child.pid, port });
  }
  // TODO: 認証が要るなら、ここでログインして storageState を
  // path.join(ctx.dir, `storageState-${ctx.runId}.json`) に保存し、そのパスを auth_state に返す
  return { driver: 'playwright', targets, auth_state: null, browser: await resolveBrowser() };
}

export async function smoke(out, { dir }) {
  const { chromium } = playwright();
  const browser = await chromium.launch({ executablePath: out.browser.executable_path });
  try {
    const context = await browser.newContext(out.auth_state ? { storageState: out.auth_state } : {});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(out.targets[TARGETS[0].name], { waitUntil: 'load' });
    await page.locator(SMOKE_SELECTOR).first().waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(dir, `smoke-${out.run_id}.png`) });
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}
