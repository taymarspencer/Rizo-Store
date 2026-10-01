
/**
 * RIZO.GAME LAUNCH CONFIG
 * =======================
 * This is intentionally the only file you should need to edit for ordinary launches.
 *
 * SAFE DEFAULT: advertising is OFF until you replace every placeholder and change
 * ads.enabled to true. Never test production ads by clicking them yourself.
 */
window.RIZO_CONFIG = Object.freeze({
  brand: {
    siteName: "Rizo.game",
    siteUrl: "https://play.rizo.store",
    storeUrl: "https://rizo.store",
    supportUrl: "./support.html"
  },

  audience: {
    // Keep this at 13 unless you deliberately build a child-directed compliance plan.
    minimumAge: 13,
    label: "Recommended for ages 13+"
  },

  installPrompt: {
    // Phase 6: never interrupt first launch with an install/download-looking gate.
    // Installation remains available through window.RizoInstall.show() from settings.
    enabled: false,
    // People who choose browser mode will see the reminder again after this many days.
    remindAfterDays: 14
  },

  ads: {
    // Keep this false while applying. AdSense manages `rizo.store` at the root-domain
    // level even though the game lives at play.rizo.store. Add the real publisher ID
    // below for ownership verification; this build adds the verification meta tag
    // without requesting ads. Turn enabled on only after the site is Ready, the three
    // display slot IDs are real, and Privacy & messaging / CMP setup is complete.
    enabled: false,

    // Keep true while using Google's official H5 test mode. Change to false before launch.
    testMode: true,

    adsense: {
      client: "ca-pub-3212890596786480",
      displaySlots: {
        "home-feed": "REPLACE_HOME_SLOT_ID",
        "arcade-between-games": "REPLACE_ARCADE_SLOT_ID",
        "shop-footer": "REPLACE_SHOP_SLOT_ID"
      }
    },

    h5Games: {
      // H5 rewarded/interstitial ads require separate Google approval.
      enabled: false,
      // A hint, not a promise. Google still decides whether an ad may be shown.
      frequencyHintSeconds: 120,
      rewardTimeoutMs: 45000
    }
  },

  analytics: {
    // Reserved for a future privacy-aware analytics provider. No tracking runs by default.
    enabled: false,
    provider: "none"
  }
});

