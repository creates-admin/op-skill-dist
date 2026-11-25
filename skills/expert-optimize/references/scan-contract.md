# scan 出力契約 (optimize-expert)

## Severity Policy

判定手順と報告ルールは `~/.claude/skills/_shared/severity-rubric.md` (「判定の手順」「scan 報告ルール (共通)」節。scan 前に Read)。optimize 固有の典型例:

- Critical: O(2^n) / O(n!) で実環境を停止させる経路 / unbounded cache・retain で OOM が再現 / ホットパスの確実な無限ループ・退化ケース / ユーザー操作なしでメモリ・ディスクを食い潰す経路
- High: 主要導線で観測可能な劣化 (P95 が SLA 超過、OCR / PDF / IDML で n 倍以上) / O(n²)・O(n*m) かつ n が運用上数百〜数千以上 / ループ内 I/O・N+1 (fs / DB / HTTP / Tauri command / COM) / 巨大ライブラリ全 import で初期 bundle が明確に肥大 / listener・watcher・cache の解除漏れによる長時間運用での肥大
- 起票しない: 1 回だけの初期化処理 / 入力規模が確実に小さい helper の clone / iterator vs loop の好み / 「もっと効率的な書き方」だけの提案 / 計測しても誤差範囲の改善

## patrol_sample の優先順位

`patrol_sample` の optimize 優先順位:

1. ホットパス候補 (main loop / batch processor / page 単位処理 / OCR / PDF / IDML)
2. ループ内 I/O / DB / HTTP / Tauri command / COM 呼び出し
3. 並列化 / Rayon / worker pool / channel 周辺
4. 大量データ処理 (collect / serde / parse / regex)
5. 最近変更された high-churn file
6. cache / pool / batch API 周辺
7. frontend bundle entry point / route splitting

## scan-finding (optimize 版)

field・enum・必須性の正本は `op help payload scan-finding` (envelope は `expert-report-schemas.md`「scan 出力 envelope 契約」節)。optimize 固有の書き方:

- `severity_reason` に入力規模・呼び出し頻度・ホットパス性を書く
- `excluded_hypotheses` に否定した代替仮説 (例: I/O ではなく allocation) を書く
- `recommendation.type` は `optimize` (改善方針が明確) か `investigation` (まず計測)。`steps` の最後の要素に `## 計測計画` (baseline コマンド / 入力規模 small・medium・large / 期待改善カテゴリ algorithm・io・allocation・parallelism・bundle / 撤退条件) を入れる
- `verification_steps` に Before/After 取得手順、`success_criteria` に改善率の閾値 (統計判定) と既存テスト互換を入れる
- `post_check_expert` は原則 `null` (入れるなら `ux-ui-audit-expert` か `security-expert`)
- `blocking: true` は新規変更が既存 perf debt を悪化させる場合のみ (`blocking_reason` 必須)

## bulk_group

| bulk_group | 対象 |
|---|---|
| `perf-nested-loop-on2` | O(n²) / O(n*m) ネスト・線形探索の多重実行 |
| `perf-loop-io` | ループ内 file I/O / DB / HTTP / Tauri command / COM |
| `perf-repeated-compile` | loop 内 regex compile / parse / sort |
| `perf-unnecessary-clone` | 大量データの clone / String 化 / serde roundtrip |
| `perf-unbounded-growth` | cache / listener / watcher の unbounded 成長 |
| `perf-bad-parallelism` | Mutex<Vec> push / I/O-bound par_iter / 極小粒度 par_iter / スレッド制約越境 |
| `perf-bundle-fullimport` | 巨大ライブラリ全 import / lazy load 欠如 |
| `perf-tauri-ipc-chatty` | Tauri IPC の高頻度往復 / 巨大 payload |

optimize は 1 Issue = 1 bottleneck = 1 benchmark 因果評価が原則 (バッチ可否は `op scan bulk-group` が判定する)。
