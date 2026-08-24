/**
 * main.js — the redirect bridge
 * -----------------------------------------------------------------------------
 * What happens when someone lands on /get/:
 *
 *   normal browser (Safari, Chrome)
 *     -> immediately redirect to the App Store, replacing this page in history
 *
 *   Instagram / Facebook / Messenger / Threads in-app browser
 *     -> immediately try the "open in the real browser" scheme as a best effort
 *     -> iOS often blocks that without a user gesture, so if the page is still
 *        here 1.4s later, show the button and let the visitor tap it. A real
 *        tap is a user gesture, which is far more likely to be honoured.
 *
 *   Android
 *     -> say so. Sunny is iPhone-only; there is nothing to redirect to.
 *
 * The automatic attempt runs AT MOST ONCE per browsing session, so pressing
 * Back never bounces the visitor forward again.
 *
 * Everything is wrapped in try/catch. If this file breaks, the page falls back
 * to a plain <a href="https://apps.apple.com/..."> that works on its own.
 * -----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /** How long to wait for the browser to disappear before showing the button. */
  var FALLBACK_DELAY_MS = 1400;

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // Detect before DOMContentLoaded: this only reads navigator and only writes to
  // <html>, both available the moment the script runs, which is before the first
  // paint. That is what stops an Android visitor seeing a flash of the spinner.
  var env = null;
  try {
    if (window.InAppBrowser) env = window.InAppBrowser.detectFromWindow(window);
  } catch (error) {
    console.warn('[main] could not detect the platform', error);
  }

  if (env && env.isAndroid) setState('android');

  onReady(function () {
    try {
      init();
    } catch (error) {
      console.error('[main] initialisation failed — showing the button', error);
      showFallback();
    }
  });

  /* ==========================================================================
   * State switching
   * ========================================================================== */

  function setState(state) {
    try {
      document.documentElement.setAttribute('data-state', state);
    } catch (error) {
      /* ignore */
    }
  }

  var fallbackShown = false;

  function showFallback(options) {
    var opts = options || {};

    if (env && env.isAndroid) {
      setState('android');
      return;
    }

    if (fallbackShown) return;
    fallbackShown = true;
    setState('fallback');

    if (opts.focus === false) return;
    try {
      if (document.hidden) return;
      var cta = document.getElementById('ctaLink');
      if (cta && typeof cta.focus === 'function') cta.focus();
    } catch (error) {
      /* ignore */
    }
  }

  /* ==========================================================================
   * Campaign tag
   * ========================================================================== */

  /**
   * `/get/?s=instagram` reaches Apple as `ct=instagram`, so App Store Connect's
   * campaign report can separate one placement from another. Sunny has no
   * analytics and this adds none — Apple reads the parameter, we never do.
   *
   * Applied to the anchor's href before anything reads it, so the automatic
   * redirect, the escape scheme and the copy field all carry the same URL.
   */
  function taggedUrl(baseUrl) {
    try {
      var source = new URLSearchParams(window.location.search).get('s');
      if (!source) return baseUrl;
      var clean = source.replace(/[^\w.-]/g, '').slice(0, 40);
      if (!clean) return baseUrl;
      return baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') +
        'ct=' + encodeURIComponent(clean) + '&mt=8';
    } catch (error) {
      return baseUrl; // very old webview: go untagged rather than not at all
    }
  }

  /* ==========================================================================
   * Init
   * ========================================================================== */

  function init() {
    if (typeof window.InAppBrowser === 'undefined') {
      console.error('[main] inapp-browser.js did not load — showing the button');
      showFallback({ focus: false });
      return;
    }

    // Sunny is iPhone-only, so Android gets a notice and nothing else: no
    // automatic attempt, no session flag, no App Store link worth showing.
    if (env && env.isAndroid) {
      setState('android');
      return;
    }

    var cta = document.getElementById('ctaLink');
    var appStoreUrl = cta ? cta.getAttribute('href') : null;

    if (!window.InAppBrowser.isSafeHttpUrl(appStoreUrl)) {
      console.error('[main] the download button has no valid https:// href', appStoreUrl);
      showFallback({ focus: false });
      return;
    }

    appStoreUrl = taggedUrl(appStoreUrl);
    if (cta) cta.setAttribute('href', appStoreUrl);

    syncCopyField(appStoreUrl);
    wireCopyButton(appStoreUrl);

    var controller = window.InAppBrowser.bind({
      selector: '[data-appstore-link]',
      env: env,
      delay: FALLBACK_DELAY_MS,
      onFallback: function () {
        showFallback();
        setCopyStatus('開けませんでした。••• から「ブラウザで開く」を選ぶか、リンクをコピーしてください。');
      }
    });

    var guard = window.InAppBrowser.createOnceGuard(window);
    var isBackForward = window.InAppBrowser.isBackForwardNavigation(window);

    if (guard.hasRun() || isBackForward) {
      // Second visit in this session, or the visitor pressed Back. Do not
      // redirect again — that is how people get trapped on a bridge page.
      showFallback({ focus: false });
      return;
    }

    autoAttempt(controller, appStoreUrl, guard);

    window.addEventListener('pageshow', function (event) {
      if (event.persisted) showFallback({ focus: false });
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) showFallback({ focus: false });
    });
  }

  /* ==========================================================================
   * The one automatic attempt
   * ========================================================================== */

  function autoAttempt(controller, appStoreUrl, guard) {
    // Mark BEFORE navigating. If the visitor comes straight back, the flag is
    // already set and we will not bounce them again.
    guard.mark();

    // In a Meta in-app browser this arms the watcher and fires the escape
    // scheme synchronously. Returns false when no escape applies.
    if (controller.retry(appStoreUrl)) return;

    // Normal browser: go straight to the App Store. `replace` rather than
    // `href` so this page never becomes a history entry — Back then returns to
    // wherever the visitor came from instead of landing here and redirecting.
    var cancelWatch = window.InAppBrowser.watchForEscape({
      delay: FALLBACK_DELAY_MS,
      onFailure: function () {
        showFallback();
      }
    });

    try {
      window.location.replace(appStoreUrl);
    } catch (error) {
      console.error('[main] automatic redirect failed', error);
      cancelWatch();
      showFallback();
    }
  }

  /* ==========================================================================
   * Copy link
   * ========================================================================== */

  var copyStatusTimer = null;

  function setCopyStatus(message) {
    var el = document.getElementById('copyStatus');
    if (!el) return;
    if (copyStatusTimer !== null) {
      window.clearTimeout(copyStatusTimer);
      copyStatusTimer = null;
    }
    el.textContent = message;
    if (message) {
      copyStatusTimer = window.setTimeout(function () {
        el.textContent = '';
        copyStatusTimer = null;
      }, 3200);
    }
  }

  function syncCopyField(appStoreUrl) {
    var field = document.getElementById('linkField');
    if (field) field.value = appStoreUrl;
  }

  function wireCopyButton(appStoreUrl) {
    var button = document.getElementById('copyBtn');
    var field = document.getElementById('linkField');
    if (!button) return;

    button.addEventListener('click', function () {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(appStoreUrl).then(
          function () { setCopyStatus('コピーしました。'); },
          function () { legacyCopy(field); }
        );
        return;
      }
      legacyCopy(field);
    });

    if (field) {
      field.addEventListener('focus', function () {
        try {
          field.setSelectionRange(0, field.value.length);
        } catch (error) { /* ignore */ }
      });
    }
  }

  // Deprecated, but works in the Meta in-app browsers where the Clipboard API
  // is sometimes missing.
  function legacyCopy(field) {
    if (!field) {
      setCopyStatus('リンクを長押ししてコピーしてください。');
      return;
    }
    try {
      field.removeAttribute('readonly');
      field.focus();
      field.setSelectionRange(0, field.value.length);
      var ok = document.execCommand('copy');
      field.setAttribute('readonly', 'readonly');
      setCopyStatus(ok ? 'コピーしました。' : 'リンクを長押ししてコピーしてください。');
    } catch (error) {
      // The field is visible and selectable, so the visitor can always
      // long-press it. Nobody ends up stuck without the link.
      try { field.setAttribute('readonly', 'readonly'); } catch (innerError) { /* ignore */ }
      setCopyStatus('リンクを長押ししてコピーしてください。');
    }
  }
})();
