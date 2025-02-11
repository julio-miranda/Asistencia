// Suponiendo que Firebase ya está inicializado y 'db' es la referencia a Firestore.
// También se asume que la autenticación y demás funciones (logout, etc.) están definidas.

// Al cargar la página, se cargan ambas tablas
$(document).ready(function () {
    cargarEmpleados();
    cargarAsistencias();
});

// Función para mostrar/ocultar las tablas y ajustar columnas si es necesario
function mostrarTabla(tabla) {
    document.getElementById("tabla-empleados").style.display = (tabla === "empleados") ? "block" : "none";
    document.getElementById("tabla-asistencias").style.display = (tabla === "asistencias") ? "block" : "none";
    if (tabla === "asistencias") {
        // Se utiliza un pequeño retardo para garantizar que el contenedor se haya renderizado
        setTimeout(function () {
            $('#asistenciasTable').DataTable().columns.adjust().draw();
        }, 100);
    }
}

// Funciones de administración de empleados
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

    const empleados = await db.collection("usuarios").get();
    empleados.forEach(doc => {
        const data = doc.data();
        empleadosTable.row.add([
            data.nombre,
            data.identificacion || "",
            data.nacimiento || "",
            data.email,
            `<button onclick="editarEmpleado('${doc.id}', '${data.nombre}', '${data.email}')">Editar</button>
             <button onclick="eliminarEmpleado('${doc.id}')">Eliminar</button>`
        ]).draw();
    });
}

async function agregarEmpleado() {
    const nombre = prompt("Ingrese el nombre:");
    const email = prompt("Ingrese el correo:");
    if (nombre && email) {
        await db.collection("usuarios").add({ nombre, email });
        cargarEmpleados();
    }
}

async function editarEmpleado(id, nombre, email) {
    const nuevoNombre = prompt("Nuevo nombre:", nombre);
    const nuevoEmail = prompt("Nuevo email:", email);
    if (nuevoNombre && nuevoEmail) {
        await db.collection("usuarios").doc(id).update({ nombre: nuevoNombre, email: nuevoEmail });
        cargarEmpleados();
    }
}

async function eliminarEmpleado(id) {
    if (confirm("¿Estás seguro de eliminar este empleado?")) {
        await db.collection("usuarios").doc(id).delete();
        cargarEmpleados();
    }
}

// Funciones de administración de asistencias
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
            { targets: 0, width: "150px", className: "dt-center" }, // Empleado
            { targets: 1, width: "120px", className: "dt-center" }, // Fecha
            { targets: 2, width: "80px", className: "dt-center" }, // Número de Escaneo
            { targets: 3, width: "120px", className: "dt-center" }, // Tipo (Entrada/Salida)
            { targets: 4, width: "150px", className: "dt-center" }, // Hora
            { targets: 5, width: "150px", className: "dt-center" }, // Estado
            { targets: 6, width: "180px", className: "dt-center" }  // Acciones
        ]
    });

    const asistencias = await db.collection("asistencias").get();
    asistencias.forEach(doc => {
        const data = doc.data();
        asistenciasTable.row.add([
            data.user,
            data.fecha,
            data.scanNumber || "N/A",
            data.tipo || "N/A",
            data.time || "No registrado",
            data.status || "N/A",
            `<button onclick="eliminarAsistencia('${doc.id}')">Eliminar</button>`
        ]).draw();
    });
}

async function eliminarAsistencia(id) {
    if (confirm("¿Estás seguro de eliminar este registro de asistencia?")) {
        await db.collection("asistencias").doc(id).delete();
        cargarAsistencias();
    }
}

// Evento para cerrar sesión
document.getElementById("logout-button").addEventListener("click", function () {
    logout();
});
