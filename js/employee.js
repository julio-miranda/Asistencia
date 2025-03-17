// js/employee.js

// Coordenadas de la ubicación permitida y radio en metros
let allowedLat = null;      // Se actualizará al obtener la ubicación de la empresa
let allowedLng = null;      // Se actualizará al obtener la ubicación de la empresa
const allowedRadius = 10;   // Radio permitido en metros

// Función para calcular la distancia entre dos coordenadas usando la fórmula de Haversine
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distancia en metros
}

// Función para convertir getCurrentPosition en una promesa
function getCurrentPositionPromise(options = {}) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// Función que verifica la ubicación actual del usuario
function checkLocation(successCallback, errorCallback) {
    // Validar que la ubicación permitida esté definida
    if (allowedLat === null || allowedLng === null) {
        alert("La ubicación permitida no está definida.");
        errorCallback();
        window.location.href = "employee.html";
        return;
    }
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                const currentLat = position.coords.latitude;
                const currentLng = position.coords.longitude;
                const distance = calcularDistancia(allowedLat, allowedLng, currentLat, currentLng);
                if (distance <= allowedRadius) {
                    successCallback();
                } else {
                    errorCallback(distance);
                }
            },
            error => {
                console.error("Error al obtener la ubicación:", error);
                alert("Error al obtener la ubicación. Verifica los permisos de tu navegador.");
                errorCallback();
            }
        );
    } else {
        alert("La geolocalización no está soportada por este navegador.");
        errorCallback();
    }
}

// Verifica que el usuario tenga una sesión válida y rol "empleado"
checkUserSession(function (uid) {
    db.collection("usuarios").doc(uid).get().then(doc => {
        if (!doc.exists || doc.data().role !== "empleado") {
            alert("No tienes permisos para acceder a este módulo.");
            window.location.href = "index.html";
            return;
        }
    }).catch(error => {
        console.error("Error al obtener datos del usuario:", error);
        alert("Error al obtener datos del usuario. Se cerrará la sesión.");
        logout();
    });
});

// Bandera para evitar múltiples procesamientos
let scanProcesado = false;

// Función que se ejecuta cuando se detecta un código QR correctamente
function onScanSuccess(decodedText, decodedResult) {
    if (scanProcesado) return;

    if (decodedText !== "J.M Asociados") {
        alert("QR incorrecto. Intenta nuevamente.");
        return;
    }

    scanProcesado = true;

    // Se limpia el escáner y se llama a registrarAsistencia
    html5QrcodeScanner.clear().then(() => {
        registrarAsistencia();
    }).catch((error) => {
        console.error("Error al detener el escáner", error);
        alert("Error al detener el escáner. Intenta nuevamente.");
        scanProcesado = false;
    });
}

function onScanError(errorMessage) {
    if (errorMessage.includes("File input")) {
        alert("Por favor, usa la cámara para escanear el código QR.");
        html5QrcodeScanner.clear().then(() => {
            html5QrcodeScanner.render(onScanSuccess, onScanError);
        }).catch((error) => {
            console.error("Error al reiniciar el escáner", error);
            alert("Error al reiniciar el escáner.");
        });
    }
}

// Configura el escáner en el contenedor "reader"
var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    {
        fps: 10,
        qrbox: 250,
        videoConstraints: { facingMode: "environment" },
        useFileInput: false
    },
    false
);

html5QrcodeScanner.render(onScanSuccess, onScanError);

// Deshabilitar carga de archivos
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

