// Verifica que el usuario esté autenticado y tenga rol "empleado"
checkUserAuth(async function (user) {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    try {
        const role = await getUserRole(user);
        if (role !== "empleado") {
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Error al obtener el rol del usuario:", error);
        window.location.href = "index.html";
    }
});

// Función para mostrar mensajes en la UI en lugar de usar alert()
function mostrarMensaje(mensaje, tipo = "error") {
    const mensajeElemento = document.getElementById("mensaje-ubicacion");
    if (mensajeElemento) {
        mensajeElemento.innerText = mensaje;
        mensajeElemento.className = tipo;  // Clases CSS como "error", "info" o "success"
    } else {
        alert(mensaje); // Fallback si el elemento no existe
    }
}

// Función que se ejecuta cuando se detecta un código QR exitosamente
function onScanSuccess(decodedText) {
    if (decodedText !== "J.M Asociados") {
        mostrarMensaje("QR incorrecto. Intenta nuevamente.");
        return;
    }

    if (typeof html5QrcodeScanner !== "undefined" && html5QrcodeScanner !== null) {
        html5QrcodeScanner.clear()
            .then(obtenerUbicacionYRegistrar)
            .catch((error) => console.error("Error al detener el escáner:", error));
    } else {
        obtenerUbicacionYRegistrar();
    }
}

function obtenerUbicacionYRegistrar() {
    const refLatitude = 13.622925;
    const refLongitude = -87.895965;
    const tolerance = 0.0001; // Aproximadamente 11 metros

    if ("geolocation" in navigator) {
        mostrarMensaje("Obteniendo ubicación, espera...", "info");

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                console.log(`Latitud: ${latitude}, Longitud: ${longitude}, Precisión: ${accuracy}m`);

                // Verifica que la precisión de la ubicación sea aceptable (menos de 20 metros)
                if (accuracy > 20) {
                    mostrarMensaje("Ubicación poco precisa, intenta nuevamente.", "error");
                    return;
                }

                // Verifica si la ubicación está dentro del rango permitido
                const isNearby = (
                    Math.abs(latitude - refLatitude) <= tolerance &&
                    Math.abs(longitude - refLongitude) <= tolerance
                );

                if (isNearby) {
                    registrarAsistencia();
                } else {
                    mostrarMensaje("Ubicación inválida. Debes estar en la zona correcta.", "error");
                    setTimeout(() => window.location.href = "employee.html", 3000);
                }
            },
            (error) => {
                let mensajeError = "Error obteniendo la ubicación.";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensajeError = "Permiso de ubicación denegado. Activa la ubicación e inténtalo de nuevo.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensajeError = "Ubicación no disponible. Verifica tu GPS.";
                        break;
                    case error.TIMEOUT:
                        mensajeError = "Tiempo de espera agotado. Intenta de nuevo.";
                        break;
                }
                mostrarMensaje(mensajeError, "error");
                console.error(mensajeError, error);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    } else {
        mostrarMensaje("Geolocalización no soportada en este navegador.", "error");
    }
}

// Función que maneja los errores de escaneo
function onScanError(errorMessage) {
    if (errorMessage.includes("File input")) {
        mostrarMensaje("Por favor, usa la cámara para escanear el código QR.");
        html5QrcodeScanner.clear().then(() => {
            html5QrcodeScanner.render(onScanSuccess, onScanError);
        }).catch((error) => console.error("Error al reiniciar el escáner:", error));
    }
}

// Configuración del escáner
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

// Inicia el escáner solo con la cámara
html5QrcodeScanner.render(onScanSuccess, onScanError);

// Prevención de carga de archivos (imagen)
document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.style.display = "none";
    }
});

// Función para registrar la asistencia en Firebase Firestore
async function registrarAsistencia() {
    const user = auth.currentUser;
    if (!user) {
        mostrarMensaje("No se encontró usuario autenticado.", "error");
        return;
    }

    const now = new Date();
    const hour = now.getHours();
    const fechaHoy = now.toISOString().split("T")[0];

    try {
        console.log("Consultando asistencias para:", user.uid, fechaHoy);
        const asistenciaQuery = await db.collection("asistencias")
            .where("userId", "==", user.uid)
            .where("fecha", "==", fechaHoy)
            .orderBy("time", "desc")
            .get();

        const scanCount = asistenciaQuery.size;
        const tipo = (scanCount % 2 === 0) ? "entrada" : "salida";

        let status = "";
        if (tipo === "entrada") {
            if (hour < 8) status = "Llegada temprana";
            else if (hour >= 8 && hour < 16) status = "Llegada tarde";
            else status = "Hora de entrada fuera de horario";
        } else {
            status = (hour < 16) ? "Salida temprana" : "Salida";
        }

        let nombreEmpleado = user.email;
        console.log("Consultando nombre del empleado para:", user.email);
        const empleadoQuery = await db.collection("usuarios")
            .where("email", "==", user.email)
            .limit(1)
            .get();
        if (!empleadoQuery.empty) {
            nombreEmpleado = empleadoQuery.docs[0].data().nombre || user.email;
        }

        console.log("Registrando asistencia:", {
            userId: user.uid,
            user: nombreEmpleado,
            fecha: fechaHoy,
            scanNumber: scanCount + 1,
            time: now.toLocaleTimeString(),
            tipo: tipo,
            status: status
        });

        await db.collection("asistencias").add({
            userId: user.uid,
            user: nombreEmpleado,
            fecha: fechaHoy,
            scanNumber: scanCount + 1,
            time: now.toLocaleTimeString(),
            tipo: tipo,
            status: status
        });

        let message = (tipo === "entrada")
            ? `Entrada registrada a las ${now.toLocaleTimeString()} (${status}). Escaneo #${scanCount + 1}`
            : `Salida registrada a las ${now.toLocaleTimeString()} (${status}). Escaneo #${scanCount + 1}`;

        mostrarMensaje(message, "success");
    } catch (error) {
        console.error("Error al registrar asistencia:", error);
        // Si el error indica que falta un índice, Firestore lo indicará en la consola con un enlace.
        mostrarMensaje("Error al registrar asistencia. Inténtalo nuevamente. " + error.message, "error");
    }
}

// Evento para cerrar sesión
document.addEventListener("DOMContentLoaded", function () {
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", logout);
    } else {
        console.error("El botón de cerrar sesión no se encontró en el DOM.");
    }
});
