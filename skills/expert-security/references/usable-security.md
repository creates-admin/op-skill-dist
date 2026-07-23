# usable-security.md — Usable Security の核

<!--
機能概要: security-expert の中核思想 "正当な user capability を維持したまま攻撃経路だけを封鎖する" を
         具体的な mitigation ladder と判断基準として定義する。
作成意図: 「危険だから禁止」「保存先固定」「import 削除」のような capability 全体禁止を構造的に防ぎ、
         validate / canonicalize / scope / confirm / audit / permission split で攻撃経路だけを潰す。
注意点: 本ファイルは「mitigation の選択基準」のみ。
       affected_user_capability / legitimate_workflow_preserved / ux_impact の判定は
       user-capability-preservation.md。OS file picker 経由 path の扱いは file-picker-and-user-selected-path.md。
-->

## 中核思想

```text
security-expert =
  攻撃点を見つける
  攻撃経路を証明する
  危険な経路だけを封鎖する
  正当なユーザー操作は残す
  UX を壊す安全策は自動 apply しない
```

```text
安全性を上げるために機能を削るのではなく、
ユーザーの正当な capability を維持したまま、
攻撃可能な経路だけを閉じる。
```

---

## NG / OK 早見表

```text
NG (絶対やってはいけない修正方針):
  任意ファイル操作は危ないので禁止
  保存先を固定する
  ユーザーに選ばせない
  外部ファイルはすべて拒否する
  shell 連携は全部削除する
  capability 全体を deny にする

OK (許可される修正方針):
  OS file picker 経由の user-selected path として扱う
  canonicalize する
  symlink / reparse point / parent traversal を検査する
  拡張子 / scheme / reserved path を検査する
  overwrite / delete / external launch には確認を入れる
  log / error から secret / production path を除去する
  shell 文字列を args 配列に変える
  IPC command の入力検証を追加する
  Tauri capability の実 unused を縮小する
```

---

## Mitigation Ladder (順序遵守)

mitigation を選ぶときは以下の順序で適用可否を検討する。**上から順に試し、不可能なら次へ**。
飛び級して `deny` から始めない。

```text
1. validate
   入力の class / format / encoding / size を検査する。
   known-bad input (unsafe scheme, reserved name, ADS, device path 等) を reject する。
   この reject は "validate の一部" として許可される。

2. canonicalize
   path / URL / encoding を正規化する。
   symlink / junction / reparse point を resolve する。
   trailing dot / trailing space / mixed separator を統一する。

3. scope
   canonicalize 後に root / workspace / user-selected directory の中に閉じているか確認する。
   ただし user-selected path は scope を強制しない (user-granted capability)。

4. confirm
   破壊的操作 (overwrite / delete / external launch / 不可逆) にユーザー確認を入れる。
   既存 UI 導線を壊さない範囲で追加する。

5. audit
   log / error / artifact から secret / production path / document content を除去する。
   重要操作の audit log を構造化する (ただし内容に user file 全文を含めない)。

6. permission split
   Tauri capability / IPC permission を細分化する。
   不要な permission を削除する (実 unused のみ)。

7. deny
   最後の手段。capability 全体禁止には使わない。
   validate / canonicalize / scope では救えない、かつ単独 input class の reject で済む場合のみ。
```

---

## 許可される deny / 禁止される deny

### 許可される deny (= validate の一部)

```text
- javascript: / data: URL を WebView 内で reject
- file:// scheme を WebView 内で reject (必要な場合のみ)
- file.txt:stream のような ADS path を reject
- \\?\C:\... の device path を reject
- \\server\share\... の UNC path を reject (必要な場合のみ)
- CON / PRN / AUX / NUL / COMx / LPTx の reserved name を reject
- archive entry name に `..` / 絶対 path を含むものを reject (zip-slip 防止)
- shell metachar を含む unsafe string command を args 配列へ変換 (= reject ではないが、文字列形式は deny)
- size / depth / count 上限超過の deserialize を reject (DOS 防止)
```

### 禁止される deny

