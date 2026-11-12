const VIEWS = ["loading", "ready", "downloading", "done", "error"];
const NO_VIDEO = "Bu sayfada video bulunamadı.";
const $ = (id) => document.getElementById(id);
const EMBEDDED = window.top !== window;
let imageTimer = null;
let lastStatus = "";
let tabUrl = "";
let currentTab = null;
let ig = null;
let targetUrl = "";
const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|avif|bmp)(?:[?#]|$)/i;
const IG_MEDIA_RE = /^https:\/\/www\.instagram\.com\/(?:stories\/[^/?#]+|(?:[^/]+\/)?(?:p|reels?|tv)\/[\w-]+|(?!(?:explore|reels|direct|accounts|stories|p|reel|tv)\/?(?:[?#]|$))[A-Za-z0-9._]{1,30}\/?(?:[?#]|$))/;
const IG_STORY_RE = /^https:\/\/www\.instagram\.com\/stories\//;
const IG_POST_RE = /^https:\/\/www\.instagram\.com\/(?:[^/]+\/)?(?:p|reels?|tv)\//;
let images = [];
let imagesSignature = null;
let selectedImage = 0;

function extensionAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch (e) {
    return false;
  }
}

let stopped = false;

function shutDown() {
  if (stopped) return;
  stopped = true;
  clearInterval(imageTimer);
  if (EMBEDDED) parent.postMessage({ type: "asil-close" }, "*");
}

function send(message) {
  if (!extensionAlive()) {
    shutDown();
    return Promise.resolve(undefined);
  }
  try {
    return chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch (e) {
    shutDown();
    return Promise.resolve(undefined);
  }
}

function show(name) {
  for (const view of VIEWS) $("view-" + view).hidden = view !== name;
}

const AUDIO_OPTIONS = [
  ["320", "MP3 · 320 kbps"],
  ["192", "MP3 · 192 kbps"],
  ["m4a", "M4A · AAC"],
  ["opus", "OPUS"],
  ["flac", "FLAC · kayıpsız"],
  ["wav", "WAV · kayıpsız"],
];
const pickers = {};

function makePicker(name) {
  const button = $(name + "-picker");
  const menu = $(name + "-menu");
  const picker = { value: null, options: [], button, menu };
  const setOpen = (open) => {
    for (const other of Object.values(pickers)) {
      if (other !== picker) other.setOpen(false, true);
    }
    menu.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  picker.setOpen = (open, silent) => {
    if (silent) {
      menu.classList.toggle("open", open);
      button.setAttribute("aria-expanded", String(open));
    } else {
      setOpen(open);
    }
  };
  picker.set = (options, value) => {
    picker.options = options;
    if (!options.some(([v]) => v === picker.value)) picker.value = value ?? options[0]?.[0];
    button.replaceChildren(
      Object.assign(document.createElement("span"), { textContent: options.find(([v]) => v === picker.value)?.[1] || "" }),
      Object.assign(document.createElement("span"), { className: "chevron" }));
    menu.replaceChildren(...options.map(([v, label]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "option" + (v === picker.value ? " selected" : "");
      item.setAttribute("role", "option");
      item.textContent = label;
      item.addEventListener("click", () => {
        picker.value = v;
        picker.set(picker.options);
        setOpen(false);
      });
      return item;
    }));
  };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!menu.classList.contains("open"));
  });
  pickers[name] = picker;
  return picker;
}

makePicker("video");
makePicker("audio").set(AUDIO_OPTIONS, "320");
makePicker("sub");
makePicker("lang");
let info = null;
const AI_OPTION = ["ai", "Yazıya dök (yapay zekâ, Türkçe dahil)"];
document.addEventListener("click", (e) => {
  if (!e.target.closest(".picker-group")) for (const p of Object.values(pickers)) p.setOpen(false, true);
});

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1e6) return `~${Math.max(1, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e9) return `~${bytes < 1e7 ? (bytes / 1e6).toFixed(1) : Math.round(bytes / 1e6)} MB`;
  return `~${(bytes / 1e9).toFixed(1)} GB`;
}

function rangeFactor() {
  if (!duration) return 1;
  const start = $("range-start").value.trim();
  const end = $("range-end").value.trim();
  const from = start && TIME_RE.test(start) ? toSeconds(start) : 0;
  const to = end && TIME_RE.test(end) ? Math.min(toSeconds(end), duration) : duration;
  return to > from ? (to - from) / duration : 1;
}

const AUDIO_RATES = { "320": 40000, "192": 24000, flac: 105840, wav: 176400 };

function audioBytes(value) {
  if (!duration) return 0;
  if (AUDIO_RATES[value]) return AUDIO_RATES[value] * duration;
  return info?.audio_size || (value === "m4a" ? 32000 : 20000) * duration;
}

function withSize(label, bytes) {
  const size = formatSize(bytes * rangeFactor());
  return size ? `${label} · ${size}` : label;
}

function renderSizes() {
  if (!info || ig) return;
  const heights = info.heights || [];
  const sizes = info.sizes || {};
  const best = heights[0] ? `En yüksek (${heights[0]}p)` : "En yüksek kalite";
  pickers.video.set([["best", withSize(best, sizes.best)],
    ...heights.slice(1).map((h) => [String(h), withSize(h + "p", sizes[String(h)])])], "best");
  pickers.audio.set(AUDIO_OPTIONS.map(([value, label]) => [value, withSize(label, audioBytes(value))]), "320");
}

function renderReady(next) {
  info = next;
  $("title").textContent = info.title;
  $("thumb").hidden = !info.thumbnail;
  $("thumb").src = info.thumbnail || "";
  const subs = info.subtitles || [];
  $("sub-group").hidden = false;
  pickers.sub.set([...subs.map((s) => [s.value, s.label]), AI_OPTION]);
  const langs = info.audio_langs || [];
  $("lang-group").hidden = langs.length < 2;
  if (langs.length >= 2) pickers.lang.set([["", "Orijinal"], ...langs.map((l) => [l.value, l.label])], "");
  $("video-label").textContent = "Video (MP4)";
  $("audio-group").hidden = false;
  $("range-group").hidden = false;
  renderDuration(info.duration);
  renderSizes();
  $("btn-all").hidden = true;
  $("story-status").hidden = true;
}

let duration = null;

function formatTime(seconds) {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function renderDuration(seconds) {
  duration = seconds || null;
  const text = duration ? formatTime(duration) : "";
  $("meta").hidden = !text;
  $("meta").textContent = text ? `Süre: ${text}` : "";
  $("range-duration").textContent = text ? `Video ${text}` : "";
  $("range-end").placeholder = text || "sona kadar";
}

const TIME_RE = /^\d+(?:[.,]\d+)?(?::\d+(?:[.,]\d+)?){0,2}$/;

function toSeconds(text) {
  return text.replace(",", ".").split(":").reduce((total, part) => total * 60 + parseFloat(part), 0);
}

function rangeError(el, text) {
  el.classList.add("invalid");
  const hint = $("range-hint");
  hint.hidden = false;
  hint.className = "err";
  hint.textContent = text;
  return null;
}

function readRange() {
  const startEl = $("range-start");
  const endEl = $("range-end");
  $("range-hint").hidden = true;
  startEl.classList.remove("invalid");
  endEl.classList.remove("invalid");
  const start = startEl.value.trim();
  const end = endEl.value.trim();
  if (start && !TIME_RE.test(start)) return rangeError(startEl, "Süreyi 1:20 ya da 1:02:05 gibi yaz.");
  if (end && !TIME_RE.test(end)) return rangeError(endEl, "Süreyi 1:20 ya da 1:02:05 gibi yaz.");
  if (start && end && toSeconds(end) <= toSeconds(start)) return rangeError(endEl, "Bitiş, başlangıçtan sonra olmalı.");
  if (duration && start && toSeconds(start) >= duration) {
    return rangeError(startEl, `Video ${formatTime(duration)} uzunluğunda.`);
  }
  if (duration && end && toSeconds(end) > duration + 1) {
    return rangeError(endEl, `Video ${formatTime(duration)} uzunluğunda.`);
  }
  return start || end ? { start, end } : {};
}

function startDownload(mode, quality) {
  const range = mode === "subtitle" ? {} : readRange();
  if (range === null) return;
  const lang = mode !== "subtitle" && !$("lang-group").hidden ? pickers.lang.value || "" : "";
  send({ cmd: "download", mode, quality, ...range, ...(lang ? { lang } : {}) }).then((state) => state && !ig && render(state));
}

function renderDone(state) {
  $("done-path").textContent = state.path;
  const share = state.share || null;
  $("btn-share").hidden = !state.path || /^asil-downloader/.test(state.path) || Boolean(share?.url);
  $("btn-share").disabled = share?.pending === true;
  $("btn-share").textContent = share?.pending ? "QR hazırlanıyor…" : "Telefona gönder";
  $("share-box").hidden = !share?.url;
  $("share-error").hidden = !share?.error;
  $("share-error").textContent = share?.error || "";
  if (share?.url) {
    const ios = shareMode === "ios" && share.svgIos;
    const svg = ios ? share.svgIos : share.svg;
    $("share-qr").src = /^data:image\/svg\+xml[,;]/.test(svg || "") ? svg : "";
    $("share-url").textContent = share.url;
    $("share-tab-ios").setAttribute("aria-selected", String(Boolean(ios)));
    $("share-tab-file").setAttribute("aria-selected", String(!ios));
    $("share-tab-ios").hidden = !share.svgIos;
    $("share-setup").hidden = !ios;
    $("share-hint").innerHTML = ios
      ? "iPhone kamerasıyla okut → <b>Kestirmeler'de aç</b>. Dosya doğrudan <b>Fotoğraflar</b>'a kaydedilir."
      : "Telefonun bilgisayarla <b>aynı Wi-Fi</b>'da olsun, kamerayla okut. Bağlantı 1 saat geçerli.";
  }
}

let shareMode = (() => {
  try {
    return localStorage.getItem("asil-share-mode") || "ios";
  } catch (e) {
    return "ios";
  }
})();

function setShareMode(mode) {
  shareMode = mode;
  try {
    localStorage.setItem("asil-share-mode", mode);
  } catch (e) {}
  send({ cmd: "state" }).then((state) => state && state.status === "done" && renderDone(state));
}

function renderProgress(state) {
  const p = state.progress || {};
  $("dl-title").textContent = state.title || "";
  const bar = $("bar-fill");
  if (p.percent == null) {
    bar.classList.add("indeterminate");
    bar.style.width = "";
  } else {
    bar.classList.remove("indeterminate");
    bar.style.width = p.percent + "%";
  }
  $("dl-stats").textContent = p.stage || [
    p.percent != null ? p.percent.toFixed(1) + "%" : "",
    p.speed,
    p.eta ? "kalan " + p.eta : "",
  ].filter(Boolean).join(" · ");
}

function open() {
  const url = targetUrl || tabUrl;
  if (!/^https?:\/\//.test(url)) {
    render({ status: "error", message: NO_VIDEO });
    return;
  }
  send({ cmd: "open", url }).then((state) => state && render(state));
}

function normalizeUrl(text) {
  const value = text.trim();
  if (!value) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : "https://" + value;
  try {
    const url = new URL(candidate);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".") ? url.href : null;
  } catch (e) {
    return null;
  }
}

function urlStatus(ok, text) {
  const status = $("url-status");
  status.hidden = !text;
  status.className = ok ? "ok" : "err";
  status.textContent = text || "";
}

function backToTab() {
  targetUrl = "";
  $("url-input").value = "";
  $("url-clear").hidden = true;
  urlStatus(true, "");
  if (IG_MEDIA_RE.test(tabUrl)) loadInstagram();
  else open();
}

async function submitUrl(e) {
  e.preventDefault();
  await goToUrl($("url-input").value);
}

async function goToUrl(text) {
  const url = normalizeUrl(text);
  if (url === "") {
    backToTab();
    return;
  }
  if (!url) {
    urlStatus(false, "Geçerli bir bağlantı yaz. Örnek: https://youtube.com/watch?v=…");
    return;
  }
  $("url-input").value = url;
  $("url-clear").hidden = false;
  urlStatus(true, "");
  if (IMAGE_URL_RE.test(new URL(url).pathname)) {
    const reply = await send({ cmd: "files", files: [{ url }] });
    urlStatus(reply?.ok, reply?.ok ? "İndiriliyor: " + reply.names.join(", ") : (reply?.message || "Resim indirilemedi."));
    return;
  }
  targetUrl = url;
  ig = null;
  open();
}

function igExt(url, fallback) {
  try {
    const ext = new URL(url).pathname.match(/\.(mp4|jpe?g|png|webp|heic)$/i);
    return ext ? ext[1].toLowerCase().replace("jpeg", "jpg") : fallback;
  } catch (e) {
    return fallback;
  }
}

function itemLabel(item, i) {
  const video = item.videos[0];
  const kind = video ? `video (${video.height}p)` : "fotoğraf";
  const label = `${item.group ? item.group + " · " : ""}${i + 1}. ${kind}`;
  return i === ig.current && ig.kind !== "profile" ? label + " · ekrandaki" : label;
}

function igOptions() {
  if (ig.items.length > 1) return ig.items.map((item, i) => [String(i), itemLabel(item, i)]);
  const options = [];
  const [item] = ig.items;
  item.videos.forEach((v, i) => {
    if (!options.some(([, label]) => label.startsWith(v.height + "p"))) {
      options.push([`0:v${i}`, i === 0 ? `En yüksek (${v.height}p)` : `${v.height}p`]);
    }
  });
  if (item.image) options.push(["0:img", item.videos.length ? "Fotoğraf (kapak)" : "Fotoğraf (orijinal)"]);
  return options;
}

function igFile(item, kind) {
  const video = kind === "img" ? null : item.videos[kind ? +kind.slice(1) : 0];
  const url = video ? video.url : item.image;
  return url ? { url, ext: igExt(url, video ? "mp4" : "jpg") } : null;
}

function selectedIgFile() {
  const [index, kind] = (pickers.video.value || "0").split(":");
  const item = ig.items[+index];
  return item ? igFile(item, kind) : null;
}

const IG_LABELS = { story: "Story", highlight: "Öne çıkan story", post: "Gönderi", profile: "Story ve öne çıkanlar" };

function renderIg() {
  $("title").textContent = ig.title;
  const cover = ig.items[ig.current || 0]?.image || ig.items[0]?.image || "";
  $("thumb").hidden = !cover;
  $("thumb").src = cover;
  const many = ig.items.length > 1;
  const label = IG_LABELS[ig.kind] || "Instagram";
  $("video-label").textContent = many ? `${label} (${ig.items.length})` : label;
  $("audio-group").hidden = true;
  $("sub-group").hidden = true;
  $("lang-group").hidden = true;
  $("range-group").hidden = true;
  renderDuration(null);
  $("story-status").hidden = true;
  $("btn-all").hidden = !many;
  $("btn-all").textContent = `Hepsini indir (${ig.items.length})`;
  pickers.video.value = null;
  pickers.video.set(igOptions(), many ? String(ig.current || 0) : undefined);
  show("ready");
}

async function loadInstagram() {
  ig = null;
  show("loading");
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id }, world: "MAIN", files: ["src/instagram.js"] });
    const data = result?.result;
    if (!data || data.error) {
      if (IG_POST_RE.test(tabUrl)) {
        open();
        return;
      }
      render({ status: "error", message: data?.error || "Instagram verisi alınamadı." });
      $("view-error").dataset.novideo = String(!IG_STORY_RE.test(tabUrl));
      return;
    }
    if (data.kind === "post" && data.items.length === 1 && data.items[0].videos.length) {
      open();
      return;
    }
    ig = data;
    renderIg();
  } catch (e) {
    if (IG_POST_RE.test(tabUrl)) open();
    else render({ status: "error", message: "Instagram verisi alınamadı: " + e.message });
  }
}

function setStatus(ok, text) {
  const status = $("story-status");
  status.hidden = false;
  status.className = ok ? "ok" : "err";
  status.textContent = text;
}

async function downloadIgSelected() {
  const file = selectedIgFile();
  if (!file) {
    setStatus(false, "Bu öğe indirilemiyor.");
    return;
  }
  $("btn-video").disabled = true;
  const reply = await send({ cmd: "files", files: [file] });
  $("btn-video").disabled = false;
  setStatus(reply?.ok, reply?.ok ? "İndiriliyor: " + reply.names.join(", ") : (reply?.message || "İndirilemedi."));
}

async function downloadIgAll() {
  const files = ig.items.map((item) => igFile(item)).filter(Boolean);
  if (!files.length) return;
  $("btn-all").disabled = true;
  const reply = await send({ cmd: "files", files });
  $("btn-all").disabled = false;
  setStatus(reply?.ok, reply?.ok ? `${reply.names.length} dosya indiriliyor.` : (reply?.message || "İndirilemedi."));
}

function render(state) {
  lastStatus = state.status;
  switch (state.status) {
    case "loading": show("loading"); break;
    case "ready": renderReady(state.info); show("ready"); break;
    case "downloading": renderProgress(state); show("downloading"); break;
    case "saving":
      renderProgress({ title: state.title, progress: { percent: null, stage: "Farklı Kaydet penceresinde yeri seç…" } });
      show("downloading");
      break;
    case "done": renderDone(state); show("done"); break;
    case "error":
      $("error-msg").textContent = state.message;
      $("view-error").dataset.novideo = String(state.message === NO_VIDEO);
      show("error");
      break;
    default: open();
  }
}

function candidates(image) {
  return [...new Set([image.src, image.original, image.preview].filter(Boolean))];
}

function selectImage(index) {
  selectedImage = index;
  const image = images[index];
  [...$("image-list").children].forEach((el, i) => el.classList.toggle("selected", i === index));
  $("image-meta").textContent = image.width && image.height ? `${image.width}×${image.height}` : "";
  $("image-status").hidden = true;
  $("btn-image").disabled = false;
}

const PREVIEW_DELAY = 300;
let previewTimer = null;
let zoom = null;

function showPreview(image) {
  if (EMBEDDED) {
    parent.postMessage({ type: "asil-preview", urls: candidates(image), caption: image.caption || "" }, "*");
    return;
  }
  if (!zoom) {
    zoom = document.createElement("div");
    zoom.className = "zoom";
    zoom.append(document.createElement("figure"));
    zoom.firstChild.append(document.createElement("img"), document.createElement("figcaption"));
    document.body.append(zoom);
  }
  const img = zoom.querySelector("img");
  const urls = candidates(image);
  img.onerror = () => {
    urls.shift();
    if (urls.length) img.src = urls[0];
  };
  img.style.width = img.style.height = "";
  img.onload = () => {
    const scale = Math.min((innerWidth - 36) / img.naturalWidth, (innerHeight - 48) / img.naturalHeight);
    img.style.width = Math.round(img.naturalWidth * scale) + "px";
    img.style.height = Math.round(img.naturalHeight * scale) + "px";
  };
  img.src = urls[0];
  zoom.querySelector("figcaption").textContent = image.caption || "";
  zoom.classList.add("show");
}

function schedulePreview(image) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => showPreview(image), PREVIEW_DELAY);
}

function hidePreview() {
  clearTimeout(previewTimer);
  if (EMBEDDED) parent.postMessage({ type: "asil-preview-hide" }, "*");
  else zoom?.classList.remove("show");
}

function renderImages(list) {
  const signature = list.map((image) => image.src).join("\n");
  if (signature === imagesSignature) return;
  imagesSignature = signature;
  const keep = images[selectedImage]?.src;
  images = list;
  $("images").hidden = !list.length;
  document.body.classList.toggle("has-images", list.length > 0);
  if (!list.length) return;
  $("image-list").replaceChildren(...list.map((image, i) => {
    const img = document.createElement("img");
    img.src = image.preview;
    img.alt = "";
    img.addEventListener("click", () => {
      hidePreview();
      selectImage(i);
    });
    img.addEventListener("mouseenter", () => schedulePreview(image));
    img.addEventListener("mouseleave", hidePreview);
    return img;
  }));
  selectImage(Math.max(0, list.findIndex((image) => image.src === keep)));
}

async function loadImages(tab) {
  if (!tab?.id || !/^(https?|file):/.test(tab.url || "")) return;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, files: ["src/image-url.js", "src/find-images.js"] });
    renderImages(result?.result || []);
  } catch (e) {
    renderImages([]);
  }
}

async function downloadSelectedImage() {
  const image = images[selectedImage];
  if (!image) return;
  $("btn-image").disabled = true;
  const reply = await send({ cmd: "image", urls: candidates(image) });
  const status = $("image-status");
  status.hidden = false;
  status.textContent = reply?.ok ? "Resim İndirilenler klasörüne kaydediliyor." : (reply?.message || "Resim indirilemedi.");
  status.className = reply?.ok ? "ok" : "err";
  $("btn-image").disabled = false;
}

function connectPanel() {
  if (stopped) return;
  if (!extensionAlive()) {
    shutDown();
    return;
  }
  let panel;
  try {
    panel = chrome.runtime.connect({ name: "panel" });
  } catch (e) {
    shutDown();
    return;
  }
  panel.onMessage.addListener((msg) => {
    if (msg.cmd === "state" && !ig) render(msg.state);
  });
  panel.onDisconnect.addListener(() => setTimeout(connectPanel, 500));
}
connectPanel();

$("thumb").addEventListener("error", () => { $("thumb").hidden = true; });
$("btn-video").addEventListener("click", () => {
  if (ig) downloadIgSelected();
  else startDownload("video", pickers.video.value || "best");
});
$("btn-audio").addEventListener("click", () => startDownload("audio", pickers.audio.value));
$("btn-sub").addEventListener("click", () => {
  if (pickers.sub.value === "ai") startDownload("transcript", "ai");
  else startDownload("subtitle", pickers.sub.value);
});
$("btn-share").addEventListener("click", () => send({ cmd: "share" }).then((state) => state && render(state)));
$("btn-all").addEventListener("click", downloadIgAll);
$("share-tab-ios").addEventListener("click", () => setShareMode("ios"));
$("share-tab-file").addEventListener("click", () => setShareMode("file"));
$("url-form").addEventListener("submit", submitUrl);
$("url-clear").addEventListener("click", backToTab);
for (const id of ["range-start", "range-end"]) {
  $(id).addEventListener("input", () => {
    $(id).classList.remove("invalid");
    $("range-hint").hidden = true;
    renderSizes();
  });
}
$("btn-cancel").addEventListener("click", () => send({ cmd: "cancel" }).then((state) => state && render(state)));
$("btn-image").addEventListener("click", downloadSelectedImage);
async function goBack() {
  const state = await send({ cmd: "reset" });
  if (!targetUrl && IG_MEDIA_RE.test(tabUrl)) {
    loadInstagram();
    return;
  }
  if (state && state.status !== "idle") render(state);
  else open();
}

for (const id of ["btn-back-done", "btn-back-error"]) {
  $(id).addEventListener("click", goBack);
}

const LIVE_STATES = new Set(["loading", "downloading", "saving", "done"]);
setInterval(async () => {
  if (stopped || ig || !LIVE_STATES.has(lastStatus)) return;
  const state = await send({ cmd: "state" });
  if (state && !ig) render(state);
}, 1000);

if (EMBEDDED) {
  document.documentElement.classList.add("embedded");
  $("btn-close").hidden = false;
  $("btn-close").addEventListener("click", () => parent.postMessage({ type: "asil-close" }, "*"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") parent.postMessage({ type: "asil-close" }, "*");
  });
  new ResizeObserver(() => {
    parent.postMessage({ type: "asil-size", height: document.body.offsetHeight }, "*");
  }).observe(document.body);
}

const FOLLOW_DELAY = 350;
const IMAGE_REFRESH = 2500;
let followTimer = null;

function loadPage() {
  if (targetUrl) return;
  ig = null;
  if (IG_MEDIA_RE.test(tabUrl)) loadInstagram();
  else open();
}

function followTab(url) {
  if (!url || url === tabUrl) return;
  tabUrl = url;
  currentTab = { ...currentTab, url };
  clearTimeout(followTimer);
  followTimer = setTimeout(() => {
    $("range-start").value = "";
    $("range-end").value = "";
    $("range-hint").hidden = true;
    loadPage();
    loadImages(currentTab);
  }, FOLLOW_DELAY);
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!currentTab || tabId !== currentTab.id) return;
  if (change.url) followTab(change.url);
  else if (change.status === "complete") loadImages(tab);
});

imageTimer = setInterval(() => {
  if (!extensionAlive()) {
    shutDown();
    return;
  }
  if (currentTab && !document.hidden && !$("image-list").matches(":hover")) loadImages(currentTab);
}, IMAGE_REFRESH);

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  currentTab = tab;
  tabUrl = tab?.url || "";
  const requested = new URLSearchParams(location.search).get("url");
  if (requested) goToUrl(requested);
  else loadPage();
  loadImages(tab);
});
