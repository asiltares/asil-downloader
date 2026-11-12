(() => {
  if (window.__asilIgMedia) return;
  const media = new Map();
  const reels = new Map();
  const codes = new Map();
  Object.defineProperty(window, "__asilIgMedia", { value: { media, reels, codes }, enumerable: false });

  const LIMIT = 600;
  const isItem = (o) => o && typeof o === "object" && (o.image_versions2 || o.video_versions) && (o.pk || o.id);
  const itemId = (o) => String(o.pk || String(o.id || "").split("_")[0]);

  function remember(map, key, value) {
    map.delete(key);
    map.set(key, value);
    if (map.size > LIMIT) map.delete(map.keys().next().value);
  }

  function collect(root) {
    const stack = [root];
    let budget = 200000;
    while (stack.length && budget-- > 0) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (typeof node.code === "string" && (isItem(node) || Array.isArray(node.carousel_media))) {
        remember(codes, node.code, node);
      }
      if (Array.isArray(node.items) && node.items.some(isItem)) {
        const owner = node.user?.username || "";
        const reelId = String(node.id || node.pk || "");
        const ids = [];
        for (const item of node.items) {
          if (!isItem(item)) continue;
          const id = itemId(item);
          ids.push(id);
          remember(media, id, { item, owner: owner || item.user?.username || "" });
        }
        if (reelId) remember(reels, reelId, { ids, owner, title: node.title || "" });
      } else if (isItem(node)) {
        const id = itemId(node);
        if (!media.has(id)) remember(media, id, { item: node, owner: node.user?.username || node.owner?.username || "" });
      }
      for (const key in node) {
        const value = node[key];
        if (value && typeof value === "object") stack.push(value);
      }
    }
  }

  function inspect(text) {
    if (typeof text !== "string" || !/image_versions2|video_versions/.test(text)) return;
    const body = text.replace(/^for \(;;\);/, "");
    try {
      collect(JSON.parse(body));
      return;
    } catch (e) {}
    for (const line of body.split(/\r?\n/)) {
      if (!line.trim().startsWith("{")) continue;
      try {
        collect(JSON.parse(line));
      } catch (e) {}
    }
  }

  const wanted = (url) => /\/graphql|\/api\/v1\//.test(String(url || ""));

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const promise = originalFetch.apply(this, args);
    try {
      const url = args[0] instanceof Request ? args[0].url : args[0];
      if (wanted(url)) {
        promise.then((response) => response.clone().text().then(inspect)).catch(() => {});
      }
    } catch (e) {}
    return promise;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (wanted(url)) {
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "" || this.responseType === "text") inspect(this.responseText);
          else if (this.responseType === "json" && this.response) collect(this.response);
        } catch (e) {}
      });
    }
    return originalOpen.call(this, method, url, ...rest);
  };

  function scanScripts() {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      if (script.__asilSeen) continue;
      script.__asilSeen = true;
      inspect(script.textContent || "");
    }
  }
  document.addEventListener("DOMContentLoaded", scanScripts);
  window.__asilIgScan = scanScripts;
})();