```text
- URL を扱う機能を全部削除する
- 任意 path への保存を全部禁止する (ユーザーの save_as 操作を奪う)
- 任意 path からの読み込みを全部禁止する (ユーザーの open 操作を奪う)
- ファイル保存を固定ディレクトリだけにする (workspace 強制)
- shell 連携そのものを削除する (外部アプリ起動を奪う)
- import / export を削除する
- 外部アプリ連携 (InDesign / Photoshop / Acrobat) を削除する
- 認証 / 権限モデル全体を再設計する
- updater / installer / signing 設計を変える
- DB migration / schema を変える
```

---

## preferred_mitigation の選択

canonical schema 拡張の `usable_security.preferred_mitigation` には複数選択可能。
本ファイル前半の「Mitigation Ladder (順序遵守)」節の順序で選ぶ。

finding type 別の推奨順序:

| finding type | 推奨 mitigation 順序 |
|-------------|---------------------|
| path 系 | validate → canonicalize → scope → confirm → audit |
| shell 系 | validate → canonicalize → audit |
| IPC 系 | validate → permission_split → audit |
| log / error 系 | audit |
| updater / external URL 系 | validate → canonicalize |
| parser / archive 系 | validate → canonicalize → scope |

---

## forbidden_shortcuts (必ず付与)

canonical schema 拡張の `usable_security.forbidden_shortcuts` には、**この finding で取ってはいけない近道** を列挙する。

```yaml
usable_security:
  forbidden_shortcuts:
    - do_not_remove_file_picker
    - do_not_force_fixed_output_directory
    - do_not_remove_import_export
    - do_not_remove_external_app_launch
    - do_not_disable_capability_entirely
    - do_not_redesign_auth_model
```

選択肢:

| forbidden_shortcut | 意味 |
|-------------------|------|
| `do_not_remove_file_picker` | OS file picker / directory picker UI を削除しない |
| `do_not_force_fixed_output_directory` | 出力先を workspace 等に固定しない (= save_as の自由を維持) |
| `do_not_remove_import_export` | import / export 機能を削除しない |
| `do_not_remove_external_app_launch` | 外部アプリ連携 (InDesign / Photoshop 等) を削除しない |
| `do_not_disable_capability_entirely` | Tauri capability 全体を disable しない |
| `do_not_redesign_auth_model` | 認証 / 権限モデル全体の再設計に踏み込まない |
| `do_not_change_updater_design` | updater / installer / signing 設計を変えない |
| `do_not_force_dependency_update` | dependency update / lockfile 更新を主作業にしない |

finding が path / IO 系なら最低でも以下を必ず含める:

```yaml
forbidden_shortcuts:
  - do_not_remove_file_picker
  - do_not_force_fixed_output_directory
```

finding が import / export 系なら:

```yaml
forbidden_shortcuts:
  - do_not_remove_import_export
```

finding が shell / external app 系なら:

```yaml
forbidden_shortcuts:
  - do_not_remove_external_app_launch
```

finding が capability 系なら:

```yaml
forbidden_shortcuts:
  - do_not_disable_capability_entirely
```

---

## ux_impact の判定

`usable_security.ux_impact` は **mitigation を適用した結果、ユーザーが感じる体験の変化** を 4 段階で表す。

| ux_impact | 説明 |
|-----------|------|
| `none` | UI / 操作導線に影響なし。validation / canonicalize / scope check / log sanitize / capability split のみ |
| `low` | 軽微な追加 (overwrite 確認ダイアログ / 拡張子警告) はあるが、既存導線は維持 |
| `medium` | 中程度の追加 (1 stage の追加 confirmation / capability の require permission prompt) |
| `high` | 既存 UI 導線の大きな変更 / capability 全体の見直し / 認証 model の再設計 |

**`ux_impact == high` の修正は自動 apply しない**。`needs_human_decision` で人間判断に委ねる。

```text
ux_impact: none の例
- path canonicalization の追加
- IPC 入力 validation の追加
- shell 文字列を args 配列に変える
- error message の sanitize
- log から secret 除去
- temp file の権限縮小

ux_impact: low の例
- overwrite 時の確認ダイアログ追加 (既存 file picker 導線維持)
- 不正な拡張子で warning 表示

ux_impact: medium の例
- 削除操作の確認 stage 追加 (新規 dialog)
- updater 適用前の confirmation prompt 追加

ux_impact: high の例 (自動 apply 禁止)
- save_as / open file の UI 削除
- 出力先を workspace 固定にする変更
- capability 全体を見直して permission prompt 体系を変える
- 認証 model / token storage の再設計
```

