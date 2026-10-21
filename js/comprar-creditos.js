const DESTINO_COMPRA_CREDITOS = "comprar-creditos.html";

function mostrarMensaje(texto, tipo = "error") {
  const elemento = document.getElementById("mensaje");

  if (!elemento) return;

  elemento.textContent = texto;
  elemento.className = `alert ${tipo}`;
  elemento.style.display = "block";
}

function guardarDestinoCompra() {
  sessionStorage.setItem(
    "pagina_despues_login",
    DESTINO_COMPRA_CREDITOS
  );
}

async function obtenerProveedorActual() {
  const {
    data: sessionData,
    error: sessionError
  } = await db.auth.getSession();

  if (sessionError || !sessionData?.session) {
    guardarDestinoCompra();
    window.location.replace("login-proveedor.html");
    return null;
  }

  const user = sessionData.session.user;

  const {
    data: provider,
    error: providerError
  } = await db
    .from("providers")
    .select("id, name, phone, whatsapp")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (providerError) {
    console.error("Error consultando proveedor:", providerError);

    mostrarMensaje(
      "No se pudo comprobar tu perfil de proveedor.",
      "error"
    );

    return null;
  }

  if (!provider) {
    guardarDestinoCompra();
    window.location.replace("registro-proveedor.html");
    return null;
  }

  return provider;
}

function mostrarEstadoPaquetes(texto, tipo = "normal") {
  const packageSelect = document.getElementById("creditPackage");

  if (!packageSelect) return;

  packageSelect.innerHTML = "";

  const option = document.createElement("option");
  option.value = "";
  option.textContent = texto;
  option.disabled = tipo === "error" || tipo === "loading";
  option.selected = true;

  packageSelect.appendChild(option);
}

function formatoPrecio(value, currency = "CUP") {
  const precio = Number(value || 0);

  return `${precio.toLocaleString("es-CU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency || "CUP"}`;
}

async function cargarPaquetes() {
  const packageSelect = document.getElementById("creditPackage");
  const packagePrice = document.getElementById("packagePrice");

  if (!packageSelect) return [];

  mostrarEstadoPaquetes("Cargando paquetes...", "loading");

  const {
    data,
    error
  } = await db
    .from("credit_packages")
    .select("id, name, credits, price, currency, active")
    .eq("active", true)
    .order("price", { ascending: true });

  if (error) {
    console.error("Error cargando paquetes:", error);

    mostrarEstadoPaquetes(
      "No se pudieron cargar los paquetes.",
      "error"
    );

    mostrarMensaje(
      "No se pudieron cargar los paquetes de créditos.",
      "error"
    );

    return [];
  }

  if (!data || data.length === 0) {
    mostrarEstadoPaquetes(
      "No hay paquetes disponibles.",
      "error"
    );

    mostrarMensaje(
      "Actualmente no hay paquetes de créditos activos.",
      "error"
    );

    return [];
  }

  packageSelect.innerHTML = "";

  const initialOption = document.createElement("option");
  initialOption.value = "";
  initialOption.textContent = "Selecciona un paquete";
  initialOption.disabled = true;
  initialOption.selected = true;

  packageSelect.appendChild(initialOption);

  data.forEach((paquete) => {
    const option = document.createElement("option");

    option.value = paquete.id;
    const cantidadCreditos = Number(paquete.credits || 0);
    const precio = formatoPrecio(
      paquete.price,
      paquete.currency
    );

    option.textContent =
      `${cantidadCreditos.toLocaleString("es-CU")} créditos · ${precio}`;

    packageSelect.appendChild(option);
  });

  packageSelect.addEventListener("change", () => {
    const selected = data.find(
      (paquete) => String(paquete.id) === String(packageSelect.value)
    );

    if (!selected) {
      if (packagePrice) {
        packagePrice.textContent = "Selecciona un paquete";
      }

      return;
    }

    if (packagePrice) {
      const creditos = Number(selected.credits || 0);
      const precio = formatoPrecio(
        selected.price,
        selected.currency
      );

      packagePrice.textContent =
        `${creditos.toLocaleString("es-CU")} créditos · ${precio}`;
    }
  });

  return data;
}

function obtenerValorCampo(id) {
  return document.getElementById(id)?.value.trim() || "";
}

