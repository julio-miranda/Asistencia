// app.js

// === CONFIGURACIÓN DE FIREBASE ===
// Reemplaza estos valores con los de tu proyecto Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD5AzdqX-y7RLIpInc-Rqh12eCdbkyUHK4",
    authDomain: "asistencia-jm-asociados.firebaseapp.com",
    projectId: "asistencia-jm-asociados",
    storageBucket: "asistencia-jm-asociados.firebasestorage.app",
    messagingSenderId: "167727595796",
    appId: "1:167727595796:web:21ef39c8e9986a7ecf8201",
    measurementId: "G-2J5SJF1L2S"
    // ... otros parámetros según tu configuración
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// === REFERENCIAS A ELEMENTOS DEL DOM ===
const authContainer = document.getElementById("auth-container");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const showRegisterLink = document.getElementById("show-register");
const showLoginLink = document.getElementById("show-login");
const registerSection = document.getElementById("register-section");

const employeeDashboard = document.getElementById("employee-dashboard");
const adminDashboard = document.getElementById("admin-dashboard");

const userEmailSpan = document.getElementById("user-email");
const adminEmailSpan = document.getElementById("admin-email");

const logoutButton = document.getElementById("logout-button");
const logoutButtonAdmin = document.getElementById("logout-button-admin");

const scanResultP = document.getElementById("scan-result");

let html5QrcodeScanner; // Variable para el objeto del lector QR

// Nombre de la empresa (debe coincidir con el texto que contenga el código QR)
const COMPANY_NAME = "JM Asociados";

// === MOSTRAR/OCULTAR SECCIONES DE AUTENTICACIÓN ===
showRegisterLink.addEventListener("click", (e) => {
    e.preventDefault();
    registerSection.style.display = "block";
    loginForm.style.display = "none";
});

showLoginLink.addEventListener("click", (e) => {
    e.preventDefault();
    registerSection.style.display = "none";
    loginForm.style.display = "block";
});

// === REGISTRO DE USUARIO ===
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    const role = document.getElementById("register-role").value; // "employee" o "admin"

    try {
        if (role === "admin") {
            // Verificar que no exista ya un administrador
            const adminQuery = await db.collection("users").where("role", "==", "admin").get();
            if (!adminQuery.empty) {
                alert("Ya existe un administrador registrado.");
                return;
            }
        }

        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        // Guardar información adicional en Firestore
        await db.collection("users").doc(user.uid).set({
            email: email,
            role: role
        });
        alert("Registro exitoso");
    } catch (error) {
        console.error("Error en el registro:", error);
        alert("Error en el registro: " + error.message);
    }
});

// === INICIO DE SESIÓN ===
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error("Error en el inicio de sesión:", error);
        alert("Error en el inicio de sesión: " + error.message);
    }
});

// === ESCUCHAR CAMBIOS DE AUTENTICACIÓN ===
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Recuperar el rol del usuario desde Firestore
        const userDoc = await db.collection("users").doc(user.uid).get();
        const userData = userDoc.data();
        authContainer.style.display = "none";
        if (userData.role === "admin") {
            adminDashboard.style.display = "block";
            adminEmailSpan.textContent = user.email;
            loadAttendanceRecords();
        } else {
            employeeDashboard.style.display = "block";
            userEmailSpan.textContent = user.email;
            startQRScanner();
        }
    } else {
        // Usuario desconectado: mostrar formulario de autenticación
        authContainer.style.display = "block";
        employeeDashboard.style.display = "none";
        adminDashboard.style.display = "none";
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear();
        }
    }
});

// === FUNCIONES DE CERRAR SESIÓN ===
logoutButton.addEventListener("click", () => {
    auth.signOut();
});

logoutButtonAdmin.addEventListener("click", () => {
    auth.signOut();
});

// === FUNCIONES PARA EL ESCANEO DEL CÓDIGO QR ===
function startQRScanner() {
    const qrReaderElementId = "qr-reader";
    html5QrcodeScanner = new Html5Qrcode(qrReaderElementId);
    const config = { fps: 10, qrbox: 250 };

    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        qrCodeSuccessCallback
    ).catch((err) => {
        console.error("Error iniciando el escáner QR:", err);
    });
}

// Esta función se ejecuta cuando se detecta un código QR correctamente
function qrCodeSuccessCallback(decodedText, decodedResult) {
    console.log(`Código QR escaneado: ${decodedText}`);
    // Detener el escaneo para procesar el dato
    html5QrcodeScanner.stop().then(() => {
        processQR(decodedText);
    }).catch((err) => {
        console.error("Error al detener el escáner:", err);
    });
}

// Procesar el código QR escaneado y registrar la asistencia
async function processQR(scannedText) {
    if (scannedText !== COMPANY_NAME) {
        alert("Código QR inválido.");
        startQRScanner();
        return;
    }

    // Obtener fecha y hora actuales
    const now = new Date();
    const currentHour = now.getHours();
    const currentTimeStr = now.toLocaleTimeString();
    const dateStr = now.toISOString().split('T')[0]; // Formato: YYYY-MM-DD

    const user = auth.currentUser;
    if (!user) {
        alert("No hay usuario autenticado.");
        return;
    }

    // Se usará un documento único por usuario y día: uid_fecha
    const attendanceRef = db.collection("attendance").doc(user.uid + "_" + dateStr);
    const attendanceDoc = await attendanceRef.get();

    if (!attendanceDoc.exists) {
        // Primer escaneo del día: registro de llegada
        let llegada = "";
        if (currentHour < 8) {
            llegada = "Llegó temprano";
        } else if (currentHour >= 8 && currentHour <= 16) {
            llegada = "Llegó tarde";
        } else {
            llegada = "Hora de llegada fuera de rango";
        }
        await attendanceRef.set({
            userId: user.uid,
            email: user.email,
            date: dateStr,
            arrivalTime: currentTimeStr,
            llegada: llegada,
            exitTime: null,
            salida: null
        });
        scanResultP.textContent = `Registro de llegada: ${llegada} a las ${currentTimeStr}`;
    } else {
        // Segundo escaneo del día: registro de salida (si no se ha registrado aún)
        const data = attendanceDoc.data();
        if (data.exitTime) {
            alert("Ya se registró la salida para hoy.");
            startQRScanner();
            return;
        }
        let salida = "";
        if (currentHour >= 8 && currentHour <= 16) {
            salida = "Salió";
        } else {
            salida = "Salió temprano";
        }
        await attendanceRef.update({
            exitTime: currentTimeStr,
            salida: salida
        });
        scanResultP.textContent = `Registro de salida: ${salida} a las ${currentTimeStr}`;
    }
    // Reiniciar el escáner después de unos segundos para el próximo uso
    setTimeout(() => {
        startQRScanner();
    }, 3000);
}

// === FUNCIONES PARA EL MÓDULO DE ADMINISTRADOR ===
// Cargar y mostrar en una tabla los registros de asistencia
async function loadAttendanceRecords() {
    const tableBody = document.querySelector("#attendance-table tbody");
    tableBody.innerHTML = ""; // Limpiar registros previos

    try {
        const attendanceSnapshot = await db.collection("attendance").orderBy("date", "desc").get();
        attendanceSnapshot.forEach(doc => {
            const data = doc.data();
            const row = document.createElement("tr");
            row.innerHTML = `
          <td>${data.email || ""}</td>
          <td>${data.date || ""}</td>
          <td>${data.arrivalTime || ""}</td>
          <td>${data.llegada || ""}</td>
          <td>${data.exitTime || ""}</td>
          <td>${data.salida || ""}</td>
        `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error cargando registros de asistencia:", error);
    }
}
