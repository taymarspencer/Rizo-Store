
/**
 * PWA INSTALL MANAGER
 * -------------------
 * Shows a one-time branded onboarding screen before the game.
 * Android/desktop Chromium can open the native install prompt.
 * iPhone/iPad must use Safari's Share -> Add to Home Screen flow.
 * The user can always continue in the browser; forced installation would be brittle.
 */
(() => {
  "use strict";
  const cfg = window.RIZO_CONFIG || {};
  const key = "rizo-game-install-reminder-v1";
  let deferredPrompt = null;

  // Storage can be unavailable in private/restricted browser modes. Installation
  // help must never block the game just because localStorage throws.
  const storage = {
    get(name) { try { return localStorage.getItem(name); } catch (error) { return null; } },
    set(name, value) { try { localStorage.setItem(name, value); return true; } catch (error) { return false; } },
    remove(name) { try { localStorage.removeItem(name); return true; } catch (error) { return false; } }
  };

  function setPageLock(locked) {
    document.documentElement.classList.toggle("ui-locked", locked);
    document.body?.classList.toggle("ui-locked", locked);
  }

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = () => /android/i.test(navigator.userAgent);

  function shouldShow() {
    if (cfg.installPrompt?.enabled === false || isStandalone()) return false;
    const previous = Number(storage.get(key) || 0);
    const days = Number(cfg.installPrompt?.remindAfterDays || 14);
    return !previous || Date.now() - previous > days * 86400000;
  }

  function platformCopy() {
    if (isIOS()) return {
      title: "INSTALL IT LIKE A REAL APP",
      button: "I ADDED IT — START",
      secondary: "PLAY IN SAFARI",
      hideSecondary: false,
      steps: ["Open this page in Safari.", "Tap the Share button (or More, then Share).", "Choose Add to Home Screen.", "Turn on Open as Web App, then tap Add."]
    };
    if (isAndroid()) return {
      title: "PUT RIZO.GAME ON YOUR HOME SCREEN",
      button: deferredPrompt ? "INSTALL RIZO.GAME" : "PLAY RIZO.GAME",
      secondary: "PLAY IN BROWSER",
      hideSecondary: !deferredPrompt,
      steps: ["Open Chrome's menu (⋮).", "Tap Add to Home screen or Install app.", "Confirm Install."]
    };
    return {
      title: "INSTALL THE FULL RIZO.GAME EXPERIENCE",
      button: deferredPrompt ? "INSTALL RIZO.GAME" : "PLAY RIZO.GAME",
      secondary: "PLAY IN BROWSER",
      hideSecondary: !deferredPrompt,
      steps: ["Use your browser's Install icon or menu.", "Choose Install Rizo.game.", "Launch it from your apps for fullscreen play."]
    };
  }

  function render() {
    const gate = document.getElementById("rizoInstallGate");
    if (!gate || !shouldShow()) return;
    const copy = platformCopy();
    gate.querySelector("[data-install-title]").textContent = copy.title;
    gate.querySelector("[data-install-button]").textContent = copy.button;
    const secondary = gate.querySelector("[data-play-browser]");
    if (secondary) {
      secondary.textContent = copy.secondary || "PLAY IN BROWSER";
      secondary.hidden = Boolean(copy.hideSecondary);
    }
    gate.querySelector("[data-install-steps]").innerHTML = copy.steps.map(step => `<li>${step}</li>`).join("");
    gate.hidden = false;
    gate.setAttribute("aria-hidden", "false");
    setPageLock(true);
  }

  function closeGate(remind = true) {
    const gate = document.getElementById("rizoInstallGate");
    if (gate) { gate.hidden = true; gate.setAttribute("aria-hidden", "true"); }
    setPageLock(false);
    if (remind) storage.set(key, String(Date.now()));
  }

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
      deferredPrompt = null;
      if (result.outcome === "accepted") closeGate(true);
      else render();
      return;
    }
    // On iOS there is no programmatic prompt. The steps remain visible, and this button
    // becomes the user's confirmation after they followed them.
    if (isIOS() || !deferredPrompt) closeGate(true);
    else document.querySelector("[data-install-steps]")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  window.addEventListener("beforeinstallprompt", event => {
    // iOS Safari never supports this prompt; ignore spoofed/embedded events so the
    // manual Add to Home Screen instructions remain truthful.
    if (isIOS()) return;
    event.preventDefault();
    deferredPrompt = event;
    const button = document.querySelector("[data-install-button]");
    const secondary = document.querySelector("[data-play-browser]");
    if (button) button.textContent = "INSTALL RIZO.GAME";
    if (secondary) secondary.hidden = false;
  });
  window.addEventListener("appinstalled", () => closeGate(true));

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("[data-install-button]")?.addEventListener("click", install);
    document.querySelector("[data-play-browser]")?.addEventListener("click", () => closeGate(true));
    render();
  });

  // Useful from the in-game settings page or the browser console during testing.
  window.RizoInstall = { show() { storage.remove(key); render(); }, hide: closeGate, isStandalone };
})();

