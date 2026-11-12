(async () => {
  const RESERVED = new Set(["explore", "reels", "direct", "accounts", "stories", "p", "reel", "tv", "about", "legal",
    "developer", "challenge", "emails", "session", "web", "api", "graphql", "static", "privacy", "terms"]);
  const path = location.pathname;
  const storyMatch = path.match(/^\/stories\/([^/?#]+)(?:\/(\d+))?/);
  const postMatch = path.match(/^\/(?:[^/]+\/)?(?:p|reels?|tv)\/([\w-]+)/);
  const profileMatch = path.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);

  let mode = "";
  let username = "";
  let storyId = "";
  let shortcode = "";
  if (storyMatch) {
    [, username, storyId = ""] = storyMatch;
    mode = username === "highlights" ? "highlight" : storyId ? "single" : "user";
    if (mode === "highlight" && !storyId) return { error: "Öne çıkan story bulunamadı." };
  } else if (postMatch) {
    mode = "post";
    shortcode = postMatch[1];
  } else if (profileMatch && !RESERVED.has(profileMatch[1].toLowerCase())) {
    mode = "profile";
    username = profileMatch[1];
  } else {
    return { error: "Bu Instagram sayfasında indirilecek medya bulunamadı." };
  }

  const csrf = (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1] || "";
  let claim = "0";
  try {
    claim = sessionStorage.getItem("www-claim-v2") || "0";
  } catch (e) {}
  const headers = {
    "X-IG-App-ID": "936619743392459",
    "X-ASBD-ID": "359341",
    "X-IG-WWW-Claim": claim,
    "X-CSRFToken": csrf,
    "X-Requested-With": "XMLHttpRequest",
    Accept: "*/*",
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const request = async (url, asJson = true) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { headers: asJson ? headers : {}, credentials: "include" });
      if (response.status === 429 && attempt < 1) {
        await sleep(2000);
        continue;
      }
      if (response.status === 429) throw Object.assign(new Error("429"), { limited: true });
      if (response.status === 401 || response.status === 403) throw Object.assign(new Error("login"), { login: true });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return asJson ? response.json() : response.text();
    }
  };

  const isItem = (o) => o && typeof o === "object" && (o.image_versions2 || o.video_versions) && (o.pk || o.id);
  const isPost = (o) => o && o.code === shortcode && (isItem(o) || Array.isArray(o.carousel_media));
  const itemId = (o) => String(o.pk || String(o.id || "").split("_")[0]);
  const ownerOf = (o) => o?.user?.username || o?.owner?.username || "";

  const ownsReel = (reel, userPk) => {
    const id = String(reel.id || reel.pk || "");
    if (mode === "highlight") return id === "highlight:" + storyId;
    if (mode === "single") return reel.items.some((i) => isItem(i) && itemId(i) === storyId);
    return reel.user?.username === username || (userPk && id === userPk);
  };

  function walk(root, visit) {
    const stack = [root];
    let budget = 400000;
    while (stack.length && budget-- > 0) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      visit(node);
      for (const key in node) {
        const value = node[key];
        if (value && typeof value === "object") stack.push(value);
      }
    }
  }

  function jsonBlobs(doc) {
    const needle = username ? JSON.stringify(username) : shortcode ? JSON.stringify(shortcode) : "";
    const blobs = [];
    for (const script of doc.querySelectorAll('script[type="application/json"]')) {
      const text = script.textContent || "";
      if (!/image_versions2|video_versions|reels_media|carousel_media/.test(text) && !(needle && text.includes(needle))) continue;
      try {
        blobs.push(JSON.parse(text));
      } catch (e) {}
    }
    return blobs;
  }

  function findInBlobs(blobs) {
    const items = new Map();
    const reels = [];
    let post = null;
    let userPk = "";
    for (const blob of blobs) {
      walk(blob, (node) => {
        if (Array.isArray(node.items) && node.items.some(isItem)) reels.push(node);
        if (isItem(node)) items.set(itemId(node), node);
        if (!post && shortcode && isPost(node)) post = node;
        if (!userPk && username && node.username === username && /^\d+$/.test(String(node.pk || node.id || ""))) {
          userPk = String(node.pk || node.id);
        }
      });
    }
    const reel = mode === "post" || mode === "profile" ? null : reels.find((r) => ownsReel(r, userPk)) || null;
    return { reel, item: items.get(storyId) || null, post, userPk };
  }

  const bestImage = (item) => {
    const candidates = item.image_versions2?.candidates || [];
    return candidates.reduce((best, c) => (!best || (c.width || 0) > (best.width || 0) ? c : best), null)?.url || "";
  };

  const normalize = (item, group = "") => ({
    id: itemId(item),
    group,
    image: bestImage(item),
    videos: (item.video_versions || [])
      .filter((v) => v.url)
      .map((v) => ({ url: v.url, width: v.width || 0, height: v.height || 0 }))
      .sort((a, b) => b.height - a.height),
  });

  const fileKey = (url) => {
    try {
      return new URL(url, location.href).pathname.split("/").pop();
    } catch (e) {
      return "";
    }
  };

  function currentIndex(items) {
    const keys = new Set();
    try {
      for (const el of document.querySelectorAll("video, img")) {
        const r = el.getBoundingClientRect();
        if (r.width < 150 || r.height < 150) continue;
        for (const url of [el.currentSrc, el.src, el.poster]) {
          if (url && !url.startsWith("blob:")) keys.add(fileKey(url));
        }
      }
    } catch (e) {}
    keys.delete("");
    const index = items.findIndex((it) => [it.image, ...it.videos.map((v) => v.url)].some((u) => keys.has(fileKey(u))));
    return Math.max(0, index);
  }

  const finish = (kind, owner, title, items) => ({
    kind,
    owner: owner || "instagram",
    title,
    items,
    current: items.length > 1 ? currentIndex(items) : 0,
  });

  const storyResult = (reel, rawItems) => {
    const owner = reel?.user?.username || (mode === "highlight" ? ownerOf(rawItems[0]) : username);
    const title = mode === "highlight" ? `${owner} · ${reel?.title || "Öne çıkan"}` : `${owner} story`;
    return finish(mode === "highlight" ? "highlight" : "story", owner, title, rawItems.map((i) => normalize(i)));
  };

  const pickStory = (reel, item) => {
    if (mode === "single") return item ? storyResult(reel, [item]) : null;
    const list = (reel?.items || []).filter(isItem);
    return list.length ? storyResult(reel, list) : null;
  };

  const postResult = (post) => {
    if (!post) return null;
    const children = (post.carousel_media || []).filter(isItem);
    const list = children.length ? children : isItem(post) ? [post] : [];
    if (!list.length) return null;
    const owner = ownerOf(post);
    return finish("post", owner, owner ? `${owner} gönderisi` : "Instagram gönderisi", list.map((i) => normalize(i)));
  };

  const shortcodeToPk = (code) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let pk = 0n;
    for (const ch of code.slice(0, 11)) {
      const value = alphabet.indexOf(ch);
      if (value < 0) return "";
      pk = pk * 64n + BigInt(value);
    }
    return pk.toString();
  };

  const hooked = window.__asilIgMedia;
  const fromHook = () => {
    if (!hooked) return null;
    try {
      window.__asilIgScan?.();
    } catch (e) {}
    if (mode === "post") return postResult(hooked.codes?.get(shortcode));
    if (mode === "single") {
      const entry = hooked.media.get(storyId);
      return entry ? storyResult({ user: { username: entry.owner || username } }, [entry.item]) : null;
    }
    if (mode === "profile") return null;
    let reel = null;
    if (mode === "highlight") {
      reel = hooked.reels.get("highlight:" + storyId);
    } else {
      for (const [id, entry] of hooked.reels) {
        if (entry.owner === username && !id.startsWith("highlight:")) reel = entry;
      }
    }
    const list = (reel?.ids || []).map((id) => hooked.media.get(id)?.item).filter(Boolean);
    return list.length ? storyResult({ title: reel.title, user: { username: reel.owner } }, list) : null;
  };

  async function userPkFor(found) {
    if (found.userPk) return found.userPk;
    const profile = await request(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    return String(profile?.data?.user?.id || "");
  }

  async function reelsMedia(ids) {
    const reels = {};
    for (let i = 0; i < ids.length; i += 10) {
      const query = ids.slice(i, i + 10).map((id) => "reel_ids=" + encodeURIComponent(id)).join("&");
      const data = await request(`/api/v1/feed/reels_media/?${query}`);
      Object.assign(reels, data?.reels || {});
      for (const reel of data?.reels_media || []) reels[String(reel.id)] = reel;
    }
    return reels;
  }

  async function profileResult(found) {
    const pk = await userPkFor(found);
    if (!pk) return { error: "Instagram kullanıcısı bulunamadı." };
    step = "öne çıkanlar";
    const tray = await request(`/api/v1/highlights/${encodeURIComponent(pk)}/highlights_tray/`);
    const highlights = (tray?.tray || []).map((h) => ({ id: String(h.id), title: h.title || "Öne çıkan" }));
    step = "story listesi";
    const reels = await reelsMedia([pk, ...highlights.map((h) => h.id)]);
    const items = [];
    for (const item of (reels[pk]?.items || []).filter(isItem)) items.push(normalize(item, "Story"));
    for (const h of highlights) {
      for (const item of (reels[h.id]?.items || []).filter(isItem)) items.push(normalize(item, h.title));
    }
    if (!items.length) return { error: "Bu profilde aktif story ya da öne çıkan yok." };
    return { ...finish("profile", username, `${username} · story ve öne çıkanlar`, items), current: 0 };
  }

  let step = "sayfa";
  try {
    const cached = fromHook();
    if (cached) return cached;

    const found = findInBlobs(jsonBlobs(document));
    let picked = mode === "post" ? postResult(found.post) : mode === "profile" ? null : pickStory(found.reel, found.item);
    if (picked) return picked;

    if (mode === "profile") {
      step = "profil";
      return await profileResult(found);
    }

    step = "sayfa yenileme";
    const html = await request(location.pathname, false);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fresh = findInBlobs(jsonBlobs(doc));
    picked = mode === "post" ? postResult(fresh.post) : pickStory(fresh.reel, fresh.item);
    if (picked) return picked;

    step = "Instagram API";
    if (mode === "post") {
      const pk = shortcodeToPk(shortcode);
      const data = pk ? await request(`/api/v1/media/${pk}/info/`) : null;
      return postResult((data?.items || [])[0]) || { error: "Gönderi bulunamadı." };
    }
    let reelId = mode === "highlight" ? "highlight:" + storyId : fresh.userPk || found.userPk;
    if (!reelId) reelId = await userPkFor({});
    if (!reelId) return { error: "Instagram kullanıcısı bulunamadı." };

    const reels = await reelsMedia([reelId]);
    const reel = reels[reelId] || Object.values(reels)[0];
    if (!reel) return { error: "Story'ye erişilemedi. Instagram'a giriş yaptığından emin ol." };
    picked = pickStory(reel, (reel.items || []).find((i) => isItem(i) && itemId(i) === storyId));
    return picked || { error: mode === "user" ? "Bu kullanıcının aktif story'si yok." : "Story bulunamadı, süresi dolmuş olabilir." };
  } catch (e) {
    if (e.limited) return { error: "Instagram şu an çok fazla istek olduğunu söylüyor. Birkaç dakika bekleyip tekrar dene." };
    if (e.login) return { error: "Instagram'a giriş yapılmamış. Brave'de giriş yapıp tekrar dene." };
    const hint = hooked ? "" : " Instagram sekmesini F5 ile yenileyip tekrar dene.";
    return { error: `Instagram verisi alınamadı (${step}: ${e.message}).${hint}` };
  }
})();
