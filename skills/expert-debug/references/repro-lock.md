# Repro Lock の項目

SKILL.md「Repro Lock (再現条件のロック)」で埋める項目。

```yaml
repro_lock:
  symptom:           # 何が起きるか
  repro_command:     # 再現コマンド or テスト名
  repro_steps:       # GUI なら手順、CLI ならコマンド列
  input_fixture:     # 入力データの位置と内容
  expected:
  actual:
  failure_frequency: # always | flaky (N/M 回) | rare | unknown
  environment: { os, rust_version, node_version, flutter_version, tauri_version }
  timezone:          # DST / TZ 依存バグ用
  locale:            # NFC/NFD / 文字種 / sort
  seed:
  notes:             # ネットワークドライブ / UNC / 日本語パス / 初回起動 / 大量件数 等
```