// Función para registrar asistencia con verificación de ubicación
async function registrarAsistencia() {
    const sessionData = getSessionData();
    if (!sessionData) {
        alert("No se encontró información de la sesión. Por favor, inicia sesión de nuevo.");
        scanProcesado = false;
        return;
    }
    const uid = sessionData.uid;

    const now = new Date();
    const hour = now.getHours();
    const fechaHoy = now.toISOString().split("T")[0];

    try {
        // Obtener datos del usuario
        const usuarioDoc = await db.collection("usuarios").doc(uid).get();
        if (!usuarioDoc.exists) {
            alert("Error: Usuario no encontrado.");
            scanProcesado = false;
            return;
        }
        const userData = usuarioDoc.data();
        const empresa = userData.empresa;
        const sucursal = userData.sucursal;

        // Obtener la ubicación de la empresa y actualizar allowedLat y allowedLng
        const empresaRef = db.collection("empresas").doc(empresa);
        const empresaDoc = await empresaRef.get();
        if (empresaDoc.exists) {
            const empresaData = empresaDoc.data();
            allowedLat = empresaData.lat;
            allowedLng = empresaData.lng;
        } else {
            // Si la empresa no existe, se obtiene la posición actual y se crea el documento
            if (navigator.geolocation) {
                try {
                    const position = await getCurrentPositionPromise();
                    await db.collection("empresas").add({
                        empresa: empresa,
                        sucursal: sucursal,
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                } catch (error) {
                    console.error("Error al obtener la ubicación:", error);
                    alert("Error al obtener la ubicación. Verifica los permisos de tu navegador.");
                    scanProcesado = false;
                    return;
                }
            } else {
                alert("La geolocalización no está soportada por este navegador.");
                scanProcesado = false;
                return;
            }
        }

        // Verificar ubicación antes de registrar asistencia
        checkLocation(async () => {
            // Verificar si hay un registro de asistencia hoy
            const asistenciaRef = db.collection("asistencias").doc(`${uid}_${fechaHoy}`);
            const asistenciaDoc = await asistenciaRef.get();

            if (!asistenciaDoc.exists) {
                // Primera vez escaneando hoy -> Registrar entrada
                // Nota: Revisar la condición según la regla de negocio (usar "hour > 8" si a las 8 se considera a tiempo)
                let status = hour >= 8 ? "Tarde" : "A tiempo";

                if (status === "Tarde") {
                    // Solicitar justificación en caso de tardanza
                    const justification = prompt("Llegaste tarde. Ingresa la razón:");
                    if (!justification) {
                        alert("Debes justificar tu llegada tarde.");
                        scanProcesado = false;
                        return;
                    }
                    await asistenciaRef.set({
                        userId: uid,
                        user: userData.nombre,
                        empresa: empresa,
                        sucursal: sucursal,
                        fecha: fechaHoy,
                        entrada: now.toLocaleTimeString(),
                        salida: null,
                        status: status,
                        justificacion: justification
                    });
                } else {
                    await asistenciaRef.set({
                        userId: uid,
                        user: userData.nombre,
                        empresa: empresa,
                        sucursal: sucursal,
                        fecha: fechaHoy,
                        entrada: now.toLocaleTimeString(),
                        salida: null,
                        status: status
                    });
                }
                alert(`Entrada registrada a las ${now.toLocaleTimeString()} (${status}).`);
            } else {
                // Segunda vez escaneando hoy -> Registrar salida
                await asistenciaRef.update({
                    salida: now.toLocaleTimeString()
                });
                alert(`Salida registrada a las ${now.toLocaleTimeString()}.`);
            }
            // Reiniciar bandera para permitir nuevos escaneos
            scanProcesado = false;
        }, (distance) => {
            if (distance !== undefined) {
                alert(`No estás en la ubicación permitida para registrar la asistencia. Distancia detectada: ${distance.toFixed(2)} metros.`);
            } else {
                alert("No se pudo verificar la ubicación. Intenta nuevamente.");
            }
            scanProcesado = false;
        });

    } catch (error) {
        console.error("Error al registrar asistencia:", error);
        alert(`Error al registrar asistencia: ${error.message}`);
        scanProcesado = false;
    }
}

// Evento para cerrar sesión
document.addEventListener("DOMContentLoaded", function () {
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", function () {
            logout();
        });
    } else {
        console.error("El botón de cerrar sesión no se encontró en el DOM.");
        alert("Error: No se encontró el botón de cerrar sesión.");
    }
});