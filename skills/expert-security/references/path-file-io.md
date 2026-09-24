# path-file-io.md — file IO / path / Windows path 境界

境界ごとの扱いは `source-sink-analysis.md` §1、user-selected path は `usable-security.md` §4。

## 1. 境界ごとの適用

sink に渡す前に canonicalize し (新規作成 path は親を canonicalize して file 名を join)、以降は戻り値を使う。
scope (`canonical.starts_with(&root_canonical)`) は境界 A / D / E / G で強制、B は強制しない、C / F は確認。
check-then-act を避け (`create_new` / handle で操作)、temp は `tempfile`、重要 file は rename ベースの atomic write、log / temp は 0600。

## 2. Windows path 境界 (15 種)

| # | 境界 | 何が起きるか | 検査 |
|---|---|---|---|
| 1 | parent traversal `..` | zip-slip / 参照 path / invoke 引数で root 外へ | `Component::ParentDir` を reject、canonicalize 後に scope |
| 2 | symlink | 文書フォルダの link 経由で任意 path へ書く | canonicalize で resolve してから判定 |
| 3 | NTFS junction | 管理者権限なしで作れる directory link (別 volume も可) | 同上 |
| 4 | reparse point | symlink / junction / mount point / OneDrive placeholder の総称。`is_symlink()` では捕まらない | `FILE_ATTRIBUTE_REPARSE_POINT` (0x400) を見るか canonicalize |
| 5 | UNC `\\server\share` / `\\?\UNC\` | network 越境、TOCTOU、改竄 payload | local 前提なら reject。正当な用途なら threat_model に明記して検証を足す |
| 6 | device path `\\?\` / `\\.\` / `\\?\Volume{GUID}` | MAX_PATH 回避、正規化規則の違いで検査を迂回 | reject |
| 7 | reserved name CON / PRN / AUX / NUL / COM0-9 / LPT0-9 | 拡張子付き (CON.txt) でも予約 | 全 component の stem を大文字化して reject |
| 8 | ADS `file.txt:stream` | 隠しデータの書込 | drive letter 以外の `:` を reject |
| 9 | 大文字小文字の同一視 | case-sensitive な比較で allowlist / scope を迂回 | 小文字化 / `eq_ignore_ascii_case` で比較 |
| 10 | 区切り `/` と `\` の混在 | `\` 前提の denylist を迂回 | canonicalize 後、または統一してから比較 |
| 11 | 末尾ドット・空白 | `foo.txt.` = `foo.txt` | 末尾ドット・空白の component を reject |
| 12 | long path (260 超) | truncate で別 path に書く | longPathAware を宣言するか、超過を reject |
| 13 | temp directory race | 予測可能な名前を先取りされ symlink 経由で書かされる | tempfile / `create_new` |
| 14 | 上書き・削除・rename の TOCTOU | check と act の間に symlink へ差し替え | atomic open / handle で操作 |
| 15 | drive-relative / current dir 依存 (`foo.txt` / `C:foo.txt`) | 起動 path 次第で想定外の場所へ | 冒頭で絶対 path に解決、`current_dir()` に依存しない、`C:foo` 形式は reject |

境界別の適用: A / D / E / F は 1・5・6・7・8 を reject し scope を強制 (F は確認)。B は canonicalize で resolve し、5・6 はアプリの想定外なら reject、
7・8 は reject、scope は強制しない。C は scope 確認。すべて case-insensitive で比較する。

## 3. 典型 finding

| パターン | severity 目安 | mitigation |
|---|---|---|
| frontend からの path に canonicalize なしで write | Critical | validate + canonicalize + scope |
| `if exists { remove }` の TOCTOU | High | atomic open |
| temp file が 0644 / predictable 名 | High | tempfile / 0600 |
| log に `path.display()` の絶対 path | High | sanitize |
| 重要 file を atomic write なしで直接上書き | High | rename ベースの atomic write |
| canonicalize 失敗 error に絶対 path | Medium (報告しない) | sanitize |

## 4. post-check で見る点 (path 系 mitigation)

canonicalize 後の scope check (境界 B 以外) / reserved・ADS・device・UNC の reject / traversal reject (境界 B 以外) /
canonicalize 失敗時の error に絶対 path が無いこと / check-then-act が atomic になっていること。
