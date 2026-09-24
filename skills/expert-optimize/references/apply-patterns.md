# Apply Patterns — 計算量 / I/O / allocation / 並列化の判断基準

優先順位は SKILL.md「3. Optimize」。手法そのものの解説は書かない。ここは OP での採否の閾値と禁止だけ。

## 計算量

1. ホットパスでない → 触らない
2. n が確実に 100 未満 → 触らない (HashMap 構築などの overhead の方が大きい)
3. 計算量を 1 段下げられるなら下げる。下げられない → I/O / allocation / 並列化を検討
4. 改善が誤差レベル → 撤退。そうでなければ実装 + Before/After

運用上の n の最大値で判断する (「今は動く」ではなく)。O(n²) は n = 1,000 で 100 万 op (許容圏)、n = 10,000 で 1 億 op (破綻)。
nested loop → index 化は、内側が 100 件以上または n × m > 10,000 のときだけ (内側が常に数個ならネストのままが速い)。

業務データの n の目安:

| 文脈 | 典型 | 最大 |
|---|---|---|
| InDesign ジョブの page_count / PDF page_count | 数〜数十 | 数百〜数千 |
| 検版・校正 rule_count | 数十〜数百 | 数千 |
| OCR block / line / char | 数百〜数千 | 数万 |
| 発注書 item / active job | 数〜数十 | 数百 |
| 監視 directory の file_count | 数百 | 数万 |
| IDML story / spread | 数十 | 数百 |

業務ドメイン別の典型改善:

| 処理 | Before | After |
|---|---|---|
| 検版・差分検出 | 全ページ × 全ページの全ピクセル比較 | ページごとの canonical hash (perceptual hash / 正規化 text hash) で bucket 化し、bucket 内だけ詳細比較 |
| 校正ルール適用 | rule × text の全文走査 | literal は Aho-Corasick で 1 走査、regex は compile once、ngram は inverted index |
| OCR 候補統合 | 全候補の総当たり | page / line / bbox bucket で grouping し bucket 内だけ比較 |
| IDML / 面付 | spread / page item を毎回 XML から線形検索 | parse once + spread_id / page_id / story_id の HashMap index |
| ファイル監視 | 毎ポーリング全 walk | mtime / inode manifest cache + notify によるイベント駆動 (全 walk は起動時と cache miss 時だけ) |
| 発注書集計 | order × item の SQL N+1 | JOIN 1 回 + group by |

sweep line / segment tree / Aho-Corasick など高度なアルゴリズムを入れたら、境界値・空入力・1 要素・最大規模の 4 ケース以上をテストする。
要件に対し過剰なデータ構造を持ち込まない。

## I/O

InDesign / IDML / PDF / OCR / ファイル監視 / NFS 系では I/O が支配的で、CPU 並列化より I/O 削減・batch 化の方がはるかに効く。

| 操作 | 目安 |
|---|---|
| SSD random read | ~100 µs |
| HDD random read / LAN HTTP / local SQL | ~1〜10 ms |
| WAN HTTP | ~50〜200 ms |
| Tauri invoke | ~0.1〜1 ms (serialize 込み) |
| InDesign COM 1 call | ~10〜100 ms |
| network drive (SMB, cold) | ~5〜50 ms |

判断順: ループ内に I/O / network / IPC / COM があれば必ず候補 → read once / parse once → batch 化 → async + concurrency limit (外部 API の rate limit を尊重) → cache (invalidation が決まる場合のみ) → Before/After。

- `BufWriter` は `flush()?` を明示する (drop 時の暗黙 flush はエラーを握り潰す)
- producer / consumer は bounded channel で backpressure をかける (unbounded は OOM 経路)
- InDesign COM: 呼び出し回数の削減が圧倒的に効く。page × pageItem × property を 1 件ずつ COM 越しに取らず、ExtendScript 1 本で全件を集めて JSON で返し、Rust 側は `do_script` を 1 回だけ呼ぶ。COM は STA なので Rayon で並列化しない

## allocation / メモリ

- clone / allocation 最適化は 1 KB 超または 1,000 要素超、かつホットパスだけ。外れるものは ignored_noise。dhat / heaptrack で allocation が bottleneck と確認してから触る
- `with_capacity` は既知サイズ 1,000 超かつホットパスのときだけ
- unbounded cache / unbounded queue は禁止。invalidation 戦略 (更新時にどの key を消すか) を決めてから入れる。決められないなら入れない
- 大型 buffer (bitmap / OCR 中間 buffer) を struct field や `Vec` に retain しない。peak RSS は `/usr/bin/time -v` の Maximum resident set size で Before/After を比べる
- hasher を `ahash` / `FxHashMap` にするのは内部処理だけ。外部入力・Tauri command 入力を key にするなら DoS 耐性のある標準 SipHash のまま
- 最適化で `?` 経路に `unwrap` / `panic!` を混入させない。borrow 地獄で可読性が壊れるなら撤退
- SIMD は scalar 版の benchmark を先に取る。unsafe は原則禁止で、必要なら high risk として `escalated`

## 並列化 (Rayon)

Rayon は CPU-bound な data parallelism 用。I/O 待ちを隠す道具ではない (I/O-bound は async + semaphore)。

採用条件 (全て満たす):

- CPU-bound / 要素が独立 / shared mutable state なし (`Mutex<Vec>` push 等を使わない)
- 1 要素の粒度が十分 (目安 > 1 µs、できれば > 100 µs)、入力が十分大きい (目安 > 数百要素。threshold は実測で決める)
- 順序不要、または `Vec` への collect で順序を復元できる
- reduce / collect の結果が決定的、エラー集約方針が明確
- sequential 版より clear に速いことを benchmark で実測できる (small / medium / large、`RAYON_NUM_THREADS` 別、peak メモリ)

使わない: I/O-bound / スレッド制約のある処理 (COM・InDesign・WebView・Tauri Window・Flutter platform channel) / 小さい collection /
lock 付き shared state 更新 / 「最初の 1 件」のエラーが仕様上意味を持つ処理 / メモリ帯域が bottleneck。

浮動小数点の並列 reduce は分割順で結果が変わる。会計・面付寸法・色値など結果が毎回違うと事故になる処理は sequential のまま。
