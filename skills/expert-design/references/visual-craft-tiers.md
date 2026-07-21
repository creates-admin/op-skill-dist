# Visual Craft Tiers

/**
 * 機能概要: color / typography / spacing & grid / hierarchy & composition の craft (taste・洗練) を
 *           「token 駆動 + 一貫性 floor + 生成方法論」として扱うための判断基準・craft token scale・
 *           AI 到達ライン Tier・floor の static Hard blocker 境界を集約する。
 * 作成意図: repo の design 方法論は floor (usability / 正しさ = a11y / token discipline / state 網羅)
 *           に全面最適化され、ceiling (craft / taste = 良い ramp・呼吸ある scale・読み取れる階層) を
 *           上げる装置が構造的に不在だった。規律 Tier だけでは「破綻なし」しか保証できず、
 *           「良い color ramp / type scale / 視覚階層」を保証できない。生成方法論を motion (motion-patterns.md)
 *           と同格で additive 化し、floor (機械担保) と ceiling (人間 playground 担保) を混ぜずに線引きする。
 *           ADR-0013 (op-explore / playground discovery) 決定I Wave1 として本ファイルを正本化する。
 * 注意点: static (Read/Grep) で「有無」を検出できる項目だけが Hard blocker。craft 品質の大半は
 *         requires_runtime = 描画結果を見ないと分からない (visualization 美の MLLM-人間 correlation は 0.428)。
 *         craft 規律は **絶対数値でなく一貫性検査として** 焼く (project 固有 DS / op-config baseline を読め、焼くな)。
 *         過剰 BLOCK で ceiling を floor 化しない (escape hatch のある項目を floor と呼ばない)。
 *         a11y (contrast / focus / keyboard) の最終判定権は ux-ui-audit-expert に委譲する。
 */

UI の craft (色・タイポ・余白とグリッド・階層と構成) の設計規則。
**craft floor は「破綻させない」最低保証であり、ceiling (美しさ・洗練) を機械で上げる装置ではない**。
craft は必ず **既存 design system / op-config の token・grid・scale** を経由し、生の数値・curve を直書きしない。
そして本ファイルは **floor を強化する** ものであって、**ceiling を floor 化しない** (= 機械 BLOCK で taste を測ろうとしない)。

## AI 到達ライン (最初に読め — over-promise 回避)

craft 品質は「描画結果を見ないと分からない」。AI agent が安定生成できる範囲には構造的な天井がある。
typography measure / 行間の呼吸 / hue 温度の brand 適合は **motion ほど Tier 境界が明瞭でない** (ADR-0013 決定I 残小論点)。
**この境界を越えた要求は「仕様まで AI / 仕上げは human」**と明示し、AI に丸投げできるかのように扱わない。

| craft 次元 | ① 完成まで安定生成 | ② 概ね安定 | ③ 仕様は書ける・質は human review 必須 | ④ 意図のみ・human / exemplar 委譲 |
|-----------|------------------|-----------|--------------------------------------|----------------------------------|
| **color** | OKLCH / HCT で知覚均等な color ramp 生成 (lightness step 等間隔 + chroma 補正) + APCA / WCAG 両睨みの contrast 検算 | semantic color token 割当 (success/warning/error/info の役割固定) | hue 温度が brand に合うか / 配色の調和の体感 | brand を体現する color story / emotion を運ぶ配色 |
| **typography** | modular scale (1.2 / 1.25 / 1.333 / 1.5) から type ramp を機械的に当てる + 本文基準 (16px 目安) からの段組み | 役割別 weight / line-height 割当、本文と見出しの呼吸の初期値 | editorial な意図的 scale 逸脱 (特大見出し) / measure (1 行字数) の最終調整 / 行間の「呼吸」 | novel な組版・誌面の詩学 |
| **spacing & grid** | grid (op-config `grid_unit`) の整数倍 spacing を機械適用 + 8pt rhythm | optical 調整 (視覚的に揃って見える微補正) の初期値 | 余白の「呼吸」の最終調整 / intra-group と inter-group の差の体感 | 構成の余白が運ぶ間・静けさ |
| **hierarchy & composition** | size / weight / color / spacing で primary > secondary > tertiary の 3 段を機械的に付ける + 60-30-10 restraint | 視線の Z / F 動線に沿った配置の初期案 | 構成のリズム / 視覚的緊張 / restraint の質 (引き算の判断) | novel な art-direction / 構成の詩学 |

