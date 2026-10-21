// upload-avatar.js
// Requiere: window.db y window.supabase; providerActual.id disponible (proveedor autenticado)

async function resizeImageFile(file, side, mime = "image/jpeg", quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // calcular crop centrado cuadrado (mejor para avatar)
        const size = Math.min(img.width, img.height);
        const sx = Math.floor((img.width - size) / 2);
        const sy = Math.floor((img.height - size) / 2);

        // redimensionar al side x side
        const canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, size, size, 0, 0, side, side);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("No se pudo generar imagen"));
          resolve(blob);
        }, mime, quality);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleAvatarUpload(file, providerId) {
  if (!file) throw new Error("Archivo no proporcionado");
  if (!providerId) throw new Error("providerId requerido");

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Tipo de archivo no permitido");
  if (file.size > 6 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx 6MB)");

  // generar original (max 1024, centrado cuadrado) y thumb (128)
  const originalBlob = await resizeImageFile(file, 1024, "image/jpeg", 0.86);
  const thumbBlob = await resizeImageFile(file, 128, "image/jpeg", 0.86);

  const filenameBase = `provider_${providerId}`;
  const pathOriginal = `${filenameBase}.jpg`;        // subir al bucket raíz o prefijo avatars/
  const pathThumb = `${filenameBase}_thumb.jpg`;

  // subir
  const storage = window.supabase.storage;
  // si tu bucket es "avatars"
  const bucket = "avatars";

  // upsert original
  let res = await storage.from(bucket).upload(pathOriginal, originalBlob, { contentType: "image/jpeg", upsert: true });
  if (res.error) throw res.error;

  // upsert thumb
  res = await storage.from(bucket).upload(pathThumb, thumbBlob, { contentType: "image/jpeg", upsert: true });
  if (res.error) throw res.error;

  // obtener public URLs (si bucket público)
  const urlOriginal = storage.from(bucket).getPublicUrl(pathOriginal).publicUrl;
  const urlThumb = storage.from(bucket).getPublicUrl(pathThumb).publicUrl;

  // actualizar tabla providers
  const { data, error } = await window.db
    .from("providers")
    .update({ avatar_url: urlOriginal, avatar_thumb_url: urlThumb })
    .eq("id", providerId);

  if (error) throw error;

  return { avatar_url: urlOriginal, avatar_thumb_url: urlThumb };
}

// Ejemplo de uso con input file
document.getElementById("avatarFileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    // muestra loader
    const result = await handleAvatarUpload(file, providerActual.id);
    // actualizar UI inmediato: todos los elementos con clase .provider-avatar mostrarán el thumb
    document.querySelectorAll(".provider-avatar").forEach(img => img.src = result.avatar_thumb_url);
    // hide loader / mostrar éxito
  } catch (err) {
    console.error(err);
    alert(err.message || "Error subiendo avatar");
  }
});