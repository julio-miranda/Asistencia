// js/employee.js

// ===================
// Verificación de Sesión Automática
// ===================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Obtener los datos de la sesión almacenados en localStorage
    const sessionData = getSessionData();
    //alert("Sesión: " + JSON.stringify(sessionData));

    // Verifica si no hay sesión o si los datos son inválidos
    if (!sessionData) {
      alert("No hay sesión, redirigiendo...");
      window.location.href = "index.html";
      return;
    }

    // Opcional: Renueva la sesión para extender su expiración
    refreshSession();

    const uid = sessionData.uid;

    // Consulta a Firestore para obtener los datos del usuario
    const userDocSnapshot = await db.collection("usuarios").doc(uid).get();
    if (!userDocSnapshot.exists) {
      alert("Usuario no encontrado en Firestore.");
      window.location.href = "index.html";
      return;
    }

    const userData = userDocSnapshot.data();
    const role = userData.role;
    alert("Rol del usuario: " + role);

    // Verifica que el usuario tenga el rol "empleado" para acceder a esta página
    if (role !== "empleado") {
      alert("Usuario no autorizado, redirigiendo...");
      handleUnauthorizedRole(role);
      return;
    }

    //alert("Usuario autorizado, cargando datos...");
    // Aquí puedes cargar los datos y funciones específicas para el empleado

  } catch (error) {
    alert("Error al verificar la sesión o el rol del usuario: " + error);
    window.location.href = "index.html";
  }
});

/**
* Función para manejar usuarios con roles no autorizados en esta sección.
* Redirige a la página correspondiente según el rol.
* @param {string} role - Rol del usuario.
*/
function handleUnauthorizedRole(role) {
  // Si el rol es "admin", redirige a admin.html; de lo contrario, vuelve al login
  window.location.href = role === "admin" ? "admin.html" : "index.html";
}

// ====================
// Código de verificación de ubicación y escaneo QR (sin cambios respecto a la lógica de geolocalización)
// ====================

// Coordenadas de la ubicación permitida y radio en metros
const allowedLat = 13.622928;      // Reemplaza con la latitud deseada
const allowedLng = -87.8959604;     // Reemplaza con la longitud deseada
const allowedRadius = 10;           // Radio permitido en metros

// Función para calcular la distancia entre dos coordenadas usando la fórmula de Haversine
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

// Función que verifica la ubicación actual del usuario
function checkLocation(successCallback, errorCallback) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLat = position.coords.latitude;
        const currentLng = position.coords.longitude;
        const distance = calcularDistancia(
          allowedLat,
          allowedLng,
          currentLat,
          currentLng
        );
        // Verifica si la distancia está dentro del radio permitido
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

// ====================
// Manejo del escaneo QR y registro de asistencia
// ====================

// Bandera para evitar múltiples procesamientos
let scanProcesado = false;

function onScanSuccess(decodedText, decodedResult) {
  //alert("QR Escaneado: " + decodedText); // Agrega un alert para ver el contenido del QR

  // Si ya se procesó un escaneo, se ignoran los siguientes
  if (scanProcesado) return;

  // Verifica que el texto escaneado sea el correcto
  if (decodedText !== "J.M Asociados") {
    alert("QR incorrecto. Intenta nuevamente.");
    return;
  }

  // Marca que el escaneo ya se procesó
  scanProcesado = true;

  // Verifica la ubicación antes de proceder
  //alert("Verificando ubicación..."); // Alert cuando se empieza la verificación de ubicación
  checkLocation(
    function () {
      //alert("Ubicación verificada correctamente.");
      // Si la ubicación es correcta, detiene el escáner y registra la asistencia
      html5QrcodeScanner.clear().then(() => {
        registrarAsistencia();
      }).catch((error) => {
        alert("Error al detener el escáner: " + error);
        // En caso de error, reiniciamos la bandera para permitir reintentos
        scanProcesado = false;
      });
    },
    function (distance) {
      if (distance !== undefined) {
        alert(`No estás en la ubicación permitida. Distancia detectada: ${distance.toFixed(2)} metros.`);
      } else {
        alert("No se pudo verificar la ubicación. Intenta nuevamente.");
      }
      // Reiniciamos la bandera para permitir reintentos
      scanProcesado = false;
    }
  );
}

function onScanError(errorMessage) {
  alert("Error al escanear: " + errorMessage); // Agrega un alert para mostrar el error
  // No hacer nada si el error no está relacionado con un intento de cargar una imagen
  if (errorMessage.includes("File input")) {
    alert("Por favor, usa la cámara para escanear el código QR.");
    // Reinicia el escáner para que el usuario solo pueda usar la cámara
    html5QrcodeScanner.clear().then(() => {
      html5QrcodeScanner.render(onScanSuccess, onScanError);
    }).catch((error) => {
      alert("Error al reiniciar el escáner: " + error);
    });
  }
}

// Configura el escáner en el contenedor "reader" usando la cámara, sin permitir cargar imágenes
var html5QrcodeScanner = new Html5QrcodeScanner(
  "reader",
  {
    fps: 5,  // Reducir los FPS para hacer que el escáner sea más flexible
    qrbox: 300,  // Aumenta el tamaño de la caja de escaneo
    videoConstraints: {
      facingMode: "environment"  // Cámara trasera
    },
    useFileInput: false
  },
  /* verbose= */ true // Para más detalles en la consola
);

// Inicia el escáner solo con la cámara
html5QrcodeScanner.render(onScanSuccess, onScanError);

// Deshabilitar completamente la carga de archivos (imagen)
document.addEventListener('DOMContentLoaded', function () {
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.setAttribute('disabled', true);
    fileInput.addEventListener('click', function () {
      alert("La carga de imágenes está deshabilitada. Solo puedes escanear el QR con la cámara.");
      window.location.href = "employee.html";
    });
  }
});

// ====================
// Función para registrar la asistencia en Firestore
// ====================

async function registrarAsistencia() {
  alert("Registrando asistencia..."); // Verifica si se llega aquí
  const session = getSessionData();
  if (!session) return;
  const sessionData = JSON.parse(session);
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

// ====================
// Evento para cerrar sesión
// ====================

document.addEventListener("DOMContentLoaded", function () {
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", function () {
      // Opción 1: Si ya tienes la función logout() definida en auth.js:
      logout();

      // Opción 2: Eliminar la sesión directamente de localStorage
      // localStorage.removeItem("session");
      // window.location.href = "index.html";
    });
  } else {
    alert("El botón de cerrar sesión no se encontró en el DOM.");
  }
});