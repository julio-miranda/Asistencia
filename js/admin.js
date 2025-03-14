// ===================
// js/admin.js
// ===================

// ===================
// Verificación de Sesión Automática
// ===================

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Obtener datos de sesión y validar su existencia
    const sessionData = getSessionData();
    if (!sessionData) {
      console.warn("No hay sesión activa.");
      return redirectToLogin();
    }

    // Opcional: Extender la sesión si aún es válida
    refreshSession();

    const { uid } = sessionData;
    const userDocSnapshot = await db.collection("usuarios").doc(uid).get();

    if (!userDocSnapshot.exists) {
      console.warn("Usuario no encontrado en la base de datos.");
      return redirectToLogin();
    }

    const userData = userDocSnapshot.data();

    if (!userData.role) {
      console.warn("El usuario no tiene rol asignado.");
      return redirectToLogin();
    }

    // Verifica que el usuario tenga rol "admin"
    if (userData.role !== "admin") {
      return handleUnauthorizedRole(userData.role);
    }

    console.log("Usuario autorizado, cargando datos...");
    cargarEmpleados();
    cargarAsistencias();
  } catch (error) {
    console.error("Error en la verificación de sesión:", error);
    redirectToLogin();
  }
});

/**
 * Redirige al usuario a la página de login.
 */
function redirectToLogin() {
  window.location.href = "index.html";
}

/**
 * Redirige al usuario según su rol.
 * @param {string} role - Rol del usuario.
 */
function handleUnauthorizedRole(role) {
  // Si el rol es "empleado", redirige a employee.html; de lo contrario, vuelve al login.
  window.location.href = role === "empleado" ? "employee.html" : "index.html";
}

// ===================
// Funciones para manejo de DataTables y contenido
// ===================

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
  // Inicializar o destruir DataTable si ya existe
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

  // Limpiar la tabla antes de cargar nuevos datos
  empleadosTable.clear().draw();

  const empleadosSnapshot = await db.collection("usuarios").get();
  empleadosSnapshot.forEach(doc => {
    const data = doc.data();
    empleadosTable.row.add([
      data.nombre,
      data.identificacion || "",
      data.nacimiento || "",
      data.email,
      data.descripcion,
      `<button onclick="editarEmpleado('${doc.id}')" style="background-color:green;">Editar</button>
         <button onclick="eliminarEmpleado('${doc.id}')" style="background-color:red;">Eliminar</button>`
    ]);
  });

  // Dibujar la tabla con los nuevos datos
  empleadosTable.draw();
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
  asistenciasTable.clear().draw();
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

// ===================
// Funciones CRUD de Empleados y Asistencias
// ===================

// Eliminar un empleado (solo se elimina el documento en Firestore)
async function eliminarEmpleado(id) {
  if (!confirm("¿Estás seguro de eliminar este empleado?")) return;
  try {
    await db.collection("usuarios").doc(id).delete();
    alert("Empleado eliminado de la base de datos.");
    cargarEmpleados();
  } catch (error) {
    console.error("Error al eliminar empleado:", error.message);
    alert("Error al eliminar el empleado: " + error.message);
  }
}

// Eliminar una asistencia
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

// ===================
// Funciones de Perfil y Actualización
// ===================

