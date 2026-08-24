# Sunny — public pages

The support page, privacy policy and terms of use for **Sunny**, an iOS alarm app that
only stops once you have completed a short exercise, verified by the camera.

- **Landing page — <https://sorawata02-eng.github.io/sunny/>** (`index.html`)
- **Download link — <https://sorawata02-eng.github.io/sunny/get/>** (redirects to the App Store)
- Support — <https://sorawata02-eng.github.io/sunny/support.html>
- Privacy Policy — <https://sorawata02-eng.github.io/sunny/privacy.html>
- Terms of Use — <https://sorawata02-eng.github.io/sunny/terms.html>

## `/get/` is the link to paste, not the App Store URL

Instagram will not take an App Store link in a bio, so the bio points at
`.../sunny/get/` and that points at the App Store.

**Changing the domain is only half of it**, and the half that is easy to miss. Instagram
opens links in its own WebView, and sending that WebView to `https://apps.apple.com/...`
can render the App Store *web page* inside it — no Get button, no way forward. A plain
redirect adds a hop without escaping the WebView.

The escape is a scheme the host app understands: `instagram://extbrowser` hands the URL
to the real browser, `x-safari-` does the same in Facebook and Messenger, and Android
uses an `intent://` URL. **None of these are documented by Meta or Apple.** They work
today and have for years; they can stop without notice. That is why every one of them is
paired with a visible fallback.

Two things about the timing, both learned the hard way:

- **The escape must fire synchronously inside a click handler.** iOS only honours a
  navigation to a custom scheme while it still considers itself in a user gesture, so the
  automatic attempt on page load is best-effort only. When it does not fire, the page
  shows a button after 1.4s and a real tap does what the load could not.
- **The automatic attempt runs once per session.** Without that guard, pressing Back from
  the App Store loads the page, which redirects again, and the visitor is trapped.

Android gets a notice rather than a redirect — Sunny is iPhone-only, so there is nothing
to send them to.

`?s=` names the source and reaches Apple as `ct`, so App Store Connect's campaign report
can tell one placement from another:

    .../sunny/get/?s=instagram
    .../sunny/get/?s=tiktok

`get/inapp-browser.js` is a verbatim copy of a module already shipping for another app.
Its tests came with it and live outside `Web/`, because everything in `Web/` is published:

    node --test Tools/webtests/inapp-browser.test.js     # 59 tests

## The root is the landing page now

Until 24 August 2026 `/` was the support page, because that URL was registered with
Apple as the app's **Support URL** and a reviewer following it had to find support rather
than a pitch. The landing page waited at `landing.html` for that reason.

The swap is done: `index.html` is the landing page, support moved to `support.html`.

**The Support URL field in App Store Connect must say `.../support.html`.** If it still
points at `/`, a reviewer following it lands on marketing, which is a guideline 1.5
problem — and this app has already been rejected three times over metadata. Change the
field in the same session you submit the next build.

`site.css` is the landing page's own stylesheet. `style.css` belongs to the generated
legal pages and to `support.html`; keeping them apart is what stops
`Tools/build_web.py` and the landing page from fighting over one file.

Screenshots in `img/` are exported from `Tools/appstore/captures/` at 660px wide — the
raw simulator captures rather than the finished App Store images, so the marketing
headline and the subscription-required line are not baked in twice.

`img/phone-frame.webp` is the device they sit inside: one transparent overlay with the
screen punched out, rendered by `Tools/appstore/frame.py` from the same code that draws
the App Store screenshots, so the site and the store show the same phone. Re-run that
script if the frame changes and paste its printed geometry into `site.css` — the hole and
the screenshot behind it have to agree to the pixel.

`img/appstore-badge.svg` is Apple's own Japanese badge artwork, not a redraw of it.
Apple's guidelines: never recolour or rebuild it, and never render it under 40px tall.

`img/mark.png` is the app icon's sunrise, extracted from `icon-1024.png` as an alpha
mask so the wordmark cannot drift from the icon the App Store shows.

The privacy policy and terms are generated from the documents inside the app itself, so
the published versions and the ones shown on screen cannot drift apart. Edit them in the
app, not here.

Contact: sora.wata09@icloud.com
