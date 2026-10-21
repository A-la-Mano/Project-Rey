const openReviewsBtn = document.getElementById("openReviewsBtn");
const reviewsModal = document.getElementById("reviewsModal");
const closeReviewsBtn = document.getElementById("closeReviewsBtn");
const exitReviewBtn = document.getElementById("exitReviewBtn");

const reviewsList = document.getElementById("reviewsList");
const reviewForm = document.getElementById("reviewForm");
const ratingInput = document.getElementById("ratingInput");
const reviewName = document.getElementById("reviewName");
const reviewComment = document.getElementById("reviewComment");

let selectedRating = 5;
const SUBMIT_THROTTLE_MS = 2 * 60 * 1000;
const LOCAL_STORAGE_KEY = "reviews_last_submit_at";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openModal() {
  if (!reviewsModal) return;

  reviewsModal.setAttribute("aria-hidden", "false");
  reviewsModal.classList.add("open");
}

function closeModal() {
  if (!reviewsModal) return;

  reviewsModal.setAttribute("aria-hidden", "true");
  reviewsModal.classList.remove("open");

  if (reviewComment) reviewComment.value = "";
  if (reviewName) reviewName.value = "";
  selectedRating = 5;
  updateRatingUI();
}

openReviewsBtn?.addEventListener("click", openModal);
closeReviewsBtn?.addEventListener("click", closeModal);
exitReviewBtn?.addEventListener("click", closeModal);

function buildRatingUI() {
  if (!ratingInput) return;

  ratingInput.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "star-btn";
    btn.setAttribute("aria-label", `Calificar con ${i} estrellas`);
    btn.dataset.value = String(i);
    btn.innerHTML = "★";
    btn.addEventListener("click", () => {
      selectedRating = Number(btn.dataset.value);
      updateRatingUI();
    });

    ratingInput.appendChild(btn);
  }

  updateRatingUI();
}

function updateRatingUI() {
  if (!ratingInput) return;

  ratingInput.querySelectorAll(".star-btn").forEach((btn) => {
    const value = Number(btn.dataset.value);
    btn.classList.toggle("active", value <= selectedRating);
  });
}

async function fetchAndRenderReviews() {
  if (!reviewsList) return;

  reviewsList.innerHTML = '<div class="empty">Cargando reseñas...</div>';

  try {
    const { data, error } = await db
      .from("reviews")
      .select("id, user_id, name, avatar_url, rating, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const rows = data || [];

    if (!rows.length) {
      reviewsList.innerHTML =
        '<div class="empty">Sé el primero en dejar una reseña.</div>';
      return;
    }

    reviewsList.innerHTML = rows
      .map((r) => {
        const avatar = r.avatar_url
          ? `<img src="${escapeHtml(r.avatar_url)}" alt="${escapeHtml(r.name || "Usuario")}" />`
          : `<span>${escapeHtml((r.name || "A")[0].toUpperCase())}</span>`;

        const date = r.created_at
          ? new Date(r.created_at).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            })
          : "";

        const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);

        return `
          <article class="review-card">
            <div class="review-avatar">${avatar}</div>

            <div class="review-content">
              <div class="review-head">
                <strong>${escapeHtml(r.name || "Anónimo")}</strong>
                <span>${escapeHtml(date)}</span>
              </div>

              <div class="review-stars">${escapeHtml(stars)}</div>
              <p>${escapeHtml(r.comment || "")}</p>
            </div>
          </article>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Error cargando reseñas:", err);
    reviewsList.innerHTML =
      '<div class="empty">No se pudieron cargar las reseñas.</div>';
  }
}

function canSubmitNow() {
  try {
    const last = Number(localStorage.getItem(LOCAL_STORAGE_KEY) || 0);
    return Date.now() - last >= SUBMIT_THROTTLE_MS;
  } catch {
    return true;
  }
}

function markSubmitNow() {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, String(Date.now()));
  } catch {}
}

async function callAddReviewRpc(payload) {
  const candidateNames = [
    "add_review_anonymous",
    "add_review",
    "add_review_anonym",
    "add_review_rpc"
  ];

  for (const name of candidateNames) {
    try {
      const res = await db.rpc(name, payload);

      if (res.error) {
        const msg = String(res.error?.message || "");
        if (
          res.error?.code === "PGRST202" ||
          /function .* not found/i.test(msg)
        ) {
          continue;
        }

        return { data: res.data, error: res.error, rpcName: name };
      }

      return { data: res.data, error: null, rpcName: name };
    } catch (e) {
      const msg = String(e?.message || e);
      if (/function .* not found/i.test(msg) || /PGRST202/.test(msg)) {
        continue;
      }
      throw e;
    }
  }

  return {
    data: null,
    error: {
      message:
        "No se encontró la función RPC para guardar reseñas. Crea add_review_anonymous o add_review en la BD."
    },
    rpcName: null
  };
}

async function submitReview(event) {
  event.preventDefault();

  const comment = (reviewComment?.value || "").trim();
  const name = (reviewName?.value || "").trim();

  if (!selectedRating || selectedRating < 1 || selectedRating > 5) {
    alert("Selecciona una puntuación válida.");
    return;
  }

  if (!comment) {
    alert("Escribe tu opinión antes de enviar.");
    return;
  }

  if (!canSubmitNow()) {
    alert("Ya enviaste una reseña recientemente. Espera unos minutos.");
    return;
  }

  try {
    const payload = {
      p_name: name || null,
      p_avatar_url: null,
      p_rating: selectedRating,
      p_comment: comment
    };

    const { data, error } = await callAddReviewRpc(payload);

    if (error) {
      throw error;
    }

    if (data && data.ok === false) {
      throw new Error(data.message || "No se pudo guardar la reseña.");
    }

    markSubmitNow();
    closeModal();
    await fetchAndRenderReviews();

    alert("Gracias por tu reseña.");
  } catch (err) {
    console.error("Error enviando reseña:", err);
    alert(err?.message || "No se pudo enviar la reseña.");
  }
}

if (reviewForm) {
  buildRatingUI();
  reviewForm.addEventListener("submit", submitReview);
}

(async function init() {
  await fetchAndRenderReviews();
  setInterval(fetchAndRenderReviews, 60000);
})();