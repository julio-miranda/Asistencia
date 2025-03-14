// js/employee.js
// Coordenadas de la ubicación permitida y radio en metros
let allowedLat = null;      // Se actualizará con la latitud de la empresa
let allowedLng = null;      // Se actualizará con la longitud de la empresa
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

// Función que verifica la ubicación actual del usuario
function checkLocation(successCallback, errorCallback) {
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
            window.location.href = "index.html";
            return;
        }
    }).catch(error => {
        console.error("Error al obtener datos del usuario:", error);
        logout();
    });
});

// Bandera para evitar múltiples procesamientos simultáneos
let scanProcesado = false;

// Función de éxito para el escaneo mediante cámara
function onScanSuccess(decodedText, decodedResult) {
    if (scanProcesado) return;

    if (decodedText !== "J.M Asociados") {
        alert("QR incorrecto. Intenta nuevamente.");
        return;
    }

    scanProcesado = true;

    html5QrcodeScanner.clear().then(() => {
        registrarAsistencia();
    }).catch((error) => {
        console.error("Error al detener el escáner", error);
        scanProcesado = false;
    });
}

// Función de error para el escaneo mediante cámara
function onScanError(errorMessage) {
    if (errorMessage.includes("File input")) {
        alert("Por favor, usa la cámara o carga una imagen para escanear el código QR.");
        html5QrcodeScanner.clear().then(() => {
            html5QrcodeScanner.render(onScanSuccess, onScanError);
        }).catch((error) => {
            console.error("Error al reiniciar el escáner", error);
        });
    }
}

// Configura el escáner para la cámara en el contenedor "reader"
var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    {
        fps: 10,
        qrbox: 250,
        videoConstraints: { facingMode: "environment" },
        useFileInput: false // Se deshabilita el file input interno para usar uno propio
    },
    false
);

html5QrcodeScanner.render(onScanSuccess, onScanError);

// Habilitar la carga de imagen para escanear QR mediante un input file
document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        // Se asegura de que el input file esté habilitado
        fileInput.removeAttribute('disabled');
        fileInput.addEventListener('change', function () {
            if (scanProcesado) return; // Evitar procesamiento múltiple
            const file = fileInput.files[0];
            if (file) {
                // Se crea una instancia temporal para escanear la imagen
                let html5QrCode = new Html5Qrcode("reader");
                scanProcesado = true;
                html5QrCode.scanFile(file, true)
                    .then(decodedText => {
                        if (decodedText !== "J.M Asociados") {
                            alert("QR incorrecto. Intenta nuevamente.");
                            scanProcesado = false;
                            return;
                        }
                        // QR correcto: se limpia la instancia y se procede a registrar la asistencia
                        html5QrCode.clear().then(() => {
                            registrarAsistencia();
                        }).catch((error) => {
                            console.error("Error al detener el escáner de archivo", error);
                            scanProcesado = false;
                        });
                    })
                    .catch(err => {
                        alert("No se pudo leer el código QR. Intenta con otra imagen.");
                        console.error("Error scanning file: ", err);
                        scanProcesado = false;
                    });
            }
        });
    }
});

// Función para registrar asistencia con verificación de ubicación
async function registrarAsistencia() {
    const sessionData = getSessionData();
    if (!sessionData) {
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
            console.error("Usuario no encontrado.");
            scanProcesado = false;
            return;
        }

        const userData = usuarioDoc.data();
        const empresa = userData.empresa;

        // Obtener la ubicación de la empresa y actualizar allowedLat y allowedLng
        const empresaDoc = await db.collection("empresas").doc(empresa).get();
        if (empresaDoc.exists) {
            const empresaData = empresaDoc.data();
            allowedLat = empresaData.ubicacion.lat;
            allowedLng = empresaData.ubicacion.lng;
        } else {
            console.error("Empresa no encontrada.");
            scanProcesado = false;
            return;
        }

        // Verificar ubicación antes de registrar asistencia
        checkLocation(async () => {
            // Verificar si ya existe un registro de asistencia para hoy
            const asistenciaRef = db.collection("asistencias").doc(`${uid}_${fechaHoy}`);
            const asistenciaDoc = await asistenciaRef.get();

            if (!asistenciaDoc.exists) {
                // Registrar entrada
                let status = hour >= 8 ? "Tarde" : "A tiempo";
                if (status === "Tarde") {
                    // Solicitar justificación si llega tarde
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
                        fecha: fechaHoy,
                        entrada: now.toLocaleTimeString(),
                        salida: null,
                        status: status
                    });
                }
                alert(`Entrada registrada a las ${now.toLocaleTimeString()} (${status}).`);
            } else {
                // Registrar salida
                await asistenciaRef.update({
                    salida: now.toLocaleTimeString()
                });
                alert(`Salida registrada a las ${now.toLocaleTimeString()}.`);
            }
            // Reiniciar la bandera para permitir nuevos escaneos
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
    }
});