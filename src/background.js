importScripts("image-url.js");
importScripts("i18n.js");

const HOST = "com.asil.downloader";
const INSTALL_HINT = "Önce kurulumu tamamla (README'deki adımlar).";
const LANG_TTL = 7 * 24 * 60 * 60 * 1000;
const COUNTRY_APIS = [
  ["https://api.country.is/", (r) => r.json().then((d) => d.country)],
  ["https://ipapi.co/country/", (r) => r.text()],
];
const CACHE_LIMIT = 30;

let port = null;
let state = { status: "idle" };
const infoCache = new Map();
const pending = new Map();
const IMAGE_MENU = "asil-image";
const LINK_MENU = "asil-link";
let restartPending = false;
const CONTEXT_TTL = 15000;
const contextTargets = new Map();
const STORY_RE = /^https:\/\/www\.instagram\.com\/stories\//;
const FILE_PREFIX = "asil-downloader";
const NAME_TIMEOUT = 3000;
const nameRequests = new Map();
let nameSeq = 0;

const panels = new Set();
const saving = new Map();

function setState(patch) {
  state = { ...state, ...patch };
  if (restartPending && !isBusy()) setTimeout(restartIfPending, 0);
  for (const panel of panels) {
    try {
      panel.postMessage({ cmd: "state", state });
    } catch (e) {
      panels.delete(panel);
    }
  }
}

chrome.runtime.onConnect.addListener((panel) => {
  if (panel.name !== "panel") return;
  panels.add(panel);
  panel.onDisconnect.addListener(() => panels.delete(panel));
});

async function saveWithBrowser(msg) {
  setState({ status: "saving", path: msg.filename, progress: null });
  try {
    const id = await chrome.downloads.download({
      url: msg.url, filename: msg.filename, saveAs: true, conflictAction: "uniquify" });
    saving.set(id, msg.token);
  } catch (e) {
    send({ type: "release", token: msg.token });
    setState({ status: "error", message: "Kaydedilemedi: " + (e?.message || "") });
  }
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!saving.has(delta.id) || !delta.state) return;
  const token = saving.get(delta.id);
  if (delta.state.current === "complete") {
    saving.delete(delta.id);
    chrome.downloads.search({ id: delta.id }).then(([item]) => {
      const path = item?.filename || state.path;
      setState({ status: "done", path, share: null });
      notify("İndirme tamamlandı", path);
    });
  } else if (delta.state.current === "interrupted") {
    saving.delete(delta.id);
    send({ type: "release", token });
    chrome.downloads.search({ id: delta.id }).then(([item]) => {
      if (item?.error === "USER_CANCELED") setState({ status: "ready", progress: null });
      else setState({ status: "error", message: "Kaydedilemedi: " + (item?.error || "bilinmeyen hata") });
    });
  }
});

function notify(title, message) {
  const t = asilI18n.t;
  chrome.notifications.create({ type: "basic", iconUrl: chrome.runtime.getURL("src/icons/icon128.png"), title: t(title), message: t(message) });
}

function getPort() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener(onHostMessage);
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message || "";
    port = null;
    pending.clear();
    for (const resolve of nameRequests.values()) resolve(null);
    nameRequests.clear();
    if (state.status === "loading" || state.status === "downloading") {
      const installProblem = /not found|forbidden/i.test(reason);
      setState({ status: "error", message: installProblem ? INSTALL_HINT : "Bağlantı koptu: " + reason });
    }
  });
  return port;
}

function send(message) {
  try {
    getPort().postMessage(message);
  } catch (e) {
    port = null;
    setState({ status: "error", message: INSTALL_HINT });
  }
}

const COOKIE_DOMAINS = ["instagram.com", "x.com", "twitter.com"];

function cookieDomain(url) {
  try {
    const host = new URL(url).hostname;
    return COOKIE_DOMAINS.find((domain) => host === domain || host.endsWith("." + domain)) || null;
  } catch (e) {
    return null;
  }
}

function post(message) {
  const domain = message.url && cookieDomain(message.url);
  if (!domain || !chrome.cookies) {
    send(message);
    return;
  }
  chrome.cookies.getAll({ domain }).then(
    (cookies) => send({
      ...message,
      cookies: cookies.map(({ domain, hostOnly, path, secure, expirationDate, name, value }) =>
        ({ domain, hostOnly, path, secure, expirationDate, name, value })),
    }),
    () => send(message));
}

function remember(info) {
  infoCache.delete(info.url);
  infoCache.set(info.url, info);
  if (infoCache.size > CACHE_LIMIT) infoCache.delete(infoCache.keys().next().value);
}

function requestInfo(url, prefetch) {
  if (infoCache.has(url)) return;
  if (pending.has(url) && (prefetch || !pending.get(url))) return;
  pending.set(url, prefetch);
  post({ type: "info", url, prefetch });
}

function isCurrent(url) {
  return state.status === "loading" && state.url === url;
}

