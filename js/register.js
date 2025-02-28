// js/register.js

// Variable global para almacenar el descriptor facial
let faceDescriptor = null;

// Iniciar la cámara y cargar modelos de face-api.js
const video = document.getElementById("video");

async function startVideo() {
    try {
        // Solicitar acceso a la cámara
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        video.srcObject = stream;
    } catch (err) {
        console.error("Error al acceder a la cámara:", err);
    }
}

// Cargar modelos (asegúrate de tenerlos en la ruta /models)
Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
]).then(startVideo);

// Capturar el rostro al hacer clic en el botón
document.getElementById("capture-face").addEventListener("click", async () => {
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
    if (detection) {
        // Convertir el descriptor (Float32Array) a un arreglo para guardarlo
        faceDescriptor = Array.from(detection.descriptor);
        alert("Rostro capturado correctamente.");
    } else {
        alert("No se pudo detectar un rostro. Intenta de nuevo.");
    }
});

// Registro de usuario
document.getElementById("register-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const Nombre = document.getElementById("register-nombre").value;
    const numero = document.getElementById("register-numero").value;
    const Fecha = document.getElementById("register-Fecha").value;
    const email = document.getElementById("register-email").value;
    const pass = document.getElementById("register-password").value;
    const pass2 = document.getElementById("register-password2").value;
    const role = document.getElementById("register-role").value;

    if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
    }

    // Para empleados se requiere el reconocimiento facial
    if (role === "empleado" && !faceDescriptor) {
        alert("Por favor, captura tu rostro para continuar con el registro.");
        return;
    }

    try {
        // Si el usuario selecciona admin, se verifica que no exista uno previamente.
        if (role === "admin") {
            const adminQuery = await db.collection("usuarios").where("role", "==", "admin").get();
            if (!adminQuery.empty) {
                alert("Ya existe un administrador registrado.");
                return;
            }
        }

        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        // Guarda los datos del usuario en Firestore, incluyendo el descriptor facial si es empleado
        await db.collection("usuarios").doc(user.uid).set({
            nombre: Nombre,
            identificacion: numero,
            nacimiento: Fecha,
            email: email,
            descripcion: "Sin descripcion",
            salarioH: 1.25,
            role: role,
            faceDescriptor: role === "empleado" ? faceDescriptor : null
        });
        alert("Registro exitoso, ahora inicia sesión.");
        window.location.href = "index.html";
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById("go-to-login").addEventListener("click", e => {
    e.preventDefault();
    window.location.href = "index.html";
});