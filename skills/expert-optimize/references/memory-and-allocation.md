# Memory and Allocation — メモリ・allocation 最適化

<!--
機能概要: 不要 allocation / clone / String 化 / buffer 多重保持 / cache 無限成長を抑える。
作成意図: Rust / OCR / PDF / IDML では allocation がボトルネックになることが多い。
         ただし borrow / Cow / Arc を多用すると可読性が破壊されるので、
         「大きい allocation だけ」を対象にする原則を明文化する。
注意点: micro 化を避ける。1 KB 以上 / 1000 要素以上 / hot path のみ対象。
       cache を入れる場合は invalidation を必ず明示。
-->

## 大原則

1. **allocation 最適化は対象を絞る** — 大きい (> 1KB / > 1000 要素) かつホットパスのみ
2. **borrow 地獄を作らない** — 可読性が破壊されるなら撤退
3. **drop タイミングを意識する** — 大型 buffer は処理後に即 drop
4. **cache は invalidation 戦略がないなら入れない**
5. **bounded を必ず付ける** — unbounded cache / unbounded queue は OOM 経路

---

## 見るべき点 (検出対象)

### clone の多発

```rust
// Bad: 巨大 Vec の clone
fn process(items: Vec<Item>) -> Vec<Output> {
    let backup = items.clone();  // 同じデータが 2 倍 retain
    // ...
}

// Bad: HashMap の clone
let snapshot = state.clone();  // 巨大 HashMap の deep clone
```

### String / Vec の不要生成

```rust
// Bad: 毎回 String alloc
fn key(id: &str) -> String { format!("user:{}", id) }
let v = cache.get(&key("u1"));

// Bad: collect → 再走査
let names: Vec<String> = users.iter().map(|u| u.name.clone()).collect();
let total = names.iter().count();  // collect 不要だった
```

### serde roundtrip

```rust
// Bad: parse → 加工 → serialize → parse
let m: Manifest = serde_json::from_str(&json)?;
let j = serde_json::to_string(&m)?;
let m2: Manifest = serde_json::from_str(&j)?;
```

### 大型 buffer の長期保持

```rust
// Bad: 処理が終わっても struct field に大型 bitmap を持ち続ける
struct OcrPipeline {
    raw_image: Vec<u8>,        // 入力 (10 MB)
    preprocessed: Vec<u8>,     // 前処理結果 (10 MB)
    feature_map: Vec<f32>,     // 中間 (40 MB)
    final_text: String,        // 最終 (1 KB)
}

// → 全段階の buffer が同時に retain される (60 MB)
```

### unbounded cache / listener

```rust
// Bad: HashMap への insert のみで eviction なし
struct OcrCache {
    cache: HashMap<ImageHash, OcrResult>,  // 無限成長
}

// Bad: addEventListener のみで removeEventListener なし
window.addEventListener('resize', handler)  // unmount 時の解除なし
```

### Vec::push / String::push_str 多発で再 alloc

```rust
// Bad: 既知サイズなのに with_capacity なし
let mut out = Vec::new();
for i in 0..1_000_000 {
    out.push(transform(i));
}
```

---

## 改善パターン

### 1. with_capacity で再 alloc 排除

```rust
// Good
let mut out = Vec::with_capacity(1_000_000);
for i in 0..1_000_000 {
    out.push(transform(i));
}

// String も同様
let mut buf = String::with_capacity(estimated_size);
for line in lines {
    buf.push_str(line);
    buf.push('\n');
}
```

> **n が小さい (< 100) なら不要**。Vec の指数 grow が十分速い。

### 2. borrow / Cow で clone を避ける

```rust
// Good: 関数引数を borrow
fn process(items: &[Item]) -> Vec<Output> { /* ... */ }

// Good: Cow で「変えたいときだけ alloc」
use std::borrow::Cow;
fn maybe_normalize(s: &str) -> Cow<'_, str> {
    if s.contains(' ') {
        Cow::Owned(s.replace(' ', "_"))
    } else {
        Cow::Borrowed(s)
    }
}
```

### 3. Arc で大型 read-only データを共有

```rust
// Good: Arc は cheap pointer copy
let manifest = Arc::new(load_manifest()?);
for task in tasks {
    let m = Arc::clone(&manifest);  // refcount 増加のみ
    tokio::spawn(async move {
        process(&m, task).await
    });
}
```

> 注意: `Arc::clone` ではなく `(*manifest).clone()` を呼ぶと中身が deep clone される。
> 必ず `Arc::clone(&manifest)` または `manifest.clone()` で参照だけ複製する。

### 4. streaming で大型 buffer を持ち回らない

```rust
// Good: streaming で段階的に処理 + drop
fn process_pages(page_count: usize) {
    for i in 0..page_count {
        let raw = render_page(i);          // 10 MB
        let pre = preprocess(&raw);
        drop(raw);                         // 早期 drop
        let result = run_ocr(&pre);
        drop(pre);
        save(&result);
    }
}
```

### 5. mem::take / mem::replace で所有権移動