- **① は token / scale / grid を当てるだけ**に構造化されているため AI が確実に担える。Design Plan が scale / token を指定し、Run Mode が既存 DS に流す。
- **②** は割当・初期値までが安定範囲。最終の心地よさは ③ に滑り込む。
- **③④** は「描画して選ぶ」性質を持つ。Design Plan に意図 (なぜ・どの次元を・どう effect させたいか) を書くところまでが AI の役目で、最終的な craft の確定は human が握る。③④ を多用する novel な art-direction は **playground (op-explore)** に逃がす (実物を `file://` で組み、人間が見て選ぶ)。AI の self-refine は anchor なしでは self-bias を単調増幅するため、③④ を AI 単独 loop で仕上げさせない。

## Related references

- `philosophy.md` (原則3 明快さ > 美しさ / 原則12 模倣ではなく文脈に従う / 迷ったらやらない)
- `decision-order.md` (既存 token / pattern を先に使う判断順)
- `visual-quality-rubric.md` (**craft floor の Static Hard blocker 正本はこちら 1 ファイル**。本 tiers は方法論)
- `motion-patterns.md` (motion token / transition / choreography。composition の動的次元はこちらへ pointer)
- `project-design-system-lookup.md` (color ramp / type scale / spacing grid token の DS Lookup / 不在時の fallback)
- `reference-map.md` (Tier ごとの craft 校正。**校正と教養であって模倣対象ではない** — 流行に寄せる根拠にしない)
- ux-ui-audit-expert `a11y-checklist.md` (contrast / focus の最終判定権はこちら)
- Material Design 3 Tokens: https://m3.material.io/foundations/design-tokens
- APCA (Accessible Perceptual Contrast Algorithm): https://git.apcacontrast.com/

---

## Craft token scale (canonical foundation)

color / type / spacing は **foundation の canonical token / scale** として定義する (motion token と同列)。
画面側で生の `#3b82f6` / `padding: 13px` / `font-size: 19px` を直書きしない (= token bypass = Hard blocker)。
token-curation 役は不在なら既存 scale に整合する形で正規化追加する (foundation 役 authority、per-feature 役は参照のみ)。

> **絶対数値は example として示すが、project の `op-config` baseline / 既存 design system を読め、焼くな** (原則12 整合)。
> 下記の比率・刻みは「これに焼く」ためではなく「一貫性検査の足場」を理解するための例示。
> project に grid_unit / type scale / color ramp が定義されていれば **それが常に優先** される。

### Spacing scale (grid 由来 + optical 調整)

| 例示 | 内容 | 用途 |
|------|------|------|
| `--space-1` … `--space-12` | grid_unit (例 4px / 8px) の整数倍を刻む | 全 margin / padding / gap はこの token を経由 |
| optical 補正 | アイコンと文字の baseline 合わせ等、視覚的に揃える微調整 | ② 以上、最終は human |

原則: **全 spacing は op-config `grid_unit` の整数倍**。ad-hoc な `13px` / `7px` を散らさない。intra-group (同じ群の中) は密、inter-group (群と群の間) は疎、という呼吸を grid 上で表現する。

### Type scale (modular ratio + 本文基準)

| 例示 ratio | 画面性格 | 備考 |
|-----------|---------|------|
| `1.2` (minor third) | 高密度・業務一覧 | 段差が小さく情報が詰められる |
| `1.25` (major third) | 標準アプリ | 汎用 |
| `1.333` (perfect fourth) | 余裕のある画面 | 見出しがよく立つ |
| `1.5` (perfect fifth) | editorial / LP | コントラスト大 |

原則: **font-size 群は単一の modular ratio から説明できる**こと。本文基準 (16px 目安、project の base に従う) から ratio を累乗して段を作り、その間に説明できない中間値 (`19px` 等) を混ぜない。意図的逸脱 (editorial 特大見出し) は **craft の一部** であり floor 違反ではない (後述「降格項目」)。

### Color (OKLCH / HCT 知覚生成 + semantic + restraint)

