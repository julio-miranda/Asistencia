import EmployeeModel from "../models/employee.model.js";
import { checkUserSession, logout } from "../services/session.service.js";

const allowedRadius = 50;
const SCAN_DUPLICATE_WINDOW_MS = 3000;

let allowedLat = null;
let allowedLng = null;

let scanProcesado = false;
let html5QrcodeScanner = null;
let scannerActivo = false;

let lastScanText = "";
let lastScanTime = 0;

let currentEmployeeUid = null;
let currentEmployeeDocId = null;
let currentEmployeeData = null;

const db = window.db;
const model = new EmployeeModel(db);

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

function mostrarMensajeGeneral(msg) {
  setText("resultado", msg);
  console.log("resultado:", msg);
}

function mostrarQrResultado(msg) {
  setText("qr-result", msg);
  console.log("qr-result:", msg);
}

function redirigirLogin() {
  logout({ redirect: true }).catch(() => {
    window.location.href = "index.html";
  });
}

function cerrarSesionPorError(mensaje) {
  if (mensaje) {
    mostrarMensajeGeneral(mensaje);
    console.warn(mensaje);
  }
  redirigirLogin();
}

function normalizarTexto(valor) {
  return (valor ?? "")
    .toString()
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extraerTextoQr(decodedText) {
  let texto = (decodedText ?? "").toString().trim();

  try {
    texto = decodeURIComponent(texto);
  } catch (_) {}

  texto = texto.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

  if (/^https?:\/\//i.test(texto)) {
    try {
      const url = new URL(texto);
      const empresa =
        url.searchParams.get("empresa") ||
        url.searchParams.get("data") ||
        url.searchParams.get("q") ||
        url.pathname.split("/").filter(Boolean).pop();

      if (empresa) return empresa.trim();
    } catch (_) {}
  }

  return texto;
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCurrentPositionPromise(options = {}) {
  const defaultOptions = {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0
  };

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalización no disponible"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      ...defaultOptions,
      ...options
    });
  });
}

async function obtenerSesionUid() {
  try {
    if (currentEmployeeUid) return currentEmployeeUid;

    if (typeof window.getSessionData === "function") {
      const sessionData = await window.getSessionData();
      if (sessionData && sessionData.uid) return sessionData.uid;
    }

    const auth = window.firebase?.auth ? window.firebase.auth() : null;
    if (auth?.currentUser?.uid) {
      return auth.currentUser.uid;
    }
  } catch (e) {
    console.warn("Error leyendo sesión:", e);
  }

  return null;
}

async function obtenerUsuarioEmpleadoActual() {
  const uid = currentEmployeeUid || await obtenerSesionUid();
  if (!uid) return null;

  currentEmployeeUid = uid;

  if (currentEmployeeData && currentEmployeeData.authUid === uid) {
    return {
      id: currentEmployeeDocId || null,
      ...currentEmployeeData
    };
  }

  try {
    const doc = await model.getUserByAuthUid(uid);
    if (doc && doc.exists) {
      currentEmployeeDocId = doc.id;
      currentEmployeeData = doc.data() || {};
      return {
        id: doc.id,
        ...currentEmployeeData
      };
    }

    return null;
  } catch (e) {
    console.error("Error buscando usuario actual:", e);
    return null;
  }
}

