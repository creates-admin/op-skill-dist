# Reference Map (ux-ui-audit-expert)

判断のキャリブレーションに使う外部参照。ux の校正対象は使いやすさの heuristics と a11y 標準だけ
(enterprise design system / information design は designer-expert 側)。

## Tier 1: Core usability heuristics

機械的に全部チェックしない。業務フローを止めている / a11y を壊している違反だけ起票する。

- GOV.UK Design Principles: https://www.gov.uk/guidance/government-design-principles
- GOV.UK Design System: https://design-system.service.gov.uk/
- Nielsen Norman Group 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- IBM Design Language Principles: https://www.ibm.com/design/language/philosophy/principles/
- Nielsen Norman Group articles: https://www.nngroup.com/articles/

## Tier A: Accessibility standards (絶対基準)

A 違反 = Critical / AA 違反 = High / AAA 違反 = 起票しない (例外条件は `a11y-checklist.md`)。

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/
- USWDS Design Principles: https://designsystem.digital.gov/design-principles/

## Tier P: Platform calibration (慣習の参考、絶対ではない)

- Fluent 2 Design Principles: https://fluent2.microsoft.design/design-principles
- Apple Human Interface Guidelines: https://developer.apple.com/jp/design/human-interface-guidelines/
- Material Design 3 Layout: https://m3.material.io/foundations/layout/understanding-layout
