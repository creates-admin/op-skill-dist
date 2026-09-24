# Directory Structure

いきなり全体再編しない。feature 単位・boundary 単位で小さく移動し、全体再編が必要なら staged_refactor / architecture_debt で計画化する。

## Detect Bad Structure

- utils / helpers / common に何でも入っている
- feature 固有処理が shared に漏れている / shared が domain を import している
- UI component が infra / filesystem / API を直接触っている
- backend の path policy と frontend の path construction が別々にある
- Tauri command が domain / IO / presentation を全部抱えている
- tests / fixtures が本体構造と対応していない
- 名前だけ feature 分割されていて中身は横断依存だらけ
- 1 directory に 50 ファイル以上 / generated・vendor・手書きが同じ directory に混在

## Good Direction

固定テンプレートではなく既存構造に沿って最小移動する。「feature 固有 / 複数 feature 共有 (shared) / IO 非依存ロジック (domain) / IO 実体 (infra)」の分離は共通で、語彙だけスタック慣習に合わせる。

```text
Vue / TS:  src/{app, features/<f>/{ui,model,api,paths.ts,types.ts}, shared/{ui,config,ipc,path}, domain/<d>}
Rust:      commands/ (薄い Tauri command) / domain/ / path_policy/ / services/ (use case) / infra/ (IO・永続化・外部プロセス) / errors/
Flutter:   features/<f>/{data,domain,presentation} / shared/{widgets,services} / core/ (error・network・storage)
```

## Apply Policy

やってよいこと: feature / boundary 単位で小さく移動 (1 PR = 1 boundary) / import path の更新範囲を限定 / 新 directory の責務をコメントで明記 / staged_refactor の `safe_first_step` から始める。

やってはいけないこと: 全体再編 / circular dependency を増やす / public module API を変える / Rust で visibility を広げて依存方向をごまかす /
1 PR で大量ファイルを動かす / 設定・生成コード・手書きを混ぜる。

## Dependency Direction Rules

健全な方向:

```text
features → domain, shared
shared → (依存なし or core utility のみ)
domain → (依存なし or 同 domain 内のみ)
infra → domain (interface 経由)
ui → composable → service → domain
```

逆流 (検出対象): shared → features / shared → domain / domain → infra (具象) / ui → infra / domain → ui types

```bash
rg "from ['\"](@/)?(domain|features)/" src/shared/
rg "from ['\"](@/)?infra/" src/domain/ src/features/*/ui/
```

## utils / common / helpers のゴミ箱化

Detection: 15 ファイル以上 / date・string・fs・network が同居 / feature 固有ロジック (`utils/auth_helpers.ts`) / `misc.ts`・`helpers.ts` のような抽象的命名 / import 元が広すぎる。

Apply (1 PR で全部やらず staged_refactor で段階化):

1. 各関数の責務を再分類
2. feature 固有処理は feature 配下、domain ロジックは domain 配下へ
3. 真に汎用なものだけ utils に残し、意味別に分割 (`date_utils.ts` / `string_utils.ts` / `fs_utils.ts`)

## tests / fixtures の対応関係

Detection: 本体構造が tests に反映されていない (`tests/test_report.ts` が直下) / fixture 配置が無秩序 / 同じ fixture の重複。

方向: tests は本体構造を mirror する (co-located test の慣習は尊重)、fixture は責務 directory 配下。
test-expert と協調する範囲なので単独で apply せず、`recommended_followup_experts` に test-expert を記録する。
