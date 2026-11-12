(() => {
  const LAZY_ATTRS = ["data-src", "data-original", "data-lazy-src", "data-full", "data-full-src", "data-large",
    "data-large-file", "data-hi-res", "data-zoom-image", "data-orig-file"];
  const IMAGE_LINK = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

  const JUNK_CAPTION = /^(true|false|null|undefined|nan|image|img|photo|resim|foto|picture|\d+)$/i;
  const captionOf = (text) => {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length >= 3 && !JUNK_CAPTION.test(value) ? value.slice(0, 140) : "";
  };

  const abs = (url) => {
    try {
      return new URL(url, document.baseURI).href;
    } catch (e) {
      return "";
    }
  };

  const fromSrcset = (srcset, best) => {
    for (const part of (srcset || "").split(/,\s+(?=\S)/)) {
      const [url, size] = part.trim().split(/\s+/);
      const width = parseFloat(size) || 1;
      if (url && width > best.width) {
        best.width = width;
        best.url = abs(url);
      }
    }
  };

  const largest = (img) => {
    const best = { url: img.currentSrc || img.src, width: 0 };
    fromSrcset(img.srcset, best);
    fromSrcset(img.getAttribute("data-srcset"), best);
    if (img.parentElement?.tagName === "PICTURE") {
      for (const source of img.parentElement.querySelectorAll("source")) {
        fromSrcset(source.srcset || source.getAttribute("data-srcset"), best);
      }
    }
    for (const name of best.width ? [] : LAZY_ATTRS) {
      const value = img.getAttribute(name);
      if (value && !value.startsWith("data:")) {
        best.url = abs(value);
        break;
      }
    }
    const link = img.closest("a[href]");
    if (link && IMAGE_LINK.test(link.href)) best.url = link.href;
    return best.url;
  };

  if ((document.contentType || "").startsWith("image/")) {
    const img = document.images[0];
    return [{
      src: location.href, original: location.href, preview: location.href, caption: captionOf(document.title),
      width: img?.naturalWidth || 0, height: img?.naturalHeight || 0,
    }];
  }

  const vw = innerWidth;
  const vh = innerHeight;
  const seen = new Set();
  const found = [];
  for (const img of document.images) {
    const preview = img.currentSrc || img.src;
    if (!preview || preview.startsWith("blob:") || img.naturalWidth < 80 || img.naturalHeight < 80) continue;
    const r = img.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (w * h < 4000) continue;
    const original = largest(img);
    const src = upgradeImageUrl(original);
    if (seen.has(src)) continue;
    seen.add(src);
    found.push({
      src, original, preview, caption: captionOf(img.alt) || captionOf(img.title),
      width: img.naturalWidth, height: img.naturalHeight, area: w * h,
    });
  }
  found.sort((a, b) => b.area - a.area);
  return found.slice(0, 8);
})();
