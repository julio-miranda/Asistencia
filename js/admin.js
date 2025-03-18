// ===================
// admin.js
// ===================

// Variables globales para almacenar la empresa y sucursal del admin
let adminEmpresa = "";
let adminSucursal = "";

// Variable global para determinar si se está editando un empleado (almacena el ID) o se está agregando uno nuevo.
let currentEditingEmployeeId = null;

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
  document.getElementById("perfil-container").style.display = "none";
  document.getElementById("empleado-container").style.display = "none";
  document.getElementById("planilla-container").style.display = "none";
  document.getElementById("tabla-empleados").style.display = (tabla === "empleados") ? "block" : "none";
  document.getElementById("tabla-asistencias").style.display = (tabla === "asistencias") ? "block" : "none";
  if (tabla === "asistencias") {
    setTimeout(function () {
      $("#asistenciasTable").DataTable().columns.adjust().draw();
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
// Se ha modificado para trabajar con un único documento por día que contiene ambos campos: entrada y salida.
async function cargarAsistencias() {
  // Mostrar la tabla cuando haya datos
  const tablaAsistencias = document.getElementById("tabla-asistencias");
  const tbody = document.querySelector("#asistenciasTable tbody");

  // Inicializar DataTable
  let dataTable = new DataTable("#asistenciasTable", {
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
        previous: "Anterior"
      }
    }
  });

  // Calcular el rango de fechas de la semana actual (lunes a domingo)
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diffLunes);
  lunes.setHours(0, 0, 0, 0);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);

  console.log("Rango de fechas:");
  console.log("Lunes:", lunes);
  console.log("Domingo:", domingo);

  // Escuchar cambios en Firestore
  db.collection("asistencias")
    .where("empresa", "==", adminEmpresa)
    .where("sucursal", "==", adminSucursal)
    .onSnapshot((snapshot) => {
      console.log("Documentos de asistencias recibidos:", snapshot.docs.length);

      dataTable.clear().draw(); // Limpiar la tabla antes de agregar nuevos datos

      snapshot.forEach((doc) => {
        const data = doc.data();
        const fechaDoc = new Date(data.fecha + "T00:00:00");

        console.log("Fecha formateada:", fechaDoc);

        // Validar si la fecha del documento está en la semana actual
        if (fechaDoc >= lunes && fechaDoc <= domingo) {
          console.log("Agregando fila para:", data.user);

          // Agregar la fila a DataTable
          dataTable.row.add([
            data.user,
            data.fecha,
            data.status,
            data.entrada,
            data.salida,
            data.justificacion || "",
            `<button onclick="eliminarAsistencia('${doc.id}')" style="background-color:red;">Eliminar</button>`,
          ]).draw();
        } else {
          console.log(`La fecha ${data.fecha} está fuera del rango.`);
        }
      });
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
        document.getElementById("nombre").value = data.nombre || "";
        document.getElementById("email").value = data.email || "";
        document.getElementById("identificacion").value = data.identificacion || "";
        document.getElementById("nacimiento").value = data.nacimiento || "";
        document.getElementById("empleado-salario").value = data.salarioH || "";
        document.getElementById("descripcionp").value = data.descripcion || "";
        document.getElementById("perfil-container").style.display = "block";
        document.getElementById("tabla-empleados").style.display = "none";
        document.getElementById("tabla-asistencias").style.display = "none";
        document.getElementById("planilla-container").style.display = "none";
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
  // Al agregar, se limpia la variable de edición
  currentEditingEmployeeId = null;
  document.getElementById("empleado-container").style.display = "block";
  document.getElementById("tabla-empleados").style.display = "none";
  document.getElementById("tabla-asistencias").style.display = "none";
  document.getElementById("planilla-container").style.display = "none";
  document.getElementById("titulo-form-empleado").textContent = "Agregar Empleado";
  document.getElementById("empleado-form").reset();
}

// Cargar los datos del empleado en el formulario para editar
async function editarEmpleado(id) {
  currentEditingEmployeeId = id;
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
    document.getElementById("empleado-container").style.display = "block";
    document.getElementById("tabla-empleados").style.display = "none";
    document.getElementById("tabla-asistencias").style.display = "none";
    document.getElementById("planilla-container").style.display = "none";
    document.getElementById("titulo-form-empleado").textContent = "Editar Empleado";
    // En modo edición se limpian los campos de contraseña
    document.getElementById("register-password").value = "";
    document.getElementById("register-password2").value = "";
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

  let updateData = {
    nombre: nombre,
    email: email,
    identificacion: identificacion,
    salarioH: salarioH,
    nacimiento: nacimiento,
    descripcion: descripcion || "Sin descripción"
  };

  try {
    if (currentEditingEmployeeId) {
      // MODO EDICIÓN
      const pass = document.getElementById("register-password").value;
      const pass2 = document.getElementById("register-password2").value;
      if (pass || pass2) {
        if (pass !== pass2) {
          alert("Las contraseñas no coinciden");
          return;
        }
        updateData.password = encrypt_data(pass);
      }
      await db.collection("usuarios").doc(currentEditingEmployeeId).update(updateData);
      alert("Empleado actualizado correctamente");
    } else {
      // MODO AGREGAR: se requiere obligatoriamente contraseña.
      const pass = document.getElementById("register-password").value;
      const pass2 = document.getElementById("register-password2").value;
      if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
      }
      updateData.password = encrypt_data(pass);
      updateData.role = "empleado";
      updateData.empresa = adminEmpresa;
      updateData.sucursal = adminSucursal;
      const newUserRef = await db.collection("usuarios").add(updateData);
      await db.collection("usuarios").doc(newUserRef.id).update({ UID: newUserRef.id });
      alert("Empleado agregado correctamente");
    }
    window.location.href = "admin.html";
  } catch (error) {
    alert("Error al guardar el empleado: " + error.message);
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
  document.getElementById("perfil-container").style.display = "none";
  document.getElementById("empleado-container").style.display = "none";
  document.getElementById("tabla-empleados").style.display = "none";
  document.getElementById("tabla-asistencias").style.display = "none";
  document.getElementById("planilla-container").style.display = "block";
  calcularPlanillaSemanal();
}

function calcularPlanillaSemanal() {
  const tbody = document.querySelector("#planillaTable tbody");
  tbody.innerHTML = "";

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

  // Convertir fechas a formato "YYYY-MM-DD"
  const fechaInicio = formatDate(lunes);
  const fechaFin = formatDate(domingo);

  // Consultar las asistencias filtradas por empresa, sucursal y semana actual
  db.collection("asistencias")
    .where("empresa", "==", adminEmpresa)
    .where("sucursal", "==", adminSucursal)
    .onSnapshot(snapshot => {
      const planilla = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        const fecha = data.fecha;
        // Filtrar los documentos por fecha (semana actual)
        if (fecha >= fechaInicio && fecha <= fechaFin) {
          // En tu objeto, el campo "user" contiene el nombre del empleado
          const empleadoKey = data.user;
          if (!planilla[empleadoKey]) {
            planilla[empleadoKey] = [];
          }
          planilla[empleadoKey].push(data);
        }
      });

      // Para relacionar la asistencia con la información del empleado,
      // obtenemos la lista de empleados.
      db.collection("usuarios").get().then(empSnapshot => {
        const empleados = [];
        empSnapshot.forEach(doc => {
          empleados.push({ id: doc.id, ...doc.data() });
        });

        tbody.innerHTML = "";
        // Iterar sobre cada grupo de asistencias (por empleado)
        for (const empleadoKey in planilla) {
          let totalHorasNormales = 0;
          let totalHorasExtras = 0;

          planilla[empleadoKey].forEach(registro => {
            // Convertir las cadenas de "fecha" y "entrada"/"salida" a objetos Date.
            const horaEntrada = crearFechaCompleta(registro.fecha, registro.entrada);
            const horaSalida = crearFechaCompleta(registro.fecha, registro.salida);
            // Se define el corte a las 16:00 para distinguir horas normales de extras.
            const corte = new Date(horaEntrada);
            corte.setHours(16, 0, 0, 0);

            let horasNormales = 0;
            let horasExtras = 0;
            if (horaSalida <= corte) {
              // Si el empleado salió antes del corte, todas las horas son normales.
              horasNormales = (horaSalida - horaEntrada) / (1000 * 60 * 60);
            } else if (horaEntrada < corte) {
              // Si entró antes del corte y salió después, se dividen las horas.
              horasNormales = (corte - horaEntrada) / (1000 * 60 * 60);
              horasExtras = (horaSalida - corte) / (1000 * 60 * 60);
            } else {
              // Si entró después del corte, todas las horas son extras.
              horasExtras = (horaSalida - horaEntrada) / (1000 * 60 * 60);
            }

            totalHorasNormales += horasNormales;
            totalHorasExtras += horasExtras;
          });

          // Redondear a dos decimales
          totalHorasNormales = Math.round(totalHorasNormales * 100) / 100;
          totalHorasExtras = Math.round(totalHorasExtras * 100) / 100;
          const totalHoras = Math.round((totalHorasNormales + totalHorasExtras) * 100) / 100;

          // Buscar la información del empleado por nombre, ya que en tu objeto "user" se almacena el nombre.
          const empleado = empleados.find(emp => emp.nombre === empleadoKey) || {};
          const identificacion = empleado.identificacion || "N/A";
          const salarioH = empleado.salarioH || 0;
          const totalPagar = Math.round(totalHoras * salarioH * 100) / 100;

          // Si hay horas registradas, agregar la fila a la tabla
          if (totalHoras > 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>${empleado.nombre || empleadoKey || "Desconocido"}</td>
              <td>${identificacion}</td>
              <td>${totalHorasNormales}</td>
              <td>${totalHorasExtras}</td>
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
  const ventanaImpresion = window.open("", "", "height=600,width=800");
  ventanaImpresion.document.write('<html><head><title>Planilla Semanal</title>');
  ventanaImpresion.document.write('<link rel="stylesheet" href="css/admin.css" />');
  ventanaImpresion.document.write('<link rel="stylesheet" href="https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css">');
  ventanaImpresion.document.write('<style>body{font-family: "Poppins", sans-serif; padding: 20px;} table {width: 100%; border-collapse: collapse;} th, td {border: 1px solid #ddd; padding: 8px; text-align: center;} th {background-color: #007bff; color: white;}</style>');
  ventanaImpresion.document.write('</head><body>');
  ventanaImpresion.document.write(contenido);
  ventanaImpresion.document.write("</body></html>");
  ventanaImpresion.document.close();
  ventanaImpresion.focus();
  ventanaImpresion.print();
  ventanaImpresion.close();
}

// Función auxiliar para combinar una fecha y una hora (se asume formato "HH:MM" o "HH:MM:SS [a.m./p.m.]")
function crearFechaCompleta(fechaStr, timeStr) {
  // Se asume que la fecha viene en "YYYY-MM-DD" y la hora en un formato legible (por ejemplo, "10:05:24 p.m.")
  // Para convertir la hora a formato 24 horas, se puede utilizar una lógica adicional si es necesario.
  // Aquí se crea la fecha base y luego se asignan las horas.
  const fechaObj = new Date(fechaStr + "T00:00:00");
  // Extraer las partes de la hora
  let [hora, min, segAMPM] = timeStr.split(":");
  segAMPM = segAMPM.trim();
  // Verificar si se incluye "a.m." o "p.m."
  let horaNum = parseInt(hora);
  if (segAMPM.toLowerCase().includes("p.m.")) {
    if (horaNum < 12) horaNum += 12;
  } else if (segAMPM.toLowerCase().includes("a.m.")) {
    if (horaNum === 12) horaNum = 0;
  }
  // Extraer los minutos (eliminando cualquier texto no numérico)
  const minutos = parseInt(min);
  // Se puede omitir los segundos si no se requiere precisión
  fechaObj.setHours(horaNum, minutos, 0, 0);
  return fechaObj;
}

// Función auxiliar para formatear una fecha a "YYYY-MM-DD"
function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const mes = ("0" + (dateObj.getMonth() + 1)).slice(-2);
  const dia = ("0" + dateObj.getDate()).slice(-2);
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