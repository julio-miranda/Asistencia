// js/employee.js

// ===================
// Verificación de Sesión, Configuración del Escáner, y Otros Eventos
// ===================
document.addEventListener("DOMContentLoaded", async () => {
  // Validar sesión y rol
  try {
    const sessionData = getSessionData(); // Se asume definida en otro lugar
    if (!sessionData) {
      alert("No hay sesión, redirigiendo...");
      window.location.href = "index.html";
      return;
    }

    // Renueva la sesión (si procede)
    refreshSession();

    const uid = sessionData.uid;
    const userDocSnapshot = await db.collection("usuarios").doc(uid).get();
    if (!userDocSnapshot.exists) {
      alert("Usuario no encontrado en Firestore.");
      window.location.href = "index.html";
      return;
    }

    const userData = userDocSnapshot.data();
    const role = userData.role;

    // Verificar rol autorizado
    if (role !== "empleado") {
      handleUnauthorizedRole(role);
      return;
    }
  } catch (error) {
    alert("Error al verificar la sesión o el rol del usuario: " + error);
    window.location.href = "index.html";
    return;
  }

  // Iniciar el escáner QR usando la cámara
  html5QrcodeScanner.render(onScanSuccess, onScanError);

  // Deshabilitar la carga de imágenes (input file)
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.setAttribute("disabled", true);
    fileInput.addEventListener("click", () => {
      alert("La carga de imágenes está deshabilitada. Solo puedes escanear el QR con la cámara.");
      window.location.href = "employee.html";
    });
  }

  // Configurar el botón de cierre de sesión
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      // Se asume que logout() está definida en auth.js
      logout();
    });
  } else {
    alert("El botón de cerrar sesión no se encontró en el DOM.");
  }
});

// ===================
// Función para manejar usuarios no autorizados
// ===================
function handleUnauthorizedRole(role) {
  window.location.href = role === "admin" ? "admin.html" : "index.html";
}

// ===================
// Funciones de Geolocalización y Cálculo de Distancia (Fórmula de Haversine)
// ===================
const allowedLat = 13.622928;      // Latitud permitida
const allowedLng = -87.8959604;    // Longitud permitida
const allowedRadius = 10;          // Radio permitido en metros

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en metros
}

function checkLocation(successCallback, errorCallback) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLat = position.coords.latitude;
        const currentLng = position.coords.longitude;
        const distance = calcularDistancia(allowedLat, allowedLng, currentLat, currentLng);
        if (distance <= allowedRadius) {
          successCallback();
        } else {
          errorCallback(distance);
        }
      },
      (error) => {
        alert("Error al obtener la ubicación: " + error);
        errorCallback();
      }
    );
  } else {
    alert("La geolocalización no está soportada por este navegador.");
    errorCallback();
  }
}

// ===================
// Manejo del Escaneo QR y Registro de Asistencia
// ===================

// Bandera para evitar procesamientos múltiples
let scanProcesado = false;

function onScanSuccess(decodedText, decodedResult) {
  // Evitar múltiples procesamientos
  if (scanProcesado) return;

  // Verificar que el texto del QR sea el esperado
  if (decodedText !== "J.M Asociados") {
    alert("QR incorrecto. Intenta nuevamente.");
    return;
  }

  scanProcesado = true; // Marca que se procesó el escaneo

  // Verifica la ubicación antes de registrar la asistencia
  checkLocation(
    () => {
      html5QrcodeScanner.clear().then(() => {
        registrarAsistencia();
      }).catch((error) => {
        alert("Error al detener el escáner: " + error);
        scanProcesado = false;
      });
    },
    (distance) => {
      if (distance !== undefined) {
        alert(`No estás en la ubicación permitida. Distancia detectada: ${distance.toFixed(2)} metros.`);
      } else {
        alert("No se pudo verificar la ubicación. Intenta nuevamente.");
      }
      scanProcesado = false;
    }
  );
}

function onScanError(errorMessage) {
  alert("Error al escanear: " + errorMessage);
  if (errorMessage.includes("File input")) {
    alert("Por favor, usa la cámara para escanear el código QR.");
    html5QrcodeScanner.clear().then(() => {
      html5QrcodeScanner.render(onScanSuccess, onScanError);
    }).catch((error) => {
      alert("Error al reiniciar el escáner: " + error);
    });
  }
}

// Configuración del escáner QR
const html5QrcodeScanner = new Html5QrcodeScanner(
  "reader",
  {
    fps: 5,          // Reducir FPS para mayor flexibilidad
    qrbox: 300,      // Tamaño de la caja de escaneo
    videoConstraints: {
      facingMode: "environment"  // Cámara trasera
    },
    useFileInput: false
  },
  /* verbose= */ true
);

// ===================
// Registro de Asistencia en Firestore
// ===================
async function registrarAsistencia() {
  alert("Registrando asistencia...");
  // Renueva la sesión (si procede)
  refreshSession();
  const sessionData = getSessionData();
  if (!sessionData) return;
  const uid = sessionData.uid;
  const now = new Date();
  const hour = now.getHours();
  const fechaHoy = now.toISOString().split("T")[0];

  try {
    const asistenciaQuery = await db.collection("asistencias")
      .where("userId", "==", uid)
      .where("fecha", "==", fechaHoy)
      .get();

    const scanCount = asistenciaQuery.size;
    const tipo = (scanCount % 2 === 0) ? "entrada" : "salida";

    let status = "";
    if (tipo === "entrada") {
      if (hour < 8) {
        status = "Llegada temprana";
      } else if (hour >= 8 && hour < 16) {
        status = "Llegada tarde";
      } else {
        status = "Hora de entrada fuera de horario";
      }
    } else {
      status = (hour < 16) ? "Salida temprana" : "Salida";
    }

    let nombreEmpleado = sessionData.email;
    const empleadoQuery = await db.collection("usuarios")
      .where("email", "==", sessionData.email)
      .limit(1)
      .get();
    if (!empleadoQuery.empty) {
      nombreEmpleado = empleadoQuery.docs[0].data().nombre;
    }

    await db.collection("asistencias").add({
      userId: uid,
      user: nombreEmpleado,
      fecha: fechaHoy,
      scanNumber: scanCount + 1,
      time: now.toLocaleTimeString(),
      tipo: tipo,
      status: status
    });

    alert("Asistencia registrada correctamente.");
  } catch (error) {
    alert("Error al registrar asistencia: " + error);
  }
}