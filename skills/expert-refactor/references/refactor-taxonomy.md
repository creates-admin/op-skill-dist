# Refactor Taxonomy

<!--
機能概要: refactor-expert が scan / patrol で使う bulk_group / subtype の正式カタログ。
作成意図: 散乱 token / god function / large file 等の検出を canonical schema の
         bulk_group に正しくマップし、Issue 起票のバッチ判定を機能させる。
注意点: ここに無い bulk_group は使わない。新規追加時は本ファイルを更新する。
-->

## Core Categories

### refactor-scattered-tokens

意味ある literal / token / path / key / command / status / error code / file type / design value が
複数箇所に散乱している。

詳細は `scattered-tokens.md` を参照。

### refactor-god-function

1 関数・1 method・1 handler が複数責務を抱えている。

詳細は `structure-health.md` の「God Function」を参照。

### refactor-large-file

1 ファイルが複数責務を抱え、変更理由が複数化している。

詳細は `structure-health.md` の「Large File」を参照。

### refactor-large-component

Vue / Flutter component が表示・状態・通信・変換・副作用を抱えすぎている。

詳細は `structure-health.md` の「Large Component」を参照。

### refactor-directory-structure

feature / domain / shared / infra / UI の置き場が崩れ、変更箇所を予測できない。

詳細は `directory-structure.md` を参照。

### refactor-boundary-mixing

UI / domain / IO / persistence / infra / config が混線している。

### refactor-duplicate-logic

同じ判断・同じ変換・同じ条件分岐が散っている。

### refactor-dependency-direction

import 方向・依存方向が逆流している。

例:

- shared が domain を import している
- UI component が infra / filesystem / API を直接触っている
- backend の path policy と frontend の path construction が別々にある

### refactor-utils-dumping-ground

utils / common / helpers が feature 固有処理のゴミ箱になっている。

### refactor-feature-leakage

feature 固有の型・関数・path・状態が shared / global に漏れている。

### refactor-dead-code

active path と紛らわしい dead code が残り、変更判断を誤らせている。

詳細は `structure-health.md` の「Dead Code」を参照。

---

## bulk_group 一覧 (canonical schema 用)

```text
refactor-scattered-tokens
refactor-god-function
refactor-large-file
refactor-large-component
refactor-directory-structure
refactor-boundary-mixing
refactor-duplicate-logic
refactor-dependency-direction
refactor-utils-dumping-ground
refactor-feature-leakage
refactor-dead-code
```

---

## scattered token の subtype

`refactor-scattered-tokens` には必ず `subtype` を付ける。

```text
paths
routes
ipc_commands
tauri_command_names
event_names
storage_keys
config_keys
status_values
design_values
asset_paths
file_types
mime_types
error_codes
permission_names
feature_flags
directory_names
glob_patterns
env_vars
```

詳細は `scattered-tokens.md` を参照。

---

## structure-health 系の subtype (任意)

行数だけでは Issue 化しない。subtype は補助情報として付ける。

```text
god-function:
  - validation-mixed
  - io-mixed
  - persistence-mixed
  - formatting-mixed
  - logging-mixed

large-file:
  - multiple-change-reasons
  - mixed-types-and-io
  - mixed-ui-and-domain

large-component:
  - state-and-io-mixed
  - render-and-domain-mixed
  - direct-tauri-invoke

dead-code:
  - unused-helper
  - parallel-old-implementation
  - orphan-route-or-command
```

---

## boundary-mixing の subtype

```text
ui-touches-infra
shared-imports-domain
domain-touches-persistence-directly
config-leaks-into-ui
ipc-handler-mixes-everything
feature-boundary-bleeding
```

---

## directory-structure の subtype

```text
utils-dumping-ground
shared-becomes-global-bag
feature-folders-name-only
parallel-frontend-backend-paths
test-fixture-mismatched-shape
generated-mixed-with-source
```
