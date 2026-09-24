# expert-debug バグパターン (active stack)

検出兆候一覧の正本。対象: Rust / Tauri v2 / Vue 3 / TypeScript / Dart / Flutter。React / Go は扱わない。
報告閾値は SKILL.md の Severity Policy (Critical / High のみ)。

## catalog 索引 (top 20 — active stack 集中版)

scan では当たりを付けるのに、apply では修正方針の参考に使う。

### Tauri v2 境界 (最頻出)

| # | パターン | 検出兆候 | 確認・修正 |
|---|---|---|---|
| 1 | invoke payload と Rust command 引数不一致 | `invoke('cmd', { foo })` と `fn cmd(bar: ...)` で名前 / 型が乖離 | key と引数名・型を 1 対 1 で照合。camelCase ↔ snake_case 自動変換はトップレベル引数のみで、ネストした struct には適用されない |
| 2 | command 戻り値の Result serialize 失敗 | `Result<T, E>` の `E` が Serialize 未実装 / 詳細不明エラーが UI に届く | `E` の `Serialize` 実装、`thiserror` + `From<...>` の網羅 |
| 3 | capability / permission 漏れ | dev では動くが build 後だけ失敗 | `src-tauri/capabilities/*.json` と plugin permission を追加 |
| 4 | path scope 漏れ | dialog の戻りを使った fs アクセスが本番だけ deny | `BaseDirectory` 経由で resolve し、allowed scope に含まれるか確認 |
| 5 | WebView 側 invoke エラー握りつぶし | `.catch(...)` 不在で UI が無反応、保存できたと誤認 | toast / error state への接続を確認 |

### Rust

| # | パターン | 検出兆候 | 確認・修正 |
|---|---|---|---|
| 6 | `unwrap()` / `expect()` panic | None / Err でプロセス終了 (Tauri 経由で UI クラッシュ) | `?` / `match` / `unwrap_or` 系 |
| 7 | tokio::spawn の JoinHandle 捨て | spawn 後に handle 無視で結果 / panic が消える | `handle.await?` |
| 8 | std::fs と async runtime 混在 | async 関数 / Tauri command 内で `std::fs::*` 直呼び → worker block、UI 応答遅延 | `tokio::fs` / `spawn_blocking` |
| 9 | Result / `?` 経路の panic 混入 | エラー伝播パスに `unwrap` / `panic!` が紛れる | Tauri command は `Result<T, AppError>` を返し panic を撲滅 |
| 10 | path canonicalize 漏れ | symlink / `..` で allowed root 外へ脱出 (TOCTOU / traversal) | `path.canonicalize()?` 後に `starts_with(&root)` |

### Vue 3 + TypeScript

| # | パターン | 検出兆候 | 確認・修正 |
|---|---|---|---|
| 11 | reactivity 喪失 | `state = newObj` で reactive 参照切れ / `.value` 付け忘れ | `Object.assign(state, newObj)` か ref 化 |
| 12 | invoke の catch 漏れ | `await invoke(...)` を try/catch なしで呼び silent 失敗 | `invoke(` 周辺の try/catch / `.catch()` を grep |
| 13 | loading / error / success state 競合 | 画面遷移後に古い async result を反映 | AbortController / request id による stale-result guard |
| 14 | Pinia store と component local state の二重管理 | 同じデータを両方に持ち片方だけ更新 | source of truth を 1 箇所に固定 |
| 15 | Promise 非待機 / forEach 内 await | `forEach(async ...)` で待機されない | `for...of` / `Promise.all(map())`、`no-floating-promises` |

### Flutter / Dart

| # | パターン | 検出兆候 | 確認・修正 |
|---|---|---|---|
| 16 | controller / subscription の dispose 漏れ | TextEditingController / FocusNode / AnimationController / StreamSubscription | `dispose()` 内で dispose / `_sub?.cancel()` |
| 17 | async gap 後の context / mounted 利用 | `await` 後の `BuildContext` 使用、`if (mounted)` ガード不在 | `await` 後に `if (!mounted) return;` |
| 18 | FutureBuilder の future 再生成 | build 内で `future: fetchX()` → 毎フレーム再実行 | future を `initState` でフィールドに保存 |
| 19 | initState で async 直扱い | 未待機の future が走る | 同期呼び出し + field 保存 / `unawaited` を明示 |
| 20 | platform channel / file picker の error 未処理 | desktop / mobile の path 差・permission 例外を catch していない | `MissingPluginException` / permission 例外を catch、未対応 platform は明示 fallback |

---

## 追加パターン (top 20 以外)

### Tauri v2 境界

Tauri の不具合は言語単体より境界で起きる。`Vue state → invoke → #[tauri::command] → serde → domain → fs/process/DB/sidecar → Result → serde → Vue state` の各境界を順に疑う。

