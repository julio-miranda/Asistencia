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

// Configura el escáner en el contenedor "reader" usando la cámara, sin permitir cargar archivos de imagen
var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    {
        fps: 10,
        qrbox: 250,
        // Asegurarse de que solo se use la cámara
        videoConstraints: {
            facingMode: "environment" // Usar la cámara trasera del dispositivo
        }
    },
    /* verbose= */ false
);

// Eliminamos cualquier posible botón de carga de imágenes
html5QrcodeScanner.render(onScanSuccess);
html5QrcodeScanner.clear().then(() => {
    // Solo habilitamos la cámara para escanear, sin opción para cargar imagenes
}).catch((error) => {
    console.error("Error al inicializar el escáner", error);
});

// Función para registrar la asistencia en Firebase Firestore, permitiendo múltiples entradas y salidas por día
async function registrarAsistencia() {
    const user = auth.currentUser;
    if (!user) return;

    const now = new Date();
    const hour = now.getHours();
    // Se formatea la fecha en formato YYYY-MM-DD para agrupar los registros diarios
    const fechaHoy = now.toISOString().split("T")[0];

    try {
        // Se consulta todos los registros de asistencia del usuario para el día de hoy
        const asistenciaQuery = await db.collection("asistencias")
            .where("userId", "==", user.uid)
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

        // Obtener el nombre del empleado desde la colección "usuarios"
        let nombreEmpleado = user.email; // Por defecto se usa el email
        const empleadoQuery = await db.collection("usuarios")
            .where("email", "==", user.email)
            .limit(1)
            .get();
        if (!empleadoQuery.empty) {
            nombreEmpleado = empleadoQuery.docs[0].data().nombre;
        }

        // Agregar un nuevo documento en "asistencias" con los datos del escaneo
        await db.collection("asistencias").add({
            userId: user.uid,
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