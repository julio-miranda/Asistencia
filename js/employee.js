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
        // Se consulta si ya existen registros de asistencia para hoy
        const asistenciaQuery = await db.collection("asistencias")
            .where("userId", "==", user.uid)
            .where("fecha", "==", fechaHoy)
            .get();

        const registros = asistenciaQuery.docs.map(doc => doc.data());

        // Verificar si es la primera entrada o salida
        if (registros.length % 2 === 0) {
            // Primera entrada o entrada alterna: se registra la entrada
            let entradaStatus = "";
            if (hour < 8) {
                entradaStatus = "Llegada temprana";
            } else if (hour >= 8 && hour < 16) {
                entradaStatus = "Llegada tarde";
            } else {
                entradaStatus = "Hora de entrada fuera de horario";
            }

            const empleado = await db.collection("usuarios").where("email", "==", user.email).get();
            await db.collection("asistencias").add({
                user: empleado.docs[0].data().nombre,
                userId: user.uid,
                fecha: fechaHoy,
                entradaTime: now.toLocaleTimeString(),
                entradaStatus: entradaStatus,
                salidaTime: null,
                salidaStatus: null
            });

            document.getElementById("qr-result").innerHTML = `<p>Entrada registrada a las ${now.toLocaleTimeString()} (${entradaStatus})</p>`;
        } else {
            // Segunda entrada o salida alterna: se registra la salida
            let salidaStatus = (hour < 16) ? "Salida temprana" : "Salida";
            const docAsistencia = registros[registros.length - 1];

            if (!docAsistencia.salidaTime) {
                await db.collection("asistencias").doc(docAsistencia.id).update({
                    salidaTime: now.toLocaleTimeString(),
                    salidaStatus: salidaStatus
                });

                document.getElementById("qr-result").innerHTML = `<p>Salida registrada a las ${now.toLocaleTimeString()} (${salidaStatus})</p>`;
            } else {
                alert("Ya se registraron la entrada y salida para hoy.");
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