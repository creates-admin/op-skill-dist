# expert-debug 言語別パターン全集 (active stack)

<!--
機能概要: SKILL.md の top 20 catalog から漏れた言語別バグパターンを網羅
作成意図: Rust / Tauri v2 / Vue 3 / TypeScript / Flutter / Dart の
         境界・低頻度・固有パターンを深掘り辞典として提供する。
         SKILL.md を肥大化させずにカバー範囲を広げる。
注意点: agent は必要時のみ Read する想定。常時参照ではない。
       React / Go は対象外スタックのため扱わない。
-->

SKILL.md の top 20 が当たらない場合、または特定スタックの深掘りが必要な場合に Read する。
**active_stack: Rust / Tauri v2 / Vue 3 / TypeScript / Dart / Flutter** が対象。

---

## Tauri v2 境界 (最重要)

Tauri アプリの不具合は **言語単体ではなく境界部分** で発生することが多い。
データフローを以下に固定して、各境界を順に疑う:

```
Vue state
  ↓
invoke(cmd, payload)
  ↓
Tauri command (#[tauri::command])
  ↓
serde (Deserialize / Serialize)
  ↓
Rust domain logic
  ↓
filesystem / process / DB / sidecar
  ↓
Result<T, E>
  ↓
serde back to JS
  ↓
Vue state update
```

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| invoke payload と Rust command 引数不一致 | フロントから呼ぶと undefined / serde error / silent 失敗 | TS 側 payload key と Rust command の引数名・型を 1 対 1 で照合 (Tauri は camelCase ↔ snake_case 自動変換あり、配下構造体には適用されないので注意) |
| command 戻り値の Result 変換ミス | UI に `string` の詳細不明エラーだけ届く | `Result<T, MyError>` の `MyError` が `Serialize` 実装済みか / `thiserror` + `From<...>` の網羅性確認 |
| capability / permission 漏れ | dev は動くが `tauri build` 後だけ失敗 | `src-tauri/capabilities/*.json` と plugin の permission を変更コマンド分追加 |
| path scope 漏れ | ファイル保存・読込が本番だけ deny | dialog の戻り path を `tauri::path::BaseDirectory` 経由で resolve、allowed scope に含まれているか確認 |
| WebView 側 invoke エラー握りつぶし | 画面上は無反応、ユーザーは保存できたと誤認 | `invoke().then(...)` だけで `.catch(...)` が無い箇所を grep。toast / error state への接続を確認 |
| Rust async task の join 漏れ | 処理完了前に画面更新 / プロセス終了 | `tokio::spawn(...)` の戻り `JoinHandle` が捨てられている箇所、await されているか確認 |
| std::fs と async runtime 混在 | UI 固まり / 応答遅延 (Tauri command が tokio runtime 内で std::fs を直呼び) | 重い I/O を `tokio::fs` または `tokio::task::spawn_blocking` に分離 |
| sidecar / external command 失敗 | 開発環境だけ動く | `tauri.conf.json` の `bundle.externalBin` 記載、resource path の resolve、Windows での実行可否 |
| Vue state と Rust backend state の不整合 | 画面上の値と保存内容が乖離 | invoke 後に Vue state を更新する経路を確認、async 結果が古い state に上書きされていないか |
| event の listen / unlisten 漏れ | 画面再表示時にハンドラが多重登録 | `tauri::Manager::listen_global` の解除を `onUnmounted` で呼んでいるか |
| Window / WebView の close ハンドリング欠落 | 保存前にクラッシュ的に終了 | `on_window_event` で `CloseRequested` を奪って保存ダイアログ表示 |

---

## Rust 固有

### 基本

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| `unwrap()` / `expect()` panic | None / Err でプロセス終了 | `?` 演算子 / `match` 化 / `unwrap_or` 系で代替 |
| 所有権の意図しない move | 後続で使えなくなる | `&` 借用 or `.clone()` (clone のコスト評価込み) |
| ライフタイム不一致 | 短命参照を長命に格納 | コンパイラ提案に従う、構造体に lifetime parameter |
| Result の `?` を main で使用不可 | main 戻り値が `()` | `fn main() -> Result<(), Box<dyn Error>>` |

### async / Tokio

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| tokio::spawn の JoinHandle 無視 | spawn したタスクの panic / 結果が消える | `let _ = handle;` ではなく `handle.await?;` |
| Mutex を await またぎで保持 | デッドロック / Send 制約違反 | `std::sync::Mutex` を await またぎ禁止、`tokio::sync::Mutex` を使う |
| blocking I/O を async context で実行 | runtime worker thread を専有しスループット低下 | `tokio::task::spawn_blocking` または `tokio::fs` |
| `block_on` の入れ子 | "Cannot start a runtime from within a runtime" panic | block_on は最上位のみ、内側は await |
| `select!` での意図しないキャンセル | 片方完了でもう片方を捨てる | branch ごとに副作用評価 |