async function enviarCompraDeCreditos(event) {
  event.preventDefault();

  const provider = await obtenerProveedorActual();

  if (!provider) return;

  const packageSelect = document.getElementById("creditPackage");
  const packageId = packageSelect?.value;

  if (!packageId) {
    mostrarMensaje(
      "Selecciona un paquete de créditos.",
      "error"
    );

    return;
  }

  const reference = obtenerValorCampo("paymentReference");
  const payerLast4 = obtenerValorCampo("paymentLast4");
  const transferDateValue =
    document.getElementById("transferDate")?.value || "";
  const confirmationPhone =
    obtenerValorCampo("confirmationPhone");

  if (
    !reference ||
    !payerLast4 ||
    !transferDateValue ||
    !confirmationPhone
  ) {
    mostrarMensaje(
      "Completa todos los datos del pago.",
      "error"
    );

    return;
  }

  if (!/^\d{4}$/.test(payerLast4)) {
    mostrarMensaje(
      "Los últimos 4 dígitos deben ser números.",
      "error"
    );

    return;
  }

  const transferDate = new Date(transferDateValue);

  if (Number.isNaN(transferDate.getTime())) {
    mostrarMensaje(
      "La fecha de transferencia no es válida.",
      "error"
    );

    return;
  }

  const {
    data: packageData,
    error: packageError
  } = await db
    .from("credit_packages")
    .select("id, credits, price, currency, active")
    .eq("id", packageId)
    .eq("active", true)
    .single();

  if (packageError || !packageData) {
    console.error(
      "Error cargando paquete:",
      packageError
    );

    mostrarMensaje(
      "No se pudo encontrar el paquete seleccionado.",
      "error"
    );

    return;
  }

  const button = event.submitter;

  if (button) {
    button.disabled = true;
    button.textContent = "Enviando solicitud...";
  }

    const {
    data: purchaseCreated,
    error: insertError
  } = await db
    .from("credit_purchases")
    .insert([
      {
        provider_id: provider.id,
        package_id: packageData.id,
        amount: packageData.price,
        credits: packageData.credits,
        currency: packageData.currency || "CUP",
        payment_method: "transferencia",
        reference,
        payer_last4: payerLast4,
        transfer_date: transferDate.toISOString(),
        confirmation_phone: confirmationPhone,
        status: "submitted"
      }
    ])
    .select("id")
    .single();

  if (!insertError && purchaseCreated?.id) {
    try {
      const BOT_TOKEN = "8761762120:AAF9DfjGaWqYLC75F5eq_vJoJguppsUq_Bw";
      const ADMIN_CHAT_ID = "8568913499";

      const providerName = provider.name || "Sin nombre";
      const providerPhone = provider.phone || "No disponible";

      const adminMessage =
        "💳 <b>NUEVA SOLICITUD DE CRÉDITOS</b>\n\n" +
        `📌 Número de registro: <b>${purchaseCreated.id}</b>\n` +
        `👤 Proveedor: <b>${providerName}</b>\n` +
        `📞 Teléfono: <b>${providerPhone}</b>\n` +
        `📦 Paquete: <b>${packageData.credits} créditos</b>\n` +
        `💰 Monto: <b>${packageData.price} ${packageData.currency || "CUP"}</b>\n` +
        `🔢 Referencia: <b>${reference}</b>\n` +
        `🔐 Últimos 4: <b>${payerLast4}</b>\n` +
        `📲 Teléfono de confirmación: <b>${confirmationPhone}</b>\n` +
        `🕒 Fecha: <b>${new Date().toLocaleString("es-CU")}</b>\n\n` +
        "✅ Solicitud enviada para revisión.";

      const adminResponse = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            text: adminMessage,
            parse_mode: "HTML"
          })
        }
      );

      const adminResult = await adminResponse.json();

      if (!adminResponse.ok) {
        console.error("Error enviando aviso admin:", adminResult);
      }

      // Segundo mensaje: comprobante bonito para que el admin lo copie y reenvíe al cliente
      const comprobanteAdminMessage =
        "✅ <b>COMPROBANTE DE COMPRA</b>\n\n" +
        `👤 Proveedor: <b>${providerName}</b>\n` +
        `📦 Paquete: <b>${packageData.credits} créditos</b>\n` +
        `💰 Monto: <b>${packageData.price} ${packageData.currency || "CUP"}</b>\n` +
        `🔢 Referencia: <b>${reference}</b>\n` +
        `📞 Confirmación: <b>${confirmationPhone}</b>\n` +
        `🕒 Fecha: <b>${new Date().toLocaleString("es-CU")}</b>\n\n` +
        "Tu solicitud fue enviada correctamente.\n" +
        "Está en revisión y te avisaremos cuando sea aprobada.";

      const comprobanteResponse = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            text: comprobanteAdminMessage,
            parse_mode: "HTML"
          })
        }
      );

      const comprobanteResult = await comprobanteResponse.json();

      if (!comprobanteResponse.ok) {
        console.error("Error enviando comprobante admin:", comprobanteResult);
      }

    } catch (error) {
      console.error("Error enviando mensajes Telegram:", error);
    }
  }

  if (insertError) {
    console.error(
      "Error enviando compra de créditos:",
      insertError
    );

    if (button) {
      button.disabled = false;
      button.textContent = "Enviar compra de créditos";
    }

    mostrarMensaje(
      insertError.message ||
        "No se pudo enviar la compra de créditos.",
      "error"
    );

    return;
  }

  mostrarMensaje(
    "Tu solicitud fue enviada correctamente. La revisaremos pronto.",
    "success"
  );

  const form = document.getElementById("creditPurchaseForm");

  if (form) {
    form.reset();
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Solicitud enviada";
  }

  setTimeout(() => {
    window.location.href = "mi-cuenta.html";
  }, 1800);
}

document.addEventListener("DOMContentLoaded", async () => {
  const provider = await obtenerProveedorActual();

  if (!provider) return;

  const providerName = document.getElementById("providerName");

  if (providerName) {
    providerName.textContent = provider.name || "Proveedor";
  }

  await cargarPaquetes();

  const form = document.getElementById("creditPurchaseForm");

  if (form) {
    form.addEventListener(
      "submit",
      enviarCompraDeCreditos
    );
  }
});