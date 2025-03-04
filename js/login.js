document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    // Obtener y validar los datos del formulario
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value;
    
    if (!email || !pass) {
        alert("Por favor, ingresa un correo y una contraseña válidos.");
        return;
    }

    try {
        // Consulta a la colección "usuarios" filtrando por correo
        const querySnapshot = await db.collection("usuarios").where("email", "==", email).get();
        if (querySnapshot.empty) {
            alert("Usuario no encontrado.");
            return;
        }

        let userDoc;
        querySnapshot.forEach(doc => userDoc = doc);
        if (!userDoc) {
            alert("Error al obtener los datos del usuario.");
            return;
        }
        const userData = userDoc.data();

        // Comparación de la contraseña encriptada utilizando la función personalizada
        if (encrypt_data(pass) !== userData.password) {
            alert("Contraseña incorrecta.");
            return;
        }
        
        // Crea la sesión usando localStorage (almacenada de forma encriptada)
        createSession(userDoc.id, 1);

        // Redirige según el rol del usuario
        window.location.href = userData.role === "admin" ? "admin.html" : "employee.html";
    } catch (error) {
        console.error("Error en el inicio de sesión:", error);
        alert("Error en el inicio de sesión: " + error.message);
    }
});

// Redirige a la página de registro
document.getElementById("go-to-register").addEventListener("click", e => {
    e.preventDefault();
    window.location.href = "register.html";
});