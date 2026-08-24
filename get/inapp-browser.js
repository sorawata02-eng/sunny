/*!
 * inapp-browser.js
 * -----------------------------------------------------------------------------
 * A small, dependency-free helper that tries to escape the Instagram / Facebook /
 * Messenger / Threads in-app browsers and open a link in the real browser
 * (Safari on iOS, Chrome/default browser on Android).
 *
 * WHY THIS EXISTS
 * Meta's in-app browsers frequently refuse to hand off `https://apps.apple.com`
 * links to the App Store. The user taps "Download" and nothing happens. The
 * workaround is to ask the host app to re-open the URL externally using a
 * custom URL scheme.
 *
 * IMPORTANT CAVEAT
 * The escape URL schemes used here (`instagram://extbrowser`, `x-safari-`) are
 * NOT documented or supported by Meta or Apple. They work today, they have
 * worked for years, and they may stop working without notice. That is exactly
 * why this module ALWAYS pairs an escape attempt with a visible fallback, and
 * why the buttons on the page stay real `<a href="...">` anchors that work with
 * JavaScript completely disabled.
 *
 * DESIGN RULES (do not break these)
 *  1. In a normal browser this module does nothing at all. The anchor navigates
 *     natively.
 *  2. The escape navigation happens SYNCHRONOUSLY inside the click handler.
 *     No promises, no analytics, no `await`, no `setTimeout` before it. iOS
 *     only honours a navigation to a custom scheme while it still considers
 *     itself inside a user gesture.
 *  3. If anything throws, we fall back to plain anchor navigation.
 *
 * Loads as a plain <script> in the browser (exposes `window.InAppBrowser`) and
 * as a CommonJS module in Node (so `npm test` can import the pure functions).
 * -----------------------------------------------------------------------------
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(); // Node — used by tests/
  } else {
    root.InAppBrowser = factory(); // Browser — used by js/main.js
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** How long to wait for the page to disappear before we assume the escape failed. */
  var DEFAULT_FALLBACK_DELAY_MS = 1500;

  /* ==========================================================================
   * 1. Detection
   * ========================================================================== */

  /**
   * Work out which browser/OS we are in. Pure function — pass the user-agent in
   * so it can be unit tested without a browser.
   *
   * @param {string} userAgent  navigator.userAgent
   * @param {{platform?: string, maxTouchPoints?: number}} [options]
   *        navigator.platform and navigator.maxTouchPoints, used to catch
   *        iPadOS 13+ which lies and reports a macOS user-agent by default.
   * @returns {{
   *   userAgent: string, os: 'ios'|'android'|'other', isIOS: boolean,
   *   isAndroid: boolean, app: 'instagram'|'threads'|'facebook'|'messenger'|'none',
   *   isMetaInAppBrowser: boolean
   * }}
   */
  function detect(userAgent, options) {
    var ua = typeof userAgent === 'string' ? userAgent : '';
    var opts = options || {};
    var platform = typeof opts.platform === 'string' ? opts.platform : '';
    var maxTouchPoints =
      typeof opts.maxTouchPoints === 'number' ? opts.maxTouchPoints : 0;

    var isAndroid = /Android/i.test(ua);

    // iPadOS 13+ in "desktop" mode reports a Macintosh UA. The giveaway is that
    // a real Mac reports maxTouchPoints === 0.
    var looksLikeIPadInDesktopMode =
      /Macintosh|Mac OS X/i.test(ua) && /Mac/i.test(platform) && maxTouchPoints > 1;

    var isIOS = !isAndroid && (/iPad|iPhone|iPod/i.test(ua) || looksLikeIPadInDesktopMode);

    // ---- Which Meta app are we inside? --------------------------------------
    // Order matters. Messenger's user-agent also contains "FBAN", and Threads'
    // user-agent is checked before Instagram's because they share tokens.
    //
    //   Instagram iOS : ... Instagram 302.0.0.23.109 (iPhone14,2; iOS 17_5_1; ...)
    //   Instagram And.: ... Instagram 302.0.0.36.111 Android (...)
    //   Facebook iOS  : ... [FBAN/FBIOS;FBAV/452.0.0.35.108;...]
    //   Facebook And. : ... [FB_IAB/FB4A;FBAV/452.0.0.28.109;...]
    //   Messenger iOS : ... [FBAN/MessengerForiOS;FBAV/...]
    //   Messenger And.: ... [FB_IAB/MESSENGER;FBAV/...] / Orca-Android
    //   Threads       : ... Barcelona 300.0.0.30.109 (...)   ("Barcelona" is
    //                   Threads' internal codename — undocumented, best effort.)
    var isMessenger =
      /FBAN\/Messenger|FB_IAB\/MESSENGER|MessengerLiteForiOS|Orca-Android/i.test(ua);
    var isThreads = /Barcelona|Threads/i.test(ua);
    var isInstagram = /Instagram/i.test(ua);
    var isFacebook = /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua);

    var app = 'none';
    if (isMessenger) app = 'messenger';
    else if (isThreads) app = 'threads';
    else if (isInstagram) app = 'instagram';
    else if (isFacebook) app = 'facebook';

    return {
      userAgent: ua,
      os: isIOS ? 'ios' : isAndroid ? 'android' : 'other',
      isIOS: isIOS,
      isAndroid: isAndroid,
      app: app,
      isMetaInAppBrowser: app !== 'none'
    };
  }

  /** Read detection inputs off a real `window`. */
  function detectFromWindow(win) {
    var w = win || (typeof window !== 'undefined' ? window : null);
    var nav = (w && w.navigator) || {};
    return detect(nav.userAgent, {
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints
    });
  }

  /* ==========================================================================
   * 2. Building the escape URL
   * ========================================================================== */

  /**
   * Only ever hand off plain http(s) URLs. This stops a typo in index.html from
   * turning into a `javascript:` or `data:` navigation.
   */
  function isSafeHttpUrl(url) {
    if (typeof url !== 'string') return false;
    return /^https?:\/\/[^\s]+$/i.test(url.trim());
  }

  /**
   * Android intent: URL that asks Android to open the link in a real browser.
   *
   * We deliberately do NOT pin `package=com.android.chrome`: on a device
   * without Chrome that fails outright. Without a package, Android routes it to
   * the user's default browser (or shows a chooser), and
   * `S.browser_fallback_url` covers the case where nothing can handle it.
   */
  function buildAndroidIntentUrl(url) {
    var withoutScheme = String(url).trim().replace(/^https?:\/\//i, '');
    return (
      'intent://' +
      withoutScheme +
      '#Intent;scheme=https' +
      ';action=android.intent.action.VIEW' +
      ';category=android.intent.category.BROWSABLE' +
      ';S.browser_fallback_url=' +
      encodeURIComponent(String(url).trim()) +
      ';end'
    );
  }

  /**
   * Decide how (and whether) to try escaping. Pure function — the heart of the
   * module and the thing the tests care about most.
   *
   * @returns {{name: string, method: 'location'|'open-then-location', url: string}|null}
   *          `null` means "do not intercept — let the anchor navigate normally".
   */
  function getEscapeStrategy(env, appStoreUrl) {
    if (!env || !env.isMetaInAppBrowser) return null;
    if (!isSafeHttpUrl(appStoreUrl)) return null;

    var url = appStoreUrl.trim();

    if (env.isIOS) {
      if (env.app === 'instagram' || env.app === 'threads') {
        // Instagram (and Threads, which is built on Instagram's stack) exposes
        // an "open externally" scheme. Opens the system default browser.
        return {
          name: 'instagram-extbrowser',
          method: 'location',
          url: 'instagram://extbrowser/?url=' + encodeURIComponent(url)
        };
      }

      if (env.app === 'facebook' || env.app === 'messenger') {
        // Facebook's iOS apps understand an `x-safari-` PREFIX on a normal URL,
        // i.e. `x-safari-https://example.com`. Note this is a prefix, not a
        // scheme with its own `://`, and the URL is NOT percent-encoded.
        //
        // We try `window.open(..., '_blank')` first because that is the form
        // most widely reported to work in the Facebook webview, then fall
        // straight through to a `location.href` assignment if `window.open`
        // returns null (which WKWebView often does). Both are synchronous.
        return {
          name: 'x-safari-prefix',
          method: 'open-then-location',
          url: 'x-safari-' + url
        };
      }

      return null;
    }

    if (env.isAndroid) {
      // Same intent URL works for Instagram, Facebook and Messenger on Android.
      return {
        name: 'android-intent',
        method: 'location',
        url: buildAndroidIntentUrl(url)
      };
    }

    return null;
  }

  /* ==========================================================================
   * 3. Performing the escape (synchronous)
   * ========================================================================== */

  /**
   * Fire the escape navigation. MUST be called synchronously from the click
   * handler. Returns true if we managed to issue a navigation attempt.
   */
  function attemptEscape(strategy, win) {
    var w = win || (typeof window !== 'undefined' ? window : null);
    if (!strategy || !w) return false;

    try {
      if (strategy.method === 'open-then-location') {
        var opened = null;
        try {
          opened = w.open(strategy.url, '_blank');
        } catch (openError) {
          opened = null;
        }
        if (!opened) {
          w.location.href = strategy.url;
        }
        return true;
      }

      w.location.href = strategy.url;
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ==========================================================================
   * 3b. Redirect-loop protection
   * ========================================================================== */

  /**
   * The page redirects automatically on load. Without a guard, this happens:
   *
   *   visit page -> redirected to App Store -> user taps Back
   *     -> page loads again -> redirected again -> user is trapped
   *
   * So the automatic attempt is allowed ONCE per browsing session. The flag
   * lives in sessionStorage (cleared when the tab closes, survives Back).
   *
   * sessionStorage throws in some private/embedded webviews, so there is an
   * in-memory flag behind it. That still prevents a loop within one page
   * instance even when storage is completely unavailable.
   */
  function createOnceGuard(win, key) {
    var storageKey = key || 'appstore-bridge-auto-attempted';
    var w = win || (typeof window !== 'undefined' ? window : null);
    var inMemory = false;

    function hasRun() {
      if (inMemory) return true;
      try {
        return w && w.sessionStorage && w.sessionStorage.getItem(storageKey) === '1';
      } catch (error) {
        return inMemory; // storage blocked — rely on the in-memory flag
      }
    }

    function mark() {
      inMemory = true;
      try {
        if (w && w.sessionStorage) w.sessionStorage.setItem(storageKey, '1');
      } catch (error) {
        logWarning('sessionStorage unavailable — loop guard is memory-only');
      }
    }

    function reset() {
      inMemory = false;
      try {
        if (w && w.sessionStorage) w.sessionStorage.removeItem(storageKey);
      } catch (error) {
        /* ignore */
      }
    }

    return { hasRun: hasRun, mark: mark, reset: reset };
  }

  /**
   * True when this page load came from the Back or Forward button. Those loads
   * must never re-trigger the automatic redirect, even if the session flag was
   * lost somehow.
   */
  function isBackForwardNavigation(win) {
    var w = win || (typeof window !== 'undefined' ? window : null);
    try {
      var perf = w && w.performance;
      if (!perf) return false;

      if (typeof perf.getEntriesByType === 'function') {
        var entry = perf.getEntriesByType('navigation')[0];
        if (entry && entry.type) return entry.type === 'back_forward';
      }

      // Long-deprecated API, still the only one in some older webviews.
      // 2 === TYPE_BACK_FORWARD
      if (perf.navigation && typeof perf.navigation.type === 'number') {
        return perf.navigation.type === 2;
      }
    } catch (error) {
      /* ignore */
    }
    return false;
  }

  /* ==========================================================================
   * 4. Did it work? (fallback watcher)
   * ========================================================================== */

  /**
   * There is no way to ask "did the OS switch apps?", so we infer it: if the
   * page gets hidden/backgrounded, the handoff almost certainly worked. If
   * nothing happens within `delay` ms, it almost certainly did not.
   *
   * @returns {Function} cancel — stop watching and fire nothing.
   */
  function watchForEscape(options) {
    var opts = options || {};
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var delay =
      typeof opts.delay === 'number' && isFinite(opts.delay) && opts.delay >= 0
        ? opts.delay
        : DEFAULT_FALLBACK_DELAY_MS;
    var onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : noop;
    var onFailure = typeof opts.onFailure === 'function' ? opts.onFailure : noop;

    if (!win || !doc) return noop;

    var settled = false;
    var timer = null;

    function cleanup() {
      if (timer !== null) {
        win.clearTimeout(timer);
        timer = null;
      }
      try {
        doc.removeEventListener('visibilitychange', handleVisibilityChange);
        win.removeEventListener('pagehide', handleLeave);
        win.removeEventListener('blur', handleLeave);
      } catch (error) {
        /* nothing sensible to do here */
      }
    }

    function settle(callback) {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        callback();
      } catch (error) {
        logWarning('callback threw', error);
      }
    }

    function handleVisibilityChange() {
      // Only a transition to hidden counts. Coming *back* is not a success.
      if (doc.hidden) settle(onSuccess);
    }
    function handleLeave() {
      settle(onSuccess);
    }

    // Attach listeners BEFORE the navigation attempt so a very fast handoff
    // cannot slip past us.
    try {
      doc.addEventListener('visibilitychange', handleVisibilityChange);
      win.addEventListener('pagehide', handleLeave);
      // `blur` on `window` only fires when the whole window loses focus, so it
      // will not be triggered by ordinary focus changes inside the page.
      win.addEventListener('blur', handleLeave);
    } catch (error) {
      logWarning('could not attach visibility listeners', error);
    }

    timer = win.setTimeout(function () {
      settle(onFailure);
    }, delay);

    return function cancel() {
      settle(noop);
    };
  }

  /* ==========================================================================
   * 5. Wiring it to the page
   * ========================================================================== */

  /**
   * Intercept taps on the App Store links, but only inside a Meta in-app
   * browser. Everywhere else the anchors are left completely alone.
   *
   * @param {{
   *   selector?: string,          // default '[data-appstore-link]'
   *   delay?: number,             // ms before onFallback fires, default 1500
   *   onFallback?: Function,      // (url, env) => void — show your modal here
   *   onAttempt?: Function,       // (strategy, env) => void — optional hook
   *   window?: Window, document?: Document, env?: object
   * }} [options]
   * @returns {{destroy: Function, env: object, retry: Function}}
   */
  function bind(options) {
    var opts = options || {};
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);

    if (!win || !doc) {
      return { destroy: noop, env: detect(''), retry: noop };
    }

    var selector = opts.selector || '[data-appstore-link]';
    var delay = typeof opts.delay === 'number' ? opts.delay : DEFAULT_FALLBACK_DELAY_MS;
    var onFallback = typeof opts.onFallback === 'function' ? opts.onFallback : noop;
    var onAttempt = typeof opts.onAttempt === 'function' ? opts.onAttempt : noop;
    var env = opts.env || detectFromWindow(win);

    var links = [];
    try {
      links = Array.prototype.slice.call(doc.querySelectorAll(selector));
    } catch (error) {
      logWarning('invalid selector "' + selector + '"', error);
    }

    if (links.length === 0) {
      logWarning('no elements matched "' + selector + '" — nothing to enhance');
    }

    var cancelWatch = null;

    function stopWatching() {
      if (cancelWatch) {
        cancelWatch();
        cancelWatch = null;
      }
    }

    /**
     * Run the escape for a URL. Exposed as `retry` so the fallback modal's
     * "Try again" button can reuse the exact same code path.
     * Returns true if an escape was attempted.
     */
    function run(url) {
      var strategy = getEscapeStrategy(env, url);
      if (!strategy) return false;

      stopWatching();
      cancelWatch = watchForEscape({
        window: win,
        document: doc,
        delay: delay,
        onSuccess: function () {
          cancelWatch = null;
        },
        onFailure: function () {
          cancelWatch = null;
          onFallback(url, env);
        }
      });

      try {
        onAttempt(strategy, env);
      } catch (error) {
        logWarning('onAttempt threw', error);
      }

      // >>> The synchronous navigation. Nothing may be awaited before this. <<<
      var attempted = attemptEscape(strategy, win);

      if (!attempted) {
        // Could not even issue the navigation — give up on the trick and let
        // the browser do the ordinary thing.
        stopWatching();
        try {
          win.location.href = url;
        } catch (error) {
          logWarning('plain navigation failed', error);
          onFallback(url, env);
        }
      }

      return true;
    }

    function handleClick(event) {
      try {
        // Respect anything that already handled this click, and let the user's
        // "open in new tab" modifier clicks behave normally.
        if (event.defaultPrevented) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        var link = event.currentTarget;
        var url = link && link.getAttribute ? link.getAttribute('href') : null;

        if (!isSafeHttpUrl(url)) {
          logWarning('link has a missing or invalid href — leaving it alone', url);
          return;
        }

        // Normal browser (or an in-app browser we have no trick for):
        // do NOT intercept. The anchor navigates natively.
        if (!getEscapeStrategy(env, url)) return;

        event.preventDefault();
        run(url);
      } catch (error) {
        // Never let a bug here break the link. Bail out and let the anchor work.
        logWarning('click handler failed — falling back to normal navigation', error);
      }
    }

    links.forEach(function (link) {
      try {
        link.addEventListener('click', handleClick);
      } catch (error) {
        logWarning('could not attach click handler', error);
      }
    });

    return {
      env: env,
      retry: run,
      destroy: function () {
        stopWatching();
        links.forEach(function (link) {
          try {
            link.removeEventListener('click', handleClick);
          } catch (error) {
            /* ignore */
          }
        });
      }
    };
  }

  /* ==========================================================================
   * Small helpers
   * ========================================================================== */

  function noop() {}

  function logWarning() {
    if (typeof console === 'undefined' || !console.warn) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[inapp-browser]');
    try {
      console.warn.apply(console, args);
    } catch (error) {
      /* ignore */
    }
  }

  /* ========================================================================== */

  return {
    DEFAULT_FALLBACK_DELAY_MS: DEFAULT_FALLBACK_DELAY_MS,
    detect: detect,
    detectFromWindow: detectFromWindow,
    isSafeHttpUrl: isSafeHttpUrl,
    buildAndroidIntentUrl: buildAndroidIntentUrl,
    getEscapeStrategy: getEscapeStrategy,
    attemptEscape: attemptEscape,
    watchForEscape: watchForEscape,
    createOnceGuard: createOnceGuard,
    isBackForwardNavigation: isBackForwardNavigation,
    bind: bind
  };
});
