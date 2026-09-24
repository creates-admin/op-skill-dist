# usable-security.md — 正当な capability を残して到達経路だけを閉じる

安全性のために機能を削らない。ユーザーの正当な capability を維持したまま、到達可能なリスク経路だけを閉じる。

## 1. NG / OK

| NG (提案も実装もしない) | OK |
|---|---|
| 任意ファイル操作を禁止する | OS picker 経由の path を user-granted として扱い、検査する |
| 保存先を固定する / ユーザーに選ばせない | canonicalize し、symlink / reparse point / `..` を検査する |
| 外部ファイルをすべて拒否する | 拡張子 / scheme / reserved path を検査する |
| shell 連携・外部アプリ連携を削除する | shell 文字列を args 配列にする |
| import / export を削除する | overwrite / delete / external launch に確認を入れる |
| capability 全体を deny にする | 実際に未使用の permission だけを縮小する |
| 認証・権限モデルや updater 設計を作り直す | log / error から secret・絶対 path を除去する / IPC 入力検証を足す |

## 2. Mitigation ladder

上から順に検討し、飛び級で `deny` から始めない。

1. **validate** — 入力の class / format / encoding / size を検査。known-bad input の reject はここに含む。
2. **canonicalize** — path / URL / encoding を正規化。symlink・junction・reparse point を resolve。区切り文字・末尾ドット・空白を統一。
3. **scope** — canonicalize 後に root / workspace 内か確認。境界 B (user-selected) には強制しない。
4. **confirm** — 上書き・削除・外部起動・不可逆操作に確認。既存導線を壊さない範囲で。
5. **audit** — log / error / artifact から secret・絶対 path・文書内容を除去。重要操作の構造化ログ (中身は入れない)。
6. **permission split** — Tauri capability / IPC permission を細分化し、実際に未使用のものを外す。
7. **deny** — 最後の手段。単一の input class の reject で済む場合のみ。capability 全体には使わない。

finding 種別ごとの推奨順:

| 種別 | 順序 |
|---|---|
| path | validate → canonicalize → scope → confirm → audit |
| shell | validate → canonicalize → audit |
| IPC | validate → permission_split → audit |
| log / error | audit |
| updater / external URL | validate → canonicalize |
| parser / archive | validate → canonicalize → scope |

