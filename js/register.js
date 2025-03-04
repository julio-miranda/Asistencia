document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre   = document.getElementById("register-nombre").value;
    const numero   = document.getElementById("register-numero").value;
    const fecha    = document.getElementById("register-Fecha").value;
    const email    = document.getElementById("register-email").value;
    const pass     = document.getElementById("register-password").value;
    const pass2    = document.getElementById("register-password2").value;
    const role     = document.getElementById("register-role").value;

    if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
    }

    try {
        // Verificar que solo exista un admin si se intenta registrar uno nuevo.
        if (role === "admin") {
            const adminQuery = await db.collection("usuarios").where("role", "==", "admin").get();
            if (!adminQuery.empty) {
                alert("Ya existe un administrador registrado.");
                return;
            }
        }

        // Encriptar la contraseña utilizando la misma función que en el login.
        const hashedPassword = encrypt_data(pass);

        // Guardar los datos del usuario en Firestore
        await db.collection("usuarios").add({
            nombre: nombre,
            identificacion: numero,
            nacimiento: fecha,
            email: email,
            password: hashedPassword, // Contraseña encriptada
            descripcion: "Sin descripcion",
            salarioH: 1.25,
            role: role
        });

        alert("Registro exitoso, ahora inicia sesión.");
        window.location.href = "index.html";
    } catch (error) {
        alert("Error: " + error.message);
    }
});

document.getElementById("go-to-login").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "index.html";
});