```rust
use std::mem;

struct Pipeline {
    buffer: Vec<u8>,
}

impl Pipeline {
    fn flush(&mut self) -> Vec<u8> {
        mem::take(&mut self.buffer)  // 所有権を移動、内部は空 Vec に
    }
}
```

### 6. drop scope を狭める

```rust
// Bad: 全 scope で大型 buffer 保持
fn process() -> Result<()> {
    let huge = load_huge()?;
    let summary = summarize(&huge);
    // huge を以降使わないが scope 内で生き続ける
    do_other_work(&summary);
    Ok(())
}

// Good: block で scope 限定
fn process() -> Result<()> {
    let summary = {
        let huge = load_huge()?;
        summarize(&huge)
        // huge は block 末で drop
    };
    do_other_work(&summary);
    Ok(())
}
```

### 7. bounded cache (LRU / TTL)

```rust
use lru::LruCache;
use std::num::NonZeroUsize;

struct OcrCache {
    cache: LruCache<ImageHash, Arc<OcrResult>>,
}

impl OcrCache {
    fn new(capacity: usize) -> Self {
        Self {
            cache: LruCache::new(NonZeroUsize::new(capacity).unwrap()),
        }
    }
}
```

```rust
// または TTL で自動 expire
use moka::sync::Cache;

let cache: Cache<Key, Arc<Value>> = Cache::builder()
    .max_capacity(10_000)
    .time_to_live(Duration::from_secs(600))
    .build();
```

### 8. listener / watcher 解除

```typescript
// Vue 3
import { onUnmounted } from 'vue'

const handler = () => { /* ... */ }
window.addEventListener('resize', handler)
onUnmounted(() => {
  window.removeEventListener('resize', handler)
})
```

```rust
// Tauri
let unlisten = app.listen("event-name", |event| { /* ... */ });
// 後で
app.unlisten(unlisten);
```

```dart
// Flutter
class _MyWidgetState extends State<MyWidget> {
  late final TextEditingController _ctrl = TextEditingController();
  StreamSubscription<int>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = stream.listen((_) {});
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _sub?.cancel();
    super.dispose();
  }
}
```

### 9. typed intermediate で serde roundtrip 排除

```rust
// Good: parse once、加工も typed のまま
let m: Manifest = serde_json::from_str(&json)?;
let updated = update(m);  // typed 加工
// 必要時にだけ serialize
let json2 = serde_json::to_string(&updated)?;
```

### 10. iterator で collect を遅延

```rust
// Bad: 中間 collect
let names: Vec<String> = users.iter().map(|u| u.name.clone()).collect();
let upper: Vec<String> = names.iter().map(|n| n.to_uppercase()).collect();

// Good: chain して 1 回 collect
let upper: Vec<String> = users.iter()
    .map(|u| u.name.to_uppercase())
    .collect();
```

---

## 小型 allocation は触らない

以下は ignored_noise:

- 1 回しか呼ばれない初期化処理の clone
- `format!("{}", n)` 1 回 (UI helper)
- 数十要素の Vec への push (with_capacity 不要)
- 文字列リテラルの `.to_string()` 1 回
- struct field の小さい String

> 「micro allocation を全部消す」は可読性破壊。**改善幅が誤差レベルなら触らない**。

---

## メモリプロファイリング

### dhat (Rust heap profiler)

`benchmark-protocol.md` 参照。`dhat-heap.json` を `dh_view` で開いて、
どの allocation site が支配的かを確認する。

### macro 確認: peak RSS

```bash
# Linux
/usr/bin/time -v ./target/release/app input/large.json
# Maximum resident set size (kbytes): N

# WSL
/usr/bin/time -v ./target/release/app input/large.json
```

### Tauri / Flutter のメモリ確認

- Tauri: WebView の DevTools Memory タブ
- Flutter: devtools の Memory タブ、`flutter run --profile` でリアルタイム監視

---

## アンチパターン (避ける)

- **`Box<T>` を `Arc<T>` に変える「最適化」で可読性破壊** (Box で十分なら Box)
- **`String` 全てを `&str` に変えようとして借用地獄**
- **`clone` 1 個を消すために unsafe を入れる**
- **小さい struct を `Box` に入れる** (Box overhead の方が大きい)
- **`SmallVec` / `arrayvec` を benchmark 取らずに導入** (Vec で十分速いことが多い)
- **cache を入れたら invalidation を考えない** (cache 不整合が次のバグになる)

---

## 改善判断フロー (memory)

```text
1. allocation が bottleneck か? (dhat / heaptrack で確認)
   - No → 触らない
   - Yes → 次へ

2. 該当 allocation は大きいか? (> 1KB / > 1000 要素)
   - No → 触らない
   - Yes → 次へ

3. clone が必要か?
   - No → borrow / Cow / Arc に置き換え
   - Yes → 次へ

4. drop scope を狭められるか?
   - Yes → block scope / mem::take
   - No → 次へ

5. bounded cache で代替できるか?
   - Yes → LRU / TTL で導入 (invalidation 戦略を明記)
   - No → 触らない (unbounded cache は禁止)

6. 改善後 Before/After で peak RSS と速度を確認
```