// Mostrar el perfil del usuario actual (según uid en la cookie de sesión)
function verPerfil() {
  document.getElementById("navbar-links").classList.remove("active");
  const sessionData = getSessionData();
  if (sessionData) {
    const uid = sessionData.uid;
    const userRef = db.collection("usuarios").doc(uid);
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

// Mostrar/ocultar el campo de nueva contraseña en el perfil
document.getElementById("cambiar-contrasena").addEventListener("change", function () {
  const nuevaContrasenaContainer = document.getElementById("nueva-contrasena-container");
  nuevaContrasenaContainer.style.display = this.checked ? "block" : "none";
});

// Manejar el formulario para editar el perfil
document.getElementById("perfil-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sessionData = checkUserSession();
  if (!sessionData) return;
  const uid = sessionData.uid;
  const nuevoNombre = document.getElementById("nombre").value;
  const nuevoEmail = document.getElementById("email").value;
  const nuevaIdentificacion = document.getElementById("identificacion").value;
  const nuevaNacimiento = document.getElementById("nacimiento").value;
  const nuevaDescripcion = document.getElementById("descripcionp").value;
  const cambiarContrasena = document.getElementById("cambiar-contrasena").checked;
  const nuevaContrasena = document.getElementById("nueva-contrasena").value;
  const salarioH = document.getElementById("empleado-salario").value;
  try {
    const updateData = {
      nombre: nuevoNombre,
      email: nuevoEmail,
      identificacion: nuevaIdentificacion,
      nacimiento: nuevaNacimiento,
      descripcion: nuevaDescripcion,
      salarioH: salarioH
    };
    if (cambiarContrasena && nuevaContrasena) {
      // Encriptar la nueva contraseña usando encrypt_data
      updateData.password = encrypt_data(nuevaContrasena);
    }
    await db.collection("usuarios").doc(uid).update(updateData);
    alert("Perfil actualizado correctamente");
    window.location.href = "admin.html";
  } catch (error) {
    alert("Error al actualizar el perfil: " + error.message);
  }
});

// ===================
// Funciones para Agregar/Editar Empleados
// ===================

// Mostrar el formulario para agregar un nuevo empleado
function agregarEmpleado() {
  document.getElementById("empleado-container").style.display = 'block';
  document.getElementById("tabla-empleados").style.display = 'none';
  document.getElementById("tabla-asistencias").style.display = 'none';
  document.getElementById("planilla-container").style.display = 'none';
  document.getElementById("titulo-form-empleado").textContent = "Agregar Empleado";
  document.getElementById("empleado-form").reset();
}

// Cargar los datos del empleado en el formulario para editar
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

// Manejo del formulario para agregar o editar un empleado
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
  if (pass !== pass2) {
    alert("Las contraseñas no coinciden");
    return;
  }
  try {
    // Encriptar la contraseña del nuevo empleado usando encrypt_data
    const hashedPassword = encrypt_data(pass);
    // Crear el nuevo empleado en Firestore
    const newUserRef = await db.collection("usuarios").add({
      nombre: nombre,
      identificacion: identificacion,
      salarioH: salarioH,
      nacimiento: nacimiento,
      email: email,
      descripcion: descripcion || "Sin descripción",
      role: "empleado",
      password: hashedPassword
    });
    // Actualizar el documento con su propio ID como UID, si se requiere
    await db.collection("usuarios").doc(newUserRef.id).update({ UID: newUserRef.id });
    alert("Empleado agregado correctamente");
    window.location.href = "admin.html";
  } catch (error) {
    alert("Error al agregar el empleado: " + error.message);
  }
});

// Función para cancelar y volver a la vista principal
function cancelarFormulario() {
  window.location.href = "admin.html";
}

// ===================
// Funciones para la Planilla Semanal
// ===================

// Mostrar la planilla semanal y calcular en tiempo real
function mostrarPlanilla() {
  document.getElementById("navbar-links").classList.remove("active");
  document.getElementById("perfil-container").style.display = 'none';
  document.getElementById("empleado-container").style.display = 'none';
  document.getElementById("tabla-empleados").style.display = 'none';
  document.getElementById("tabla-asistencias").style.display = 'none';
  document.getElementById("planilla-container").style.display = 'block';
  calcularPlanillaSemanal(); // Configurar listener en tiempo real
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

  // Obtener las asistencias de la semana
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

          // Buscar el empleado correspondiente en la lista
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
  const contenido = document.getElementById("planilla-container").innerHTML;
  const ventanaImpresion = window.open('', '', 'height=600,width=800');
  ventanaImpresion.document.write('<html><head><title>Planilla Semanal</title>');
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

// Función auxiliar para combinar una fecha y una hora (se asume formato "HH:MM")
function crearFechaCompleta(fechaStr, timeStr) {
  const partes = timeStr.split(":");
  const fechaObj = new Date(fechaStr + "T00:00:00");
  fechaObj.setHours(parseInt(partes[0]), parseInt(partes[1]) || 0, 0, 0);
  return fechaObj;
}

// Función auxiliar para formatear una fecha a "YYYY-MM-DD"
function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const mes = ('0' + (dateObj.getMonth() + 1)).slice(-2);
  const dia = ('0' + dateObj.getDate()).slice(-2);
  return `${year}-${mes}-${dia}`;
}

// ===================
// Menú y Navegación
// ===================
let currentVisibleSectionId = null;

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menu-toggle");
  const navbarLinks = document.getElementById("navbar-links");

  menuToggle.addEventListener("click", function () {
    const isActive = navbarLinks.classList.contains("active");

    if (!isActive) {
      const sections = document.querySelectorAll(".form-container, .tabla-container, .planilla-container");
      sections.forEach(section => {
        if (window.getComputedStyle(section).display !== "none") {
          currentVisibleSectionId = section.id;
          section.style.display = "none";
        }
      });
      navbarLinks.classList.add("active");
    } else {
      navbarLinks.classList.remove("active");
      if (currentVisibleSectionId) {
        document.getElementById(currentVisibleSectionId).style.display = "block";
        currentVisibleSectionId = null;
      }
    }
  });
});

// ====================
// Evento para cerrar sesión
// ====================

document.addEventListener("DOMContentLoaded", function () {
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", function () {
      // Opción 1: Si ya tienes la función logout() definida en auth.js:
      logout();

      // Opción 2: Eliminar la sesión directamente de localStorage
      // localStorage.removeItem("session");
      // window.location.href = "index.html";
    });
  } else {
    console.error("El botón de cerrar sesión no se encontró en el DOM.");
  }
});
