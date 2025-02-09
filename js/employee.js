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
    // Formateamos la fecha en formato YYYY-MM-DD para agrupar registros por día
    const fechaHoy = now.toISOString().split("T")[0];

    try {
        // Se consulta si ya existe un registro de asistencia para hoy
        const asistenciaQuery = await db.collection("asistencias")
            .where("userId", "==", user.uid)
            .where("fecha", "==", fechaHoy)
            .get();

        if (asistenciaQuery.empty) {
            // Primer escaneo del día: se registra la entrada.
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
                fecha: fechaHoy,
                entradaTime: now.toLocaleTimeString(),
                entradaStatus: entradaStatus,
                salidaTime: null,
                salidaStatus: null
            });
            document.getElementById("qr-result").innerHTML = `<p>Entrada registrada a las ${now.toLocaleTimeString()} (${entradaStatus})</p>`;
        } else {
            // Si ya existe un registro, se verifica si aún no se ha registrado la salida.
            let docAsistencia = null;
            asistenciaQuery.forEach(doc => {
                if (!doc.data().salidaTime) {
                    docAsistencia = doc;
                }
            });
            if (docAsistencia) {
                const salidaStatus = (hour < 16) ? "Salida temprana" : "Salida";
                await docAsistencia.ref.update({
                    salidaTime: now.toLocaleTimeString(),
                    salidaStatus: salidaStatus
                });
                document.getElementById("qr-result").innerHTML = `<p>Salida registrada a las ${now.toLocaleTimeString()} (${salidaStatus})</p>`;
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
