// Suponiendo que Firebase ya está inicializado y 'db' es la referencia a Firestore.
// También se asume que la autenticación y demás funciones (logout, etc.) están definidas.

// Verifica si el usuario está autenticado y tiene el rol "admin"
firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) {
        // Si no está autenticado, redirige a la página de login
        window.location.href = "index.html";
        return;
    }

    // Consulta el rol del usuario en Firestore
    const doc = await db.collection("usuarios").doc(user.uid).get();
    if (doc.exists) {
        const role = doc.data().role;
        if (role !== "admin") {
            // Si el rol no es "admin", redirige a otra página
            window.location.href = "index.html";
        } else if (role == "empleado") {
            // Si el rol es "empleado", redirige a otra página
            window.location.href = "employee.html";
        }
    } else {
        alert("No se encontraron datos del usuario.");
        window.location.href = "index.html";
    }
});

// Al cargar la página, se cargan ambas tablas
// Se asume que Firebase ya se inicializó en firebase-config.js y que 'db' y 'auth' están disponibles.

$(document).ready(function () {
    cargarEmpleados();
    cargarAsistencias();
});

// Función para mostrar/ocultar secciones
function mostrarTabla(tabla) {
    document.getElementById("navbar-links").classList.remove("active");
    document.getElementById("perfil-container").style.display = 'none';
    document.getElementById("empleado-container").style.display = 'none';
    document.getElementById("planilla-container").style.display = 'none';
    document.getElementById("tabla-empleados").style.display = (tabla === "empleados") ? "block" : "none";
    document.getElementById("tabla-asistencias").style.display = (tabla === "asistencias") ? "block" : "none";
    if (tabla === "asistencias") {
        setTimeout(function () {
            $('#asistenciasTable').DataTable().columns.adjust().draw();
        }, 100);
    }
}

// Cargar la tabla de empleados
async function cargarEmpleados() {
    const empleadosTable = $("#empleadosTable").DataTable({
        scrollX: true,
        destroy: true,
        autoWidth: false,
        paging: true,
        searching: true,
        ordering: true,
        language: {
            "lengthMenu": "Mostrar _MENU_ Empleados",
            "zeroRecords": "No se encontraron resultados",
            "info": "Mostrando _START_ a _END_ de _TOTAL_ Empleados",
            "infoFiltered": "(filtrado de _MAX_ total)",
            "search": "Buscar:",
            paginate: {
                first: "Primero",
                last: "Último",
                next: "Siguiente",
                previous: "Anterior"
            }
        }
    });

    const empleadosSnapshot = await db.collection("usuarios").get();
    empleadosSnapshot.forEach(doc => {
        const data = doc.data();
        empleadosTable.row.add([
            data.nombre,
            data.identificacion || "",
            data.nacimiento || "",
            data.email,
            `<button onclick="editarEmpleado('${doc.id}')" style="background-color:green;">Editar</button>
       <button onclick="eliminarEmpleado('${doc.id}')" style="background-color:red;">Eliminar</button>`
        ]).draw();
    });
}

// Cargar la tabla de asistencias
async function cargarAsistencias() {
    const asistenciasTable = $("#asistenciasTable").DataTable({
        scrollX: true,
        destroy: true,
        autoWidth: false,
        paging: true,
        searching: true,
        ordering: true,
        language: {
            "lengthMenu": "Mostrar _MENU_ registros",
            "zeroRecords": "No se encontraron resultados",
            "info": "Mostrando _START_ a _END_ de _TOTAL_ registros",
            "infoFiltered": "(filtrado de _MAX_ total)",
            "search": "Buscar:",
            paginate: {
                first: "Primero",
                last: "Último",
                next: "Siguiente",
                previous: "Anterior"
            }
        },
        columnDefs: [
            { targets: 0, width: "150px", className: "dt-center" },
            { targets: 1, width: "120px", className: "dt-center" },
            { targets: 2, width: "80px", className: "dt-center" },
            { targets: 3, width: "120px", className: "dt-center" },
            { targets: 4, width: "150px", className: "dt-center" },
            { targets: 5, width: "150px", className: "dt-center" },
            { targets: 6, width: "180px", className: "dt-center" }
        ]
    });

    const asistenciasSnapshot = await db.collection("asistencias").get();
    asistenciasSnapshot.forEach(doc => {
        const data = doc.data();
        asistenciasTable.row.add([
            data.user,
            data.fecha,
            data.scanNumber || "N/A",
            data.tipo || "N/A",
            data.time || "No registrado",
            data.status || "N/A",
            `<button onclick="eliminarAsistencia('${doc.id}')" style="background-color:red;">Eliminar</button>`
        ]).draw();
    });
}

