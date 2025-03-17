// ===================
// admin.js
// ===================

// Variables globales para almacenar la empresa y sucursal del admin
let adminEmpresa = "";
let adminSucursal = "";

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

    // Verificar que el usuario tenga rol "admin"
    if (userData.role !== "admin") {
      return handleUnauthorizedRole(userData.role);
    }

    // Asignar la empresa y sucursal del admin para filtrar datos
    adminEmpresa = userData.empresa;
    adminSucursal = userData.sucursal;

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
  window.location.href = role === "empleado" ? "employee.html" : "index.html";
}

// ===================
// Funciones para manejo de DataTables y contenido
// ===================

/**
 * Muestra u oculta las secciones según el parámetro recibido.
 * @param {string} tabla - "empleados" o "asistencias"
 */
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

// Cargar la tabla de empleados filtrando por empresa, sucursal y rol "empleado"
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

  empleadosTable.clear().draw();

  // Consulta filtrada por empresa, sucursal y rol "empleado"
  const empleadosSnapshot = await db.collection("usuarios")
    .where("empresa", "==", adminEmpresa)
    .where("sucursal", "==", adminSucursal)
    .where("role", "==", "empleado")
    .get();

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

  empleadosTable.draw();
}

// Cargar la tabla de asistencias filtrando por empresa, sucursal y rango de fechas (semana actual)
// Función para cargar la tabla de asistencias filtrada por fecha y sucursal
async function cargarAsistencias() {
  const asistenciasTable = $("#asistenciasTable").DataTable({
    scrollX: true,
    destroy: true,
    autoWidth: false,
    paging: true,
    searching: true,
    ordering: true,
    language: {
      lengthMenu: "Mostrar _MENU_ registros",
      zeroRecords: "No se encontraron resultados",
      info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
      infoFiltered: "(filtrado de _MAX_ total)",
      search: "Buscar:",
      paginate: {
        first: "Primero",
        last: "Último",
        next: "Siguiente",
        previous: "Anterior",
      },
    },
  });

  asistenciasTable.clear().draw();

  // Calcular el rango de fechas de la semana actual
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diffLunes);
  lunes.setHours(0, 0, 0, 0);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);

  // Obtener todos los empleados (fuera de la consulta de asistencias)
  const empleados = await db.collection("usuarios").get().then(empSnapshot => {
    return empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });

  // Obtener todas las asistencias para el rango de fechas (sin filtrar por fecha aún)
  db.collection("asistencias").onSnapshot((snapshot) => {
    const planilla = {};

    snapshot.forEach((doc) => {
      const data = doc.data();
      
      // Filtrar por empresa, sucursal y semana actual
      if (
        data.empresa === adminEmpresa &&
        data.sucursal === adminSucursal &&
        new Date(data.fecha) >= lunes &&
        new Date(data.fecha) <= domingo
      ) {
        const empleadoId = data.user;
        if (!planilla[empleadoId]) {
          planilla[empleadoId] = {};
        }
        const fecha = data.fecha;
        if (!planilla[empleadoId][fecha]) {
          planilla[empleadoId][fecha] = [];
        }
        planilla[empleadoId][fecha].push(data);
      }
    });

    // Crear la tabla de asistencias
    const tbody = document.querySelector("#asistenciasTable tbody");
    tbody.innerHTML = "";

    // Iterar sobre cada empleado y procesar las asistencias
    for (const empleadoId in planilla) {
      let totalNormal = 0;
      let totalExtra = 0;

      for (const fecha in planilla[empleadoId]) {
        const registros = planilla[empleadoId][fecha];
        const entradas = registros.filter((r) => r.tipo === "entrada");
        const salidas = registros.filter((r) => r.tipo === "salida");

        if (entradas.length === 0 || salidas.length === 0) continue;

        entradas.sort((a, b) => a.time.localeCompare(b.time));
        salidas.sort((a, b) => a.time.localeCompare(b.time));

        const horaEntrada = crearFechaCompleta(fecha, entradas[0].time);
        const horaSalida = crearFechaCompleta(fecha, salidas[salidas.length - 1].time);
        const corte = new Date(horaEntrada);
        corte.setHours(16, 0, 0, 0);

        let horasNormales = 0;
        let horasExtras = 0;

        // Calcular horas normales y extras
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

      // Buscar el empleado en la lista de empleados
      const empleado = empleados.find(emp => emp.id === empleadoId);
      const salarioH = empleado ? empleado.salarioH : 0;
      const totalPagar = Math.round(totalHoras * salarioH * 100) / 100;

      if (totalHoras > 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${empleado ? empleado.nombre : "Desconocido"}</td>
          <td>${empleado ? empleado.identificacion : "N/A"}</td>
          <td>${totalNormal}</td>
          <td>${totalExtra}</td>
          <td>${totalHoras}</td>
          <td>$ ${totalPagar}</td>
        `;
        tbody.appendChild(tr);
      }
    }
  });
}

// ===================
// Funciones CRUD de Empleados y Asistencias
// ===================

// Eliminar un empleado (se elimina el documento en Firestore)
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

// Mostrar el perfil del usuario actual
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
    const hashedPassword = encrypt_data(pass);
    // Crear el nuevo empleado en Firestore e incluir empresa y sucursal del admin
    const newUserRef = await db.collection("usuarios").add({
      nombre: nombre,
      identificacion: identificacion,
      salarioH: salarioH,
      nacimiento: nacimiento,
      email: email,
      descripcion: descripcion || "Sin descripción",
      role: "empleado",
      password: hashedPassword,
      empresa: adminEmpresa,
      sucursal: adminSucursal
    });
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
  calcularPlanillaSemanal();
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

  // Convertir fechas a formato comparable
  const fechaInicio = formatDate(lunes);
  const fechaFin = formatDate(domingo);

  // Obtener todas las asistencias de la empresa y sucursal (sin filtrar por fecha aún)
  db.collection("asistencias")
    .where("empresa", "==", adminEmpresa)
    .where("sucursal", "==", adminSucursal)
    .onSnapshot(snapshot => {
      const planilla = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        const fecha = data.fecha;

        // Filtrar en el cliente por la semana actual
        if (fecha >= fechaInicio && fecha <= fechaFin) {
          const empleadoId = data.user;
          if (!planilla[empleadoId]) {
            planilla[empleadoId] = {};
          }
          if (!planilla[empleadoId][fecha]) {
            planilla[empleadoId][fecha] = [];
          }
          planilla[empleadoId][fecha].push(data);
        }
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
      logout();
    });
  } else {
    console.error("El botón de cerrar sesión no se encontró en el DOM.");
  }
});
