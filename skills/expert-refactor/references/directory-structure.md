# Directory Structure

<!--
機能概要: ディレクトリ構造劣化の検出と、責務境界に沿った再配置 policy を提供する。
作成意図: utils / common / helpers のゴミ箱化、shared への feature 漏れ、
         依存方向の逆流を構造的に検出して整理する。
注意点: いきなり全体再編しない。feature 単位・boundary 単位で小さく移動し、
       全体再編が必要な場合は staged_refactor / architecture_debt として
       計画化する。
-->

## Detect Bad Structure

以下の兆候があれば構造劣化として検出する:

- utils / helpers / common に何でも入っている
- feature 固有処理が shared に漏れている
- shared が domain を import している
- UI component が infra / filesystem / API を直接触っている
- backend の path policy と frontend の path construction が別々にある
- Tauri command が domain / IO / presentation を全部抱えている
- tests / fixtures が本体構造と対応していない
- 名前だけ feature 分割されていて、中身は横断依存だらけ
- 1 つの directory に 50 ファイル以上ある
- generated / vendor / 手書きが同じ directory に混在

---

## Good Direction

固定テンプレートではなく、**既存構造に沿って最小移動** する。

### Vue / TS の例

```text
src/
  app/
  features/
    report/
      ui/
      model/
      api/
      paths.ts
      types.ts
  shared/
    ui/
    config/
    ipc/
    path/
  domain/
    job/
    document/
```

### Tauri / Rust の例

```text
src-tauri/src/
  commands/        # Tauri command (薄い、domain / infra に委譲)
  domain/          # ドメインロジック (IO に依存しない)
  infra/           # IO / 永続化 / 外部プロセス
  path_policy/     # path 組み立て・検証
  services/        # use case (domain + infra を組み合わせる)
  errors/          # error 型・variant
```

### Flutter の例

```text
lib/
  features/
    <feature>/
      data/
      domain/
      presentation/
  shared/
    widgets/
    services/
  core/
    error/
    network/
    storage/
```

---

## Apply Policy

### やってよいこと

- feature 単位 / boundary 単位で **小さく** 移動する
- 1 PR で 1 boundary の整理に留める
- import path の更新範囲を限定する
- 新しい directory を作る場合は責務をコメントで明記
- staged_refactor の `safe_first_step` から始める

### やってはいけないこと

- いきなり全体再編しない
- circular dependency を増やさない
- public module API を変えない
- Rust では visibility を広げて依存方向を **ごまかさない**
- ディレクトリ移動による diff を最小化する (1 PR で大量ファイルが動く状態を避ける)
- 設定 / 生成コード / 手書きを混ぜない

---

## Dependency Direction Rules

### 健全な依存方向

```text
features → domain
features → shared
shared → (依存なし or core utility のみ)
domain → (依存なし or 同 domain 内のみ)
infra → domain (interface 経由)
ui → composable → service → domain
```

### 逆流の典型 (検出対象)

- shared が features を import
- shared が domain を import
- domain が infra を import (interface 経由でなく具象)
- ui が infra を直接 import
- domain が ui types を import

### 検出 grep 例

```bash
# shared が domain / features を参照していないか
rg "from ['\"](@/)?domain/" src/shared/
rg "from ['\"](@/)?features/" src/shared/

# domain が infra を直接参照していないか
rg "from ['\"](@/)?infra/" src/domain/

# ui が infra を直接参照していないか
rg "from ['\"](@/)?infra/" src/features/*/ui/
```

---

## utils / common / helpers のゴミ箱化検出

### Detection

- ファイル数が多すぎる (15 ファイル以上が目安)
- 関数の責務がバラバラ (date / string / fs / network が同居)
- feature 固有のロジックが入っている (例: `auth_helpers.ts` が `utils/` 配下)
- 命名が抽象的すぎる (`misc.ts` / `helpers.ts` / `common.ts`)
- import 元が広すぎる

### Apply Policy

1. 各関数の責務を **再分類**
2. feature 固有処理は対応する feature 配下に移動
3. domain ロジックは domain 配下に移動
4. 真に汎用なものだけ utils に残す
5. 残った utils を意味別に分割 (`date_utils.ts` / `string_utils.ts` / `fs_utils.ts`)

ただし、**1 PR で全部やらない**。staged_refactor で段階化する。

---

## tests / fixtures の対応関係

本体構造と tests / fixtures の構造が対応していない場合も検出対象。

### Detection

- `src/features/report/` に対して `tests/test_report.ts` が `tests/` 直下にあり、構造が反映されていない
- fixture 配置が無秩序
- 同じ fixture が複数箇所に重複している

### Apply Policy

- tests directory は本体構造を mirror する (`tests/features/report/`)
- ただし test framework の慣習を尊重する (Vitest / Jest の co-located test も可)
- fixture は責務 directory 配下に置く

これらは test-expert と協調する範囲。refactor-expert 単独で apply せず、Issue を分割する。
Phase 1 では `post_check_expert` に test-expert を指定できない (許容値が
`ux-ui-audit-expert | security-expert | null` のみ) ため、
`recommended_followup_experts: [{expert: "test-expert", ...}]` で記録する。
