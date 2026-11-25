# health の返却 (JSON)

SKILL.md「7. health」の返却の形。

```json
{
  "duplicates": [ { "fact": "同じ事実", "locations": [ { "file": ".claude/rules/<feature>.md", "section": "節" } ],
    "proposed_canonical": "残す 1 か所 (file + 節)" } ],
  "conflicts": [ { "subject": "食い違う対象", "statements": [ { "file": "...", "section": "節", "says": "その箇所の主張" } ] } ],
  "scatter": [ { "business_feature": "機能地図の機能", "specs": [ { "feature": "<feature>", "chars": 0 } ],
    "proposed_target": "まとめ先の feature キーか (新設)" } ]
}
```
