/* js/controllers/login.controller.js */
import LoginModel from "../models/login.model.js";
import { createSession } from "../services/session.service.js";
import { ensureCurrentUserCanonicalProfile } from "../services/usuario.migration.service.js";

function getAuth() {
    if (!window.firebase || typeof window.firebase.auth !== "function") {
        throw new Error("Firebase Auth no está disponible.");
    }
    return window.firebase.auth();
}

function getDb() {
    if (!window.db || typeof window.db.collection !== "function") {
        throw new Error("Firestore no está disponible.");
    }
    return window.db;
}

function isValidEmail(email) {
    const emailPattern = /^[^\s@]+@[^\s@]+.[^\s@]+$/;
    return emailPattern.test(String(email || "").trim());
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

function showLoginError(message) {
    alert(message);
}

function syncGlobalAuthState({ userData = null } = {}) {
    window.adminClaims = null;
    window.adminSessionUserData = userData || null;


    window.dispatchEvent(new CustomEvent("auth:session-updated", {
        detail: {
            sessionData: window.adminSessionUserData
        }
    }));


}

function mergeIdentity({ uid, email, firestoreProfile, authUser }) {
    const profile = firestoreProfile || {};


    return {
        id: profile.id || uid,
        authUid: uid,
        ...profile,
        email: profile.email || email || authUser?.email || "",
        nombre: profile.nombre || authUser?.displayName || "",
        role: profile.role || null,
        empresa: profile.empresa || "",
        sucursal: profile.sucursal || "",
        blocked: profile.blocked === true,
        activo: profile.activo !== undefined ? profile.activo : true
    };


}

function buildProfileErrorMessage(uid) {
    const expectedPath = uid ? `usuarios/${uid}` : "usuarios/{uid}";
    return `No existe un perfil asociado a este usuario. Debes guardar el documento en ${expectedPath}.`;
}

function initLoginController() {
    const form = document.getElementById("login-form");
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;
    const forgotButton = document.getElementById("btn-forgot-password");


    if (!form) {
        console.error("No se encontró el formulario login-form");
        return;
    }

    const model = new LoginModel(getDb(), getAuth());

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (submitButton) submitButton.disabled = true;

        try {
            const login = String(document.getElementById("login-email")?.value || "").trim();
            const password = String(document.getElementById("login-password")?.value || "").trim();

            if (!login || !password) {
                showLoginError("Debes completar correo y contraseña.");
                return;
            }

            if (!isValidEmail(login)) {
                showLoginError("Debes ingresar un correo electrónico válido.");
                return;
            }

            const credential = await model.signInWithEmailAndPassword(login, password);
            const user = credential?.user;
            const uid = user?.uid;

            if (!uid) {
                await model.signOut();
                showLoginError("Error de autenticación.");
                return;
            }

            const result = await model.getProfileDataByUid(uid);

            if (!result.ok) {
                await model.signOut();
                showLoginError(buildProfileErrorMessage(uid));
                return;
            }

            const firestoreProfile = result.profile;

            let migration = null;
            try {
                migration = await ensureCurrentUserCanonicalProfile({
                    uid,
                    profileData: firestoreProfile,
                    currentDocId: firestoreProfile?.id || null,
                    deleteLegacyDoc: true
                });
            } catch (e) {
                console.warn("No se pudo migrar el perfil durante login:", e);
            }

            const canonicalProfile = migration?.profile || firestoreProfile;
            const canonicalDocId = migration?.canonicalDocId || canonicalProfile?.id || uid;

            const identity = mergeIdentity({
                uid,
                email: user?.email || login,
                firestoreProfile: canonicalProfile,
                authUser: user
            });

            if (!identity.role) {
                await model.signOut();
                showLoginError("Tu perfil no tiene rol asignado.");
                return;
            }

            if (identity.activo === false || identity.blocked === true) {
                await model.signOut();
                showLoginError("Tu usuario está bloqueado.");
                return;
            }

            const sessionData = await createSession(uid, 1, {
                authUid: uid,
                role: identity.role,
                empresa: identity.empresa || "",
                sucursal: identity.sucursal || "",
                email: identity.email || "",
                nombre: identity.nombre || "",
                docId: canonicalDocId,
                activo: identity.activo,
                blocked: identity.blocked
            });

            syncGlobalAuthState({
                userData: {
                    ...identity,
                    docId: canonicalDocId,
                    session: sessionData
                }
            });

            window.adminUserDocId = canonicalDocId;
            window.adminEmpresa = identity.empresa || "";
            window.adminSucursal = identity.sucursal || "";

            redirectByRole(identity.role);
        } catch (err) {
            console.error("Error en login:", err);

            const code = String(err?.code || "");

            if (
                code.includes("auth/wrong-password") ||
                code.includes("auth/invalid-credential") ||
                code.includes("auth/invalid-login-credentials") ||
                code.includes("auth/user-not-found")
            ) {
                showLoginError("Credenciales incorrectas.");
            } else if (code.includes("auth/too-many-requests")) {
                showLoginError("Demasiados intentos. Intenta más tarde.");
            } else if (code.includes("auth/operation-not-allowed")) {
                showLoginError("El acceso con correo y contraseña no está habilitado.");
            } else if (code.includes("permission-denied")) {
                showLoginError("No tienes permisos para leer el perfil. Revisa las reglas de Firestore.");
            } else {
                showLoginError("Error al iniciar sesión.");
            }

            try {
                await model.signOut();
            } catch (_) { }
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
