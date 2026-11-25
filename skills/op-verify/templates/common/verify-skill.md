---
name: verify
description: このリポジトリのアプリを起動して、変更が実機で動くかを確かめるときに使う。「変更を確かめて」「動作確認」「実機で見て」と言われたとき、または UI・画面・起動に関わる変更を報告する前に使う。
---

<!-- op-verify のひな形。対象 repo の .claude/skills/verify/SKILL.md として置き、置いたらこのコメントを消す (frontmatter は先頭のまま)。
  {{start}} / {{stop}} / {{smoke}}: op-config.yaml の verify_harness の同名キーの値
  {{driver}}: verify_harness.driver の値。「4. 変えた流れを操作して撮る」の driver の箇条は該当する行だけを残す
  {{artifacts}}: ハーネスが生成物を置く gitignore 済みのディレクトリ (テンプレートのハーネスなら .verify/)
  {{login}}: auth_state が null のときのサインインの扱い (要らなければ「不要」)
  「繰り返し確かめる流れ」と「手作業で補う工程」は --init では空のまま (「なし」) にし、op-verify --grow が育てる -->

# verify: 変更を実機で確かめる

手順はこのリポジトリの実機検証ハーネスを呼ぶだけにする。起動の事情はハーネスの中にあるので、プロセスを手で立てない。
すべてのコマンドはリポジトリのルートで実行する。

## 1. 起動する

```bash
{{start}}
```

stdout の 1 行の JSON を控える。`targets` が開く URL、`auth_state` がサインイン済みの状態のファイル、
`browser` が操作に使うブラウザ、`run_id` がこの起動の ID。exit が 0 でなければ stderr の末尾を報告して止める。

## 2. 準備ができるまで待つ

start は ready を確かめてから戻る。続けて smoke で、画面が描画され操作できることを確かめる。

```bash
{{smoke}}
```

exit が 0 でなければ 5 の停止をしてから、smoke の出力を報告して止める。

## 3. サインインする

`auth_state` が null でなければ、そのファイルをサインイン済みの状態として読み込む (Playwright なら storageState)。
null なら、サインインは {{login}}。

## 4. 変えた流れを操作して撮る

- playwright: `browser.executable_path` のブラウザで `targets` の URL を開く。
- webdriver: `browser.endpoint` に New Session を送り、`webdriver_capabilities` を `capabilities.alwaysMatch` に渡す (無ければ `{}`)。

変更が触れた画面を開き、変えた流れを実際に操作する。操作の前後でスクリーンショットを撮り、`{{artifacts}}` に保存する。
下の「繰り返し確かめる流れ」があれば、それも実行する。「手作業で補う工程」はハーネスがまだ自動でやらない工程なので、書かれた時点で手で行う。

### 繰り返し確かめる流れ

なし

### 手作業で補う工程

なし

## 5. 停止する

結果にかかわらず、最後に必ず実行する。

```bash
{{stop}}
```

## 6. 報告する

実行したコマンドと操作の手順、見た結果 (スクリーンショットのパス、期待と実際の違い) を報告する。
手順と見た結果を示さずに成功を報告しない。stop の exit が 0 でなければそれも報告する。