function requestName() {
  const id = ++nameSeq;
  return new Promise((resolve) => {
    nameRequests.set(id, resolve);
    setTimeout(() => {
      if (nameRequests.delete(id)) resolve(null);
    }, NAME_TIMEOUT);
    send({ type: "name", id });
  });
}

function extOf(url, fallback) {
  try {
    const ext = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (ext && /^(jpe?g|png|webp|gif|avif|bmp|svg|heic|mp4|webm|mov|m4a|mp3)$/i.test(ext[1])) {
      return ext[1].toLowerCase().replace("jpeg", "jpg");
    }
  } catch (e) {}
  return fallback;
}

async function downloadNamed(url, ext) {
  const name = (await requestName()) || FILE_PREFIX;
  const filename = `${name}.${ext}`;
  const id = await chrome.downloads.download({ url, filename, saveAs: true, conflictAction: "uniquify" });
  return { id, filename };
}

async function downloadFiles(files) {
  const names = [];
  for (const file of files) {
    if (typeof file?.url !== "string" || !/^https:\/\//.test(file.url)) continue;
    const ext = /^[a-z0-9]{2,5}$/i.test(file.ext || "") ? file.ext.toLowerCase() : extOf(file.url, "bin");
    names.push((await downloadNamed(file.url, ext)).filename);
  }
  if (!names.length) throw new Error("İndirilecek dosya bulunamadı.");
  return names;
}

function isBusy() {
  return state.status === "downloading" || state.status === "saving";
}

function restartHost() {
  restartPending = false;
  if (!port) return;
  try {
    port.disconnect();
  } catch (e) {}
  port = null;
  pending.clear();
  infoCache.clear();
  for (const resolve of nameRequests.values()) resolve(null);
  nameRequests.clear();
  getPort();
}

function restartIfPending() {
  if (restartPending && !isBusy()) restartHost();
}

function onHostMessage(msg) {
  switch (msg.type) {
    case "share":
      if (state.status === "done" && state.path === msg.path) {
        setState({ share: msg.error ? { error: msg.error } : { url: msg.url, svg: msg.svg, ios: msg.ios, svgIos: msg.svg_ios } });
      }
      break;
    case "updated":
      notify("yt-dlp güncellendi", `Yeni sürüm: ${msg.version || "?"}. Kendiliğinden devreye girdi.`);
      restartPending = true;
      restartIfPending();
      break;
    case "name": {
      const resolve = nameRequests.get(msg.id);
      nameRequests.delete(msg.id);
      if (resolve) resolve(typeof msg.name === "string" ? msg.name : null);
      break;
    }
    case "info":
      pending.delete(msg.url);
      remember(msg);
      if (isCurrent(msg.url)) setState({ status: "ready", info: msg });
      break;
    case "skip":
      pending.delete(msg.url);
      if (isCurrent(msg.url)) requestInfo(msg.url, false);
      break;
    case "progress":
      if (state.status === "downloading") setState({ progress: msg });
      break;
    case "done":
      if (msg.url && msg.token) {
        saveWithBrowser(msg);
      } else {
        setState({ status: "done", path: msg.path });
        notify("İndirme tamamlandı", msg.path);
      }
      break;
    case "cancelled":
      setState({ status: "ready", progress: null });
      break;
    case "error": {
      if (msg.url !== undefined) {
        pending.delete(msg.url);
        if (!isCurrent(msg.url)) break;
      }
      const wasDownloading = state.status === "downloading";
      setState({ status: "error", message: msg.message });
      if (wasDownloading) notify("İndirme başarısız", msg.message);
      break;
    }
  }
}

function openFor(url) {
  if (state.status === "downloading" || state.status === "saving") return state;
  if (state.url === url && state.status !== "idle") return state;
  const cached = infoCache.get(url);
  if (cached) {
    setState({ status: "ready", url, info: cached, message: null, path: null, progress: null });
  } else {
    setState({ status: "loading", url, info: null, message: null, path: null, progress: null });
    requestInfo(url, false);
  }
  return state;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.cmd) {
    case "open":
      sendResponse(openFor(msg.url));
      return;
    case "download":
      if (state.status === "ready") {
        setState({ status: "downloading", title: state.info.title, share: null, progress: { percent: 0, speed: "", eta: "" } });
        post({ type: "download", url: state.url, mode: msg.mode, quality: msg.quality, start: msg.start, end: msg.end,
          lang: msg.lang });
      }
      sendResponse(state);
      return;
    case "cancel":
      if (state.status === "downloading") post({ type: "cancel" });
      sendResponse(state);
      return;
    case "reset":
      if (state.status !== "downloading" && state.status !== "saving") setState({ status: "idle" });
      sendResponse(state);
      return;
    case "state":
      sendResponse(state);
      return;
    case "share":
      if (state.status === "done" && state.path && !state.share?.pending) {
        setState({ share: { pending: true } });
        send({ type: "share", path: state.path });
      }
      sendResponse(state);
      return;
    case "contextTarget":
      if (_sender.tab?.id && typeof msg.url === "string") {
        contextTargets.set(_sender.tab.id, { url: msg.url, at: Date.now() });
      }
      return;
    case "openPanel":
      if (_sender.tab?.id && typeof msg.url === "string" && /^https:\/\//.test(msg.url)) openPanel(_sender.tab, msg.url);
      return;
    case "fallback":
      if (_sender.tab?.id) openPopupFallback(_sender.tab.id);
      return;
    case "files":
      downloadFiles(Array.isArray(msg.files) ? msg.files : []).then(
        (names) => sendResponse({ ok: true, names }),
        (e) => sendResponse({ ok: false, message: e?.message || "İndirilemedi." }));
      return true;
    case "image":
      downloadImage(msg.urls || [msg.url]).then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, message: e?.message || "Resim indirilemedi." }));
      return true;
  }
});

