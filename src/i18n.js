(() => {
  const EN = {
    "Kapat": "Close",
    "URL yapıştır ve Enter'a bas": "Paste a URL and press Enter",
    "İndirilecek URL": "URL to download",
    "Bu sayfaya dön": "Back to this page",
    "Getir": "Fetch",
    "Video bilgisi alınıyor…": "Getting video info…",
    "İndir": "Download",
    "Ses": "Audio",
    "Ses dili": "Audio language",
    "Altyazı / yazıya dökme (SRT)": "Subtitles / transcription (SRT)",
    "Aralık": "Range",
    "(isteğe bağlı)": "(optional)",
    "Başlangıç": "Start",
    "Bitiş": "End",
    "sona kadar": "to the end",
    "İptal": "Cancel",
    "Tamamlandı": "Done",
    "Telefona gönder": "Send to phone",
    "QR hazırlanıyor…": "Preparing QR…",
    "iPhone · Fotoğraflar": "iPhone · Photos",
    "Dosya olarak": "As a file",
    "Telefonla okutulacak QR kod": "QR code to scan with your phone",
    "iPhone kestirmesini kur (bir kez)": "Set up the iPhone shortcut (once)",
    "Geri": "Back",
    "Tekrar dene": "Try again",
    "Resim": "Images",
    "Resmi indir": "Download image",
    "En yüksek kalite": "Highest quality",
    "Yazıya dök (yapay zekâ, Türkçe dahil)": "Transcribe (AI, any language)",
    "Fotoğraf (kapak)": "Photo (cover)",
    "Fotoğraf (orijinal)": "Photo (original)",
    "Öne çıkan story": "Highlight story",
    "Gönderi": "Post",
    "Story ve öne çıkanlar": "Stories and highlights",
    "Instagram gönderisi": "Instagram post",
    "Başlıksız": "Untitled",
    "Orijinal": "Original",
    "Farklı Kaydet penceresinde yeri seç…": "Choose a location in the Save As window…",
    "Resim İndirilenler klasörüne kaydediliyor.": "Saving the image to your Downloads folder.",
    "Resim indirilemedi.": "Couldn't download the image.",
    "Resim indirilemedi": "Couldn't download the image",
    "Bu resim indirilemez.": "This image can't be downloaded.",
    "İndirilemedi.": "Couldn't download.",
    "İndirilecek dosya bulunamadı.": "Nothing to download.",
    "Bu öğe indirilemiyor.": "This item can't be downloaded.",
    "Geçerli bir bağlantı yaz. Örnek: https://youtube.com/watch?v=…":
      "Enter a valid link. Example: https://youtube.com/watch?v=…",
    "Süreyi 1:20 ya da 1:02:05 gibi yaz.": "Enter a time like 1:20 or 1:02:05.",
    "Bitiş, başlangıçtan sonra olmalı.": "End must be after start.",
    "Bu sayfada video bulunamadı.": "No video found on this page.",
    "Bu site korumalı, indirilemez.": "This site is protected and can't be downloaded.",
    "Bu video giriş gerektiriyor.": "This video requires login.",
    "Bu dosya zaten indirilmiş.": "This file has already been downloaded.",
    "Zaten bir indirme sürüyor.": "A download is already running.",
    "Geçersiz zaman aralığı. Örnek: 1:20 - 2:45": "Invalid time range. Example: 1:20 - 2:45",
    "Geçersiz seçim.": "Invalid selection.",
    "İndirme başarısız oldu.": "Download failed.",
    "Bilinmeyen istek.": "Unknown request.",
    "Yazıya dökme bileşeni kuruluyor (ilk sefer)…": "Installing the transcription component (first time)…",
    "Videoda yazıya dökülecek konuşma bulunamadı.": "No speech found to transcribe.",
    "Paylaşılacak dosya bulunamadı.": "File to share not found.",
    "Bilgisayar bir ağa bağlı görünmüyor.": "This computer doesn't seem to be on a network.",
    "Ses hazırlanıyor…": "Preparing audio…",
    "Yazıya dökülüyor…": "Transcribing…",
    "Ses dönüştürülüyor…": "Converting audio…",
    "Altyazı hazırlanıyor…": "Preparing subtitles…",
    "Video ve ses birleştiriliyor…": "Merging video and audio…",
    "İndirme tamamlandı": "Download complete",
    "İndirme başarısız": "Download failed",
    "yt-dlp güncellendi": "yt-dlp updated",
    "Resmi indir (asil-downloader)": "Download image (asil-downloader)",
    "asil-downloader ile indir": "Download with asil-downloader",
    "Önce kurulumu tamamla (README'deki adımlar).": "Finish setup first (see the steps in the README).",
    "Instagram verisi alınamadı.": "Couldn't get Instagram data.",
    "Öne çıkan story bulunamadı.": "Highlight story not found.",
    "Bu Instagram sayfasında indirilecek medya bulunamadı.": "No media to download on this Instagram page.",
    "Instagram kullanıcısı bulunamadı.": "Instagram user not found.",
    "Bu profilde aktif story ya da öne çıkan yok.": "This profile has no active stories or highlights.",
    "Gönderi bulunamadı.": "Post not found.",
    "Story'ye erişilemedi. Instagram'a giriş yaptığından emin ol.":
      "Couldn't access the story. Make sure you're logged in to Instagram.",
    "Bu kullanıcının aktif story'si yok.": "This user has no active story.",
    "Story bulunamadı, süresi dolmuş olabilir.": "Story not found, it may have expired.",
    "Instagram şu an çok fazla istek olduğunu söylüyor. Birkaç dakika bekleyip tekrar dene.":
      "Instagram says there are too many requests. Wait a few minutes and try again.",
    "Instagram'a giriş yapılmamış. Brave'de giriş yapıp tekrar dene.":
      "You're not logged in to Instagram. Log in in your browser and try again.",
  };

  const HTML_EN = {
    "iPhone kamerasıyla okut → <b>Kestirmeler'de aç</b>. Dosya doğrudan <b>Fotoğraflar</b>'a kaydedilir.":
      "Scan with the iPhone camera → <b>Open in Shortcuts</b>. The file is saved straight to <b>Photos</b>.",
    "Telefonun bilgisayarla <b>aynı Wi-Fi</b>'da olsun, kamerayla okut. Bağlantı 1 saat geçerli.":
      "Put your phone on the <b>same Wi-Fi</b> as the computer and scan with the camera. The link works for 1 hour.",
    "<b>Kestirmeler</b> uygulamasını aç, sağ üstteki <b>+</b>'ya bas.":
      "Open the <b>Shortcuts</b> app and tap <b>+</b> in the top right.",
    "Adını tam olarak <b>asil-downloader</b> koy.": "Name it exactly <b>asil-downloader</b>.",
    "<b>Eylem Ekle</b> → <b>URL'nin İçeriğini Al</b> ekle. URL olarak <b>Kestirme Girdisi</b>'ni seç.":
      "<b>Add Action</b> → add <b>Get Contents of URL</b>. Choose <b>Shortcut Input</b> as the URL.",
    "<b>Fotoğraf Albümüne Kaydet</b> eylemini ekle (Albüm: Son Öğeler).":
      "Add the <b>Save to Photo Album</b> action (Album: Recents).",
    "Bitti. İlk çalıştırmada <b>Yerel Ağ</b> ve <b>Fotoğraflar</b> izinlerine <b>İzin Ver</b> de.":
      "Done. On the first run, tap <b>Allow</b> for <b>Local Network</b> and <b>Photos</b> access.",
  };

  const RULES = [
    [/^En yüksek \((\d+p)\)/, "Highest ($1)"],
    [/ · kayıpsız/g, " · lossless"],
    [/ \(otomatik\)$/, " (auto)"],
    [/ · orijinal$/, " · original"],
    [/^Süre: /, "Duration: "],
    [/^Video (.+) uzunluğunda\.$/, "The video is $1 long."],
    [/^İndiriliyor: /, "Downloading: "],
    [/^(\d+) dosya indiriliyor\.$/, "Downloading $1 files."],
    [/^Hepsini indir \((\d+)\)$/, "Download all ($1)"],
    [/\bkalan (\S+)/, "$1 left"],
    [/^Yazıya dökülüyor… %(\d+)$/, "Transcribing… $1%"],
    [/^Yapay zekâ modeli indiriliyor \(ilk sefer, (.+)\)…$/, "Downloading the AI model (first time, $1)…"],
    [/(\d+)\. fotoğraf/, "$1. photo"],
    [/ · ekrandaki$/, " · on screen"],
    [/ · Öne çıkan$/, " · Highlight"],
    [/^(.+) gönderisi$/, "$1's post"],
    [/ · story ve öne çıkanlar$/, " · stories and highlights"],
    [/^Ses dönüştürme başarısız: /, "Audio conversion failed: "],
    [/^Ses çözülemedi: /, "Couldn't decode audio: "],
    [/^Beklenmeyen hata: /, "Unexpected error: "],
    [/^Kaydedilemedi: /, "Couldn't save: "],
    [/bilinmeyen hata$/, "unknown error"],
    [/^Bağlantı koptu: /, "Connection lost: "],
    [/^Instagram verisi alınamadı(:| \()/, "Couldn't get Instagram data$1"],
    [/ Instagram sekmesini F5 ile yenileyip tekrar dene\.$/, " Refresh the Instagram tab with F5 and try again."],
    [/^(\S+) kurulamadı: /, "Couldn't install $1: "],
    [/\bkod (\d+)$/, "code $1"],
    [/^Yeni sürüm: (.+)\. Kendiliğinden devreye girdi\.$/, "New version: $1. It's already active."],
    [/yt-dlp Python kütüphanesi bulunamadı: /, "yt-dlp Python library not found: "],
    [/yt-dlp'yi güncellemeyi dene: /, "Try updating yt-dlp: "],
  ];

  const LANGS = ["tr", "en"];
  const ATTRS = ["title", "placeholder", "aria-label", "alt"];
  const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  const uiLang = () => {
    try {
      const l = (chrome.i18n && chrome.i18n.getUILanguage()) || navigator.language || "";
      return /^tr\b/i.test(l) ? "tr" : "en";
    } catch (e) {
      return "tr";
    }
  };
  let lang = "tr";

  function t(text) {
    if (lang === "tr" || typeof text !== "string" || !text.trim()) return text;
    const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (Object.prototype.hasOwnProperty.call(EN, core)) return lead + EN[core] + tail;
    let out = core;
    for (const [re, to] of RULES) out = out.replace(re, to);
    return lead + out + tail;
  }

  function translateNode(node) {
    if (lang === "tr" || !node) return;
    if (node.nodeType === 3) {
      const next = t(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    const html = node.innerHTML.trim();
    if (Object.prototype.hasOwnProperty.call(HTML_EN, html)) {
      node.innerHTML = HTML_EN[html];
      return;
    }
    for (const name of ATTRS) {
      const value = node.getAttribute(name);
      if (value) {
        const next = t(value);
        if (next !== value) node.setAttribute(name, next);
      }
    }
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
    for (const child of Array.from(node.childNodes)) translateNode(child);
  }

  function watch(doc) {
    const observer = new MutationObserver((records) => {
      if (lang === "tr") return;
      for (const r of records) {
        if (r.type === "characterData") translateNode(r.target);
        else if (r.type === "attributes") translateNode(r.target);
        else if (r.type === "childList") {
          const html = r.target.innerHTML && r.target.innerHTML.trim();
          if (html && Object.prototype.hasOwnProperty.call(HTML_EN, html)) r.target.innerHTML = HTML_EN[html];
          else r.addedNodes.forEach(translateNode);
        }
      }
    });
    observer.observe(doc.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS,
    });
  }

  async function load() {
    let stored;
    try {
      stored = storage && (await storage.get("lang")).lang;
    } catch (e) {}
    lang = LANGS.includes(stored) ? stored : uiLang();
    return lang;
  }

  function apply(doc) {
    doc.documentElement.lang = lang;
    translateNode(doc.body);
  }

  const ready = load();

  if (typeof document !== "undefined" && document.documentElement && location.protocol === "chrome-extension:") {
    const doc = document;
    doc.documentElement.style.visibility = "hidden";
    const start = () => ready.then(() => {
      apply(doc);
      watch(doc);
      doc.documentElement.style.visibility = "";
    });
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }

  globalThis.asilI18n = {
    t,
    ready,
    get lang() { return lang; },
    set(next) { if (LANGS.includes(next)) lang = next; },
  };
})();
