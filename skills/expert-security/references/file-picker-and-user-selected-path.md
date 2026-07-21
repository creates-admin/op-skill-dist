# file-picker-and-user-selected-path.md — OS file picker / user-selected path の扱い

<!--
機能概要: OS file picker / directory picker でユーザーが明示的に選択した path を user-granted capability
         として尊重しつつ、必要な検査 (canonicalize / reparse / scope / extension / overwrite / error leak) を
         行う規約を定義する。
作成意図: usable security の核。「user-selected path だから何でも許可」も「危険だから禁止」もどちらも誤り。
         user-granted capability として尊重しつつ、validate / canonicalize / confirm / audit で守る。
注意点: trust boundary B (user-selected) の取扱。boundary A (frontend free text) との混同を避ける。
       Windows 固有の path 境界 (UNC / device path / reparse point 等) は windows-path-boundaries.md。
-->

## 中核原則

```text
OS file picker / directory picker 経由でユーザーが明示選択した path は
user-granted capability として尊重する。

ただし、ユーザーが選択した path が悪性 (reparse point / device path / reserved name 等) で
あれば、それを reject するのは validation の一部であり、capability の禁止ではない。

「ユーザーが ../system32/foo.exe を選んだから書き込む」のは間違い (reserved な path 構造を validate)。
「ユーザーが C:\Users\Alice\Documents\report.pdf を選んだから書き込む」のは正しい。
```

---

## boundary B (user-selected) の判定基準

`source.kind == "user_selected_file"` または `source.kind == "drag_drop"` のいずれかで、かつ以下のいずれかから取得した path:

- `tauri::dialog::FileDialogBuilder::pick_file` の戻り値
- `tauri::dialog::FileDialogBuilder::pick_folder` の戻り値
- `tauri::dialog::FileDialogBuilder::save` の戻り値
- ネイティブ file picker (Windows IFileDialog / macOS NSOpenPanel) の結果
- HTML5 `<input type="file">` でユーザーが選択した File オブジェクト
- drag-drop event 経由で WebView に渡された File オブジェクト

**frontend で生成された自由文字列を「user-selected」として扱ってはいけない**。
typed string は boundary A (untrusted) として扱う。

---

## user-selected path に対する必須検査 (validation の一部 = OK)

### 1. canonicalize

```text
- std::fs::canonicalize(path) で symlink / junction / reparse point を resolve
- canonicalize に失敗したら "invalid path" として reject
- canonicalize 後の絶対 path を以降の検査で使う
```

### 2. extension 検査

```text
- アプリの想定する拡張子 (例: .json, .toml, .pdf, .idml) のみ accept
- 拡張子なし / 想定外拡張子は reject (または warning)
- 大文字小文字を統一して比較
```

### 3. reserved name reject

```text
- CON, PRN, AUX, NUL, COM0..COM9, LPT0..LPT9 (case-insensitive)
- Windows のすべての drive で予約されている
- 拡張子が付いていても予約 (CON.txt も予約)
```

### 4. ADS (alternate data stream) reject

```text
- file.txt:stream のようなコロン区切り stream 名を含む path を reject
- Windows NTFS でのみ有効だが、cross-platform code でも reject 推奨
```

### 5. device path / UNC path 取扱

```text
- \\?\C:\... の device path は通常 reject (本当に必要なら明示的に許可)
- \\?\UNC\server\share\... も同様
- \\server\share\... の UNC path は network 越境を意味する。アプリの想定外なら reject
- ただし「ユーザーが UNC 上のファイルを編集する」のが正当な用途なら許可
```

### 6. reparse point / symlink

```text
- canonicalize で resolve した結果が、想定 root / workspace の外を指す場合に scope 違反として reject
  (ただし user-selected の場合は scope 強制しない場合も多い)
- 攻撃シナリオ: user-selected が一見 workspace 内だが、symlink で外部を指す
  → canonicalize 後の path で判断
- TOCTOU 対策: canonicalize 後すぐに open し、open した file descriptor / handle で操作する
```

### 7. overwrite / delete confirm (必要に応じて)

```text
- save dialog 自体に上書き確認が組み込まれている (OS 標準) のでアプリ側で再確認は不要
- ただし、 import wizard や batch processing で「既存 file を上書きします」のような状況は明示確認
- 削除操作は capability に応じて確認 (既存 UI 導線は壊さない)
```

### 8. error 出力の sanitize

```text
- error message に user-selected path をそのまま含めない (production path / user 名漏洩)
- error は generic な "ファイルを開けませんでした" 等にして、詳細は log にのみ書く
- log permission も限定 (0600 / 現ユーザーのみ Read)
```

---

## scope 強制の扱い

**user-selected path には原則 scope 強制しない**。

```text
NG (scope 強制):
  user-selected path が "C:\Users\Alice\Documents\..." なのに、アプリの workspace 配下のみ許可とする
  → ユーザーが選んだ path が使えなくなる = capability 禁止

OK (scope 強制しない):
  user-selected path をそのまま受け入れる (ただし上記 1〜8 の検査は行う)

例外: scope 強制してよいケース:
  - 自動保存 (auto-save) のように、ユーザーが毎回選ぶわけではない場合
  - 内部 cache / temp の生成 (= user-selected ではない)
  - import で読み込んだ project file 内の reference path (= boundary D, stale trusted)
  - archive extraction の解凍先 (= 内部生成 path)
```

---

## frontend free text vs user-selected の混同を避ける

```text
NG: frontend からの invoke で path: String を受け取り、それを「ユーザーが選んだ path だから」と user-selected
    として扱う

OK: frontend は file picker を呼ぶときに「OS dialog を出して」とアプリに依頼するだけ。
    実際の path は backend (Tauri 側) が dialog から取得し、その path を内部で保持する。
    frontend には「保存しました」「読み込みました」という意味だけ通知する。
    
    どうしても frontend から path を渡したい場合は untrusted (boundary A) として扱う。
```

