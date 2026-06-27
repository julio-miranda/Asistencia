import PerfilModel from "../models/perfil.model.js";
import { checkUserSession, logout } from "../services/session.service.js";
import { hashPassword } from "../services/password.service.js";

const db = window.db;
if (!db) {
    console.error("Firestore no está inicializado.");
}

const model = new PerfilModel(db);

let perfilDocId = null;
let perfilDataCache = null;
let currentSessionUid = null;

function setValor(id, valor) {
    const el = document.getElementById(id);
    if (el) el.value = valor ?? "";
}

function getValor(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}

function cancelarFormulario() {
    window.location.href = "admin.html";
}

function redirigirLogin() {
    logout({ redirect: true }).catch(() => {
        window.location.href = "index.html";
    });
}

async function obtenerSesion() {
    try {
        const session = await checkUserSession();
        if (!session || !session.uid) return null;
        currentSessionUid = session.uid;
        return session;
    } catch (e) {
        console.warn("Error leyendo sesión:", e);
        return null;
    }
}

async function buscarUsuarioPorUid(uid) {
    if (!uid) return null;

    if (typeof window.buscarUsuarioFirestorePorAuthUid === "function") {
        const doc = await window.buscarUsuarioFirestorePorAuthUid(uid);
        if (doc) return doc;
    }

    return await model.getUserByAuthUid(uid);
}

function resetPasswordFields() {
    const cambiar = document.getElementById("cambiar-contrasena");
    const nuevaCont = document.getElementById("nueva-contrasena-container");
    const nuevaInp = document.getElementById("nueva-contrasena");

    if (cambiar) cambiar.checked = false;
    if (nuevaCont) nuevaCont.style.display = "none";
    if (nuevaInp) nuevaInp.value = "";
}

