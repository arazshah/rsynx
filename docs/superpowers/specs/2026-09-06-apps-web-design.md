# apps/web — landing page + install script

## هدف

`apps/web` تنها بخش از ساختار پروژه (طبق `README.md` و `CLAUDE.md`) است که هنوز ساخته
نشده: یک صفحهٔ فرود دامنهٔ `rsynx.ir` به‌همراه اسکریپت نصبی که با
`curl -fsSL https://rsynx.ir/i | sh` قابل اجراست و از باینری‌های منتشرشده در
`.github/workflows/release.yml` استفاده می‌کند.

## معماری

یک اپ جدید در workspace به نام `@rsynx/web`، هم‌شکل با `apps/relay`: فقط `Bun.serve()`
خام، بدون فریم‌ورک HTTP و بدون build step — مطابق قانون سخت «فقط Bun» در `CLAUDE.md`.

```
apps/web/
├── package.json        @rsynx/web — scripts: dev, start, test, typecheck
├── src/
│   ├── index.ts         Bun.serve() — مسیریابی سه‌حالته
│   └── index.test.ts     تست سه مسیر
└── public/
    ├── index.html        صفحهٔ فرود (استاتیک، بدون build)
    └── install.sh        اسکریپت نصب (POSIX sh)
```

### `src/index.ts`

سرور فقط سه مسیر را می‌شناسد:

| مسیر | پاسخ |
|------|------|
| `GET /` | `public/index.html` با `content-type: text/html; charset=utf-8` |
| `GET /i` | `public/install.sh` با `content-type: text/x-shellscript; charset=utf-8` |
| هر مسیر دیگر | `404 Not Found` |

پورت از `process.env.PORT` خوانده می‌شود (پیش‌فرض `3000`). دیپلوی واقعی (systemd/Docker
روی یک VPS) خارج از اسکوپ این کار است — فقط خود اپ ساخته می‌شود.

## اسکریپت نصب (`public/install.sh`)

POSIX `sh` خالص (بدون bashism، چون shebang آن `#!/bin/sh` است):

1. **تشخیص OS** با `uname -s`: `Linux` → `linux`، `Darwin` → `darwin`. هر مقدار دیگر →
   پیام خطا به `stderr` («سیستم‌عامل پشتیبانی نمی‌شود، باینری را دستی از صفحهٔ Releases
   گیت‌هاب دانلود کنید») + خروج با کد ۱.
2. **تشخیص معماری** با `uname -m`: `x86_64`/`amd64` → `x64`، `arm64`/`aarch64` → `arm64`.
   هر مقدار دیگر → همان رفتار خطای بالا.
3. **دانلود باینری** از
   `https://github.com/arazshah/rsynx/releases/latest/download/rsynx-<os>-<arch>` —
   این آدرس ثابت گیت‌هاب همیشه به آخرین release اشاره می‌کند، پس نیازی به فراخوانی GitHub
   API (و محدودیت نرخ آن) نیست.
4. **نصب**: فایل دانلودشده به‌صورت موقت گرفته می‌شود، `chmod +x` می‌شود، و به
   `${RSYNX_INSTALL_DIR:-$HOME/.local/bin}` منتقل می‌شود (پوشه در صورت نبود ساخته
   می‌شود). هرگز از `sudo` استفاده نمی‌شود و هرگز بیرون از `$HOME` نمی‌نویسد، مگر کاربر
   صریحاً `RSYNX_INSTALL_DIR` را ست کند.
5. **بررسی PATH**: اگر پوشهٔ نصب از قبل در `$PATH` نیست، خط
   `export PATH="<dir>:$PATH"` برای اضافه‌کردن به‌صورت راهنما چاپ می‌شود.

Windows به‌صورت آگاهانه پوشش داده نمی‌شود — کاربران Windows باینری `rsynx-windows-x64.exe`
را دستی از GitHub Releases دانلود می‌کنند (لینک در صفحهٔ فرود).

## صفحهٔ فرود (`public/index.html`)

یک فایل HTML استاتیک با `<style>` inline، بدون جاوااسکریپت، بدون build step. محتوا به
فارسی (هم‌راستا با لحن موجود در `README.md`، `SPEC.md`، و `CLAUDE.md`).

تم: تیره، الهام‌گرفته از ترمینال — پشتهٔ فونت monospace سیستمی
(`ui-monospace, "SF Mono", "Cascadia Code", "Liberation Mono", monospace`) به‌جای
فونت‌های عمومی مثل Inter، و یک رنگ تأکیدی واحد (سبز/فیروزه‌ای در سبک cursor ترمینال) —
نه گرادیان بنفش/نئون. این محدودیت‌ها همان قوانین ضد-الگوی-عمومی-AI هستند که در
`rules/ux-design/DESIGN_PROCESS.md` آمده، حتی برای یک صفحهٔ مینیمال.

بخش‌ها:

1. **Header**: عنوان `rsynx` + یک جملهٔ معرفی («اشتراک‌گذاری زندهٔ ترمینال، بدون SSH»).
2. **نصب**: بلاک کد قابل‌کپی با دستور `curl -fsSL https://rsynx.ir/i | sh`.
3. **نحوهٔ کار**: خلاصهٔ جریان host/join (همان چیزی که در بخش «استفاده»ی `README.md`
   هست) — دستور `rsynx host`، دستور `rsynx join <code>`، و توضیح تأیید/چت/انتقال کنترل.
4. **گیت‌هاب**: لینک به `github.com/arazshah/rsynx` و به صفحهٔ Releases (برای دانلود
   دستی باینری Windows).
5. **Footer**: لایسنس MIT + لینک به `LICENSE`.

سه لنگر ناوبری بالای صفحه (`نحوهٔ کار` / `نصب` / `گیت‌هاب`) به بخش‌های ۲ و ۳ و لینک
گیت‌هاب اشاره می‌کنند.

## تست

`src/index.test.ts` با `bun:test`، سه حالت:

- `GET /` → status `200`، `content-type` شامل `text/html`.
- `GET /i` → status `200`، `content-type` شامل `text/x-shellscript`.
- `GET /does-not-exist` → status `404`.

اسکریپت نصب تست خودکار ندارد (چون TypeScript نیست)؛ صحت آن با `sh -n public/install.sh`
(بررسی نحوی) و یک اجرای دستی در برابر سروری که با `bun run --cwd apps/web dev` بالا
آمده، تأیید می‌شود.

## خارج از اسکوپ

- دیپلوی واقعی (Dockerfile، systemd unit، تنظیم DNS برای `rsynx.ir`).
- پشتیبانی از Windows در اسکریپت `/i`.
- هر گونه build step، فریم‌ورک frontend، یا فایل CSS/JS جدا.
