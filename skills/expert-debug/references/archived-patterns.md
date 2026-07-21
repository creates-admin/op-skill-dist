# expert-debug 対象外スタック退避 (archived)

<!--
機能概要: active_stack から外した React / Go のバグパターンを退避
作成意図: 主戦技術が Rust / Tauri v2 / Vue 3 / Flutter に絞られたため、
         React / Go は通常検出から外す。ただし参照されたリポジトリに
         該当スタックがある場合のみ Read する辞典として保持する。
注意点: ここに書かれたパターンを scan で報告すると ignored_noise になる。
       明示的にリポジトリが React / Go プロジェクトと判明したときだけ参照する。
-->

このファイルは **disabled_by_default のスタック向け** の退避辞典である。
通常の scan / fix では参照しない。リポジトリのファイル構成 (`package.json` の依存に `react`、`go.mod` 等) で明示的に該当が分かったときだけ Read する。

---

## React 固有

| パターン | 症状 | 確認方法 |
|---------|-----|---------|
| useEffect 依存配列漏れ | state が古い値を参照 (stale closure) | ESLint `react-hooks/exhaustive-deps` |
| key に index 使用 | リスト並び替え時に状態が混ざる | 一意 ID を key に |
| 状態の二重管理 | props と useState で同じ値 | 単一情報源に集約 |
| useMemo / useCallback 過剰 | 依存配列内オブジェクト毎レンダリング新規 | プロファイラで確認 |
| context の再レンダー爆発 | provider value が毎回新オブジェクト | useMemo で安定化 |
| Suspense 境界の取りこぼし | 子コンポでの throw promise が上に届かない | 適切な ErrorBoundary / Suspense 階層 |
| StrictMode 二重実行 | useEffect が dev で 2 回呼ばれて副作用が想定外 | 副作用に冪等性 / cleanup を必ず実装 |

---

## Go 固有

| パターン | 症状 | 確認方法 |
|---------|-----|---------|
| nil map に書き込み | panic | `make(map[K]V)` 初期化 |
| goroutine リーク | チャネル受信側がいない | context キャンセル伝播 |
| defer の評価タイミング | ループ内 defer で蓄積 | 関数化で即解放 |
| err シャドウイング | `if err := ...; err != nil` の外で別 err | 命名分け |
| context 伝播漏れ | 親キャンセルが子に届かない | 関数間で context 引数を渡し続ける |
| channel の close 重複 | "close of closed channel" panic | sender 側が 1 つに固定、sync.Once |
| time.After のリーク | select ループ内で都度 time.After | time.NewTimer を再利用 |

---

## 復活させる場合

リポジトリが React / Go を主戦に切り替えた場合は、以下の手順で復活させる:

1. このファイルから該当セクションを `patterns.md` の本編に戻す
2. `SKILL.md` の `Technology Profile` で active_stack に該当スタックを追加
3. `tools.md` のプロジェクトタイプ別 recipe に該当スタックの検証コマンドを追加
4. agent.md の cheatsheet を更新