function checkLocation(successCallback, errorCallback) {
  if (allowedLat === null || allowedLng === null) {
    alert("La ubicación permitida no está definida.");
    console.error("checkLocation: allowedLat/allowedLng no definidos.");
    errorCallback && errorCallback();
    return;
  }

  if (!navigator.geolocation) {
    alert("La geolocalización no está soportada por este navegador.");
    console.error("checkLocation: geolocalización no disponible.");
    errorCallback && errorCallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const accuracy = position.coords.accuracy;
      console.log(`Precisión GPS: ${accuracy}m`);

      if (accuracy > 50) {
        alert(`La señal GPS no es lo suficientemente precisa (${accuracy.toFixed(1)} m). Intenta nuevamente en un lugar abierto.`);
        errorCallback && errorCallback();
        return;
      }

      const currentLat = position.coords.latitude;
      const currentLng = position.coords.longitude;
      const distance = calcularDistancia(allowedLat, allowedLng, currentLat, currentLng);

      if (distance <= allowedRadius) {
        successCallback && successCallback();
      } else {
        errorCallback && errorCallback(distance);
      }
    },
    error => {
      console.error("Error al obtener la ubicación:", error);
      alert("Error al obtener la ubicación. Verifica los permisos de tu navegador.");
      errorCallback && errorCallback();
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

function showJustificationModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById("justificationModal");
    const textarea = document.getElementById("justificationText");
    const saveButton = document.getElementById("saveJustificationButton");

    if (!modal || !textarea || !saveButton) {
      const fallback = prompt("Ingrese la justificación de su llegada tarde:");
      resolve(fallback ? fallback.trim() : "");
      return;
    }

    modal.style.display = "flex";
    textarea.value = "";

    const handler = () => {
      const justification = textarea.value.trim();
      modal.style.display = "none";
      saveButton.removeEventListener("click", handler);
      resolve(justification);
    };

    saveButton.addEventListener("click", handler);
  });
}

async function stopScanner() {
  if (html5QrcodeScanner) {
    try {
      await html5QrcodeScanner.clear();
    } catch (e) {
      console.warn("No se pudo limpiar el escáner:", e);
    }
    html5QrcodeScanner = null;
  }

  const reader = document.getElementById("reader");
  if (reader) reader.innerHTML = "";

  scannerActivo = false;
}

async function tryRenderScannerIfNeeded() {
  try {
    if (typeof Html5QrcodeScanner === "undefined") {
      alert("No se cargó la librería del lector QR.");
      return;
    }

    if (scannerActivo) return;

    await stopScanner();

    const reader = document.getElementById("reader");
    if (!reader) {
      console.warn("No existe el contenedor #reader");
      return;
    }

    const readerWidth = reader.clientWidth || 320;
    const qrSize = Math.max(180, Math.min(280, Math.floor(readerWidth * 0.82)));

    const config = {
      fps: 8,
      qrbox: () => ({
        width: qrSize,
        height: qrSize
      }),
      aspectRatio: 1.0,
      rememberLastUsedCamera: true,
      showTorchButtonIfSupported: true
    };

    if (typeof Html5QrcodeSupportedFormats !== "undefined") {
      config.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
    }

    if (typeof Html5QrcodeScanType !== "undefined") {
      config.supportedScanTypes = [Html5QrcodeScanType.SCAN_TYPE_CAMERA];
    }

    html5QrcodeScanner = new Html5QrcodeScanner("reader", config, false);
    scannerActivo = true;
    html5QrcodeScanner.render(onScanSuccess, onScanError);
  } catch (err) {
    scannerActivo = false;
    console.error("Error iniciando scanner:", err);
    alert("No se pudo iniciar el escáner.\n\nVerifica permisos de cámara o conexión.");
  }
}

function onScanError(errorMessage) {
  const msg = (errorMessage || "").toString();

  if (
    /not found/i.test(msg) ||
    /qr code parse error/i.test(msg) ||
    /no multiformat readers/i.test(msg) ||
    /no qr code/i.test(msg)
  ) {
    return;
  }

  console.warn("Error real del scanner:", msg);
}

