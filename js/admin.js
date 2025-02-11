// Suponiendo que Firebase ya está inicializado y 'db' es la referencia a Firestore.
// También se asume que la autenticación y demás funciones (logout, etc.) están definidas.

// Al cargar la página, se cargan ambas tablas
$(document).ready(function () {
    cargarEmpleados();
    cargarAsistencias();
});

// Función para mostrar/ocultar las tablas y ajustar columnas si es necesario
function mostrarTabla(tabla) {
    document.getElementById("navbar-links").classList.remove("active");
    document.getElementById("empleado-container").style.display = 'none';
    document.getElementById("perfil-container").style.display = 'none';
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
            `<button onclick="editarEmpleado('${doc.id}', '${data.nombre}', '${data.email}')" style="background-color:green;">Editar</button>
             <button onclick="eliminarEmpleado('${doc.id}')" style="background-color:red;">Eliminar</button>`
        ]).draw();
    });
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
            `<button onclick="eliminarAsistencia('${doc.id}')" style="background-color:red;">Eliminar</button>`
        ]).draw();
    });
}

async function eliminarEmpleado(id) {
    try {
        // Eliminar el empleado de Firestore
        await db.collection("empleados").doc(id).delete();

        alert("Empleado eliminado correctamente");
        cargarEmpleados();  // Recargar la lista de empleados
    } catch (error) {
        alert("Error al eliminar el empleado: " + error.message);
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
                document.getElementById("descripcionp").value = data.descripcion || '';
                document.getElementById("perfil-container").style.display = 'block';
                document.getElementById("tabla-empleados").style.display = 'none';
                document.getElementById("tabla-asistencias").style.display = 'none';
            }
        });
    }
}

// Función para manejar el cambio de la contraseña
document.getElementById("cambiar-contrasena").addEventListener("change", function () {
    const nuevaContrasenaContainer = document.getElementById("nueva-contrasena-container");
    if (this.checked) {
        nuevaContrasenaContainer.style.display = "block";
    } else {
        nuevaContrasenaContainer.style.display = "none";
    }
});

// Función para manejar el formulario de editar perfil
document.getElementById("perfil-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = firebase.auth().currentUser;
    const nuevoNombre = document.getElementById("nombre").value;
    const nuevoEmail = document.getElementById("email").value;
    const nuevaIdentificacion = document.getElementById("identificacion").value;
    const nuevaNacimiento = document.getElementById("nacimiento").value;
    const nuevaDescripcion = document.getElementById("descripcion").value;
    const cambiarContrasena = document.getElementById("cambiar-contrasena").checked;
    const nuevaContrasena = document.getElementById("nueva-contrasena").value;

    try {
        // Actualizar los datos en Firestore
        await db.collection("usuarios").doc(user.uid).update({
            nombre: nuevoNombre,
            email: nuevoEmail,
            identificacion: nuevaIdentificacion,
            nacimiento: nuevaNacimiento,
            descripcion: nuevaDescripcion
        });

        // Si el usuario quiere cambiar la contraseña
        if (cambiarContrasena && nuevaContrasena) {
            await user.updatePassword(nuevaContrasena);
        }

        alert("Perfil actualizado correctamente");
    } catch (error) {
        alert("Error al actualizar el perfil: " + error.message);
    }
});

// Función para cancelar el formulario de perfil
function cancelarFormulario() {
    window.location.href = "admin.html";
}

// Función para agregar un empleado
function agregarEmpleado() {
    document.getElementById("empleado-container").style.display = 'block';
    document.getElementById("tabla-empleados").style.display = 'none';
    document.getElementById("tabla-asistencias").style.display = 'none';
    document.getElementById("titulo-form-empleado").textContent = "Agregar Empleado";
    document.getElementById("empleado-form").reset();
}

// Función para editar un empleado
async function editarEmpleado(id) {
    const docRef = db.collection("usuarios").doc(id);
    const doc = await docRef.get();

    if (doc.exists) {
        const data = doc.data();
        document.getElementById("empleado-nombre").value = data.nombre;
        document.getElementById("empleado-email").value = data.email;
        document.getElementById("empleado-identificacion").value = data.identificacion;
        document.getElementById("empleado-nacimiento").value = data.nacimiento;
        document.getElementById("descripcion").value = data.descripcion;

        document.getElementById("empleado-container").style.display = 'block';
        document.getElementById("tabla-empleados").style.display = 'none';
        document.getElementById("tabla-asistencias").style.display = 'none';
        document.getElementById("titulo-form-empleado").textContent = "Editar Empleado";
    }
}

// Función para manejar el formulario de editar perfil
document.getElementById("perfil-form").addEventListener("submit", async (e) => {
    e.preventDefault(); // Evita que el formulario se envíe por defecto

    const user = firebase.auth().currentUser;
    const nuevoNombre = document.getElementById("nombre").value;
    const nuevoEmail = document.getElementById("email").value;
    const nuevaIdentificacion = document.getElementById("identificacion").value;
    const nuevaNacimiento = document.getElementById("nacimiento").value;
    const nuevaDescripcion = document.getElementById("descripcion").value;
    const cambiarContrasena = document.getElementById("cambiar-contrasena").checked;
    const nuevaContrasena = document.getElementById("nueva-contrasena").value;

    try {
        // Actualizar los datos en Firestore
        await db.collection("usuarios").doc(user.uid).update({
            nombre: nuevoNombre,
            email: nuevoEmail,
            identificacion: nuevaIdentificacion,
            nacimiento: nuevaNacimiento,
            descripcion: nuevaDescripcion
        });

        // Si el usuario quiere cambiar la contraseña
        if (cambiarContrasena && nuevaContrasena) {
            await user.updatePassword(nuevaContrasena);
        }

        alert("Perfil actualizado correctamente");

        // Ocultar el formulario y mostrar las tablas nuevamente
        window.location.href = "admin.html";
    } catch (error) {
        alert("Error al actualizar el perfil: " + error.message);
    }
});

// Función para agregar un nuevo empleado
document.getElementById("empleado-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = document.getElementById("empleado-nombre").value;
    const email = document.getElementById("empleado-email").value;
    const identificacion = document.getElementById("empleado-identificacion").value;
    const nacimiento = document.getElementById("empleado-nacimiento").value;
    const pass = document.getElementById("register-password").value;
    const pass2 = document.getElementById("register-password2").value;


    try {
        if (pass !== pass2) {
            alert("Las contraseñas no coinciden");
            return;
        }

        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        // Crear un nuevo empleado en Firestore
        const newEmployeeRef = await db.collection("usuarios").doc(user.uid).set({
            nombre: nombre,
            identificacion: identificacion,
            nacimiento: nacimiento,
            email: email,
            descripcion: "Sin descripcion",
            role: "empleado"
        });

        alert("Empleado agregado correctamente");

        // Limpiar el formulario y mostrar las tablas nuevamente
        window.location.href = "admin.html";
    } catch (error) {
        alert("Error al agregar el empleado: " + error.message);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("menu-toggle").addEventListener("click", function () {
        const navbarLinks = document.getElementById("navbar-links");
        const isActive = navbarLinks.classList.contains("active");

        navbarLinks.classList.toggle("active");

        if (!isActive) {
            document.querySelector(".form-container").style.display = 'none';
            document.getElementById("tabla-empleados").style.display = "none";
            document.getElementById("tabla-asistencias").style.display = "none";
        }
    });
});

