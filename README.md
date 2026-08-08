# Sunny's public pages

Three static files. They exist because App Store Connect requires a **Privacy Policy URL**
and a **Support URL** that Apple can open, and neither can be satisfied from inside the app.

| File | Purpose |
|---|---|
| `index.html` | Support page — contact address and the questions people actually write in about |
| `privacy.html` | Privacy Policy |
| `terms.html` | Terms of Use |
| `style.css` | Shared styling, lifted from the app's own design tokens |

Both legal pages are **generated**, not hand-written:

    python3 Tools/build_web.py          # regenerate after editing the app's documents
    python3 Tools/build_web.py --check  # fail if the published pages have drifted

The source is `Sunny/Paywall/LegalDocument.swift` — the same documents the in-app screens
render — with the Japanese taken from the same translations that are compiled into the
binary. Edit the app's documents and re-run; never edit `privacy.html` or `terms.html` by
hand, because a hosted privacy policy that quietly stops matching the app is a public
statement that is no longer true.

Run `--check` before every submission. It proves the URL you are handing Apple says what
the build does.

---

## Hosting it

Nothing here needs a server, a build step, or a framework — any static host works. The
files use only relative links, so they work at any base path and a custom domain can be
added later without editing anything.

### GitHub Pages, in a separate repository (recommended)

A separate repo keeps the app's source private while the pages stay public. GitHub Pages
only serves from a repository root or a `/docs` folder, and this project already has a
`Docs/` folder, so a dedicated repo is also the tidiest fit.

1. Create a new **public** repository on GitHub called `sunny`. Do not add a README.
2. From this project:

       cd "Web"
       git init
       git add .
       git commit -m "Sunny public pages"
       git branch -M main
       git remote add origin https://github.com/<your-github-username>/sunny.git
       git push -u origin main

3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
4. Wait a minute or two, then open the URLs below and confirm they load in a private
   window — Apple must be able to reach them without being signed in to anything.

Your URLs will be:

    https://<your-github-username>.github.io/sunny/           (support)
    https://<your-github-username>.github.io/sunny/privacy.html
    https://<your-github-username>.github.io/sunny/terms.html

### A custom domain later

Add a file called `CNAME` containing the domain, point a DNS `CNAME` record at
`<your-github-username>.github.io`, and set the domain under Settings → Pages. The URLs in
App Store Connect can be updated at any time without submitting a new build — they are
metadata, not part of the binary.

### If you would rather not use GitHub

Drag this folder onto <https://app.netlify.com/drop>, or use any static host. The only
requirements Apple has are that the pages are publicly reachable, load without a login,
and stay up.
