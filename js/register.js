// js/register.js
document.getElementById("register-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = document.getElementById("register-email").value;
    const pass = document.getElementById("register-password").value;
    const pass2 = document.getElementById("register-password2").value;
    const role = document.getElementById("register-role").value;

    if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
    }

    try {
        // Si el usuario selecciona admin, se verifica que no exista uno previamente.
        if (role === "admin") {
            const adminQuery = await db.collection("usuarios").where("role", "==", "admin").get();
            if (!adminQuery.empty) {
                alert("Ya existe un administrador registrado.");
                return;
            }
        }

        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        // Guarda los datos del usuario en Firestore.
        await db.collection("usuarios").doc(user.uid).set({
            email: email,
            role: role
        });
        alert("Registro exitoso, ahora inicia sesión.");
        window.location.href = "login.html";
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById("go-to-login").addEventListener("click", e => {
    e.preventDefault();
    window.location.href = "login.html";
});