// Función asíncrona para eliminar un empleado
function eliminarEmpleado(id) {
    // Confirmar eliminación
    if (!confirm("¿Estás seguro de eliminar este empleado?")) return;

    try {
        // 1. Eliminar el empleado de Firestore
        db.collection("usuarios").doc(id).delete();
        alert("Empleado eliminado de la base de datos.");

        // 2. Intentar eliminar al usuario de Authentication (solo si es el usuario actual)
        try {
            auth.doc(id).delete();
            alert("El usuario también ha sido eliminado de la autenticación.");
            // 3. Recargar la tabla después de eliminar
            cargarEmpleados();
        } catch (authError) {
            console.error("Error al eliminar usuario de Authentication:", authError.message);
        }
    } catch (error) {
        console.error("Error al eliminar empleado:", error.message);
        alert("Error al eliminar el empleado: " + error.message);
    }
}


// Función para eliminar una asistencia
async function eliminarAsistencia(id) {
    if (confirm("¿Estás seguro de eliminar esta asistencia?")) {
        try {
            await db.collection("asistencias").doc(id).delete();
            alert("Asistencia eliminada correctamente");
            cargarAsistencias();
        } catch (error) {
            alert("Error al eliminar la asistencia: " + error.message);
        }
    }
}

// Evento para cerrar sesión
document.getElementById("logout-button").addEventListener("click", function () {
    logout();
});

// Función para ver el perfil del usuario
function verPerfil() {
    document.getElementById("navbar-links").classList.remove("active");
    const user = firebase.auth().currentUser;
    if (user) {
        const userRef = db.collection("usuarios").doc(user.uid);
        userRef.get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById("nombre").value = data.nombre || '';
                document.getElementById("email").value = data.email || '';
                document.getElementById("identificacion").value = data.identificacion || '';
                document.getElementById("nacimiento").value = data.nacimiento || '';
                document.getElementById("empleado-salario").value = data.salarioH || '';
                document.getElementById("descripcionp").value = data.descripcion || '';
                document.getElementById("perfil-container").style.display = 'block';
                document.getElementById("tabla-empleados").style.display = 'none';
                document.getElementById("tabla-asistencias").style.display = 'none';
                document.getElementById("planilla-container").style.display = 'none';
            }
        });
    }
}

// Mostrar/ocultar campo de nueva contraseña
document.getElementById("cambiar-contrasena").addEventListener("change", function () {
    const nuevaContrasenaContainer = document.getElementById("nueva-contrasena-container");
    nuevaContrasenaContainer.style.display = this.checked ? "block" : "none";
});

// Manejo del formulario de editar perfil
document.getElementById("perfil-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = firebase.auth().currentUser;
    const nuevoNombre = document.getElementById("nombre").value;
    const nuevoEmail = document.getElementById("email").value;
    const nuevaIdentificacion = document.getElementById("identificacion").value;
    const nuevaNacimiento = document.getElementById("nacimiento").value;
    const nuevaDescripcion = document.getElementById("descripcionp").value;
    const cambiarContrasena = document.getElementById("cambiar-contrasena").checked;
    const nuevaContrasena = document.getElementById("nueva-contrasena").value;
    const salarioH = document.getElementById("empleado-salario").value;
    try {
        await db.collection("usuarios").doc(user.uid).update({
            nombre: nuevoNombre,
            email: nuevoEmail,
            identificacion: nuevaIdentificacion,
            nacimiento: nuevaNacimiento,
            descripcion: nuevaDescripcion,
            salarioH: salarioH
        });
        if (cambiarContrasena && nuevaContrasena) {
            await user.updatePassword(nuevaContrasena);
        }
        alert("Perfil actualizado correctamente");
        window.location.href = "admin.html";
    } catch (error) {
        alert("Error al actualizar el perfil: " + error.message);
    }
});

// Función para cancelar formularios
function cancelarFormulario() {
    window.location.href = "admin.html";
}

// Función para agregar empleado
function agregarEmpleado() {
    document.getElementById("empleado-container").style.display = 'block';
    document.getElementById("tabla-empleados").style.display = 'none';
    document.getElementById("tabla-asistencias").style.display = 'none';
    document.getElementById("planilla-container").style.display = 'none';
    document.getElementById("titulo-form-empleado").textContent = "Agregar Empleado";
    document.getElementById("empleado-form").reset();
}

