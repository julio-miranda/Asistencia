// js/register.js
document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre   = document.getElementById("register-nombre").value;
    const numero   = document.getElementById("register-numero").value;
    const fecha    = document.getElementById("register-Fecha").value;
    const email    = document.getElementById("register-email").value;
    const pass     = document.getElementById("register-password").value;
    const pass2    = document.getElementById("register-password2").value;

    if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
    }

    try {
        // Verificar si ya existe un administrador registrado
        const adminQuery = await db.collection("usuarios").where("role", "==", "admin").get();
        const role = adminQuery.empty ? "admin" : "empleado"; // Primer usuario será admin, los demás empleados

        // Obtener el sistema operativo solo si es un empleado
        let sistemaOperativo = null;
        if (role === "empleado") {
            sistemaOperativo = navigator.platform; // Obtener el sistema operativo
        }

        // Encriptar la contraseña
        const hashedPassword = encrypt_data(pass);

        // Guardar los datos del usuario en Firestore
        const userData = {
            nombre: nombre,
            identificacion: numero,
            nacimiento: fecha,
            email: email,
            password: hashedPassword, 
            descripcion: "Sin descripción",
            salarioH: 1.25,
            role: role
        };

        // Si es un empleado, incluir el sistema operativo
        if (role === "empleado") {
            userData.sistemaOperativo = sistemaOperativo;
        }

        await db.collection("usuarios").add(userData);

        alert("Registro exitoso. Ahora inicia sesión.");
        window.location.href = "index.html";
    } catch (error) {
        alert("Error: " + error.message);
    }
});

document.getElementById("go-to-login").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "index.html";
});