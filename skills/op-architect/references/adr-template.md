<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 で SKILL.md フェーズ3-2 本文から移動 (内容変更なし、verbatim 転記)。
       テンプレ本体は成果物サンプル (dump) であり順序契約を持たないため references/ へ退避。
       SKILL.md 側は「1 ADR 書くごとに commit する」等の手順契約のみを保持する。
-->

<!--
機能概要: op-architect フェーズ3-2 で ADR を起こす際に使う MADR ベースの雛形テンプレート。
作成意図: テンプレ本体は毎回 fill-in する成果物サンプルであり、手順の一部ではないため
          SKILL.md 本文から分離。テンプレ改訂 (節追加・削除) はここで行う。
注意点: 内容は SKILL.md からの verbatim 移動。採番規則 (NNNN-<kebab-case-title>.md) と
        commit 手順そのものは SKILL.md フェーズ3-2 本文側の契約であり、本ファイルでは扱わない。
-->

# op-architect フェーズ3-2: ADR ドラフトテンプレート (MADR ベース)

**いつ読むか**: フェーズ3-2 で ADR を書き出す直前 (論点の決定が出た/または 3-judge の batch draft で)。

採番:
- 既存 ADR の最大番号 + 1 (ゼロパディング 4 桁)
- ファイル名: `NNNN-<kebab-case-title>.md`

テンプレ (MADR ベース):

```markdown
# ADR-NNNN: <タイトル>

- Status: Accepted
- Date: <YYYY-MM-DD>
- Deciders: <ユーザー名 / チーム名>

## Context

<なぜこの意思決定が必要になったか。背景・制約・前提を 3〜6 行>

## Decision

<決めたこと。1〜3 文で明確に>

## Consequences

### Positive
- <得られる効果>

### Negative / Trade-offs
- <受け入れる制約 / 代償>

## Alternatives Considered

### <案 A> (採用)
- 採用理由: ...

### <案 B>
- 不採用理由: ...

### <案 C>
- 不採用理由: ...

## References

- <参考 URL / 関連 ADR>
```
