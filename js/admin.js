// js/admin.js
// Verifica que el usuario esté autenticado y tenga rol "admin"
checkUserAuth(async function (user) {
    const role = await getUserRole(user);
    if (role !== "admin") {
        window.location.href = "index.html";
        return;
    }
});

document.getElementById("logout-button-admin").addEventListener("click", function () {
    logout();
});

document.getElementById("view-attendance").addEventListener("click", cargarAsistencias);
document.getElementById("manage-employees").addEventListener("click", cargarEmpleados);

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
            const userDoc = await db.collection("usuarios").doc(data.userId).get();
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
        document.getElementById("admin-content").innerHTML = html;
    } catch (error) {
        console.error("Error al cargar asistencias:", error);
    }
}

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
        document.getElementById("admin-content").innerHTML = html;
    } catch (error) {
        console.error("Error al cargar empleados:", error);
    }
}