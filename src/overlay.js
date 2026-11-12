(() => {
  const ID = "asil-downloader-overlay";
  const target = typeof window.__asilTarget === "string" ? window.__asilTarget : "";
  window.__asilTarget = undefined;
  const existing = document.getElementById(ID);
  if (existing) {
    existing.dispatchEvent(new Event("asil-close"));
    existing.id = "";
    if (!target) return;
  }

  const host = document.createElement("div");
  host.id = ID;
  host.style.cssText = "all: initial; position: fixed; top: 12px; right: 12px; z-index: 2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .preview {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        pointer-events: none;
        opacity: 0;
        transition: opacity .15s ease;
      }
      .preview.show { opacity: 1; }
      .preview figure { margin: 0; position: relative; }
      .preview img {
        display: block;
        max-width: 80vw;
        max-height: 84vh;
        border: 6px solid #fff;
        border-radius: 6px;
        background: #fff;
        box-shadow: 0 30px 80px rgba(0, 0, 0, .55);
      }
      .preview figcaption {
        position: absolute;
        left: 50%;
        bottom: -14px;
        transform: translateX(-50%);
        max-width: 90%;
        padding: 4px 10px;
        border-radius: 4px;
        background: #fff;
        color: #111;
        font: 600 13px/1.4 "Segoe UI", system-ui, sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
      }
      .preview figcaption:empty { display: none; }
      .panel {
        position: relative;
        width: 340px;
        border-radius: 26px;
        overflow: hidden;
        background: rgba(14, 14, 14, .62);
        backdrop-filter: blur(30px) saturate(180%);
        -webkit-backdrop-filter: blur(30px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, .12);
        box-shadow: 0 20px 50px -12px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .12);
        opacity: 0;
        transform: translateY(-6px) scale(.98);
        transform-origin: top right;
        transition: opacity .18s ease, transform .18s ease;
      }
      .panel.open { opacity: 1; transform: none; }
      iframe {
        display: block;
        width: 340px;
        height: 120px;
        max-height: calc(100vh - 24px);
        border: 0;
        background: transparent;
        color-scheme: dark;
      }
    </style>
    <div class="preview"><figure><img alt=""><figcaption></figcaption></figure></div>
    <div class="panel"><iframe allowtransparency="true"></iframe></div>`;
  const panel = root.querySelector(".panel");
  const frame = root.querySelector("iframe");
  const preview = root.querySelector(".preview");
  const previewImg = preview.querySelector("img");
  const previewCaption = preview.querySelector("figcaption");
  let ready = false;

  function close() {
    window.removeEventListener("message", onMessage);
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    panel.classList.remove("open");
    preview.classList.remove("show");
    setTimeout(() => host.remove(), 180);
  }

  function onMessage(e) {
    if (e.source !== frame.contentWindow || !e.data) return;
    if (e.data.type === "asil-size") {
      ready = true;
      frame.style.height = Math.ceil(e.data.height) + "px";
      panel.classList.add("open");
    } else if (e.data.type === "asil-preview" && Array.isArray(e.data.urls) && e.data.urls.length) {
      const urls = e.data.urls.filter((u) => typeof u === "string");
      previewImg.onerror = () => {
        urls.shift();
        if (urls.length) previewImg.src = urls[0];
      };
      previewImg.style.width = previewImg.style.height = "";
      previewImg.onload = () => {
        const scale = Math.min(innerWidth * .8 / previewImg.naturalWidth, innerHeight * .84 / previewImg.naturalHeight);
        previewImg.style.width = Math.round(previewImg.naturalWidth * scale) + "px";
        previewImg.style.height = Math.round(previewImg.naturalHeight * scale) + "px";
      };
      previewImg.src = urls[0];
      previewCaption.textContent = String(e.data.caption || "");
      preview.classList.add("show");
    } else if (e.data.type === "asil-preview-hide") {
      preview.classList.remove("show");
    } else if (e.data.type === "asil-close") {
      close();
    }
  }

  function onOutside(e) {
    if (!e.composedPath().includes(host)) close();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  host.addEventListener("asil-close", close);
  window.addEventListener("message", onMessage);
  document.addEventListener("mousedown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  frame.src = chrome.runtime.getURL("src/popup.html") + (target ? "?url=" + encodeURIComponent(target) : "");
  document.documentElement.append(host);

  setTimeout(() => {
    if (ready) return;
    host.remove();
    try {
      chrome.runtime.sendMessage({ cmd: "fallback" }).catch(() => {});
    } catch (e) {}
  }, 2000);
})();
