# CLAUDE.md

راهنمای Claude Code برای کار در این ریپازیتوری.

## دربارهٔ پروژه

rsynx یک ابزار متن‌باز خط‌فرمان برای اشتراک‌گذاری زندهٔ ترمینال بین دو نفر است — شبیه
AnyDesk اما برای ترمینال، بدون نیاز به SSH، IP عمومی، یا تنظیم فایروال. یک نفر میزبان است
(`rsynx host`) که یک کد شش‌رقمی و رمز عبور چهار کاراکتری تولید می‌کند؛ طرف دیگر با
`rsynx join <code>` وصل می‌شود. بعد از تأیید میزبان، مهمان می‌تواند ترمینال را زنده تماشا
کند، چت کند، و در صورت تأیید مجدد میزبان کنترل تایپ را موقتاً بگیرد. تمام ارتباط سرتاسر
(end-to-end) رمزنگاری می‌شود؛ سرور relay هرگز به کلید رمزگشایی یا محتوای پیام‌ها دسترسی
ندارد. مالک پروژه: اراز شاه‌کرمی (mail@araz.me) — github.com/arazshah/rsynx — لایسنس MIT.

مستند کامل پروتکل در [`docs/SPEC.md`](docs/SPEC.md) است — قبل از تغییر هر چیزی مرتبط با
پروتکل، رمزنگاری، یا فرمت پیام‌ها، آن فایل را بخوان و اگر تغییری در رفتار پروتکل لازم است،
اول SPEC.md را به‌روز کن.

## قوانین سخت (غیرقابل مذاکره)

- **فقط Bun.** هیچ‌جا از npm/yarn/pnpm یا Node.js runtime استفاده نشود — نه در اسکریپت‌ها، نه
  در Dockerfile، نه در CI.
- **strict: true** در تمام tsconfig های پروژه (ریشه و هر workspace).
- **relay هرگز نباید:** payload رمزشده را روی دیسک ذخیره کند، سعی در رمزگشایی آن کند، نشست را
  بعد از پایان نگه دارد، یا محتوای payload را لاگ کند. لاگ‌های relay فقط شامل session-id، نوع
  پیام، و timestamp هستند.
- **هیچ عملیات کنترلی بدون تأیید صریح میزبان اجرا نشود** — نه پذیرش join، نه گرفتن کنترل تایپ
  توسط مهمان.
- **نام‌گذاری فایل‌ها kebab-case.**
- **پیام‌های commit به فرمت Conventional Commits.**

## ساختار پوشه‌ها

```
rsynx/
├── apps/
│   ├── cli/          @rsynx/cli — ابزار خط‌فرمان (host/join، رابط TUI)
│   ├── relay/        @rsynx/relay — سرور واسط WebSocket (فقط فوروارد پیام‌های رمزشده)
│   └── web/          سایت فرود + اسکریپت نصب (مسیر /i)
├── packages/
│   └── protocol/     @rsynx/protocol — رمزنگاری، مشتق‌سازی کلید، تایپ‌های پیام مشترک
├── docs/
│   └── SPEC.md        مستند کامل پروتکل — منبع حقیقت برای هر رفتار پروتکلی
└── .github/workflows/  CI (typecheck + test) و release (build باینری چندپلتفرمی)
```

## قرارداد Commit

Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, ...). هر مرحلهٔ
منطقی از کار (مثلاً هر بستهٔ workspace، هر زیرمرحلهٔ CLI) باید بعد از پاس شدن تست‌های مربوطه
(typecheck و/یا `bun test`) در یک commit جدا ثبت شود — commit های بزرگ و ترکیبی از چند مرحله
نساز.

## دستورات مفید

```bash
bun install                        # نصب وابستگی‌های کل workspace
bun test                           # اجرای تمام تست‌ها (bun:test)
bun run typecheck                  # tsc --noEmit روی کل ریپازیتوری
bun run --cwd apps/relay dev       # اجرای relay در حالت dev
bun run --cwd apps/cli dev         # اجرای cli در حالت dev
bun run --cwd apps/web dev         # اجرای web (صفحهٔ فرود + /i) در حالت dev
bun run dev:relay                  # میان‌بر همان دستور بالا از ریشه
bun run dev:cli                    # میان‌بر همان دستور بالا از ریشه
bun run dev:web                    # میان‌بر همان دستور بالا از ریشه
bun run build:cli                  # ساخت باینری standalone برای cli
```

برای اجرای یک تست خاص: `bun test <path/to/file.test.ts>` یا `bun test -t "<name pattern>"`.

## نکات فنی مخصوص این پروژه

- در `apps/relay` از `Bun.serve()` با پشتیبانی WebSocket استفاده کن، نه یک فریم‌ورک HTTP
  جداگانه.
- در `packages/protocol` تا حد امکان فقط از Web Crypto API استاندارد (یا `bun:crypto` در
  صورت نیاز) استفاده کن؛ اضافه کردن هر وابستگی رمزنگاری خارجی باید توجیه صریح داشته باشد.
- تایپ‌های پیام پروتکل (envelope، انواع پیام‌های relay-level و user-level) باید به‌صورت
  discriminated union نوشته شوند تا type-safety کامل بین apps/cli و apps/relay حفظ شود.
- `apps/cli` با `bun build --compile --minify` به یک باینری standalone کامپایل می‌شود که به
  نصب جداگانهٔ Bun نیاز ندارد.
