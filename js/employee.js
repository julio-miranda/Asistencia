// js/employee.js

// Coordenadas de la ubicación permitida y radio en metros
const allowedLat = 13.622928;      // Reemplaza con la latitud deseada
const allowedLng = -87.8959604;     // Reemplaza con la longitud deseada
const allowedRadius = 31;          // Radio permitido en metros

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
                // Verifica si la distancia está dentro del radio permitido
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

// Verifica que el usuario tenga una sesión válida y rol "empleado" usando localStorage
checkUserSession(function(uid) {
    // Se asume que en Firestore el documento de usuario tiene como ID el uid de la sesión
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

// Bandera para evitar múltiples procesamientos
let scanProcesado = false;

function onScanSuccess(decodedText, decodedResult) {
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
    checkLocation(
        function () {
            // Si la ubicación es correcta, detiene el escáner y registra la asistencia
            html5QrcodeScanner.clear().then(() => {
                registrarAsistencia();
            }).catch((error) => {
                console.error("Error al detener el escáner", error);
                // En caso de error, reiniciamos la bandera para permitir reintentos
                scanProcesado = false;
            });
        },
        function (distance) {
            // Si la ubicación no es válida, muestra un mensaje y no procede con el registro
            if (distance !== undefined) {
                alert(`No estás en la ubicación permitida para registrar la asistencia. Distancia detectada: ${distance.toFixed(2)} metros.`);
            } else {
                alert("No se pudo verificar la ubicación. Intenta nuevamente.");
            }
            // Reiniciamos la bandera para permitir reintentos
            scanProcesado = false;
        }
    );
}

// Función que maneja los errores de escaneo
function onScanError(errorMessage) {
    // No hacer nada si el error no está relacionado con un intento de cargar una imagen
    if (errorMessage.includes("File input")) {
        alert("Por favor, usa la cámara para escanear el código QR.");
        // Reinicia el escáner para que el usuario solo pueda usar la cámara
        html5QrcodeScanner.clear().then(() => {
            html5QrcodeScanner.render(onScanSuccess, onScanError);
        }).catch((error) => {
            console.error("Error al reiniciar el escáner", error);
        });
    }
}

// Configura el escáner en el contenedor "reader" usando la cámara, sin permitir cargar imágenes
var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    {
        fps: 10,
        qrbox: 250,
        videoConstraints: {
            facingMode: "environment"  // Usamos la cámara trasera del dispositivo
        },
        // Deshabilitamos la opción de importar archivos de imagen
        useFileInput: false
    },
    /* verbose= */ false
);

// Inicia el escáner solo con la cámara
html5QrcodeScanner.render(onScanSuccess, onScanError);

// Deshabilitar completamente la carga de archivos (imagen) a través de un evento
document.addEventListener('DOMContentLoaded', function () {
    // Prevenir la carga de archivos (imagen) si se intenta
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.setAttribute('disabled', true);  // Deshabilitamos el campo de archivo
        // Opcionalmente, se puede agregar un evento que muestre una alerta si se intenta cargar un archivo
        fileInput.addEventListener('click', function () {
            alert("La carga de imágenes está deshabilitada. Solo puedes escanear el QR con la cámara.");
            window.location.href = "employee.html";
        });
    }
});

// Función para registrar la asistencia en Firebase Firestore, permitiendo múltiples entradas y salidas por día
async function registrarAsistencia() {
    // Obtener datos de sesión desde localStorage
    const sessionData = getSessionData();
    if (!sessionData) return;
    const uid = sessionData.uid;

    const now = new Date();
    const hour = now.getHours();
    // Se formatea la fecha en formato YYYY-MM-DD para agrupar los registros diarios
    const fechaHoy = now.toISOString().split("T")[0];

    try {
        // Se consulta todos los registros de asistencia del usuario para el día de hoy
        const asistenciaQuery = await db.collection("asistencias")
            .where("userId", "==", uid)
            .where("fecha", "==", fechaHoy)
            .get();

        // Número de escaneos ya realizados en el día
        const scanCount = asistenciaQuery.size;
        // Si el número de escaneos es par, se registra una entrada; si es impar, se registra una salida
        const tipo = (scanCount % 2 === 0) ? "entrada" : "salida";

        // Determinar el estado según la hora y el tipo de registro
        let status = "";
        if (tipo === "entrada") {
            if (hour < 8) {
                status = "Llegada temprana";
            } else if (hour >= 8 && hour < 16) {
                status = "Llegada tarde";
            } else {
                status = "Hora de entrada fuera de horario";
            }
        } else { // salida
            status = (hour < 16) ? "Salida temprana" : "Salida";
        }

        // Obtener el nombre del empleado desde la colección "usuarios" utilizando el uid
        let nombreEmpleado = "Usuario desconocido";
        const empleadoDoc = await db.collection("usuarios").doc(uid).get();
        if (empleadoDoc.exists) {
            nombreEmpleado = empleadoDoc.data().nombre;
        }

        // Agregar un nuevo documento en "asistencias" con los datos del escaneo
        await db.collection("asistencias").add({
            userId: uid,
            user: nombreEmpleado,
            fecha: fechaHoy,
            scanNumber: scanCount + 1,
            time: now.toLocaleTimeString(),
            tipo: tipo,    // "entrada" o "salida"
            status: status
        });

        // Mostrar mensaje en el elemento "qr-result"
        let message = "";
        if (tipo === "entrada") {
            message = `Entrada registrada a las ${now.toLocaleTimeString()} (${status}). Escaneo #${scanCount + 1}`;
        } else {
            message = `Salida registrada a las ${now.toLocaleTimeString()} (${status}). Escaneo #${scanCount + 1}`;
        }
        document.getElementById("qr-result").innerHTML = `<p>${message}</p>`;
    } catch (error) {
        console.error("Error al registrar asistencia:", error);
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