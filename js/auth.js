// js/auth.js
// Verifica si el usuario está autenticado. Si no, redirige a login.html.
function checkUserAuth(callback) {
    auth.onAuthStateChanged(user => {
        if (user) {
            callback(user);
        } else {
            window.location.href = "login.html";
        }
    });
}

// Obtiene el rol del usuario a partir de Firestore.
async function getUserRole(user) {
    try {
        const doc = await db.collection("usuarios").doc(user.uid).get();
        if (doc.exists) {
            return doc.data().role;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error al obtener rol:", error);
        return null;
    }
}

// Función para cerrar sesión.
function logout() {
    auth.signOut().then(() => {
        window.location.href = "login.html";
    });
}