許可される deny (validate の一部): WebView 内の `javascript:` / `data:` / 不要な `file:` / ADS (`file.txt:stream`) /
device path (`\\?\`) / 想定外の UNC / reserved name (CON・PRN・AUX・NUL・COMx・LPTx) / archive entry の `..`・絶対 path /
size・depth・count 上限超過の deserialize。shell 文字列形式の呼び出しを args 配列へ置き換えることもここに入る。

禁止される deny: URL 機能の全削除 / 任意 path への保存・読込の全禁止 / 保存先の固定 / shell・外部アプリ連携の削除 /
import・export の削除 / 認証・権限モデルの再設計 / updater・installer・signing 設計の変更 / DB migration・schema 変更。

## 3. usable_security field の判定

### affected_user_capability

| 値 | 意味 |
|---|---|
| `save_as` | 任意 path・任意名で保存できる (OS save dialog 含む) |
| `open_file` | 任意ファイルを開ける |
| `choose_directory` | 任意 directory を選べる (workspace / 出力先) |
| `export` / `import` | 他形式への出力 / 取り込み |
| `external_app_launch` | InDesign / Photoshop / Acrobat / explorer / open などの起動 |
| `batch_processing` | 複数ファイル・複数項目の一括処理 |

capability 別の典型 finding と正しい mitigation (NG は常に「その capability の UI・導線を消す / 固定する / 形式を 1 つに絞る」):

| capability | 典型 finding | mitigation |
|---|---|---|
| `save_as` | canonicalize なし / reserved・ADS・device を reject しない / 上書き確認なし | validate + canonicalize + confirm + audit |
| `open_file` | project file 内 path を再検証しない (境界 D) | validate + canonicalize + scope |
| `export` | 出力 path に user input をそのまま使う / artifact に secret・path 混入 | validate + canonicalize + confirm + audit |
| `import` | parser に size・depth・count 上限なし / zip-slip / encoding 未検査で panic | validate + canonicalize + scope + audit |
| `batch_processing` | 途中失敗時の rollback・部分成功が曖昧で artifact が不整合 | validate + scope + audit (失敗状態を記録) + confirm (大量処理の開始前) |
| `external_app_launch` | shell 文字列で起動 / JSX・COM に user input を interpolate / PATH 依存 | trusted binary path + args 配列 + audit + confirm (既存導線の範囲で) |

### legitimate_workflow_preserved

- `true`: 上記 capability の UI・導線が残り、選択肢を強制的に絞らず、mitigation が validate / canonicalize / scope /
  confirm / audit / split に閉じている。追加 UI は確認・警告など選択肢を提示するものだけ。
- `false`: save_as / open_file / export / import / 外部連携 / batch の UI が消えた、出力先・読込元が固定された、
  capability 全体が disable された、選べる範囲が大きく減った。
- 代替 UX があれば `false` にしない (例: 危険 path 検出時に別の保存先を提案するが、最終的には任意 path に保存できる)。
  ただし代替 UX の新設 (安全な import wizard 等) は ux_impact high。

scan で提案する mitigation は `true` にできるものに限る。できないなら別の ladder を選ぶか、人間判断の論点として扱う。

### ux_impact

| 値 | 例 | 自動 apply |
|---|---|---|
| `none` | canonicalize / IPC 入力検証 / args 配列化 / error sanitize / log から secret 除去 / temp 権限縮小 | 可 |
| `low` | 上書き確認ダイアログ (既存 picker 導線は維持) / 不正拡張子の警告 | 可 |
| `medium` | 削除の確認 stage 追加 / updater 適用前の確認 / capability の permission prompt | `needs_human_decision` |
| `high` | save_as・open の UI 削除 / 出力先固定 / permission 体系の見直し / 認証・token 保存方式の再設計 | 不可 (`needs_human_decision`) |

### forbidden_shortcuts

その finding で取ってはいけない近道を列挙する。

| 値 | 付ける finding |
|---|---|
| `do_not_remove_file_picker` + `do_not_force_fixed_output_directory` | path / file IO / user-selected path (必須) |
| `do_not_remove_import_export` | import / export |
| `do_not_remove_external_app_launch` | shell / 外部アプリ / InDesign COM・ExtendScript (必須) |
| `do_not_disable_capability_entirely` | capability (必須)、log (log 機能自体を消さない) |
| `do_not_redesign_auth_model` | capability / 認証周り |
| `do_not_change_updater_design` | updater / installer |
| `do_not_force_dependency_update` | 依存起因の finding |

## 4. user-selected path (境界 B)

OS picker / directory picker / save dialog / drag-drop で選ばれた path は、ユーザーが「ここに保存 / ここから読む」と許可したもの。
「何でも許可」も「危険だから禁止」も誤り。

必須検査 (validation であって capability の禁止ではない):
1. canonicalize (失敗したら invalid path として reject)。以降は canonicalize 後の path を使い、TOCTOU を避けるため即 open して handle で操作する
2. 拡張子がアプリの想定内か (大小文字を揃えて比較)
3. reserved name / ADS / device path を reject。UNC はアプリの用途上不要なら reject (network share 上の編集が正当な用途なら許可)
4. 上書き・削除の確認。OS の save dialog が上書き確認を持つなら重ねない。import wizard / batch で既存 file を上書きする場合は確認する
5. error / Toast に選択 path をそのまま出さない (詳細は log のみ)

scope を強制しない。強制してよいのは user-selected でない場合だけ: 自動保存、内部 cache / temp、
import した project file 内の参照 path (境界 D)、archive の解凍先。

混同の禁止:
- frontend が `invoke` で渡してくる path 文字列は、ユーザーが選んだものでも境界 A として扱う。
  理想は backend が dialog を開いて path を取得・保持し、frontend には結果だけを返す形。
- drag-drop は File handle / 内容で受けるのが安全。JS 側で path を加工して渡されたら境界 A に降格。複数 drop は 1 件ずつ検査。
- clipboard 由来の path / URL は境界 A。

project file 内の参照が解決できない場合は、無視も workspace 強制もせず、ユーザーに再選択を促す (境界 B として再取得)。

user-selected path の finding: `affected_user_capability` に save_as / open_file / choose_directory の該当を入れ、
`preferred_mitigation` は validate / canonicalize / confirm / audit。`scope` は境界 B 以外にだけ使う。

## 5. recommendation.steps の書き方

mitigation ladder の段ごとに書き、最後に forbidden shortcut を明記する。

```markdown
1. validate: `path` の拡張子 (.json / .toml / .txt)、reserved name、ADS、device / UNC path を検査して reject
2. canonicalize: `std::fs::canonicalize` で resolve。失敗は error。以降は canonicalize 後の path を使う
3. scope: app_data_dir 配下に閉じているか確認 (internal IPC のため。OS picker 経由の path には強制しない)
4. audit: error は "Invalid path" 等の汎用文言にし、詳細は log のみ

触ってはいけない: save_as の OS dialog / 出力先の自由 / import・export
```
