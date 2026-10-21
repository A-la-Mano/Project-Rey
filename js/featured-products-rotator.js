// featured-products-rotator.js (ajustado para avatar_thumb_url y fallback más fiable)
// Rotación / cierre por 1 minuto / analytics / acciones Llamar y WhatsApp

const VISIBLE_MS = 5000;
const PAUSE_MS = 10000;
const REFRESH_MS = 60000;
const CLOSE_HIDE_MS = 60000; // 1 minuto
const STORAGE_KEY_CLOSED = "featured_rotator_closed_until";

const featuredRotator = document.getElementById("featuredRotator");

if (!featuredRotator) {
  console.warn("featuredRotator no encontrado en DOM.");
} else {
  let queue = [];
  let index = 0;
  let loopTimer = null;
  let refreshTimer = null;
  let resumeTimer = null;

  let closedUntil = Number(sessionStorage.getItem(STORAGE_KEY_CLOSED)) || 0;
  let isClosedForSession = closedUntil > Date.now();

  const escapeHtml = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const digits = (s) => String(s || "").replace(/\D/g, "");

  function buildActions(item) {
    const phone = item.contact_phone || "";
    const whatsapp = item.contact_whatsapp || "";
    const providerId = item.provider_id || "";
    const productId = item.product_id || "";

    const callBtn = phone
      ? `<button class="fp-btn fp-call" data-phone="${escapeHtml(phone)}" data-provider-id="${escapeHtml(providerId)}" data-product-id="${escapeHtml(productId)}" aria-label="Llamar">📞</button>`
      : `<button class="fp-btn fp-call disabled" disabled aria-label="Llamar">📞</button>`;

    const waBtn = whatsapp
      ? `<button class="fp-btn fp-wa" data-wa="${escapeHtml(whatsapp)}" data-provider-id="${escapeHtml(providerId)}" data-product-id="${escapeHtml(productId)}" aria-label="WhatsApp">💬</button>`
      : `<button class="fp-btn fp-wa disabled" disabled aria-label="WhatsApp">💬</button>`;

    return `<div class="fp-actions">${callBtn}${waBtn}</div>`;
  }

  function buildMarkup(item) {
    const provider = item.business_name || item.name || "Proveedor";
    const municipio = item.municipio || "La Habana";
    const title =
      item.publication_type === "product"
        ? item.title || item.market_title || "Producto"
        : item.title || provider;

    // Preferir avatar (miniatura) si existe; si no usar imagen del producto
    const avatar = item.logo_url || item.avatar_thumb_url || item.avatar_url || null;
    const productImg = item.image_url || item.market_image || null;
    const imageSrc = avatar || productImg || "";

    const imgHtml = imageSrc
      ? `<div class="fp-img-wrap"><img class="fp-img" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(title)}" loading="lazy"></div>`
      : `<div class="fp-img-wrap fp-img-placeholder">🛍️</div>`;

    const actions = buildActions(item);

    return `
      <div class="fp-card-min" role="region" aria-live="polite">
        <button class="fp-close" aria-label="Cerrar">×</button>

        ${imgHtml}

        <div class="fp-body-min">
          <div class="fp-topline">
            <div class="fp-provider-min"><strong>${escapeHtml(provider)}</strong><span class="fp-muni-min"> • ${escapeHtml(municipio)}</span></div>
          </div>

          <div class="fp-title-min" title="${escapeHtml(title)}">${escapeHtml(title)}</div>

          <div class="fp-actions-row">
            ${actions}
          </div>
        </div>
      </div>
    `;
  }

  function registerAnalytics(providerId, eventType, metadata = {}) {
    try {
      if (typeof window.registrarEvento === "function") {
        // fire-and-forget
        window.registrarEvento(providerId, eventType, metadata).catch(() => {});
      }
    } catch (e) {
      // ignore
    }
  }

  function attachActionHandlers() {
    if (!featuredRotator) return;

    featuredRotator.querySelectorAll(".fp-call").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const phone = btn.dataset.phone || "";
        const providerId = btn.dataset.providerId || "";
        const productId = btn.dataset.productId || "";

        if (!phone) {
          alert("Teléfono no disponible.");
          return;
        }

        registerAnalytics(providerId, "phone_click", {
          source: "featured_rotator",
          product_id: productId || null
        });

        window.location.href = `tel:${encodeURIComponent(phone.trim())}`;
      });
    });

    featuredRotator.querySelectorAll(".fp-wa").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const wa = btn.dataset.wa || "";
        const providerId = btn.dataset.providerId || "";
        const productId = btn.dataset.productId || "";

        if (!wa) {
          alert("WhatsApp no disponible.");
          return;
        }

        registerAnalytics(providerId, "whatsapp_click", {
          source: "featured_rotator",
          product_id: productId || null
        });

        const num = digits(wa);
        window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer");
      });
    });
  }

  function clearResumeTimer() {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }

  function scheduleResumeFromClosedUntil() {
    clearResumeTimer();
    closedUntil = Number(sessionStorage.getItem(STORAGE_KEY_CLOSED)) || 0;
    const now = Date.now();
    if (closedUntil && closedUntil > now) {
      const ms = closedUntil - now;
      resumeTimer = setTimeout(() => {
        sessionStorage.removeItem(STORAGE_KEY_CLOSED);
        closedUntil = 0;
        isClosedForSession = false;
        if (queue.length) startLoop();
        if (featuredRotator) {
          featuredRotator.style.display = "block";
          featuredRotator.style.opacity = "1";
        }
      }, ms);
    } else {
      sessionStorage.removeItem(STORAGE_KEY_CLOSED);
      closedUntil = 0;
      isClosedForSession = false;
    }
  }

  function onCloseClicked() {
    const until = Date.now() + CLOSE_HIDE_MS;
    sessionStorage.setItem(STORAGE_KEY_CLOSED, String(until));
    closedUntil = until;
    isClosedForSession = true;

    if (featuredRotator) {
      featuredRotator.style.opacity = "0";
      setTimeout(() => {
        if (featuredRotator) featuredRotator.style.display = "none";
      }, 220);
    }
    stopLoop();
    scheduleResumeFromClosedUntil();
  }

  function renderItem(item) {
    if (!featuredRotator) return;
    featuredRotator.innerHTML = buildMarkup(item);
    featuredRotator.classList.remove("hidden");

    if (isClosedForSession) {
      featuredRotator.style.display = "none";
      featuredRotator.style.opacity = "0";
    } else {
      featuredRotator.style.display = "block";
      featuredRotator.style.opacity = "1";
    }

    const closeBtn = featuredRotator.querySelector(".fp-close");
    closeBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      onCloseClicked();
    });

    attachActionHandlers();
  }

  function hideWidget() {
    if (!featuredRotator) return;
    featuredRotator.style.opacity = "0";
    setTimeout(() => {
      if (featuredRotator) featuredRotator.style.display = "none";
    }, 220);
  }

  function showWidget() {
    if (!featuredRotator || isClosedForSession) return;
    featuredRotator.style.display = "block";
    featuredRotator.offsetHeight;
    featuredRotator.style.opacity = "1";
  }

  async function startLoop() {
    stopLoop();
    if (!queue.length || isClosedForSession) {
      if (featuredRotator) featuredRotator.classList.add("hidden");
      return;
    }

    const cycle = async () => {
      showWidget();
      renderItem(queue[index]);

      await new Promise((r) => setTimeout(r, VISIBLE_MS));
      hideWidget();
      await new Promise((r) => setTimeout(r, PAUSE_MS));

      index = (index + 1) % queue.length;
      if (!isClosedForSession) {
        loopTimer = setTimeout(cycle, 0);
      }
    };

    loopTimer = setTimeout(cycle, 0);
  }

  function stopLoop() {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function normalizeRow(row) {
    const item = {
      id: row.id,
      publication_type: row.publication_type,
      provider_id: row.provider_id,
      product_id: row.product_id,
      created_at: row.created_at,
      expires_at: row.expires_at
    };

    const mp = Array.isArray(row.market_products) ? row.market_products[0] : row.market_products;
    if (mp) {
      item.title = mp.title || null;
      item.image_url = mp.image_url || null;
      item.seller_name = mp.seller_name || null;
      item.seller_phone = mp.seller_phone || null;
      item.seller_whatsapp = mp.seller_whatsapp || null;
    }

    const prov = Array.isArray(row.providers) ? row.providers[0] : row.providers;
    if (prov) {
      item.business_name = prov.business_name || prov.name || null;
      item.name = prov.name || null;
      // preferimos avatar_thumb_url si existe
      item.avatar_thumb_url = prov.avatar_thumb_url || null;
      item.avatar_url = prov.avatar_url || null;
      item.logo_url = prov.logo_url || null;
      item.municipio = prov.municipalities?.name || null;
      item.provider_phone = prov.phone || null;
      item.provider_whatsapp = prov.whatsapp || null;
    }

    item.contact_phone = item.seller_phone || item.provider_phone || null;
    item.contact_whatsapp = item.seller_whatsapp || item.provider_whatsapp || null;

    return item;
  }

  async function loadQueue() {
    if (!featuredRotator) return;

    try {
      const ahora = new Date().toISOString();

      const { data, error } = await db
        .from("featured_publications")
        .select(`
          id,
          provider_id,
          product_id,
          publication_type,
          status,
          expires_at,
          created_at,
          providers:provider_id (
            id,
            name,
            business_name,
            phone,
            whatsapp,
            avatar_url,
            avatar_thumb_url,
            municipality_id,
            municipalities:municipality_id ( name )
          ),
          market_products:product_id (
            id,
            title,
            price,
            image_url,
            seller_name,
            seller_phone,
            seller_whatsapp
          )
        `)
        .eq("status", "active")
        .gt("expires_at", ahora)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        console.error("Error cargando featured_publications:", error);
        queue = [];
        stopLoop();
        if (featuredRotator) featuredRotator.classList.add("hidden");
        return;
      }

      const newQueue = [];
      for (const row of data || []) {
        const n = normalizeRow(row);

        if (n.publication_type === "product" && !n.title && n.product_id) {
          try {
            const { data: pd, error: perr } = await db
              .from("market_products")
              .select("id, title, image_url, seller_name, seller_phone, seller_whatsapp")
              .eq("id", n.product_id)
              .maybeSingle();
            if (!perr && pd) {
              n.title = pd.title || n.title;
              n.image_url = pd.image_url || n.image_url;
              n.seller_name = pd.seller_name || n.seller_name;
              n.seller_phone = pd.seller_phone || n.seller_phone;
              n.seller_whatsapp = pd.seller_whatsapp || n.seller_whatsapp;
              n.contact_phone = n.seller_phone || n.provider_phone || null;
              n.contact_whatsapp = n.seller_whatsapp || n.provider_whatsapp || null;
            }
          } catch (e) {}
        }

        if (!n.title && !n.business_name && !n.name) continue;
        newQueue.push(n);
      }

      if (newQueue.length) {
        queue = newQueue;
        index = 0;
        if (isClosedForSession) scheduleResumeFromClosedUntil();
        else startLoop();
      } else {
        queue = [];
        stopLoop();
        if (featuredRotator) featuredRotator.classList.add("hidden");
      }
    } catch (err) {
      console.error("Error rotator:", err);
      queue = [];
      stopLoop();
      if (featuredRotator) featuredRotator.classList.add("hidden");
    }
  }

  if (isClosedForSession) scheduleResumeFromClosedUntil();
  loadQueue();
  refreshTimer = setInterval(loadQueue, REFRESH_MS);

  window.addEventListener("beforeunload", () => {
    stopLoop();
    clearResumeTimer();
    if (refreshTimer) clearInterval(refreshTimer);
  });

  function clearResumeTimer() {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }
}