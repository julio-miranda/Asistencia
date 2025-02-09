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

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 2. Referencias a elementos HTML
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const employeeModule = document.getElementById('employee-module');
const adminModule = document.getElementById('admin-module');
const adminContent = document.getElementById('admin-content');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

const goToRegisterLink = document.getElementById('go-to-register');
const goToLoginLink = document.getElementById('go-to-login');

const scanQRButton = document.getElementById('scan-qr-button');
const qrResultDiv = document.getElementById('qr-result');

const logoutButton = document.getElementById('logout-button');
const logoutButtonAdmin = document.getElementById('logout-button-admin');

const viewAttendanceBtn = document.getElementById('view-attendance');
const manageEmployeesBtn = document.getElementById('manage-employees');

// 3. Navegación entre secciones
goToRegisterLink.addEventListener('click', e => {
    e.preventDefault();
    loginSection.style.display = "none";
    registerSection.style.display = "block";
});

goToLoginLink.addEventListener('click', e => {
    e.preventDefault();
    registerSection.style.display = "none";
    loginSection.style.display = "block";
});

// 4. Registro de Usuarios
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const pass = document.getElementById('register-password').value;
    const pass2 = document.getElementById('register-password2').value;
    const role = document.getElementById('register-role').value;

    if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
    }

    try {
        // Si se selecciona admin, verificamos que no exista ya uno
        if (role === "admin") {
            const adminQuery = await db.collection("usuarios").where("role", "==", "admin").get();
            if (!adminQuery.empty) {
                alert("Ya existe un administrador registrado.");
                return;
            }
        }

        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;

        // Guarda datos del usuario en Firestore
        await db.collection("usuarios").doc(user.uid).set({
            email: email,
            role: role
        });

        alert("Registro exitoso");
        registerForm.reset();
        registerSection.style.display = "none";
        loginSection.style.display = "block";
    } catch (error) {
        console.error("Error en registro:", error);
        alert(error.message);
    }
});

// 5. Login de Usuarios
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, pass);
        // Una vez autenticado, se redirige según el rol del usuario
        verificarRol(userCredential.user);
        loginForm.reset();
    } catch (error) {
        console.error("Error en login:", error);
        alert(error.message);
    }
});

// 6. Verificar rol del usuario autenticado
async function verificarRol(user) {
    try {
        const doc = await db.collection("usuarios").doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.role === "admin") {
                mostrarAdminModule();
            } else {
                mostrarEmployeeModule();
            }
        } else {
            alert("No se encontraron datos del usuario.");
        }
    } catch (error) {
        console.error("Error al verificar rol:", error);
    }
}

// 7. Mostrar módulos según el rol
function mostrarEmployeeModule() {
    loginSection.style.display = "none";
    registerSection.style.display = "none";
    adminModule.style.display = "none";
    employeeModule.style.display = "block";
}

function mostrarAdminModule() {
    loginSection.style.display = "none";
    registerSection.style.display = "none";
    employeeModule.style.display = "none";
    adminModule.style.display = "block";
    // Por defecto, se puede mostrar las asistencias:
    cargarAsistencias();
}

// 8. Función para “escanear” el QR (simulación)
scanQRButton.addEventListener('click', async () => {
    // En una implementación real, aquí se integraría un lector de QR.
    // Para efectos de este ejemplo se usa prompt() para simular el escaneo.
    const scannedText = prompt("Simula el escaneo del QR. Ingresa el texto del QR:");
    if (scannedText !== "J.M Asociados") {
        alert("QR incorrecto.");
        return;
    }
    // Si es el QR correcto, se procede a registrar la asistencia
    registrarAsistencia();
});