### filesystem / path

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| std::fs エラー握りつぶし | `let _ = fs::write(...);` で書き込み失敗を見逃す | Result を `?` で伝播、ログ + ユーザー通知 |
| canonicalize 漏れ | symlink / `..` で allowed root 外に脱出 | `path.canonicalize()?.starts_with(&root)?` パターン強制 |
| Windows path / UNC path | `C:\\` `\\?\` `\\server\share` の正規化漏れ | `Path::new` での比較に `canonicalize` を挟む |
| 日本語パス (NFC/NFD) | macOS と Windows でファイル名比較失敗 | `unicode-normalization` crate で NFC 統一 |
| 大きいファイル丸読み | OOM / メモリスパイク | `BufReader` でストリーム化、サイズ上限ガード |

### serde / 型境界

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| `#[serde(default)]` 不在 | 旧 config 読み込みで Missing field エラー | optional fields に default を付ける、Versioning 戦略 |
| `#[serde(rename_all = "camelCase")]` 不一致 | Tauri 側のフィールド名が snake のまま JS に届く | struct に rename_all を付与、ネスト構造にも忘れず |
| optional vs default の混同 | `Option<T>` で `null` を許すか、`#[serde(default)]` で field 不在を許すか | API 仕様で意図を明示 |
| `thiserror` / `anyhow` の境界 | ライブラリ内で anyhow を使うと型情報喪失 | lib では thiserror、bin / Tauri command では anyhow |

### panic safety

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| Tauri command 内で panic | command 戻りが string error 化、UI に詳細届かず | `Result<T, AppError>` を必ず返す、panic は撲滅 |
| `index out of bounds` | 配列直接 indexing で panic | `.get(i)` で Option 化 |
| 整数オーバーフロー | release だと wrap、debug だと panic | `checked_*` / `saturating_*` / `wrapping_*` を意図に応じて |

---

## Vue 3 固有

### Reactivity

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| `ref` のアンラップ忘れ | テンプレートで `.value` 付ける / script で付け忘れ | `console.log(myRef)` で `RefImpl` が出るか実値か |
| `reactive` オブジェクト再代入 | `state = newObj` で reactivity 喪失 | `Object.assign(state, newObj)` または ref 化 |
| `watch` の deep オプション漏れ | ネストオブジェクト変更が検知されない | `{ deep: true }` 追加、または `watch(() => obj.field, ...)` で具体的に |
| `v-model` 双方向バインド失敗 | カスタムコンポで `update:modelValue` emit 漏れ | emit 名・props 名のペア確認 |
| Vuetify props 型不一致 | `<v-btn :disabled="cond">` で cond が文字列 | 真偽値に明示変換 (`!!cond`) |
| Pinia store の getter 再計算しない | getter が ref ではなく値を直接返す | `computed` 化で解決 |

### Tauri invoke 境界

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| invoke の catch 漏れ | `await invoke(...)` を try/catch なしで呼び silent 失敗 | grep で `invoke(` の周辺に try/catch があるか / Promise chain で `.catch()` |
| loading / error / success state の競合 | 画面遷移後に古い async result を反映 | AbortController または stale-result-guard (request id チェック) |
| undefined payload を Rust に渡す | Rust 側で deserialize エラー | TS 型で `payload: { foo: string }` を強制、`undefined` の通り抜けを禁止 |
| number / string の境界 | invoke で数値が string 化 / 逆 | TS 型と Rust 型を 1 対 1 で確認、シリアライズ越境テスト |
| null と empty string の意味混同 | "未入力" と "明示的に空" を区別したいのに同じ扱い | API 仕様で意図を明示、`Option<String>` vs `String` |
| Pinia store と component local state の二重管理 | 同じデータを両方に持ち片方だけ更新 | source of truth を 1 箇所に固定 |

---

## TypeScript / JavaScript 固有

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| Promise の非待機 | `await` 忘れで結果が Promise オブジェクト | `noFloatingPromises` ESLint |
| エラーの型 unknown | `catch (e)` で `e.message` 直アクセス | `e instanceof Error` ガード |
| `tsconfig.strict` 無効 | null チェックすり抜け | `"strict": true` に統一 |
| forEach 内 await 効かない | 並列実行されない / 待機されない | `for...of` または `Promise.all(map())` |
| `JSON.parse` の例外未処理 | 不正 JSON で全体クラッシュ | try/catch + バリデーション (zod 等) |
| 浅いコピーで参照漏れ | `{...obj}` のネスト先は共有 | `structuredClone` または明示的 deep copy |

---

## Flutter / Dart 固有

### Lifecycle / dispose

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| TextEditingController dispose 漏れ | メモリリーク / 多重 listener | `dispose()` 内で `controller.dispose()` |
| FocusNode dispose 漏れ | 同上 | 同上 |
| AnimationController dispose 漏れ | ticker leak で警告 / クラッシュ | `with SingleTickerProviderStateMixin` + `dispose` |
| StreamSubscription cancel 漏れ | 画面破棄後もイベント受信 → 死んだ widget に setState | `dispose` 内で `_sub?.cancel()` |
| async gap 後の context 利用 | `await` 後に `BuildContext` 失効 | `mounted` チェックを `await` 後に挟む |
| dispose 後の setState | "setState() called after dispose" 例外 | `if (!mounted) return;` |