async function onScanSuccess(decodedText) {
  const rawText = extraerTextoQr(decodedText);
  const normalizedScan = normalizarTexto(rawText);
  const nowTs = Date.now();

  if (!normalizedScan) return;

  if (normalizedScan === lastScanText && (nowTs - lastScanTime) < SCAN_DUPLICATE_WINDOW_MS) {
    return;
  }

  lastScanText = normalizedScan;
  lastScanTime = nowTs;

  if (scanProcesado) return;
  scanProcesado = true;

  try {
    const userData = await obtenerUsuarioEmpleadoActual();
    if (!userData) {
      alert("Error: Usuario no encontrado.");
      scanProcesado = false;
      return;
    }

    const empresa = userData.empresa || "";
    const qrEmpresa = normalizarTexto(rawText);
    const empresaNormalizada = normalizarTexto(empresa);

    if (!qrEmpresa || qrEmpresa !== empresaNormalizada) {
      mostrarQrResultado(`QR leído: ${rawText}`);
      mostrarMensajeGeneral("QR incorrecto. Intenta nuevamente.");
      scanProcesado = false;
      setTimeout(() => {
        tryRenderScannerIfNeeded();
      }, 1200);
      return;
    }

    await stopScanner();
    await registrarAsistencia();
  } catch (err) {
    console.error("Error al procesar QR:", err);
    alert("Error al procesar el QR. Intenta nuevamente.");
    scanProcesado = false;
    setTimeout(() => {
      tryRenderScannerIfNeeded();
    }, 1200);
  }
}

async function registrarAsistencia() {
  const uid = await obtenerSesionUid();

  if (!uid) {
    cerrarSesionPorError("No se encontró información de la sesión. Inicia sesión nuevamente.");
    return;
  }

  const now = new Date();
  const hour = now.getHours();
  const fechaHoy = now.toISOString().split("T")[0];

  try {
    const userData = await obtenerUsuarioEmpleadoActual();

    if (!userData) {
      cerrarSesionPorError("Usuario no encontrado. Se cerrará la sesión.");
      return;
    }

    const jornadas = Array.isArray(userData.jornadas) ? userData.jornadas : [];

    if (jornadas.length === 0) {
      cerrarSesionPorError("No tienes jornadas asignadas. Contacta con el administrador.");
      return;
    }

    if (jornadas.length === 1) {
      await procesarJornada(jornadas[0], userData, now, hour, fechaHoy);
      return;
    }

    const select = document.getElementById("jornadasSelect");
    const btnConfirmar = document.getElementById("btnConfirmarJornada");

    if (!select || !btnConfirmar) {
      alert("Controles de selección de jornada no disponibles.");
      return;
    }

    select.innerHTML = "";

    const docs = await model.getJornadasByIds(jornadas);

    docs.forEach(doc => {
      if (!doc || !doc.exists) return;

      const d = doc.data() || {};
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = `${d.nombre || doc.id} (${d.horaEntrada || "??:??"} - ${d.horaSalida || "??:??"})`;
      select.appendChild(opt);
    });

    select.style.display = "";
    btnConfirmar.style.display = "";

    const handler = async () => {
      const jornadaId = select.value;
      select.style.display = "none";
      btnConfirmar.style.display = "none";
      btnConfirmar.removeEventListener("click", handler);
      await procesarJornada(jornadaId, userData, now, hour, fechaHoy);
    };

    btnConfirmar.addEventListener("click", handler);
  } catch (err) {
    console.error("Error registrarAsistencia:", err);
    alert(`Error al registrar asistencia: ${err.message || err}`);
  }
}