// Función para editar empleado
async function editarEmpleado(id) {
    const docRef = db.collection("usuarios").doc(id);
    const doc = await docRef.get();
    if (doc.exists) {
        const data = doc.data();
        document.getElementById("empleado-nombre").value = data.nombre;
        document.getElementById("empleado-email").value = data.email;
        document.getElementById("empleado-identificacion").value = data.identificacion;
        document.getElementById("empleado-salario").value = data.salarioH;
        document.getElementById("empleado-nacimiento").value = data.nacimiento;
        document.getElementById("descripcion").value = data.descripcion;
        document.getElementById("empleado-container").style.display = 'block';
        document.getElementById("tabla-empleados").style.display = 'none';
        document.getElementById("tabla-asistencias").style.display = 'none';
        document.getElementById("planilla-container").style.display = 'none';
        document.getElementById("titulo-form-empleado").textContent = "Editar Empleado";
    }
}

// Manejo del formulario para agregar/editar empleado
document.getElementById("empleado-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("empleado-nombre").value;
    const email = document.getElementById("empleado-email").value;
    const identificacion = document.getElementById("empleado-identificacion").value;
    const salarioH = document.getElementById("empleado-salario").value;
    const nacimiento = document.getElementById("empleado-nacimiento").value;
    const descripcion = document.getElementById("descripcion").value;
    const pass = document.getElementById("register-password").value;
    const pass2 = document.getElementById("register-password2").value;
    try {
        if (pass !== pass2) {
            alert("Las contraseñas no coinciden");
            return;
        }
        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        await db.collection("usuarios").doc(user.uid).set({
            nombre: nombre,
            identificacion: identificacion,
            salarioH: salarioH,
            nacimiento: nacimiento,
            email: email,
            descripcion: descripcion || "Sin descripción",
            role: "empleado",
            UID: user.uid
        });
        alert("Empleado agregado correctamente");
        window.location.href = "admin.html";
    } catch (error) {
        alert("Error al agregar el empleado: " + error.message);
    }
});

// ─── PLANILLA SEMANAL CON ACTUALIZACIÓN EN TIEMPO REAL E IMPRESIÓN ─────────────

// Función para mostrar la planilla semanal y calcular en tiempo real
function mostrarPlanilla() {
    document.getElementById("navbar-links").classList.remove("active");
    document.getElementById("perfil-container").style.display = 'none';
    document.getElementById("empleado-container").style.display = 'none';
    document.getElementById("tabla-empleados").style.display = 'none';
    document.getElementById("tabla-asistencias").style.display = 'none';
    document.getElementById("planilla-container").style.display = 'block';
    calcularPlanillaSemanal(); // Se configura el listener en tiempo real
}

function calcularPlanillaSemanal() {
    const tbody = document.querySelector("#planillaTable tbody");
    tbody.innerHTML = '';

    // Determinar el inicio (lunes) y fin (domingo) de la semana actual
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const diffLunes = (diaSemana === 0) ? -6 : (1 - diaSemana);
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + diffLunes);
    lunes.setHours(0, 0, 0, 0);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    // Obtener asistencias de la semana
    db.collection("asistencias")
        .where("fecha", ">=", formatDate(lunes))
        .where("fecha", "<=", formatDate(domingo))
        .onSnapshot(snapshot => {
            const planilla = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const empleadoId = data.user;
                if (!planilla[empleadoId]) {
                    planilla[empleadoId] = {};
                }
                const fecha = data.fecha;
                if (!planilla[empleadoId][fecha]) {
                    planilla[empleadoId][fecha] = [];
                }
                planilla[empleadoId][fecha].push(data);
            });

            // Obtener información de empleados
            db.collection("usuarios").get().then(empSnapshot => {
                const empleados = [];
                empSnapshot.forEach(doc => {
                    empleados.push({ id: doc.id, ...doc.data() });
                });

                tbody.innerHTML = '';
                for (const empleadoId in planilla) {
                    let totalNormal = 0;
                    let totalExtra = 0;
                    for (const fecha in planilla[empleadoId]) {
                        const registros = planilla[empleadoId][fecha];
                        const entradas = registros.filter(r => r.tipo === "entrada");
                        const salidas = registros.filter(r => r.tipo === "salida");
                        if (entradas.length === 0 || salidas.length === 0) continue;
                        entradas.sort((a, b) => a.time.localeCompare(b.time));
                        salidas.sort((a, b) => a.time.localeCompare(b.time));
                        const horaEntrada = crearFechaCompleta(fecha, entradas[0].time);
                        const horaSalida = crearFechaCompleta(fecha, salidas[salidas.length - 1].time);
                        const corte = new Date(horaEntrada);
                        corte.setHours(16, 0, 0, 0);

                        let horasNormales = 0;
                        let horasExtras = 0;
                        if (horaSalida <= corte) {
                            horasNormales = (horaSalida - horaEntrada) / (1000 * 60 * 60);
                        } else if (horaEntrada < corte) {
                            horasNormales = (corte - horaEntrada) / (1000 * 60 * 60);
                            horasExtras = (horaSalida - corte) / (1000 * 60 * 60);
                        } else {
                            horasExtras = (horaSalida - horaEntrada) / (1000 * 60 * 60);
                        }
                        totalNormal += horasNormales;
                        totalExtra += horasExtras;
                    }
                    totalNormal = Math.round(totalNormal * 100) / 100;
                    totalExtra = Math.round(totalExtra * 100) / 100;
                    const totalHoras = totalNormal + totalExtra;

                    // Buscar el empleado correspondiente en la lista de empleados
                    const empleado = empleados.find(emp => emp.id === empleadoId || emp.nombre === empleadoId) || {};
                    const salarioH = empleado.salarioH || 0;
                    const totalPagar = Math.round(totalHoras * salarioH * 100) / 100;

                    if (totalHoras > 0) {
                        const tr = document.createElement("tr");
                        tr.innerHTML = `
          <td>${empleado.nombre || 'Desconocido'}</td>
          <td>${empleado.identificacion || 'N/A'}</td>
          <td>${totalNormal}</td>
          <td>${totalExtra}</td>
          <td>${totalHoras}</td>
          <td>$ ${totalPagar}</td>
        `;
                        tbody.appendChild(tr);
                    }
                }
            });
        });
}



