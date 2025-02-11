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
    // Verifica que el texto escaneado sea el correcto
    if (decodedText !== "J.M Asociados") {
        alert("QR incorrecto. Intenta nuevamente.");
        return;
    }
    // Detiene el escáner y registra la asistencia
    html5QrcodeScanner.clear().then(() => {
        registrarAsistencia();
    }).catch((error) => {
        console.error("Error al detener el escáner", error);
    });
}

// Configura el escáner en el contenedor "reader"
var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    { fps: 10, qrbox: 250 },
    /* verbose= */ false
);
html5QrcodeScanner.render(onScanSuccess);

// Función para registrar la asistencia en Firebase Firestore
async function registrarAsistencia() {
    const user = auth.currentUser;
    if (!user) return;

    const now = new Date();
    const hour = now.getHours();
    const fechaHoy = now.toISOString().split("T")[0]; // Formato YYYY-MM-DD

    try {
        // Consulta los registros de asistencia para hoy
        const asistenciaQuery = await db.collection("asistencias")
            .where("userId", "==", user.uid)
            .where("fecha", "==", fechaHoy)
            .orderBy("entradaTime")
            .get();

        let entradaStatus = "";
        if (asistenciaQuery.empty) {
            // Primer escaneo del día: es una entrada
            if (hour < 8) {
                entradaStatus = "Llegada temprana";
            } else if (hour >= 8 && hour < 16) {
                entradaStatus = "Llegada tarde";
            } else {
                entradaStatus = "Hora de entrada fuera de horario";
            }
            await db.collection("asistencias").add({
                userId: user.uid,
                user: user.displayName,
                fecha: fechaHoy,
                entradaTime: now.toLocaleTimeString(),
                entradaStatus: entradaStatus,
                salidaTime: null,
                salidaStatus: null
            });
            document.getElementById("qr-result").innerHTML = `<p>Entrada registrada a las ${now.toLocaleTimeString()} (${entradaStatus})</p>`;
        } else {
            // Ya existe una entrada, verificamos si es hora de salida o más entradas
            let lastEntry = null;
            let lastExit = null;
            asistenciaQuery.forEach(doc => {
                const data = doc.data();
                if (!data.salidaTime) {
                    lastEntry = doc; // Última entrada sin salida
                } else {
                    lastExit = doc; // Última salida registrada
                }
            });

            // Si la última entrada no tiene salida, registrar salida
            if (lastEntry && !lastEntry.data().salidaTime) {
                let salidaStatus = (hour < 16) ? "Salida temprana" : "Salida";
                await lastEntry.ref.update({
                    salidaTime: now.toLocaleTimeString(),
                    salidaStatus: salidaStatus
                });
                document.getElementById("qr-result").innerHTML = `<p>Salida registrada a las ${now.toLocaleTimeString()} (${salidaStatus})</p>`;
            } else if (lastExit && lastExit.data().salidaTime) {
                // Si la última salida tiene hora, registrar una nueva entrada
                let entradaStatus = "";
                if (hour < 8) {
                    entradaStatus = "Llegada temprana";
                } else if (hour >= 8 && hour < 16) {
                    entradaStatus = "Llegada tarde";
                } else {
                    entradaStatus = "Hora de entrada fuera de horario";
                }
                await db.collection("asistencias").add({
                    userId: user.uid,
                    user: user.displayName,
                    fecha: fechaHoy,
                    entradaTime: now.toLocaleTimeString(),
                    entradaStatus: entradaStatus,
                    salidaTime: null,
                    salidaStatus: null
                });
                document.getElementById("qr-result").innerHTML = `<p>Entrada registrada a las ${now.toLocaleTimeString()} (${entradaStatus})</p>`;
            } else {
                alert("Ya se registró la entrada y salida para hoy.");
            }
        }
    } catch (error) {
        console.error("Error al registrar asistencia:", error);
    }
}

// Evento para cerrar sesión
document.addEventListener("DOMContentLoaded", function() {
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", function() {
            logout();
        });
    } else {
        console.error("El botón de cerrar sesión no se encontró en el DOM.");
    }
});