function bindCommonUI() {
    const menuToggle = document.getElementById("menu-toggle");
    if (menuToggle && !menuToggle.dataset.bound) {
        menuToggle.dataset.bound = "1";
        menuToggle.addEventListener("click", () => {
            const nav = document.getElementById("navbar-links");
            if (nav) nav.classList.toggle("active");
        });
    }

    const logoutBtn = document.getElementById("logout-button");
    if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = "1";
        logoutBtn.addEventListener("click", () => {
            logout({ redirect: true }).catch(() => {
                window.location.href = "index.html";
            });
        });
    }

    const btnQr = document.getElementById("btnDescargarQr");
    if (btnQr && !btnQr.dataset.bound) {
        btnQr.dataset.bound = "1";
        btnQr.addEventListener("click", () => {
            const empresa = window.adminEmpresa || perfilDataCache?.empresa || "";
            if (!empresa) {
                alert("No se pudo identificar la empresa.");
                return;
            }

            const container = document.getElementById("qr-container");
            if (!container) return;

            container.innerHTML = "";
            container.style.position = "absolute";
            container.style.left = "-9999px";

            try {
                new QRCode(container, {
                    text: empresa,
                    width: 400,
                    height: 400
                });
            } catch (e) {
                console.error("Error generando QR:", e);
                container.style.position = "";
                container.style.left = "";
                alert("Error generando QR");
                return;
            }

            setTimeout(() => {
                const img = container.querySelector("img");
                let href = null;

                if (img && img.src) {
                    href = img.src;
                } else {
                    const canvas = container.querySelector("canvas");
                    if (canvas && typeof canvas.toDataURL === "function") {
                        href = canvas.toDataURL("image/png");
                    }
                }

                if (!href) {
                    alert("No se pudo generar el QR");
                    container.innerHTML = "";
                    container.style.position = "";
                    container.style.left = "";
                    return;
                }

                const link = document.createElement("a");
                link.href = href;
                link.download = `${empresa}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                container.innerHTML = "";
                container.style.position = "";
                container.style.left = "";
            }, 200);
        });
    }
}

function bindFormEvents() {
    const form = document.getElementById("perfil-form");
    if (!form || form.dataset.bound) return;

    form.dataset.bound = "1";

    const cambiar = document.getElementById("cambiar-contrasena");
    const nuevaCont = document.getElementById("nueva-contrasena-container");
    const nuevaInp = document.getElementById("nueva-contrasena");

    if (cambiar) {
        cambiar.addEventListener("change", () => {
            if (nuevaCont) {
                nuevaCont.style.display = cambiar.checked ? "block" : "none";
            }

            if (!cambiar.checked && nuevaInp) {
                nuevaInp.value = "";
            }
        });
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!perfilDocId) {
            alert("No se pudo identificar el usuario.");
            return;
        }

        const nombre = getValor("nombre").trim();
        const email = getValor("email").trim();
        const identificacionNombre = getValor("identificacionNombre").trim();
        const identificacion = getValor("identificacion").trim();
        const nacimiento = getValor("nacimiento").trim();
        const salarioHRaw = getValor("empleado-salariop").trim();
        const descripcion = getValor("descripcionp").trim();
        const nuevaContrasena = getValor("nueva-contrasena").trim();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!nombre) {
            alert("El nombre es obligatorio.");
            return;
        }

        if (!email || !emailPattern.test(email)) {
            alert("Correo inválido.");
            return;
        }

        if (!identificacionNombre) {
            alert("El tipo de documento es obligatorio.");
            return;
        }

        if (!identificacion) {
            alert("La identificación es obligatoria.");
            return;
        }

        if (!nacimiento) {
            alert("La fecha de nacimiento es obligatoria.");
            return;
        }

        const salarioH = Number(salarioHRaw);
        if (Number.isNaN(salarioH) || salarioH < 0) {
            alert("El salario por hora debe ser un número válido.");
            return;
        }

        const updateData = {
            nombre,
            email,
            identificacionNombre,
            identificacion,
            nacimiento,
            salarioH,
            descripcion: descripcion || "",
            empresa: window.adminEmpresa || perfilDataCache?.empresa || "",
            sucursal: window.adminSucursal || perfilDataCache?.sucursal || ""
        };

        const auth = window.firebase?.auth ? window.firebase.auth() : null;
        const currentUser = auth?.currentUser || null;

        try {
            if (cambiar && cambiar.checked) {
                if (!nuevaContrasena) {
                    alert("Ingresa la nueva contraseña.");
                    return;
                }

                const hashedPassword = await hashPassword(nuevaContrasena);
                updateData.password = hashedPassword;
                updateData.passwordHash = hashedPassword;

                if (currentUser && currentSessionUid && currentUser.uid === currentSessionUid) {
                    try {
                        await currentUser.updatePassword(nuevaContrasena);
                    } catch (authErr) {
                        console.warn("No se pudo actualizar la contraseña de Firebase Auth:", authErr);
                    }
                }
            }

            if (currentUser && currentSessionUid && currentUser.uid === currentSessionUid && email !== currentUser.email) {
                try {
                    await currentUser.updateEmail(email);
                } catch (authErr) {
                    console.warn("No se pudo actualizar el email de Firebase Auth:", authErr);
                }
            }

            await model.updateProfile(perfilDocId, updateData);

            alert("Perfil actualizado correctamente");
            perfilDataCache = null;
            await cargarPerfil();
        } catch (error) {
            console.error("Error al actualizar perfil:", error);
            alert("Error al actualizar: " + (error.message || error));
        }
    });
}

async function cargarPerfil() {
    const perfilContainer = document.getElementById("perfil-container");
    const form = document.getElementById("perfil-form");

    if (!perfilContainer || !form) return;

    if (!db || !db.collection) {
        alert("Firestore no está disponible.");
        return;
    }

    try {
        const session = await obtenerSesion();
        if (!session) {
            redirigirLogin();
            return;
        }

        if (window.adminSessionUserData) {
            perfilDataCache = window.adminSessionUserData;
            perfilDocId = window.adminSessionUserData.docId || null;
        }

        if (!perfilDataCache) {
            const doc = await buscarUsuarioPorUid(session.uid);
            if (!doc) {
                alert("No se encontró el perfil.");
                return;
            }

            perfilDocId = doc.id;
            perfilDataCache = doc.data() || {};
        }

        const data = perfilDataCache || {};

        setValor("nombre", data.nombre);
        setValor("email", data.email);
        setValor("identificacionNombre", data.identificacionNombre);
        setValor("identificacion", data.identificacion);
        setValor("nacimiento", data.nacimiento);
        setValor("empleado-salariop", data.salarioH);
        setValor("descripcionp", data.descripcion);

        resetPasswordFields();
        bindFormEvents();
        bindCommonUI();

        const inicioEl = document.getElementById("btn-cancelar-perfil");
        if (inicioEl && !inicioEl.dataset.bound) {
            inicioEl.dataset.bound = "1";
            inicioEl.addEventListener("click", cancelarFormulario);
        }

        window.adminEmpresa = window.adminEmpresa || data.empresa || "";
        window.adminSucursal = window.adminSucursal || data.sucursal || "";
    } catch (error) {
        console.error("Error al cargar perfil:", error);
        alert("Error al cargar perfil: " + (error.message || error));
    }
}

window.verPerfil = cargarPerfil;
window.cancelarFormulario = cancelarFormulario;

document.addEventListener("DOMContentLoaded", async () => {
    if (!document.getElementById("perfil-container")) return;
    await cargarPerfil();
});