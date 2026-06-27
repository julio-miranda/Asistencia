import UserModel from "../models/user.model.js";
import { comparePassword } from "../services/password.service.js";
import { createSession, logout } from "../services/session.service.js";

function getAuth() {
    if (!window.firebase || typeof window.firebase.auth !== "function") {
        throw new Error("Firebase Auth no está disponible.");
    }
    return window.firebase.auth();
}

function isValidEmail(email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
}

function redirectByRole(role) {
    if (role === "admin") {
        window.location.href = "admin.html";
        return;
    }

    if (role === "empleado") {
        window.location.href = "employee.html";
        return;
    }

    window.location.href = "bloqueo.html";
}

function initLoginController() {
    const form = document.getElementById("login-form");
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;
    const forgotButton = document.getElementById("btn-forgot-password");

    if (!form) {
        console.error("No se encontró el formulario login-form");
        return;
    }

    const db = window.db;
    if (!db) {
        console.error("Firestore no está inicializado.");
        return;
    }

    const userModel = new UserModel(db);

    async function resolverEmailDesdeLogin(login) {
        const value = String(login || "").trim();
        if (!value) return null;

        if (isValidEmail(value)) {
            return value;
        }

        const doc = await userModel.findByLogin(value);
        if (!doc) return null;

        const data = doc.data() || {};
        return String(data.email || "").trim() || null;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (submitButton) submitButton.disabled = true;

        try {
            const login = String(document.getElementById("login-email")?.value || "").trim();
            const pass = String(document.getElementById("login-password")?.value || "").trim();

            if (!login || !pass) {
                alert("Debes completar correo/identificación y contraseña.");
                return;
            }

            const email = await resolverEmailDesdeLogin(login);
            if (!email) {
                alert("Credenciales incorrectas.");
                return;
            }

            const auth = getAuth();
            const cred = await auth.signInWithEmailAndPassword(email, pass);

            const doc = await userModel.findByLogin(login);
            if (!doc) {
                await auth.signOut();
                alert("Acceso denegado.");
                return;
            }

            const user = doc.data() || {};
            const uid = cred.user?.uid;

            if (!uid) {
                await auth.signOut();
                alert("Error de autenticación.");
                return;
            }

            if (user.activo === false || user.blocked === true) {
                await auth.signOut();
                alert("Tu usuario está bloqueado.");
                return;
            }

            await createSession(uid, 1);
            redirectByRole(user.role);

        } catch (err) {
            console.error("Error en login:", err);

            const code = String(err?.code || "");

            if (
                code.includes("auth/wrong-password") ||
                code.includes("auth/invalid-credential") ||
                code.includes("auth/invalid-login-credentials") ||
                code.includes("auth/user-not-found")
            ) {
                alert("Credenciales incorrectas.");
            } else if (code.includes("auth/too-many-requests")) {
                alert("Demasiados intentos. Intenta más tarde.");
            } else if (code.includes("auth/operation-not-allowed")) {
                alert("El acceso con correo y contraseña no está habilitado.");
            } else {
                alert("Error al iniciar sesión.");
            }
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    if (forgotButton) {
        forgotButton.addEventListener("click", () => {
            window.location.href = "forgot-password.html";
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoginController);
} else {
    initLoginController();
}