// 9. Registrar asistencia en Firestore
async function registrarAsistencia() {
    const user = auth.currentUser;
    if (!user) return;

    const now = new Date();
    const hora = now.getHours();
    const minutos = now.getMinutes();
    // Formateamos la fecha en formato YYYY-MM-DD para agrupar por día
    const fechaHoy = now.toISOString().split("T")[0];

    try {
        // Se busca si ya existe un registro de asistencia para hoy
        const asistenciaRef = db.collection("asistencias")
            .where("userId", "==", user.uid)
            .where("fecha", "==", fechaHoy);
        const snapshot = await asistenciaRef.get();

        if (snapshot.empty) {
            // Primera vez: registro de entrada
            let entradaStatus = "";
            if (hora < 8) {
                entradaStatus = "Llegada temprana";
            } else if (hora >= 8 && hora < 16) {
                entradaStatus = "Llegada tarde";
            } else {
                entradaStatus = "Hora de entrada fuera de horario";
            }

            await db.collection("asistencias").add({
                userId: user.uid,
                fecha: fechaHoy,
                entradaTime: now.toLocaleTimeString(),
                entradaStatus: entradaStatus,
                // Se deja la salida en null hasta que se registre
                salidaTime: null,
                salidaStatus: null
            });
            qrResultDiv.innerHTML = `<p>Entrada registrada a las ${now.toLocaleTimeString()} (${entradaStatus})</p>`;
        } else {
            // Ya existe registro para hoy; se asume que es el escaneo de salida
            // Solo se registra salida si aún no se registró
            let docAsistencia = null;
            snapshot.forEach(doc => {
                if (!doc.data().salidaTime) {
                    docAsistencia = doc;
                }
            });
            if (docAsistencia) {
                let salidaStatus = "";
                if (hora < 16) {
                    salidaStatus = "Salida temprana";
                } else {
                    salidaStatus = "Salida";
                }
                await docAsistencia.ref.update({
                    salidaTime: now.toLocaleTimeString(),
                    salidaStatus: salidaStatus
                });
                qrResultDiv.innerHTML = `<p>Salida registrada a las ${now.toLocaleTimeString()} (${salidaStatus})</p>`;
            } else {
                alert("Ya se registró la entrada y salida para hoy.");
            }
        }
    } catch (error) {
        console.error("Error al registrar asistencia:", error);
    }
}

// 10. Cerrar sesión
logoutButton.addEventListener('click', async () => {
    await auth.signOut();
    location.reload();
});
logoutButtonAdmin.addEventListener('click', async () => {
    await auth.signOut();
    location.reload();
});

// 11. Módulo de administrador: Ver asistencias y administrar empleados

// a) Cargar y mostrar asistencias en una tabla
async function cargarAsistencias() {
    try {
        const snapshot = await db.collection("asistencias").orderBy("fecha", "desc").get();
        let html = "<h3>Historial de Asistencias</h3>";
        html += `<table>
        <tr>
          <th>Empleado</th>
          <th>Fecha</th>
          <th>Entrada</th>
          <th>Estado Entrada</th>
          <th>Salida</th>
          <th>Estado Salida</th>
        </tr>`;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Obtener el email del empleado consultando la colección "usuarios"
            let userDoc = await db.collection("usuarios").doc(data.userId).get();
            const email = userDoc.exists ? userDoc.data().email : "Desconocido";

            html += `<tr>
          <td>${email}</td>
          <td>${data.fecha}</td>
          <td>${data.entradaTime || "-"}</td>
          <td>${data.entradaStatus || "-"}</td>
          <td>${data.salidaTime || "-"}</td>
          <td>${data.salidaStatus || "-"}</td>
        </tr>`;
        }
        html += "</table>";
        adminContent.innerHTML = html;
    } catch (error) {
        console.error("Error al cargar asistencias:", error);
    }
}

// b) Administrar empleados: mostrar listado
async function cargarEmpleados() {
    try {
        const snapshot = await db.collection("usuarios").get();
        let html = "<h3>Listado de Empleados</h3>";
        html += `<table>
        <tr>
          <th>Correo</th>
          <th>Rol</th>
        </tr>`;
        snapshot.forEach(doc => {
            const data = doc.data();
            html += `<tr>
          <td>${data.email}</td>
          <td>${data.role}</td>
        </tr>`;
        });
        html += "</table>";
        adminContent.innerHTML = html;
    } catch (error) {
        console.error("Error al cargar empleados:", error);
    }
}

// Eventos para botones del administrador
viewAttendanceBtn.addEventListener('click', cargarAsistencias);
manageEmployeesBtn.addEventListener('click', cargarEmpleados);

// 12. Estado de autenticación: si el usuario ya está logueado, se muestra su módulo
auth.onAuthStateChanged(user => {
    if (user) {
        verificarRol(user);
    } else {
        // No hay usuario autenticado
        loginSection.style.display = "block";
        registerSection.style.display = "none";
        employeeModule.style.display = "none";
        adminModule.style.display = "none";
    }
});  