// Función para imprimir la planilla
function imprimirPlanilla() {
    // Obtener el contenido de la planilla
    const contenido = document.getElementById("planilla-container").innerHTML;
    // Abrir una nueva ventana para la impresión
    const ventanaImpresion = window.open('', '', 'height=600,width=800');
    ventanaImpresion.document.write('<html><head><title>Planilla Semanal</title>');
    // Incluir estilos necesarios para la impresión (puedes agregar más si es necesario)
    ventanaImpresion.document.write('<link rel="stylesheet" href="css/admin.css" />');
    ventanaImpresion.document.write('<link rel="stylesheet" href="https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css">');
    ventanaImpresion.document.write('<style>body{font-family: "Poppins", sans-serif; padding: 20px;} table {width: 100%; border-collapse: collapse;} th, td {border: 1px solid #ddd; padding: 8px; text-align: center;} th {background-color: #007bff; color: white;}</style>');
    ventanaImpresion.document.write('</head><body>');
    ventanaImpresion.document.write(contenido);
    ventanaImpresion.document.write('</body></html>');
    ventanaImpresion.document.close();
    ventanaImpresion.focus();
    ventanaImpresion.print();
    ventanaImpresion.close();
}

// Función auxiliar para combinar fecha y hora (se espera que 'time' tenga formato "HH:MM")
function crearFechaCompleta(fechaStr, timeStr) {
    const partes = timeStr.split(":");
    const fechaObj = new Date(fechaStr + "T00:00:00");
    fechaObj.setHours(parseInt(partes[0]), parseInt(partes[1]) || 0, 0, 0);
    return fechaObj;
}

// Función auxiliar para formatear fecha (YYYY-MM-DD)
function formatDate(dateObj) {
    const year = dateObj.getFullYear();
    const mes = ('0' + (dateObj.getMonth() + 1)).slice(-2);
    const dia = ('0' + dateObj.getDate()).slice(-2);
    return `${year}-${mes}-${dia}`;
}

// Variable global para almacenar el id de la sección que estaba visible antes de abrir el menú
let currentVisibleSectionId = null;

document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.getElementById("menu-toggle");
    const navbarLinks = document.getElementById("navbar-links");

    menuToggle.addEventListener("click", function () {
        const isActive = navbarLinks.classList.contains("active");

        if (!isActive) {
            // Al abrir el menú, recorremos todas las secciones para detectar la visible
            const sections = document.querySelectorAll(".form-container, .tabla-container, .planilla-container");
            sections.forEach(section => {
                // Usamos getComputedStyle para asegurar que obtenemos el valor real de 'display'
                if (window.getComputedStyle(section).display !== "none") {
                    // Guardamos el id de la sección visible
                    currentVisibleSectionId = section.id;
                    // Ocultamos la sección
                    section.style.display = "none";
                }
            });
            // Mostramos el menú a pantalla completa
            navbarLinks.classList.add("active");
        } else {
            // Al cerrar el menú, quitamos la clase 'active'
            navbarLinks.classList.remove("active");
            // Restauramos la sección que estaba visible (si se almacenó)
            if (currentVisibleSectionId) {
                document.getElementById(currentVisibleSectionId).style.display = "block";
                currentVisibleSectionId = null;
            }
        }
    });
});