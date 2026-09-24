# Refactor Taxonomy

bulk_group / subtype の正式カタログ。ここに無い bulk_group は使わない。

## bulk_group

| bulk_group | 意味 | 詳細 |
|---|---|---|
| `refactor-scattered-tokens` | 意味ある literal / token / path / key / command / status / error code / file type / design value が複数箇所に散乱 | `scattered-tokens.md` |
| `refactor-god-function` | 1 関数・method・handler が複数責務を抱える | `structure-health.md`「God Function」 |
| `refactor-large-file` | 1 ファイルが複数責務を抱え変更理由が複数化 | `structure-health.md`「Large File」 |
| `refactor-large-component` | Vue / Flutter component が表示・状態・通信・変換・副作用を抱えすぎ | `structure-health.md`「Large Component」 |
| `refactor-directory-structure` | feature / domain / shared / infra / UI の置き場が崩れ変更箇所を予測できない | `directory-structure.md` |
| `refactor-boundary-mixing` | UI / domain / IO / persistence / infra / config の混線 | — |
| `refactor-duplicate-logic` | 同じ判断・変換・条件分岐が散っている | — |
| `refactor-dependency-direction` | import / 依存方向の逆流 (shared → domain、UI → infra 直接、backend path policy と frontend path construction の二重化) | `directory-structure.md`「Dependency Direction Rules」 |
| `refactor-utils-dumping-ground` | utils / common / helpers が feature 固有処理のゴミ箱 | `directory-structure.md` |
| `refactor-feature-leakage` | feature 固有の型・関数・path・状態が shared / global に漏れている | — |
| `refactor-dead-code` | active path と紛らわしい dead code が変更判断を誤らせる | `structure-health.md`「Dead Code」 |

## subtype

`refactor-scattered-tokens` は subtype 必須:

```text
paths / routes / ipc_commands / tauri_command_names / event_names / storage_keys / config_keys /
status_values / design_values / asset_paths / file_types / mime_types / error_codes /
permission_names / feature_flags / directory_names / glob_patterns / env_vars
```

その他は任意 (補助情報):

```text
god-function:        validation-mixed / io-mixed / persistence-mixed / formatting-mixed / logging-mixed
large-file:          multiple-change-reasons / mixed-types-and-io / mixed-ui-and-domain
large-component:     state-and-io-mixed / render-and-domain-mixed / direct-tauri-invoke
dead-code:           unused-helper / parallel-old-implementation / orphan-route-or-command
boundary-mixing:     ui-touches-infra / shared-imports-domain / domain-touches-persistence-directly /
                     config-leaks-into-ui / ipc-handler-mixes-everything / feature-boundary-bleeding
directory-structure: utils-dumping-ground / shared-becomes-global-bag / feature-folders-name-only /
                     parallel-frontend-backend-paths / test-fixture-mismatched-shape / generated-mixed-with-source
```
