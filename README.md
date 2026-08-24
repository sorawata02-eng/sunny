# Sunny — public pages

The support page, privacy policy and terms of use for **Sunny**, an iOS alarm app that
only stops once you have completed a short exercise, verified by the camera.

- **Landing page — <https://sorawata02-eng.github.io/sunny/>** (`index.html`)
- Support — <https://sorawata02-eng.github.io/sunny/support.html>
- Privacy Policy — <https://sorawata02-eng.github.io/sunny/privacy.html>
- Terms of Use — <https://sorawata02-eng.github.io/sunny/terms.html>

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
headline and the subscription-required line are not baked in twice. Phone frames are
drawn in CSS.

The privacy policy and terms are generated from the documents inside the app itself, so
the published versions and the ones shown on screen cannot drift apart. Edit them in the
app, not here.

Contact: sora.wata09@icloud.com