### Async / Future

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| FutureBuilder の future 再生成 | build 内で `future: fetchX()` と書くと毎フレーム再実行 | future を `initState` でフィールドに保存 |
| initState で async 直扱い | `await` できず未待機の future が走る | `initState` から同期呼び出し → 内部で `unawaited` を使うか field に保存 |
| setState 連打による状態競合 | 複数の async が前後する setState で最終状態が不定 | request id / cancel token / 直近 future のみ反映 |
| compute / isolate の例外伝播 | isolate 内 throw が main に届かず silent 失敗 | `compute` の戻りを try/catch で包む |

### Platform / desktop 差

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| file picker / permission error | desktop と mobile で API 差 | `kIsWeb` / `Platform.is*` で分岐、permission 例外 catch |
| desktop と mobile の path 差異 | mobile の sandbox path / desktop の絶対 path | `path_provider` で正規化、絶対 path を直接使わない |
| StatefulWidget の key 不在 | 同型 widget 入れ替えで状態保持 | `ValueKey` 付与 |
| platform channel error | iOS / Android / desktop で channel が異なる例外 | `MissingPluginException` を catch、未対応 platform は明示 fallback |

---

## Python / FastAPI 固有 (conditional_stack)

AI Gateway 等の Python backend リポジトリでのみ参照する。それ以外では無視する。

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| async def 内で同期 I/O | `open()` / `requests.get()` 直呼び | `aiofiles` / `httpx` async に置換 |
| Pydantic v1 → v2 移行ミス | `parse_obj` / `dict()` が deprecated | `model_validate` / `model_dump` |
| Optional の型ヒント漏れ | `def f(x: int = None)` | `Optional[int]` または `int | None` |
| dataclass mutable default | `field: list = []` で全インスタンス共有 | `field(default_factory=list)` |
| グローバル DB セッション | リクエスト間でセッション漏れ | Depends で per-request 注入 |

---

## 低頻度パターン (覚える価値はあるが日常的でない)

| パターン | 症状 | 確認方法 |
|---------|------|---------|
| Daylight Saving Time | 3/11, 11/4 付近で時刻計算ズレ | UTC で計算、表示時のみローカル変換 |
| 整数オーバーフロー | 32bit int で大きな掛け算 | 型を 64bit / BigInt / Rust なら i64 / checked_* |
| 文字列正規化 (NFC/NFD) | macOS と Linux / Windows でファイル名比較失敗 | NFC 統一 (Rust: `unicode-normalization`、Python: `unicodedata`) |
| BOM 付きファイル | 先頭 3 バイトが `\xef\xbb\xbf` | utf-8-sig で読む / Rust なら手動スキップ |
| ロケール依存ソート | 言語環境で結果が違う | 明示ロケール指定、または codepoint sort |
| 浮動小数点比較 | `0.1 + 0.2 != 0.3` | epsilon 比較 / 整数化 / Decimal |
| デッドロック | A→B 順 / B→A 順で取得 | 取得順を一意化、try_lock + timeout |
| TOCTOU | check と use の間に状態変化 | アトミック操作、canonicalize 後に確認 |
| プロセス FD 上限 | EMFILE エラー | 適切な close + ulimit |
| Windows UNC path | `\\server\share` の正規化漏れ | canonicalize で `\\?\UNC\` 形式に揃える |
| ネットワークドライブ遅延 | 一定確率でタイムアウト | retry + 適切な timeout、ローカルキャッシュ |

---

## エッジケース catalog

修正時に必ず確認する境界値:

- **空**: `[]` / `""` / `{}` / `None` / `null` / `undefined` / `Option::None`
- **境界**: 0 / 1 / 最大値 - 1 / 最大値 / 最大値 + 1
- **型**: 想定外の型 (string が来るはずに number、optional が undefined)
- **サイズ**: 1 件 / 2 件 / N 件 / 数十万件 / 巨大ファイル
- **同時性**: 単一スレッド / 並行アクセス / 競合 / await またぎ Mutex
- **ネットワーク**: 成功 / タイムアウト / 5xx / 接続切断 / 遅延
- **権限**: 認証なし / 認可なし / 期限切れトークン / capability 漏れ
- **データ**: 想定 schema / 不正 JSON / 部分破損 / 巨大ペイロード / 古い config
- **path**: 相対 / 絶対 / `..` / symlink / 日本語 (NFC) / 日本語 (NFD) / UNC / 長 path
- **OS**: Windows / macOS / Linux / Web / iOS / Android (該当 platform のみ)
- **状態**: 初回起動 / config 未存在 / 一部破損 / 旧 version からの migration

---

## 対象外スタックの参照

React / Go は主戦技術から除外されており、通常の scan / fix では扱わない
(該当パターンの深掘りが必要な場合は git history 等でリポジトリ固有に判断する)。
