(() => {
  if (window.__asilXHelper) return;
  window.__asilXHelper = true;

  const PLAYER = '[data-testid="videoPlayer"], [data-testid="videoComponent"]';
  const BUTTON_CLASS = "asil-x-download";

  function statusUrl(el) {
    const article = el.closest("article");
    const link = article && (article.querySelector('a[href*="/status/"] time')?.closest("a")
      || article.querySelector('a[href*="/status/"]'));
    const href = link ? link.href : location.pathname.includes("/status/") ? location.href : "";
    if (!href) return "";
    const url = new URL(href, location.href);
    const match = url.pathname.match(/^\/[^/]+\/status\/\d+/);
    return match ? url.origin + match[0] : "";
  }

  function mediaOf(target) {
    return target instanceof Element ? target.closest(`video, ${PLAYER}`) : null;
  }

  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch (e) {}
  }

  window.addEventListener("contextmenu", (e) => {
    const media = mediaOf(e.target);
    if (!media) return;
    const url = statusUrl(media);
    if (url) send({ cmd: "contextTarget", url });
    e.stopImmediatePropagation();
  }, true);

  function addButton(player) {
    if (player.querySelector(`:scope > .${BUTTON_CLASS}`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = asilI18n.t("İndir");
    button.title = asilI18n.t("asil-downloader ile indir");
    button.style.cssText = [
      "position:absolute", "top:8px", "left:8px", "z-index:10", "padding:5px 10px", "border:0",
      "border-radius:999px", "background:rgba(14,14,14,.72)", "color:#36ff9f", "font:600 12px/1 system-ui,sans-serif",
      "cursor:pointer", "backdrop-filter:blur(8px)", "opacity:0", "transition:opacity .15s ease",
    ].join(";");
    for (const name of ["pointerdown", "mousedown", "mouseup"]) {
      button.addEventListener(name, (e) => e.stopPropagation(), true);
    }
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = statusUrl(player);
      if (url) send({ cmd: "openPanel", url });
    }, true);
    player.addEventListener("mouseenter", () => { button.style.opacity = "1"; });
    player.addEventListener("mouseleave", () => { button.style.opacity = "0"; });
    if (getComputedStyle(player).position === "static") player.style.position = "relative";
    player.append(button);
  }

  function scan(root) {
    if (!(root instanceof Element || root instanceof Document)) return;
    if (root instanceof Element && root.matches(PLAYER)) addButton(root);
    for (const player of root.querySelectorAll(PLAYER)) addButton(player);
  }

  asilI18n.ready.then(() => {
    scan(document);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) scan(node);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
})();
