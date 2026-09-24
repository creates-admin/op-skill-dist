# Visual Craft Tiers

color / typography / spacing & grid / hierarchy & composition の craft 規律。
craft は既存 design system / op-config の token・grid・scale を経由し、生の数値を直書きしない。
機械で担保するのは floor (破綻させない一貫性) だけで、ceiling (洗練・taste) は人間がモックと実物を見て判断する。

## AI 到達ライン

| craft 次元 | ① 完成まで安定生成 | ② 概ね安定 | ③ 仕様は書ける・質は human review 必須 | ④ 意図のみ・human 委譲 |
|-----------|------------------|-----------|--------------------------------------|----------------------|
| **color** | OKLCH / HCT で知覚均等な ramp + WCAG / APCA の contrast 検算 | semantic token 割当 (success / warning / error / info 固定) | hue 温度が brand に合うか / 調和の体感 | brand を体現する color story |
| **typography** | modular scale から type ramp を当てる (本文基準 16px 目安) | 役割別 weight / line-height の初期値 | 特大見出し等の意図的逸脱 / measure / 行間の呼吸 | novel な組版 |
| **spacing & grid** | `grid_unit` の整数倍 spacing | optical 調整の初期値 | 余白の呼吸 / intra-group と inter-group の差の体感 | 余白が運ぶ間・静けさ |
| **hierarchy & composition** | size / weight / color / spacing で primary > secondary > tertiary の 3 段 + 60-30-10 restraint | Z / F 動線に沿った配置の初期案 | 構成のリズム / restraint の質 | novel な art-direction |

- ①② は token / scale / grid を当てるだけなので Apply で自走してよい
- ③④ はモックで合意した見た目を目標にし、自分で作り込まない。AI 単独の self-refine loop で仕上げない。
  判断が要る差分は `needs_human_decision` で返す

## Craft token scale

下記の数値は一貫性検査を理解するための例示。project の op-config baseline (`design_system_baseline`) / 既存 DS が常に優先。
token が不在なら既存 scale に整合する形で正規化追加する。

- **spacing**: `--space-1` … `--space-12` のように `grid_unit` (例 4px / 8px) の整数倍。全 margin / padding / gap は token 経由。
  同じ群の中は密、群と群の間は疎
- **type scale**: font-size 群は単一の modular ratio から説明できること (`1.2` 高密度業務 / `1.25` 標準 / `1.333` 余裕 /
  `1.5` editorial)。説明できない中間値を混ぜない
- **color**: primitive ramp は OKLCH / HCT の知覚均等 step (sRGB 直線補間は中間がくすむ)。semantic は役割固定で装飾に流用しない。
  restraint は主 60% / 副 30% / accent 10% を目安にし、accent 種類数は `max_accent_colors` 以内

## floor の判定

- Static Hard blocker (type scale 中間値 / spacing 広範囲逸脱 / accent 過多 / semantic 装飾流用) と降格項目は
  `visual-quality-rubric.md` の Hard blockers 節が正本
- 描画しないと判定できない質 (色の調和 / タイポの呼吸 / 構成のリズム / restraint の質) は BLOCK せず、
  完了報告で human 確認項目として挙げる
- 要素の出現順・連動・空間連続性 (choreography) は `motion-patterns.md` の Choreography 語彙

## 禁止

- 絶対数値 (line-height 145-150% / 8pt 固定等) を floor に焼く
- 流行の模倣を craft の根拠にする
- token / scale bypass の任意値
- equal-weight (階層なし) / accent 過多 / semantic 色の装飾流用 / type scale の中間値乱発
- ③④ craft を AI self-refine loop で仕上げる
- 「おしゃれに / 垢抜けさせる」提案
