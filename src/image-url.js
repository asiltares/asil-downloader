var upgradeImageUrl = (() => {
  const TARGET = 2000;

  function scaleParams(u, wKey, hKey) {
    const w = parseInt(u.searchParams.get(wKey), 10);
    if (!(w > 0 && w < TARGET)) return false;
    const h = parseInt(u.searchParams.get(hKey), 10);
    u.searchParams.set(wKey, String(TARGET));
    if (h > 0) u.searchParams.set(hKey, String(Math.round(h * TARGET / w)));
    return true;
  }

  return function upgradeImageUrl(url) {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return url;
    }
    if (!/^https?:$/.test(u.protocol)) return url;
    const host = u.hostname;

    if (host === "pbs.twimg.com" && u.searchParams.has("name")) {
      u.searchParams.set("name", "orig");
      return u.href;
    }
    if (host === "i.pinimg.com") {
      u.pathname = u.pathname.replace(/^\/\d+x\d*\//, "/originals/");
      return u.href;
    }
    if (host === "preview.redd.it") {
      return "https://i.redd.it" + u.pathname;
    }
    if (host === "upload.wikimedia.org" && u.pathname.includes("/thumb/")) {
      u.pathname = u.pathname.replace("/thumb/", "/").replace(/\/[^/]+$/, "");
      return u.href;
    }
    if (/\.(fbcdn\.net|cdninstagram\.com)$/.test(host)) {
      return url;
    }
    if (/^(lh\d|yt\d)\.googleusercontent\.com$|^lh\d\.ggpht\.com$/.test(host)) {
      u.pathname = u.pathname.replace(/=[swh]\d+[^/]*$/, "=s0");
      return u.href;
    }
    if (host.endsWith(".ytimg.com") && /\/(default|mqdefault|hqdefault|sddefault)\.jpg$/.test(u.pathname)) {
      u.pathname = u.pathname.replace(/[a-z]*default\.jpg$/, "maxresdefault.jpg");
      return u.href;
    }
    if (u.pathname.includes("/wp-content/uploads/")) {
      u.pathname = u.pathname.replace(/-\d{2,4}x\d{2,4}(\.[a-z]{3,4})$/i, "$1");
      return u.href;
    }
    if (/\/upload\/[^/]*\b[wh]_\d+[^/]*\//.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/upload\/[^/]*\b[wh]_\d+[^/]*\//, "/upload/");
      return u.href;
    }
    const sized = u.pathname.match(/\/w-(\d+)\/(?:h-(\d+)\/)?/);
    if (sized && +sized[1] < TARGET && !/\/s-[0-9a-f]{20,}/.test(u.pathname)) {
      const w = +sized[1];
      const h = sized[2] ? `h-${Math.round(+sized[2] * TARGET / w)}/` : "";
      u.pathname = u.pathname.replace(sized[0], `/w-${TARGET}/${h}`);
      return u.href;
    }
    if (scaleParams(u, "w", "h") || scaleParams(u, "width", "height")) {
      return u.href;
    }
    return url;
  };
})();
