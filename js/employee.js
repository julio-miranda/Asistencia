// js/employee.js

// Coordenadas de la ubicación permitida y radio en metros (mantiene tu lógica)
const allowedLat = 13.622928;      
const allowedLng = -87.8959604;     
const allowedRadius = 10;         

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

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

// Verificar que el usuario esté autenticado y tenga rol "empleado"
checkUserAuth(async function (user) {
    const role = await getUserRole(user);
    if (role !== "empleado") {
        window.location.href = "index.html";
        return;
    }
});

// Cargar modelos y arrancar la cámara en el módulo de asistencia
const video = document.getElementById("video");
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('/models')
]).then(startVideo);

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => video.srcObject = stream)
    .catch(err => console.error("Error al acceder a la cámara:", err));
}

// Función para verificar el rostro y registrar asistencia
async function verifyFaceAndMarkAttendance() {
    const user = auth.currentUser;
    if (!user) return;

    // Obtener el descriptor facial almacenado en el registro del usuario
    const userDoc = await db.collection("usuarios").doc(user.uid).get();
    if (!userDoc.exists || !userDoc.data().faceDescriptor) {
         alert("No se encontró registro facial. Por favor, regístrate correctamente.");
         return;
    }
    const storedDescriptor = new Float32Array(userDoc.data().faceDescriptor);

    // Detectar rostro en tiempo real desde el video
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (detection) {
         const currentDescriptor = detection.descriptor;
         const distance = faceapi.euclideanDistance(storedDescriptor, currentDescriptor);
         // Umbral para considerar un match (puedes ajustarlo según pruebas)
         if (distance < 0.6) {
              // Si el rostro coincide, se verifica la ubicación
              checkLocation(
                () => {
                    registrarAsistencia();
                },
                (distLocation) => {
                    if (distLocation !== undefined) {
                        alert(`No estás en la ubicación permitida. Distancia detectada: ${distLocation.toFixed(2)} metros.`);
                    } else {
                        alert("No se pudo verificar la ubicación. Intenta nuevamente.");
                    }
                }
              );
         } else {
              alert("Rostro no coincide. Intenta de nuevo.");
         }
    } else {
         alert("No se pudo detectar tu rostro. Asegúrate de estar frente a la cámara.");
    }
}

// Función que registra la asistencia en Firestore (mantiene tu lógica previa)
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
        document.getElementById("result").innerHTML = `<p>${message}</p>`;
    } catch (error) {
        console.error("Error al registrar asistencia:", error);
    }
}

// Evento para verificar rostro y registrar asistencia
document.getElementById("verify-face").addEventListener("click", async () => {
    await verifyFaceAndMarkAttendance();
});

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