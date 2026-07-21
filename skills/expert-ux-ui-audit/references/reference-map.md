<!--
duplicated_in: skills/expert-design/references/reference-map.md
sync_policy: 両ファイルに共通する Tier 1 (heuristics 系) のリンク URL は完全一致させる。
             Tier 2 (enterprise design systems) / Tier 3 (information design) は ux では使わないため
             ux 側に保持しない (Grep / 校正で参照していないため負債になる)。
             a11y 標準 (WCAG / WAI-ARIA / USWDS) は ux 側に独自保持し、designer 側は Tier 4 で
             校正用の platform standards を持つ (役割が違うため重複させない)。
             変更時は (a) Tier 1 リンクを両ファイルで diff、(b) URL 切れチェックは各 agent の
             利用箇所だけで足りる。
-->

# Reference Map (ux-ui-audit-expert 視点)

外部 UX 思想 / accessibility 標準の参照地図。
ux-ui-audit-expert が判断のキャリブレーションに使う「外部教養」の正規リンクを集約する。

designer-expert と異なり、ux 側は **使いやすさの heuristics と a11y 標準だけが校正対象**。
enterprise design system (Atlassian / Stripe / SAP 等) や information design 書籍は
**designer-expert の主戦場** であり、ux 側の audit では引かない (`expert-design/references/reference-map.md` 参照)。

## ux-ui-audit-expert の使い方

- **使いやすさの heuristics を確認したい** → Tier 1 (NN/g, GOV.UK, IBM)
- **WCAG / a11y を確認したい** → Tier A (WCAG 公式 / WAI-ARIA / USWDS)
- **platform 慣習で迷ったとき** → Tier P (Apple HIG / Material / Fluent) ※絶対基準ではない

## 注意

- Tier 1 / Tier P のガイドラインは **校正と教養** のための参照
- WCAG (Tier A) だけは **絶対基準** として扱う (A 違反 = Critical、AA 違反 = High)
- それ以外の heuristics は判断材料、機械的に全部適用しない

---

## Tier 1: Core usability heuristics (ux-ui の主戦場)

業務完了性 / signifier / feedback / error prevention / heuristics。

- GOV.UK Design Principles: https://www.gov.uk/guidance/government-design-principles
- GOV.UK Design System: https://design-system.service.gov.uk/
- Nielsen Norman Group 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- IBM Design Language Principles: https://www.ibm.com/design/language/philosophy/principles/
- Don Norman / Nielsen Norman Group articles: https://www.nngroup.com/articles/

### NN/g 10 Heuristics の利用上の注意

- 機械的に全部チェックしない (10 個全部にスコアを付けない)
- 違反が **業務フローを止めている** ものだけ起票する
- 違反が **a11y を破壊している** ものだけ起票する

---

## Tier A: Accessibility standards (絶対基準)

WCAG は **絶対基準**。違反したら起票する。

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/
- USWDS Design Principles: https://designsystem.digital.gov/design-principles/

### Severity 判定の絶対ルール

- WCAG A 違反 → **Critical**
- WCAG AA 違反 → **High**
- WCAG AAA 違反 → 起票しない (Medium 以下扱い)

---

## Tier P: Platform calibration (慣習の参考、絶対ではない)

platform 固有の慣習を確認したいときに参照する。**模倣対象ではない**。
project 固有の design system / 業務ドメイン慣習が常に優先される。

- Fluent 2 Design Principles: https://fluent2.microsoft.design/design-principles
- Apple Human Interface Guidelines: https://developer.apple.com/jp/design/human-interface-guidelines/
- Material Design 3 Tokens: https://m3.material.io/foundations/design-tokens
- Material Design 3 Layout: https://m3.material.io/foundations/layout/understanding-layout

---

## designer-expert との重複保持の理由

両 agent が共通の **Tier 1 (heuristics)** だけ重複保持し、それ以外は役割に応じて片側に置く。

| 領域 | ux 側 | designer 側 |
|------|------|------------|
| Tier 1 (NN/g, GOV.UK, IBM) | ✓ (重複保持、sync 必須) | ✓ (重複保持、sync 必須) |
| Tier A (WCAG, WAI-ARIA, USWDS) | ✓ (絶対基準として保持) | ✗ (a11y は ux の責務) |
| Tier 2 (Atlassian, Stripe, Primer 等 enterprise DS) | ✗ (audit で引かない) | ✓ (主戦場) |
| Tier 3 (Tufte 等 information design) | ✗ | ✓ |
| Tier P (Apple HIG, Material, Fluent) | ✓ (校正用) | ✓ (校正用、役割違い) |

ux は heuristics + a11y で audit、designer は token / 視覚秩序 / pattern で実装。
役割が違うため、片側に寄せられる Tier はあえて重複保持しない (sync コスト削減)。