---

## legitimate_workflow_preserved の判定

`usable_security.legitimate_workflow_preserved` は boolean。

```text
true = 正当な user capability (保存先選択 / 読込元選択 / export / import / 外部アプリ連携) が維持されている
false = 上記のいずれかが失われた (= apply してはいけない / post-check で BLOCK)
```

判定基準:

```text
legitimate_workflow_preserved = false にすべきケース:
- save_as の UI が削除された
- open file の UI が削除された
- 出力先を workspace 等に固定した
- import / export の機能が削除された
- 外部アプリ連携が削除された
- capability 全体が disable された
- ユーザーが選択できる範囲が大きく減った

legitimate_workflow_preserved = true にできるケース:
- mitigation が path / shell / log / capability の validation / canonicalize / scope / confirm / audit / split に閉じている
- UI 導線は既存通り
- 追加された UI は overwrite confirm / 警告など、選択肢を提示するもののみ
```

`legitimate_workflow_preserved == false` の apply は **絶対に行わない** (apply mode は停止し `needs_human_decision` で返す)。post-check で `false` を検出したら **BLOCK**。

---

## 修正提示の標準フォーマット (scan finding の recommendation)

scan finding の `recommendation.steps` は mitigation ladder に従って書く。

### 例: path traversal in IPC (frontend_invoke → file_write)

```markdown
## 修正手順

1. **validate**: `path` 引数の class を確認
   - extension が `.json` / `.toml` / `.txt` のいずれかであること
   - reserved name (CON / PRN / AUX / NUL / COMx / LPTx) を reject
   - ADS (`file.txt:stream`) を reject
   - device path (`\\?\C:\...`) と UNC path (`\\server\share\...`) を reject

2. **canonicalize**: `std::fs::canonicalize(path)` で symlink / reparse point を resolve
   - canonicalize に失敗したら error を返す
   - canonicalize 後の絶対 path を以降で使う

3. **scope**: workspace 配下に閉じているか確認
   - `tauri::api::path::app_data_dir()` 配下のみ許可
   - scope 外なら error を返す
   - 注: 本 finding は internal IPC なので scope 強制可。OS file picker 経由 path には scope 強制しない

4. **audit**: error message に絶対 path を漏らさない
   - error は "Invalid path" 等の generic な文言にする
   - 詳細は log にだけ書き、log permission も限定する

## 触ってはいけない範囲 (forbidden shortcuts)

- save_as (OS file picker 経由) の UI を削除しない
- 出力先を workspace 配下に固定しない (save_as は user-granted capability)
- import / export 機能を削除しない
```

### 例: log で絶対 path 漏洩 (config → disclose)

```markdown
## 修正手順

1. **audit**: log 出力箇所で path を sanitize
   - `Path::display()` の戻り値をそのまま log::error! に渡さない
   - user 名を含む部分を `~/` 等で置換するヘルパー関数を導入
   - log には relative path / sanitized path のみ出力

2. **audit (log permission)**: log file の権限を確認
   - production build で log を `0600` (Windows なら現ユーザーのみ Read)
   - log directory も other ユーザーから listing できないように

## 触ってはいけない範囲

- log 機能そのものを削除しない (debug / 障害解析に必要)
- recent files 機能を削除しない (UX 必須)
```

---

## apply 可否の判定 (apply mode で参照)

`apply_decision` 構造体の定義・判定マトリクス・apply 可否の詳細は `apply-policy.md` を参照。

---

## post-check 観点 (本ファイルとの対応)

post-check では以下を確認する (`post-check-policy.md` と整合):

```text
観点 7. 正当なユーザー操作が維持されているか
- legitimate_workflow_preserved == true か
- save_as / open file / export / import / 外部アプリ連携 が削除されていないか
- 出力先が workspace 等に固定されていないか
- capability 全体 disable されていないか
- forbidden_shortcuts が守られているか

観点 8. UX/UI auxiliary post-check が必要か
- ui / workflow に影響する mitigation を実装した場合 → requires_aux_post_check: true
- ui に影響しない mitigation のみ → requires_aux_post_check: false (not_required)
```

詳細は `post-check-policy.md` の 8 観点節。
