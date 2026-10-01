
/**
 * RIZO.GAME MONETIZATION ADAPTER
 * ===============================
 * Connects the game's provider-neutral window.RizoAds bridge to:
 *  - standard responsive AdSense display units in three reserved slots;
 *  - Google's H5 Ad Placement API for optional rewarded/interstitial moments.
 *
 * IMPORTANT:
 * - It stays completely dormant while RIZO_CONFIG.ads.enabled is false.
 * - Rewarded loot is granted only after Google's `adViewed` callback.
 * - This does not bypass AdSense or H5 Games approval.
 * - Do not click your own live ads and do not ask players to click normal display ads.
 */
(() => {
  "use strict";
  const cfg = window.RIZO_CONFIG?.ads;
  const mounted = new WeakSet();
  let scriptPromise = null;

  const validClient = value => /^ca-pub-\d{10,}$/.test(String(value || ""));
  const validSlot = value => /^\d+$/.test(String(value || ""));
  const onlinePage = () => /^https?:$/.test(location.protocol);
  const h5Ready = () => Boolean(cfg?.h5Games?.enabled && typeof window.adBreak === "function");

  function ensurePublisherMeta() {
    if (!validClient(cfg?.adsense?.client)) return;
    let meta = document.querySelector('meta[name="google-adsense-account"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "google-adsense-account";
      document.head.appendChild(meta);
    }
    meta.content = cfg.adsense.client;
  }

  function loadGoogleScript() {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      if (!validClient(cfg?.adsense?.client)) return reject(new Error("Replace the AdSense publisher ID in rizo-config.js"));
      ensurePublisherMeta();
      const existing = document.querySelector('script[data-rizo-google-ads],script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
      if (existing) {
        if (existing.dataset.loaded === "true" || typeof window.adsbygoogle !== "undefined") {
          existing.dataset.loaded = "true";
          resolve();
        } else {
          existing.addEventListener("load", () => { existing.dataset.loaded = "true"; resolve(); }, { once: true });
          existing.addEventListener("error", reject, { once: true });
        }
        return;
      }

      // This queue stub is the official pattern used by Google's Ad Placement API.
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = window.adConfig = function(options) { window.adsbygoogle.push(options); };

      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.rizoGoogleAds = "true";
      if (cfg.testMode) script.dataset.adbreakTest = "on";
      if (cfg?.h5Games?.enabled && Number(cfg.h5Games.frequencyHintSeconds) > 0) script.dataset.adFrequencyHint = `${Math.max(30, Number(cfg.h5Games.frequencyHintSeconds))}s`;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.adsense.client)}`;
      script.onload = () => { script.dataset.loaded = "true"; resolve(); };
      script.onerror = () => reject(new Error("Google ads script failed to load"));
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  async function configureH5() {
    if (!cfg?.h5Games?.enabled) return;
    await loadGoogleScript();
    window.adConfig({
      sound: "on",
      preloadAdBreaks: "on"
    });
  }

  function labelSlot(element) {
    element.querySelectorAll(".rizo-ad-placeholder,.rizo-ad-error").forEach(node => node.remove());
    if (!element.querySelector(".rizo-sponsored-label")) {
      const label = document.createElement("div");
      label.className = "rizo-sponsored-label";
      label.textContent = "SPONSORED";
      element.prepend(label);
    }
    element.classList.add("rizo-ad-live");
  }

  async function mountBanner(placement, element) {
    if (!element || mounted.has(element)) return;
    mounted.add(element);
    labelSlot(element);

    const slotId = cfg?.adsense?.displaySlots?.[placement];
    if (!onlinePage()) {
      element.insertAdjacentHTML("beforeend", '<div class="rizo-ad-placeholder">ADS LOAD ONLY AFTER THE SITE IS ONLINE.</div>');
      return;
    }
    if (!validClient(cfg?.adsense?.client) || !validSlot(slotId)) {
      element.insertAdjacentHTML("beforeend", `<div class="rizo-ad-placeholder">${cfg?.testMode ? "AD TEST SLOT: " + placement : "AD SLOT NOT CONFIGURED"}</div>`);
      return;
    }

    try {
      await loadGoogleScript();
      const unit = document.createElement("ins");
      unit.className = "adsbygoogle";
      unit.style.display = "block";
      unit.dataset.adClient = cfg.adsense.client;
      unit.dataset.adSlot = slotId;
      unit.dataset.adFormat = "auto";
      unit.dataset.fullWidthResponsive = "true";
      element.appendChild(unit);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.warn("Rizo display ad failed", error);
      element.insertAdjacentHTML("beforeend", '<div class="rizo-ad-error">SPONSOR SLOT TEMPORARILY UNAVAILABLE</div>');
    }
  }

  function showRewarded(placement) {
    if (!h5Ready()) return Promise.resolve(false);
    return new Promise(resolve => {
      let settled = false;
      const finish = result => { if (!settled) { settled = true; resolve(Boolean(result)); } };
      const timeout = setTimeout(() => finish(false), Number(cfg.h5Games.rewardTimeoutMs || 45000));
      const done = result => { clearTimeout(timeout); finish(result); };

      try {
        window.adBreak({
          type: "reward",
          name: `rizo-${String(placement).replace(/[^a-z0-9-]/gi, "-")}`,
          beforeAd: () => document.dispatchEvent(new CustomEvent("rizo:ad-start", { detail: { placement, format: "rewarded" } })),
          afterAd: () => document.dispatchEvent(new CustomEvent("rizo:ad-end", { detail: { placement, format: "rewarded" } })),
          beforeReward: showAdFn => showAdFn(),
          adViewed: () => done(true),
          adDismissed: () => done(false),
          adBreakDone: () => done(false)
        });
      } catch (error) {
        console.warn("Rizo rewarded ad failed", error);
        done(false);
      }
    });
  }

  function showInterstitial(placement) {
    if (!h5Ready()) return Promise.resolve(false);
    return new Promise(resolve => {
      let shown = false;
      try {
        window.adBreak({
          // `next` is reserved for natural transitions, never mid-tap or on every action.
          type: "next",
          name: `rizo-${String(placement).replace(/[^a-z0-9-]/gi, "-")}`,
          beforeAd: () => { shown = true; document.dispatchEvent(new CustomEvent("rizo:ad-start", { detail: { placement, format: "interstitial" } })); },
          afterAd: () => document.dispatchEvent(new CustomEvent("rizo:ad-end", { detail: { placement, format: "interstitial" } })),
          adBreakDone: () => resolve(shown)
        });
      } catch (error) {
        console.warn("Rizo interstitial failed", error);
        resolve(false);
      }
    });
  }

  const provider = { mountBanner, showRewarded, showInterstitial };

  async function connect() {
    if (!cfg?.enabled || !onlinePage()) return;
    try {
      await loadGoogleScript();
      await configureH5();
      if (window.RizoAds?.setProvider) window.RizoAds.setProvider(provider);
    } catch (error) {
      console.warn("Rizo monetization remains disabled:", error.message || error);
    }
  }

  // Site ownership verification can happen before ad serving is approved.
  // A real publisher ID adds Google's verification meta tag while `ads.enabled`
  // remains false, so no production ad request is made during review.
  ensurePublisherMeta();
  window.addEventListener("rizo:adbridge-ready", connect, { once: true });
  if (window.RizoAds?.setProvider) connect();
  window.RizoMonetization = { connect, provider, config: cfg };
})();

