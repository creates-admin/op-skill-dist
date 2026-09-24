# bash fence convention (subshell / shell 状態 drift 防止)

SKILL.md 内の prescriptive bash fence は、fence (= Bash tool 呼び出し) 間で shell 状態が引き継がれない
前提で書く。export の fence 間持続は環境依存 (local CLI = 持続 / Cloud sandbox = 呼び出しごとに初期化)。

## 不変則

1. 明示 export + 持続を前提にしない。fence を跨ぐ変数は `export VAR=...` を明示する (`VAR=...` のみは次 fence で空展開)。
   ただし export が渡る前提で後続 fence を書かない。確実性が要る値・Cloud 対応 skill は一時ファイル経由を優先する
   (複数変数・連想配列は `declare -p VAR1 VAR2 > "$TMP"` → 受け側で `source "$TMP"`)。
2. 受け側は `:?` でガードする。

   ```bash
   : "${ADR_DIR:?ADR_DIR must be set — フェーズ0 で確定した ADR フォルダパス}"
   ```

3. command substitution を並列化しない。background `&` 内の `RESULT=$(...)` は親 shell に戻らない。
   並列化する場合は出力を一時ファイルへ書き、`wait` 後に読む。
4. 配列は使用前に `ARR=()` で初期化する (未定義配列の `"${ARR[@]}"` は空展開で silent 通過する)。
