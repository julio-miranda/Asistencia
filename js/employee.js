// js/employee.js

// Verifica que el usuario esté autenticado y tenga rol "empleado"
checkUserAuth(async function (user) {
    const role = await getUserRole(user);
    if (role !== "empleado") {
        window.location.href = "index.html";
        return;
    }
});

// Función que se ejecuta cuando se detecta un código QR exitosamente
function onScanSuccess(decodedText, decodedResult) {
    if (decodedText !== "J.M Asociados") {
        alert("QR incorrecto. Intenta nuevamente.");
        return;
    }

    if (typeof html5QrcodeScanner !== "undefined" && html5QrcodeScanner !== null) {
        html5QrcodeScanner.clear().then(() => {
            obtenerUbicacionYRegistrar();
        }).catch((error) => {
            console.error("Error al detener el escáner", error);
        });
    } else {
        obtenerUbicacionYRegistrar();
    }
}

// Función para calcular la distancia entre dos coordenadas (Haversine)
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

function obtenerUbicacionYRegistrar() {
    const refLatitude = 13.6230319;
    const refLongitude = -87.8959763;
    const tolerance = 55; // Tolerancia en metros

    if ("geolocation" in navigator) {
        alert("Obteniendo ubicación. Por favor, espera...");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                console.log(`Latitud detectada: ${latitude}, Longitud detectada: ${longitude}`);

                const distancia = calcularDistancia(latitude, longitude, refLatitude, refLongitude);
                console.log(`Distancia calculada: ${distancia.toFixed(2)} metros`);

                if (distancia <= tolerance) {
                    registrarAsistencia();
                } else {
                    alert(`Ubicación inválida. Estás a ${distancia.toFixed(2)} metros del punto permitido.`);
                    setTimeout(() => {
                        window.location.href = "employee.html";
                    }, 3000);
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
                alert(mensajeError);
                console.error(mensajeError);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        alert("Geolocalización no soportada en este navegador.");
        console.error("La geolocalización no es soportada en este navegador.");
    }
}

// Función que maneja los errores de escaneo
function onScanError(errorMessage) {
    if (errorMessage.includes("File input")) {
        alert("Por favor, usa la cámara para escanear el código QR.");
        html5QrcodeScanner.clear().then(() => {
            html5QrcodeScanner.render(onScanSuccess, onScanError);
        }).catch((error) => {
            console.error("Error al reiniciar el escáner", error);
        });
    }
}

var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    {
        fps: 10,
        qrbox: 250,
        videoConstraints: {
            facingMode: "environment"
        },
        useFileInput: false
    },
    false
);

html5QrcodeScanner.render(onScanSuccess, onScanError);

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

// Función para registrar asistencia en Firestore
async function registrarAsistencia() {
    const user = auth.currentUser;
    if (!user) return;

    const now = new Date();
    const hour = now.getHours();
    const fechaHoy = now.toISOString().split("T")[0];

    try {
        const asistenciaQuery = await db.collection("asistencias")
            .where("userId", "==", user.uid)
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

        let nombreEmpleado = user.email;
        const empleadoQuery = await db.collection("usuarios")
            .where("email", "==", user.email)
            .limit(1)
            .get();
        if (!empleadoQuery.empty) {
            nombreEmpleado = empleadoQuery.docs[0].data().nombre;
        }

        await db.collection("asistencias").add({
            userId: user.uid,
            user: nombreEmpleado,
            fecha: fechaHoy,
            scanNumber: scanCount + 1,
            time: now.toLocaleTimeString(),
            tipo: tipo,
            status: status
        });

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