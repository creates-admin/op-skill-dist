<!--
duplicated_in: skills/expert-ux-ui-audit/references/reference-map.md
sync_policy: 両ファイルに共通する Tier 1 (NN/g, GOV.UK, IBM 等 heuristics 系) の URL のみ完全一致。
             Tier 2 (enterprise DS) / Tier 3 (information design) は本ファイル (designer 側) のみ保持。
             a11y 標準 (WCAG / WAI-ARIA / USWDS) は ux 側に独自保持し、本ファイルでは持たない
             (a11y 監査は ux-ui-audit-expert の責務で designer は触らないため、重複させない)。
             Tier P (Apple HIG / Material / Fluent) は両 agent が校正用に持つが役割が違うため、
             URL は揃えるが Tier 名や使い方節は agent ごとに書き分けてよい。
             変更時:
               (a) Tier 1 のリンクを両ファイルで diff
               (b) Tier 2 / Tier 3 を変更しても ux 側更新不要
               (c) WCAG 系を変更したら ux 側のみ更新
-->

# Reference Map (designer-expert 視点)

外部デザイン思想 / デザインシステムの参照地図。
designer-expert が判断のキャリブレーションに使う「外部教養」の正規リンクを集約する。

## designer-expert の使い方

- **token / component の運用ルールを校正したい** → Tier 2 を見る
- **情報設計 / 余白 / 階層を校正したい** → Tier 3 を見る
- **a11y / platform 慣習を確認したい** → Tier 4 を見る
- **そもそも「何のための画面か」を見直したい** → Tier 1 に戻る

## 注意

- ここに並ぶデザインシステムは **校正と教養** のための参照であり、**模倣対象ではない**
- project 固有の design system が常に優先される
- 流行 (Apple 風 / Material 風) に寄せる根拠としてはならない

---

## Tier 1: Core judgment

判断の核。業務完了性 / 信頼 / ミニマルの規律 / signifier / feedback / error prevention / enterprise craft。

- GOV.UK Design Principles: https://www.gov.uk/guidance/government-design-principles
- GOV.UK Design System: https://design-system.service.gov.uk/
- Dieter Rams / Vitsœ Good Design: https://www.vitsoe.com/rw/about/good-design
- Nielsen Norman Group 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- IBM Design Language Principles: https://www.ibm.com/design/language/philosophy/principles/

---

## Tier 2: Design system operation (designer の主戦場)

token governance / component reuse / pattern consistency / enterprise density /
host surface consistency / role-based UI。

- Atlassian Design Tokens: https://atlassian.design/components/tokens
- Adobe Spectrum: https://spectrum.adobe.com/
- Shopify App Design Guidelines: https://shopify.dev/docs/apps/design
- GitHub Primer: https://primer.style/
- Stripe Apps Design: https://docs.stripe.com/stripe-apps/design?locale=ja-JP
- Salesforce Display Density: https://developer.salesforce.com/docs/platform/ja-jp/lwc/guide/data-display-density.html
- SAP Fiori Design Principles: https://www.sap.com/design-system/fiori-design-ios/discover/sap-design-system/vision-and-mission/sap-fiori-design-principles

---

## Tier 3: Visual order / information design

静けさ / 余白 / 情報秩序 / data honesty / grid / iteration。

- Edward Tufte / The Visual Display of Quantitative Information: https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/

(Maeda / Hara / Fukasawa / Müller-Brockmann / IDEO 等の書籍系は、公式 URL が確定しているもののみ載せる。
非公式 PDF / 転載サイトはリンクしない。)

---

## Tier 4: Calibration only

platform literacy / quality calibration / accessibility / token / layout literacy。
**模倣対象ではなく、校正用の教養** として扱う。

- Fluent 2 Design Principles: https://fluent2.microsoft.design/design-principles
- Apple Human Interface Guidelines: https://developer.apple.com/jp/design/human-interface-guidelines/
- Material Design 3 Tokens: https://m3.material.io/foundations/design-tokens
- Material Design 3 Layout: https://m3.material.io/foundations/layout/understanding-layout
- USWDS Design Principles: https://designsystem.digital.gov/design-principles/
