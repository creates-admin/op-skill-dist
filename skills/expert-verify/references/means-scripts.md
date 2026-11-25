# 操作手段 2・3 の実行

SKILL.md「3. 操作手段の順序」の手段 2・3 の詳細。

## 手段 2: Playwright ライブラリ

ライブラリは checkout の依存から解決する。無ければ証跡ディレクトリに `npm install --prefix <証跡ディレクトリ>/pw playwright-core` で入れ
(ブラウザはダウンロードされない)、`PW_FALLBACK_DIR` にそのパスを渡す。どちらにしたかを `gaps` に書く。

```js
// <証跡ディレクトリ>/shot.cjs  (cwd = checkout)
// 使い方: node shot.cjs <start.json> <target 名> <パス> <出力 png> [wait_for のセレクタ]
// exit 0: 撮影できた / exit 2: 要素待ちの時間切れ (撮影と JSON 出力は済み) / それ以外の非 0: 手段の失敗
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const [startJson, target, urlPath, out, waitFor] = process.argv.slice(2);
const start = JSON.parse(fs.readFileSync(startJson, 'utf8'));

function loadPlaywright() {
  const roots = [process.cwd(), process.env.PW_FALLBACK_DIR].filter(Boolean);
  for (const root of roots) {
    for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
      try { return createRequire(path.join(root, 'package.json'))(name); } catch {}
    }
  }
  throw new Error('playwright library not found');
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: start.browser.executable_path });
  const context = await browser.newContext(start.auth_state ? { storageState: start.auth_state } : {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const res = await page.goto(new URL(urlPath, start.targets[target]).href, { waitUntil: 'load' });
  let waitTimeout = null;
  try {
    await page.locator(waitFor || 'body').first().waitFor({ state: waitFor ? 'visible' : 'attached' });
  } catch (e) {
    if (e.name !== 'TimeoutError') throw e;
    waitTimeout = e.message.split('\n')[0];
  }
  await page.screenshot({ path: out, fullPage: true });
  console.log(JSON.stringify({ status: res && res.status(), url: page.url(), errors, wait_timeout: waitTimeout }));
  await browser.close();
  process.exitCode = waitTimeout ? 2 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
```

SSE や常時ポーリングのあるページは network が静まらないため、`networkidle` を待たない。描画完了は `load` と、
シナリオの `wait_for` があればその要素の表示、無ければ `body` の存在で判定する。

exit 2 は要素待ちの時間切れで、スクリーンショットと stdout の JSON (`wait_timeout` に時間切れの内容、`errors` にコンソールエラー) は出ている。
シナリオの fail として扱い (`actual` に `wait_timeout`、`evidence` にそのスクリーンショット)、手段 3 へは進まない。
exit 1 などそれ以外の非 0 は手段 2 の失敗として `means_attempts` に stderr を verbatim で残し、手段 3 へ進む。
クリックや入力が要るシナリオは、このスクリプトの要素待ちと `screenshot` の間に操作を足した別ファイルを証跡ディレクトリに作る。exit code の意味は変えない。

## 手段 3: WebDriver

capabilities は start の JSON の `webdriver_capabilities` (`verify-harness.md` §2。Tauri は `tauri:options.application`) を
`alwaysMatch` に入れる。無ければ spawn prompt の指定、どちらも無ければ `{}`。

途中の失敗で空の png を証跡にしないよう、subshell 内で pipefail を有効にし、画像は一時ファイルに書いて中身があるときだけ置き換える。

```bash
(
  set -euo pipefail
  EP="<browser.endpoint>"
  OUT="<証跡ディレクトリ>/<シナリオ名>.png"
  CAPS=$(jq -c '{capabilities: {alwaysMatch: (.webdriver_capabilities // {})}}' "<start の JSON>")
  SID=$(curl -sf -X POST "$EP/session" -H 'Content-Type: application/json' \
    -d "$CAPS" | jq -er '.value.sessionId // empty')
  : "${SID:?WebDriver session を作れなかった}"
  trap 'rm -f "$OUT.part"; curl -sf -o /dev/null -X DELETE "$EP/session/$SID" || true' EXIT
  curl -sf -o /dev/null -X POST "$EP/session/$SID/url" -H 'Content-Type: application/json' -d '{"url":"<target URL>"}'
  curl -sf "$EP/session/$SID/screenshot" | jq -er '.value // empty' | base64 -d > "$OUT.part"
  test -s "$OUT.part"
  mv "$OUT.part" "$OUT"
)
```

非 0 で終わったら手段 3 の失敗として `means_attempts` に stderr を verbatim で残す。