### 理想的な実装パターン (Tauri)

```rust
// 1. frontend が "save_as" command を呼ぶ (path は渡さない)
#[tauri::command]
async fn save_as(window: tauri::Window, content: String) -> Result<(), String> {
    use tauri::api::dialog::FileDialogBuilder;
    
    // 2. backend が OS dialog を呼ぶ
    let path = FileDialogBuilder::new()
        .set_parent(&window)
        .add_filter("JSON", &["json"])
        .save_file_async()
        .await
        .ok_or("user cancelled")?;

    // 3. user-selected path に必須検査
    let path = validate_user_selected_path(&path)?;
    
    // 4. canonicalize 後の path に書き込み
    tokio::fs::write(&path, content)
        .await
        .map_err(|_| "failed to save".to_string())?;  // error sanitize
    
    Ok(())
}

fn validate_user_selected_path(path: &Path) -> Result<PathBuf, String> {
    // 1. canonicalize
    let canonical = path.canonicalize().map_err(|_| "invalid path".to_string())?;
    
    // 2. extension
    let ext = canonical.extension().and_then(|e| e.to_str()).unwrap_or("");
    if !matches!(ext, "json" | "toml" | "txt") {
        return Err("unsupported extension".to_string());
    }
    
    // 3. reserved name
    let stem = canonical.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let upper = stem.to_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"];
    if reserved.contains(&upper.as_str())
        || (upper.starts_with("COM") && upper.len() == 4)
        || (upper.starts_with("LPT") && upper.len() == 4)
    {
        return Err("reserved name".to_string());
    }
    
    // 4. ADS reject
    let s = canonical.to_string_lossy();
    if s.contains(':') && !s.starts_with(r"\\?\") {
        // path 中にコロンが drive letter 以外で含まれる = ADS の疑い
        // (この簡易チェックは Windows path に限定して使う)
    }
    
    // 5. device path / UNC reject (アプリの想定次第)
    if s.starts_with(r"\\?\") || s.starts_with(r"\\") {
        return Err("device or UNC path is not supported".to_string());
    }
    
    Ok(canonical)
}
```

---

## drag-drop の扱い

```text
- WebView の drop event で受け取った File オブジェクトの path は user-granted (boundary B)
- ただし JS 側で path を編集してから渡されると boundary A (untrusted) に降格
- backend に渡すときは path 文字列ではなく File handle / blob / 内容で渡すのが安全

drag-drop の検査:
- 上記 1〜8 と同等
- 加えて、複数 file drop の場合は 1 件ずつ独立に検査
- drag drop 経路の dragDropEnabled が必要な場合のみ true にする (capability)
```

---

## clipboard の扱い

```text
- clipboard 経由の path / URL は boundary A (untrusted) に降格
- ユーザーが「貼り付け」操作を行ったとしても、内容自体は untrusted
- file:// URL や path-like 文字列を clipboard から path として扱う前に validation 必須
```

---

## 修正提示 (recommendation.steps の例)

### scan finding: user-selected path で reparse point resolve なし

```markdown
## 修正手順

1. **canonicalize**: `std::fs::canonicalize(path)` で reparse point / symlink を resolve
   - canonicalize 失敗時は "invalid path" として reject

2. **validate**:
   - extension 検査 (.json / .toml / .txt のみ accept)
   - reserved name reject (CON / PRN / AUX / NUL / COMx / LPTx)
   - ADS reject (`file.txt:stream`)
   - device path / UNC path reject (アプリ想定外)

3. **audit**: error / log 出力に絶対 path を漏らさない (sanitize)

4. **TOCTOU 対策**: canonicalize 直後に open し、file descriptor で以降の操作

## 触ってはいけない範囲 (forbidden shortcuts)

- save_as / open_file の OS dialog UI を削除しない (user-granted capability)
- 出力先を workspace 配下に固定しない (user-granted を尊重)
- import / export を削除しない
```

### scan finding: imported project file 内 path の再検証なし (boundary D)

```markdown
## 修正手順

1. **再検証 (stale trusted data として扱う)**:
   - project file 内の reference path をそのまま使わない
   - canonicalize → scope check (workspace 配下) → extension 確認の順で再検証
   - 解決できない reference は user に「ファイルが見つかりません。再選択しますか?」を提示
     (= user-granted で再取得)

2. **validate**: reserved / ADS / device path / UNC を reject

3. **audit**: error 出力 sanitize

## 触ってはいけない範囲

- project file 内 reference を完全に無視 (project の意味が壊れる)
- workspace 内のみに無理に閉じる (project が外部 reference を持つことは正当)
```

---

## 司令官 / op-run へのシグナル

user-selected path の finding で `usable_security.forbidden_shortcuts` には少なくとも以下を含める:

```yaml
forbidden_shortcuts:
  - do_not_remove_file_picker
  - do_not_force_fixed_output_directory
```

`affected_user_capability` に該当 capability を列挙:

```yaml
affected_user_capability:
  - save_as            # save dialog 経由なら
  - open_file          # open dialog 経由なら
  - choose_directory   # directory picker 経由なら
```

`legitimate_workflow_preserved: true` を保つ mitigation を選ぶ:

```yaml
preferred_mitigation:
  - validate
  - canonicalize
  - confirm   # overwrite / delete などに限定
  - audit
```

`scope` を mitigation に含めるのは internal IPC など boundary B 以外の場合に限る。
boundary B では `scope` を強制的に「workspace 内」に絞らない (= capability 禁止になる)。
