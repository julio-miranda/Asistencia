const user = firebase.auth().currentUser; // Tomas el usuario

$(document).ready(function () {
    cargarEmpleados();
    cargarAsistencias();
});

function mostrarTabla(tabla) {
    document.getElementById("tabla-empleados").style.display = (tabla === "empleados") ? "block" : "none";
    document.getElementById("tabla-asistencias").style.display = (tabla === "asistencias") ? "block" : "none";
}

async function cargarEmpleados() {
    const empleadosTable = $("#empleadosTable").DataTable({
        scrollX: true,
        destroy: true,
        Response: true,
        autoWidth: false,
        "paging": true,
        "searching": true,
        "ordering": true,
        "language": {
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
            data.identificacion,
            data.nacimiento,
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

async function cargarAsistencias() {
    const asistenciasTable = $("#asistenciasTable").DataTable({
        scrollX: true,
        destroy: true,
        Response: true,
        autoWidth: false,
        "paging": true,
        "searching": true,
        "ordering": true,
        "language": {
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
        "columnDefs": [
            {
                "targets": 0, // Columna de 'Empleado'
                "width": "150px"
            },
            {
                "targets": 1, // Columna de 'Fecha'
                "width": "120px"
            },
            {
                "targets": 2, // Columna de 'Hora Entrada'
                "width": "150px"
            },
            {
                "targets": 3, // Columna de 'Estado Entrada'
                "width": "120px"
            },
            {
                "targets": 4, // Columna de 'Hora Salida'
                "width": "150px"
            },
            {
                "targets": 5, // Columna de 'Estado Salida'
                "width": "120px"
            },
            {
                "targets": 6, // Columna de 'Acciones'
                "width": "180px"
            }
        ]
    });

    const asistencias = await db.collection("asistencias").get();
    asistencias.forEach(doc => {
        const data = doc.data();
        asistenciasTable.row.add([
            data.user,
            data.fecha,
            data.entradaTime || "No registrado",
            data.entradaStatus || "N/A",
            data.salidaTime || "No registrado",
            data.salidaStatus || "N/A",
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

document.getElementById("logout-button").addEventListener("click", function () {
    logout();
});