async function procesarJornada(jornadaId, userData, now, hour, fechaHoy) {
  try {
    const jornadaDoc = await model.getJornadaById(jornadaId);

    if (!jornadaDoc || !jornadaDoc.exists) {
      alert("Error: Jornada no encontrada.");
      return;
    }

    const jornadaData = jornadaDoc.data() || {};
    const jornadaNombre = jornadaData.nombre || "";
    const horaEntrada = jornadaData.horaEntrada || "00:00";
    const horaSalida = jornadaData.horaSalida || "00:00";

    const { empresa, sucursal } = userData;

    const empresaDoc = await model.getEmpresaByScope(empresa, sucursal);

    if (empresaDoc && empresaDoc.exists) {
      const data = empresaDoc.data() || {};
      allowedLat = parseFloat(data.lat);
      allowedLng = parseFloat(data.lng);
    } else if (navigator.geolocation) {
      const pos = await getCurrentPositionPromise();
      allowedLat = pos.coords.latitude;
      allowedLng = pos.coords.longitude;
      await model.createEmpresaLocationIfNeeded(empresa, sucursal, allowedLat, allowedLng);
    } else {
      alert("La geolocalización no está soportada por este navegador.");
      return;
    }

    checkLocation(async () => {
      const asistenciaRef = model.createAsistenciaRef(userData.id, fechaHoy);
      const asistenciaDoc = await asistenciaRef.get();

      if (!asistenciaDoc.exists) {
        const entradaHour = (horaEntrada || "00:00").split(":")[0] || "0";
        const status = hour >= parseInt(entradaHour, 10) ? "Tarde" : "A tiempo";

        const baseData = {
          userId: userData.id,
          user: userData.nombre,
          empresa,
          sucursal,
          fecha: fechaHoy,
          jornadaId,
          jornadaNombre,
          entrada: now.toLocaleTimeString(),
          salida: null,
          status
        };

        if (status === "Tarde") {
          const justif = await showJustificationModal();

          if (!justif) {
            alert("Debes justificar tu llegada tarde.");
            scanProcesado = false;
            setTimeout(() => tryRenderScannerIfNeeded(), 1200);
            return;
          }

          baseData.justificacion = justif;
          mostrarQrResultado(`Jornada: ${jornadaNombre} (${horaEntrada} - ${horaSalida})`);
        }

        await model.setAsistencia(asistenciaRef, baseData);
        mostrarMensajeGeneral("Entrada registrada.");
      } else {
        await model.updateAsistencia(asistenciaRef, { salida: now.toLocaleTimeString() });
        mostrarMensajeGeneral("Salida registrada.");
      }

      scanProcesado = false;
    }, distance => {
      alert(distance !== undefined
        ? `No estás en la ubicación permitida. Distancia: ${distance.toFixed(2)} m.`
        : "No se pudo verificar la ubicación. Intenta nuevamente.");

      scanProcesado = false;
      setTimeout(() => tryRenderScannerIfNeeded(), 1200);
    });

  } catch (err) {
    console.error("Error en procesarJornada:", err);
    alert(`Error al procesar jornada: ${err.message || err}`);
    scanProcesado = false;
    setTimeout(() => tryRenderScannerIfNeeded(), 1200);
  }
}

function initUI() {
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      logout({ redirect: true }).catch(() => {
        window.location.href = "index.html";
      });
    });
  }
}

async function initEmployeeModule() {
  initUI();

  try {
    const session = await checkUserSession(async (uid, userData, docId) => {
      currentEmployeeUid = uid || null;
      currentEmployeeDocId = docId || null;
      currentEmployeeData = userData || null;

      const userDataFinal = await obtenerUsuarioEmpleadoActual();

      if (!userDataFinal) {
        cerrarSesionPorError("Usuario no encontrado. Se cerrará la sesión.");
        return;
      }

      if (userDataFinal.role !== "empleado") {
        cerrarSesionPorError("No tienes permisos para acceder a este módulo. Se cerrará la sesión.");
        return;
      }

      const jornadas = Array.isArray(userDataFinal.jornadas) ? userDataFinal.jornadas : [];

      if (jornadas.length === 0) {
        cerrarSesionPorError("No tienes jornadas asignadas. Contacta con el administrador. Se cerrará la sesión.");
        return;
      }

      tryRenderScannerIfNeeded();
    });

    if (!session) {
      cerrarSesionPorError("No se pudo validar la sesión.");
    }
  } catch (err) {
    console.error("Error al inicializar el módulo empleado:", err);
    cerrarSesionPorError("Error al inicializar el módulo empleado.");
  }
}

document.addEventListener("DOMContentLoaded", initEmployeeModule);