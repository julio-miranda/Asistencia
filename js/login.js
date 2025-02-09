// js/login.js
document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        // Consulta el rol del usuario
        const doc = await db.collection("usuarios").doc(user.uid).get();
        if (doc.exists) {
            const role = doc.data().role;
            if (role === "admin") {
                window.location.href = "admin.html";
            } else {
                window.location.href = "employee.html";
            }
        } else {
            alert("No se encontraron datos del usuario.");
        }
    } catch (error) {
        alert(error.message);
    }
});

// Navegar a la página de registro
document.getElementById("go-to-register").addEventListener("click", e => {
    e.preventDefault();
    window.location.href = "register.html";
});