| 層 | 内容 |
|----|------|
| primitive ramp | OKLCH / HCT で **知覚均等** な lightness step を刻む (sRGB 直線補間は中間がくすむ) |
| semantic 割当 | `success` / `warning` / `error` / `info` を **役割で固定**。装飾色に流用しない |
| restraint (60-30-10) | 主色 60% / 副色 30% / accent 10% を目安に accent を増やしすぎない |

原則: **semantic 色は意味として使う** (原則6)。accent 色の種類数は op-config の閾値を超えない。hue 温度が brand に合うか (③) は human 判断で、機械は ramp の知覚均等と contrast の検算 (①) まで。

---

## いつ craft floor を適用するか / しないか

floor (= 一貫性検査) と ceiling (= art-direction) は **phase で切り替える**。境界点は卒業 gate に固定する (ADR-0013 決定I)。

| 局面 | floor (一貫性検査) | ceiling (art-direction) |
|------|-------------------|------------------------|
| **op-run / enrichment (本番起票・apply)** | 常時適用 (token discipline / scale 一貫性 / restraint の機械検査) | **封印**。reference-map exemplar を持ち込まず、philosophy の usability 優先を維持 |
| **op-explore (playground スコープ)** | 常時適用 (floor は playground でも崩さない) | **解除**。実物を組み、exemplar を craft 原則の言語化付きで持ち込み、人間が見て選ぶ。持ち込むのは意匠でなく craft 原則 |
| **卒業 gate (唯一の境界点)** | recurring 値を canonical token へ正規化 (tokenize 同時検査) | art-direction 意図 / craft 原則整合 / exemplar gap だけを spec_only で残す (意匠は残さない) |

floor フェーズで「もっと洗練させたい / おしゃれに」は **出さない** (agent-instructions の禁止と整合)。floor フェーズの craft 仕事は「破綻を消す」ことだけ。ceiling を上げたい要求は playground (op-explore) に逃がす。

---

## Static Hard blockers (gate / post-check で BLOCK 可)

craft 品質の大半は requires_runtime だが、以下は **static (Read/Grep) で「有無」を検出できる**ため gate / post-check で BLOCK してよい (motion-patterns の「有無検出できるものだけ BLOCK」規律を文字通り適用)。
**正本は `visual-quality-rubric.md` の Hard blocker 節 1 ファイル**。本 tiers は方法論であり、下記 4 項目の集合は rubric と完全一致させる (drift 防止)。

1. **type scale の説明不能な中間値** — font-size 群が単一の modular ratio から説明できない中間値 (例: 16/20/24 の中に唐突な 19px) を含む。
2. **grid 単位を外れた spacing の広範囲逸脱** — spacing が op-config `grid_unit` の整数倍でない値を広範囲で散らしている (1〜2 箇所の optical 補正ではなく、ad-hoc 値の蔓延)。
3. **accent 色種類数の閾値超過** — accent (装飾) 色の種類数が op-config の閾値を超え、画面が色で騒がしい。
4. **semantic 色の装飾流用** — `success` / `warning` / `error` / `info` の semantic 色を、その意味と無関係な装飾用途に流用している。

### 降格項目 (BLOCK でなく PASS_WITH_NOTES の Notes 対象)

以下は **escape hatch がある = 静的に違反と確定できない**ため floor (BLOCK) に含めない。craft 観察項目 / warning + 注釈要求に降格する (escape hatch のある項目を floor と呼ばない)。

- **`intra-group gap < inter-group gap` の崩れ** — 群の中の余白が群と群の間より広い状態は崩れだが、**何が同一 group かは意味的判断で静的に確定不能**。Notes で「この群構造で正しいか確認」と注釈要求するに留める。
- **type scale の意図的逸脱** — editorial な特大見出し等は craft の一部であり、scale 逸脱が常に誤りとは言えない。Notes で「意図的逸脱か確認」と注釈要求するに留める。

---

## Runtime-only な質 (BLOCK しない、human 確認項目)

以下は描画して見ないと判定できない。**op-run の static verify では落とさず**、Design Plan の `Verification` 節に「human が描画確認すべき項目」として列挙する (③④ を含む craft は especially)。visualization 美の MLLM-人間 correlation は 0.428 で、judge が HTML を Read するだけでは捉えられない領域。