| パターン | 症状 | 確認 |
|---|---|---|
| sidecar / external command 失敗 | 開発環境だけ動く | `bundle.externalBin` 記載、resource path の resolve、Windows での実行可否 |
| Vue state と backend state の不整合 | 画面と保存内容が乖離 | invoke 後の state 更新経路、古い async 結果の上書き |
| event の listen / unlisten 漏れ | 再表示でハンドラ多重登録 | `listen` の戻り unlisten を `onUnmounted` で呼ぶ |
| close ハンドリング欠落 | 保存前に終了 | `on_window_event` の `CloseRequested` |
| `generate_handler!` 登録漏れ | 新規 command が frontend から呼べない | `tauri::generate_handler` への追加 |

### Rust

| パターン | 症状 | 確認 |
|---|---|---|
| `std::sync::Mutex` を await またぎで保持 | デッドロック / Send 制約違反 | `tokio::sync::Mutex` か、await 前に drop |
| `block_on` の入れ子 | "Cannot start a runtime from within a runtime" | block_on は最上位のみ |
| `select!` の意図しないキャンセル | 片方完了でもう片方の副作用が消える | branch ごとの cancel safety |
| `let _ = fs::write(...)` | 書き込み失敗を見逃す | `?` で伝播、ログ + ユーザー通知 |
| Windows / UNC path | `C:\` / `\\?\` / `\\server\share` の比較失敗 | 比較前に canonicalize |
| 日本語パス NFC/NFD | macOS と Windows でファイル名比較失敗 | `unicode-normalization` で NFC 統一 |
| 巨大ファイル丸読み | OOM | `BufReader`、サイズ上限ガード |
| `#[serde(default)]` 不在 | 旧 config 読み込みで missing field | optional field に default |
| `rename_all = "camelCase"` の付け忘れ (ネスト struct) | JS に snake_case のまま届く | ネスト struct にも付与 |
| lib 内の anyhow | 型情報喪失 | lib は thiserror、bin / command は anyhow |
| 配列直接 indexing / 整数オーバーフロー | panic (debug) / wrap (release) | `.get(i)` / `checked_*` / `saturating_*` |

### Vue 3 / TypeScript

| パターン | 症状 | 確認 |
|---|---|---|
| `watch` の deep 漏れ | ネスト変更を検知しない | `{ deep: true }` か getter で具体化 |
| カスタム `v-model` の emit 漏れ | 双方向バインド失敗 | `modelValue` / `update:modelValue` のペア |
| Vuetify props 型不一致 | `:disabled="cond"` に文字列 | `!!cond` |
| undefined payload を invoke に渡す | Rust 側 deserialize エラー | TS 型で payload を固定 |
| number / string、null / 空文字の意味混同 | 越境で型・意味が変わる | TS 型と Rust 型 (`Option<String>` vs `String`) を 1 対 1 で確認 |
| `catch (e)` で `e.message` 直アクセス | unknown で落ちる | `e instanceof Error` ガード |

### Flutter / Dart

| パターン | 症状 | 確認 |
|---|---|---|
| setState 連打 | 前後する async で最終状態が不定 | request id / cancel token / 直近 future のみ反映 |
| compute / isolate の例外 | main に届かず silent 失敗 | `compute` の戻りを try/catch |
| desktop と mobile の path 差 | sandbox / 絶対 path の混同 | `path_provider` で正規化 |
| StatefulWidget の key 不在 | 同型 widget 入れ替えで状態が残る | `ValueKey` |

### 環境依存 (低頻度)

DST 境界の時刻計算 / BOM 付きファイル / ロケール依存ソート / ネットワークドライブの遅延・タイムアウト / プロセス FD 上限 (EMFILE)。

---

## エッジケース catalog

修正時に確認する境界値:

- 空: `[]` / `""` / `{}` / `None` / `null` / `undefined`
- 境界: 0 / 1 / 最大値 ± 1
- 型: 想定外の型、optional が undefined
- サイズ: 1 件 / 2 件 / 数十万件 / 巨大ファイル
- 同時性: 並行アクセス / 競合 / await またぎ Mutex
- ネットワーク: タイムアウト / 5xx / 切断 / 遅延
- 権限: 認証なし / 期限切れトークン / capability 漏れ
- データ: 不正 JSON / 部分破損 / 巨大ペイロード / 古い config
- path: 相対 / 絶対 / `..` / symlink / 日本語 NFC・NFD / UNC / 長 path
- OS: Windows / macOS / Linux / Web / iOS / Android (該当のみ)
- 状態: 初回起動 / config 未存在 / 一部破損 / 旧 version からの migration