async function downloadImage(urls) {
  const queue = [...new Set(urls.filter((u) => u && !u.startsWith("blob:")))];
  if (!queue.length) throw new Error("Bu resim indirilemez.");
  const name = (await requestName()) || FILE_PREFIX;
  const attempt = async () => {
    const url = queue.shift();
    const id = await chrome.downloads.download({
      url, filename: `${name}.${extOf(url, "jpg")}`, saveAs: true, conflictAction: "uniquify" });
    if (!queue.length) return id;
    const onChanged = (delta) => {
      if (delta.id !== id || !delta.state) return;
      if (delta.state.current === "complete") chrome.downloads.onChanged.removeListener(onChanged);
      if (delta.state.current === "interrupted") {
        chrome.downloads.onChanged.removeListener(onChanged);
        chrome.downloads.erase({ id }).catch(() => {});
        attempt().catch(() => {});
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
    return id;
  };
  return attempt();
}

async function openPopupFallback(tabId, url) {
  try {
    await chrome.action.setPopup({ tabId, popup: url ? "src/popup.html?url=" + encodeURIComponent(url) : "src/popup.html" });
    await chrome.action.openPopup();
  } catch (e) {
  } finally {
    chrome.action.setPopup({ tabId, popup: "" }).catch(() => {});
  }
}

async function openPanel(tab, url) {
  try {
    if (url) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: (target) => { window.__asilTarget = target; }, args: [url] });
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/overlay.js"] });
  } catch (e) {
    openPopupFallback(tab.id, url);
  }
}

function menuTarget(info, tab) {
  const remembered = tab?.id && contextTargets.get(tab.id);
  const fresh = remembered && Date.now() - remembered.at < CONTEXT_TTL ? remembered.url : "";
  const media = /^https?:/.test(info.srcUrl || "") ? info.srcUrl : "";
  if (info.linkUrl) return info.linkUrl;
  if (info.mediaType && fresh) return fresh;
  return media || fresh || info.pageUrl || "";
}

chrome.action.onClicked.addListener((tab) => openPanel(tab));

const MENU_TITLES = { [IMAGE_MENU]: "Resmi indir (asil-downloader)", [LINK_MENU]: "asil-downloader ile indir" };

async function countryCode() {
  for (const [url, read] of COUNTRY_APIS) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const code = response.ok && String(await read(response)).trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(code)) return code;
    } catch (e) {}
  }
  return null;
}

async function detectLanguage() {
  const store = chrome.storage?.local;
  if (!store || typeof fetch !== "function") return;
  await asilI18n.ready;
  const { lang, langCheckedAt = 0 } = await store.get(["lang", "langCheckedAt"]);
  if (lang && Date.now() - langCheckedAt < LANG_TTL) return;
  const country = await countryCode();
  const next = country ? (country === "TR" ? "tr" : "en") : (lang || asilI18n.lang);
  await store.set({ lang: next, langCheckedAt: country ? Date.now() : 0 });
  asilI18n.set(next);
  for (const [id, title] of Object.entries(MENU_TITLES)) {
    chrome.contextMenus.update?.(id, { title: asilI18n.t(title) }, () => void chrome.runtime.lastError);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: IMAGE_MENU, title: asilI18n.t(MENU_TITLES[IMAGE_MENU]), contexts: ["image"] });
    chrome.contextMenus.create({ id: LINK_MENU, title: asilI18n.t(MENU_TITLES[LINK_MENU]), contexts: ["link", "video", "audio"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === LINK_MENU) {
    const url = menuTarget(info, tab);
    if (tab?.id) contextTargets.delete(tab.id);
    if (tab?.id && url) openPanel(tab, url);
    return;
  }
  if (info.menuItemId !== IMAGE_MENU) return;
  downloadImage([upgradeImageUrl(info.srcUrl), info.srcUrl]).catch((e) => notify("Resim indirilemedi", e?.message || ""));
});

function prefetch(tab) {
  if (tab?.active && /^https?:\/\//.test(tab.url || "") && !STORY_RE.test(tab.url)) requestInfo(tab.url, true);
}

chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
  if (change.url || change.status === "complete") prefetch(tab);
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(prefetch).catch(() => {});
});
chrome.runtime.onStartup.addListener(getPort);

getPort();
detectLanguage().catch(() => {});