- 色の調和の体感 (hue 温度・彩度バランスが brand に合うか、騒がしくないか)
- タイポの呼吸 (line-height / measure が読みやすい間か、詰まり / 間延びがないか)
- 構成のリズム (視線が迷わず流れるか、視覚的緊張のメリハリがあるか)
- restraint の質 (引き算の判断、要素を足したくなる誘惑に勝てているか)

これらが品質を左右する craft (③④) は、playground (op-explore) で複数候補を実物として並べ、exemplar gap を併示した上で人間が選ぶ (ADR-0013 決定I の ceiling / calibration)。

---

## Composition の動的次元 → motion-patterns へ

hierarchy & composition の craft は静的配置だけで完結しない。要素の **出現順・連動・空間連続性** (choreography = stagger / parenting / spatial continuity) は時間軸の craft であり、`motion-patterns.md` が扱う。
composition を Design Plan で詰めるとき、動的に階層を伝える設計 (例: 重要要素を先に出して視線を誘導する) が必要なら **`motion-patterns.md` の Transition pattern カタログ / choreography 語彙を参照** する (motion-patterns 側に choreography 節が additive される予定)。静的 composition (本ファイル) と動的 choreography (motion-patterns) は地続きで、Tier の考え方 (①② は token で自走 / ③④ は human polish) も共通。

---

## Architect Mode で craft を Design Plan に書くときの節構造

`pr-templates.md` の Design Plan template に **`### Craft Strategy`** を craft を意図的に詰める画面に限り追加する (Motion Strategy / Chart Strategy と同形式の条件付き additive 節)。token / scale 適用 (①②) で済む範囲か、human polish が要る (③④) かを必ず明記する。

```markdown
### Craft Strategy (craft を意図的に詰める画面のみ)

#### Design Intent
- どの craft 次元を効かせるか (color / typography / spacing & grid / hierarchy & composition) — 1〜2 文
- なぜ (どの情報・どの体験のために) — usability の上に craft を乗せる根拠 (原則3)

#### 採用 scale / token
- type scale: <ratio (project の値) / 本文基準>
- spacing: <op-config grid_unit の整数倍を使用>
- color: <既存 ramp / semantic token。OKLCH/HCT 知覚生成 ramp があればそれ>
- (token / scale 不在なら foundation 役が正規化追加。生値直書き禁止)

#### Tier
- ①② (scale / token 適用で完成) / ③④ (仕様のみ、human polish 要・playground 候補)

#### Restraint
- accent 色種類数: <op-config 閾値以内>
- 60-30-10 の方針: <主 / 副 / accent の配分>

#### Hierarchy
- primary > secondary > tertiary を何で付けるか (size / weight / color / spacing)
- equal-weight (階層なし) を避ける根拠

#### Verification (human 確認、③④ は必須)
- [ ] 色の調和の体感 (描画して確認)
- [ ] タイポの呼吸 (line-height / measure が読みやすい間か)
- [ ] 構成のリズム (視線が迷わないか)
- [ ] (③④) playground で候補比較・exemplar gap 併示が要るか
```

---

## 禁止 (craft アンチパターン)

| 禁止 | 影響 |
|------|------|
| 絶対数値 (line-height 145-150% / 8pt 固定等) を floor に焼く | project 固有 DS / op-config と衝突、token-first・原則12 (流行に寄せない) を裏切る |
| 流行 (Apple 風 / Material 風 / 流行のダッシュボード) 模倣を craft の根拠にする | 模倣ではなく文脈に従う (原則12) に違反、project の延長線上の品質を壊す |
| 任意値の乱発 (token / scale bypass) | foundation の token / scale が形骸化、AI 生成 UI が generic に見える主因 (任意値 / サイズ過多) |
| equal-weight (階層なし) | primary / secondary が同強度で視線が迷う、情報階層崩壊 |
| accent 過多 (restraint 欠如) | 60-30-10 を超えて色が騒がしく、semantic の意味が埋もれる |
| semantic 色を装飾流用 | success/warning/error/info の意味が揺れ、色記号体系が崩壊 |
| type scale の中間値乱発 | modular ratio から説明できない font-size が散り、タイポの秩序が崩れる |
| ③④ craft を AI self-refine loop で無 anchor 仕上げ | self-bias を単調増幅し generic / 不自然に収束 (human / exemplar anchor 必須) |
| floor フェーズで「おしゃれに / 垢抜けさせる」提案 | ceiling を floor に持ち込む越権、playground スコープ違反 |
