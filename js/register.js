document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre     = document.getElementById("register-nombre").value;
    const numero     = document.getElementById("register-numero").value;
    const fecha      = document.getElementById("register-Fecha").value;
    const empresa    = document.getElementById("register-empresa").value;
    const direccion  = document.getElementById("register-direccion").value;
    const telefono   = document.getElementById("register-telefono").value;
    const email      = document.getElementById("register-email").value;
    const pass       = document.getElementById("register-password").value;
    const pass2      = document.getElementById("register-password2").value;

    if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
    }

    try {
        // Verificar si ya existe un administrador registrado
        const adminQuery = await db.collection("usuarios").where("role", "==", "admin").get();
        const role = adminQuery.empty ? "admin" : "empleado"; // Primer usuario será admin, los demás empleados

        // Encriptar la contraseña correctamente
        const hashedPassword = await encrypt_data(pass); // Asegurar que el valor esté resuelto antes de guardarlo

        // Guardar los datos del usuario en Firestore
        await db.collection("usuarios").add({
            nombre: nombre,
            identificacion: numero,
            nacimiento: fecha,
            email: email,
            password: hashedPassword,  // Ahora este valor ya no es una Promise
            descripcion: "Sin descripción",
            salarioH: 1.25,
            role: role,
            empresa: empresa,
            direccion: direccion,
            telefono: telefono
        });

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