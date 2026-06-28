// js/admin.js
import { checkUserSession, logout } from "./services/session.service.js";
import { hashPassword } from "./services/password.service.js";

(function () {
  // =========================
  // Globals compartidas
  // =========================
  window.adminEmpresa = window.adminEmpresa || "";
  window.adminSucursal = window.adminSucursal || "";
  window.currentEditingEmployeeId = window.currentEditingEmployeeId || null;
  window.currentEditingJornadaId = window.currentEditingJornadaId || null;
  window.asistenciasUnsub = window.asistenciasUnsub || null;
  window.adminSessionUserData = window.adminSessionUserData || null;
  window.adminUserDocId = window.adminUserDocId || null;

  let resolveAdminReady;
  window.adminReadyPromise = new Promise((resolve) => {
    resolveAdminReady = resolve;
  });

  window.whenAdminReady = async function () {
    return await window.adminReadyPromise;
  };

  // =========================
  // Helpers
  // =========================
  function obtenerSemanaActual() {
    const hoy = new Date();
    const d = hoy.getDay() || 7;
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - d + 1);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);

    return {
      inicio: inicio.toISOString().split("T")[0],
      fin: fin.toISOString().split("T")[0]
    };
  }

  function formatDate(dateObj) {
    const y = dateObj.getFullYear();
    const mo = ("0" + (dateObj.getMonth() + 1)).slice(-2);
    const da = ("0" + dateObj.getDate()).slice(-2);
    return `${y}-${mo}-${da}`;
  }

  function crearFechaCompleta(fechaStr, timeStr) {
    if (!fechaStr) fechaStr = new Date().toISOString().split("T")[0];
    timeStr = timeStr || "00:00";

    const esPM = /p\.?m\.?/i.test(timeStr);
    const esAM = /a\.?m\.?/i.test(timeStr);

    const clean = timeStr.replace(/a\.?m\.?|p\.?m\.?/gi, "").trim();
    const parts = clean.split(":").map(n => parseInt(n, 10));

    let h = Number.isFinite(parts[0]) ? parts[0] : 0;
    let m = Number.isFinite(parts[1]) ? parts[1] : 0;
    let s = Number.isFinite(parts[2]) ? parts[2] : 0;

    if (esPM && h < 12) h += 12;
    if (esAM && h === 12) h = 0;

    const dt = new Date(fechaStr + "T00:00:00");
    dt.setHours(h, m, s, 0);
    return dt;
  }

  const SINONIMOS_NOCTURNO = ["noche", "nocturna", "nocturno", "nocturnas"];

  function esJornadaNocturna(nombre) {
    if (!nombre) return false;
    const low = String(nombre).toLowerCase();
    return SINONIMOS_NOCTURNO.some(s => low.includes(s));
  }

  async function hashPasswordSafe(pass) {
    if (typeof hashPassword === "function") {
      return await hashPassword(pass);
    }
    if (window.bcrypt && typeof window.bcrypt.hash === "function") {
      return await window.bcrypt.hash(pass, 10);
    }
    throw new Error("No hay función de hash disponible.");
  }

  function showRoute(tabla) {
    const rutas = {
      empleados: "empleados.html",
      asistencias: "asistencias.html",
      jornadas: "jornadas.html",
      planilla: "planilla.html",
      perfil: "perfil.html"
    };

    if (rutas[tabla]) {
      window.location.href = rutas[tabla];
    }
  }

  async function buscarUsuarioPorUidAutenticado(uid, email = "") {
    const db = window.db;
    if (!uid || !db || typeof db.collection !== "function") return null;

    if (typeof window.buscarUsuarioFirestorePorAuthUid === "function") {
      const doc = await window.buscarUsuarioFirestorePorAuthUid(uid);
      if (doc) return doc;
    }

    let snap = await db.collection("usuarios")
      .where("authUid", "==", uid)
      .limit(1)
      .get();

    if (!snap.empty) return snap.docs[0];

    if (email && typeof window.buscarUsuarioFirestorePorEmail === "function") {
      const doc = await window.buscarUsuarioFirestorePorEmail(email);
      if (doc) return doc;
    }

    if (email) {
      snap = await db.collection("usuarios")
        .where("email", "==", String(email).trim())
        .limit(1)
        .get();

      if (!snap.empty) return snap.docs[0];
    }

    return null;
  }

  async function sincronizarAuthUidSiFalta(docRef, data, uid) {
    if (!docRef || !data || !uid) return;
    if (data.authUid) return;

    try {
      await docRef.update({ authUid: uid });
    } catch (e) {
      console.warn("No se pudo sincronizar authUid:", e);
    }
  }

  // =========================
  // Navegación / UI
  // =========================
  function redirectToLogin() {
    logout({ redirect: true });
  }

  function handleUnauthorizedRole(role) {
    if (role === "empleado") {
      window.location.href = "employee.html";
      return;
    }
    redirectToLogin();
  }

  function mostrarTabla(tabla) {
    const navLinks = document.getElementById("navbar-links");
    if (navLinks) navLinks.classList.remove("active");

    const ids = [
      "perfil-container",
      "empleado-container",
      "tabla-empleados",
      "tabla-asistencias",
      "planilla-container",
      "jornadas-container"
    ];

    const existsSomeView = ids.some(id => document.getElementById(id));

    if (existsSomeView) {
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });

      if (tabla === "empleados") {
        const el = document.getElementById("tabla-empleados");
        if (el) {
          el.style.display = "block";
          if (typeof window.cargarEmpleados === "function") window.cargarEmpleados();
          return;
        }
      } else if (tabla === "asistencias") {
        const el = document.getElementById("tabla-asistencias");
        if (el) {
          const semana = obtenerSemanaActual();
          const fechaInicioaEl = document.getElementById("fechaInicioa");
          const fechaFinaEl = document.getElementById("fechaFina");
          if (fechaInicioaEl) fechaInicioaEl.value = semana.inicio;
          if (fechaFinaEl) fechaFinaEl.value = semana.fin;
          el.style.display = "block";
          if (typeof window.cargarAsistencias === "function") window.cargarAsistencias(semana.inicio, semana.fin);
          return;
        }
      } else if (tabla === "jornadas") {
        const el = document.getElementById("jornadas-container");
        if (el) {
          el.style.display = "block";
          if (typeof window.cargarJornadas === "function") window.cargarJornadas();
          return;
        }
      } else if (tabla === "planilla") {
        const el = document.getElementById("planilla-container");
        if (el) {
          el.style.display = "block";
          if (typeof window.mostrarPlanilla === "function") window.mostrarPlanilla();
          return;
        }
      } else if (tabla === "perfil") {
        const el = document.getElementById("perfil-container");
        if (el) {
          el.style.display = "block";
          if (typeof window.verPerfil === "function") window.verPerfil();
          return;
        }
      }

      showRoute(tabla);
      return;
    }

    showRoute(tabla);
  }

  function cancelarFormulario() {
    const empleadoContainer = document.getElementById("empleado-container");
    const tablaEmpleados = document.getElementById("tabla-empleados");

    if (empleadoContainer) {
      const form = document.getElementById("empleado-form");
      if (form) form.reset();

      window.currentEditingEmployeeId = null;
      empleadoContainer.style.display = "none";
      if (tablaEmpleados) tablaEmpleados.style.display = "block";

      const titulo = document.getElementById("titulo-form-empleado");
      if (titulo) titulo.textContent = "Agregar Empleado";

      const seccion = document.getElementById("seccion-contraseña");
      if (seccion) seccion.style.display = "block";

      const cambiarCont = document.getElementById("cambiar-contrasena-empleado-container");
      if (cambiarCont) cambiarCont.style.display = "none";

      const cambiarChk = document.getElementById("cambiar-contrasena-empleado");
      if (cambiarChk) cambiarChk.checked = false;

      const nuevaCont = document.getElementById("nueva-contrasena-empleado-container");
      if (nuevaCont) nuevaCont.style.display = "none";

      return;
    }

    const jornadaContainer = document.getElementById("jornadas-container");
    if (jornadaContainer) {
      const form = document.getElementById("jornada-form");
      if (form) form.reset();
      window.currentEditingJornadaId = null;
      if (typeof window.cargarJornadas === "function") window.cargarJornadas();
      return;
    }

    const perfilContainer = document.getElementById("perfil-container");
    if (perfilContainer) {
      if (typeof window.verPerfil === "function") {
        window.verPerfil();
      }
      return;
    }

    const planillaContainer = document.getElementById("planilla-container");
    if (planillaContainer) {
      if (typeof window.mostrarPlanilla === "function") {
        window.mostrarPlanilla();
      }
      return;
    }

    window.location.href = "admin.html";
  }

  function verPerfilFallback() {
    if (document.getElementById("perfil-container")) return;
    window.location.href = "perfil.html";
  }

  // =========================
  // Exponer helpers
  // =========================
  window.obtenerSemanaActual = obtenerSemanaActual;
  window.formatDate = formatDate;
  window.crearFechaCompleta = crearFechaCompleta;
  window.esJornadaNocturna = esJornadaNocturna;
  window.redirectToLogin = redirectToLogin;
  window.handleUnauthorizedRole = handleUnauthorizedRole;
  window.mostrarTabla = mostrarTabla;
  window.cancelarFormulario = cancelarFormulario;

  if (typeof window.verPerfil !== "function") {
    window.verPerfil = verPerfilFallback;
  }

  // =========================
  // UI común
  // =========================
  function initCommonUI() {
    const menuToggle = document.getElementById("menu-toggle");
    if (menuToggle && !menuToggle.dataset.bound) {
      menuToggle.dataset.bound = "1";
      menuToggle.addEventListener("click", () => {
        const nav = document.getElementById("navbar-links");
        if (!nav) return;
        nav.classList.toggle("active");
      });
    }

    const logoutBtn = document.getElementById("logout-button");
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", () => {
        logout({ redirect: true });
      });
    }

    const btnQr = document.getElementById("btnDescargarQr");
    if (btnQr && !btnQr.dataset.bound) {
      btnQr.dataset.bound = "1";
      btnQr.addEventListener("click", () => {
        if (!window.adminEmpresa) return alert("Empresa no encontrada");

        const tmpDiv = document.getElementById("qr-container");
        if (!tmpDiv) return alert("Contenedor de QR no encontrado");

        tmpDiv.innerHTML = "";
        tmpDiv.style.position = "absolute";
        tmpDiv.style.left = "-9999px";

        try {
          new QRCode(tmpDiv, {
            text: window.adminEmpresa,
            width: 400,
            height: 400
          });
        } catch (e) {
          console.error("Error generando QR:", e);
          tmpDiv.style.position = "";
          tmpDiv.style.left = "";
          return alert("Error generando QR");
        }

        setTimeout(() => {
          const img = tmpDiv.querySelector("img");
          let href = null;

          if (img && img.src) {
            href = img.src;
          } else {
            const canvas = tmpDiv.querySelector("canvas");
            if (canvas && typeof canvas.toDataURL === "function") {
              href = canvas.toDataURL("image/png");
            }
          }

          if (!href) {
            alert("No se pudo generar el QR");
            tmpDiv.innerHTML = "";
            tmpDiv.style.position = "";
            tmpDiv.style.left = "";
            return;
          }

          const link = document.createElement("a");
          link.href = href;
          link.download = `${window.adminEmpresa}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          tmpDiv.innerHTML = "";
          tmpDiv.style.position = "";
          tmpDiv.style.left = "";
        }, 200);
      });
    }
  }

  // =========================
  // Bootstrap de sesión
  // =========================
  document.addEventListener("DOMContentLoaded", async () => {
    initCommonUI();

    try {
      await checkUserSession(async (uid, userDataFromCallback, userDocIdFromCallback) => {
        try {
          if (!uid) {
            if (resolveAdminReady) resolveAdminReady(null);
            redirectToLogin();
            return;
          }

          const db = window.db;
          if (!db || !db.collection) {
            if (resolveAdminReady) resolveAdminReady(null);
            redirectToLogin();
            return;
          }

          const auth = window.firebase && typeof window.firebase.auth === "function"
            ? window.firebase.auth()
            : null;
          const email = auth && auth.currentUser ? (auth.currentUser.email || "") : "";

          let userData = userDataFromCallback || null;
          let userDocId = userDocIdFromCallback || null;
          let userDocRef = null;

          let userDoc = null;

          if (!userData) {
            userDoc = await buscarUsuarioPorUidAutenticado(uid, email);
            if (userDoc) {
              userData = userDoc.data() || {};
              userDocId = userDoc.id;
              userDocRef = userDoc.ref;
              await sincronizarAuthUidSiFalta(userDocRef, userData, uid);
            }
          } else {
            if (!userData.authUid || userData.authUid !== uid) {
              userDoc = await buscarUsuarioPorUidAutenticado(uid, email);
              if (userDoc) {
                userData = userDoc.data() || userData;
                userDocId = userDoc.id;
                userDocRef = userDoc.ref;
                await sincronizarAuthUidSiFalta(userDocRef, userData, uid);
              }
            } else if (userDocId) {
              userDocRef = db.collection("usuarios").doc(userDocId);
            }
          }

          if (!userData) {
            if (resolveAdminReady) resolveAdminReady(null);
            redirectToLogin();
            return;
          }

          if (userData.role !== "admin") {
            if (resolveAdminReady) resolveAdminReady(null);
            handleUnauthorizedRole(userData.role);
            return;
          }

          window.adminSessionUserData = {
            ...userData,
            docId: userDocId || userData.docId || null
          };
          window.adminUserDocId = userDocId || userData.docId || null;
          window.adminEmpresa = userData.empresa || "";
          window.adminSucursal = userData.sucursal || "";

          if (resolveAdminReady) resolveAdminReady(window.adminSessionUserData);

          const semana = obtenerSemanaActual();
          const fechaInicioaEl = document.getElementById("fechaInicioa");
          const fechaFinaEl = document.getElementById("fechaFina");
          if (fechaInicioaEl && !fechaInicioaEl.value) fechaInicioaEl.value = semana.inicio;
          if (fechaFinaEl && !fechaFinaEl.value) fechaFinaEl.value = semana.fin;
        } catch (innerErr) {
          console.error("Error en validación de sesión admin:", innerErr);
          if (resolveAdminReady) resolveAdminReady(null);
          redirectToLogin();
        }
      });
    } catch (err) {
      console.error("Error inicializando Admin:", err);
      if (resolveAdminReady) resolveAdminReady(null);
      redirectToLogin();
    }
  });
})();