# parser-boundary.md — parser / archive / deserialize

外部ファイル (境界 E) を parse・展開する経路。parser crate 自体の既知脆弱性は依存監査の領域。

## 1. 検査点

- zip-slip: entry name の `..` / 絶対 path / `\` を reject し、展開先 (親が存在すれば canonicalize) が展開 root 内かを確認する。
  archive 内の symlink / hardlink entry は作成しない。
- decompression bomb: 全体サイズ / entry ごと / 合計 / entry 数 / 圧縮比 / ネスト深さに上限を持ち、実際の読み出しバイト数で数える
  (例: 合計 100 MB、entry 10 MB、10,000 entries、圧縮比 1:100)。
- deserialize: parse 前の入力サイズ上限、depth / count / 巨大 string の上限、XML の外部 entity と entity 展開の無効化、parse 失敗で panic しない。

## 2. 典型 finding

| パターン | severity 目安 | mitigation |
|---|---|---|
| 展開で `..` / 絶対 path を reject しない | Critical (import 操作が要るなら High) | entry 検証 + scope |
| archive の size / count / ratio 上限なし | High | 上限 |
| `serde_json::from_str` に上限なしの入力 | High | size 上限 |
| XML の entity 展開が有効 | High | 無効化 |
| archive 内 symlink を作成 | High | reject |
| parse 失敗で panic | High | Result |
| nested archive の深さ制御なし | Medium (報告しない) | depth 上限 |
