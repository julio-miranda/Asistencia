/* js/admin.js */
import { checkUserSession, logout, getSessionData } from "./services/session.service.js";

(function () {
  "use strict";

  window.adminEmpresa = window.adminEmpresa || "";
  window.adminSucursal = window.adminSucursal || "";
  window.currentEditingEmployeeId = window.currentEditingEmployeeId || null;
  window.currentEditingJornadaId = window.currentEditingJornadaId || null;
  window.asistenciasUnsub = window.asistenciasUnsub || null;
  window.adminSessionUserData = window.adminSessionUserData || null;
  window.adminUserDocId = window.adminUserDocId || null;
  window.adminClaims = null;

  let resolveAdminReady;
  window.adminReadyPromise = new Promise((resolve) => {
    resolveAdminReady = resolve;
  });

  window.whenAdminReady = async function () {
    return await window.adminReadyPromise;
  };

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
      if (typeof window.verPerfil === "function") window.verPerfil();
      return;
    }

    const planillaContainer = document.getElementById("planilla-container");
    if (planillaContainer) {
      if (typeof window.mostrarPlanilla === "function") window.mostrarPlanilla();
      return;
    }

    window.location.href = "admin.html";


  }

  function verPerfilFallback() {
    if (document.getElementById("perfil-container")) return;
    window.location.href = "perfil.html";
  }

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

  function combinarDatosSesion({ userDataFromCallback, sessionData, userDocIdFromCallback }) {
    const role = userDataFromCallback?.role || sessionData?.role || null;
    const empresa = userDataFromCallback?.empresa || sessionData?.empresa || "";
    const sucursal = userDataFromCallback?.sucursal || sessionData?.sucursal || "";
    const nombre = userDataFromCallback?.nombre || sessionData?.nombre || "";
    const email = userDataFromCallback?.email || sessionData?.email || "";


    return {
      role,
      empresa,
      sucursal,
      nombre,
      email,
      docId: userDocIdFromCallback || userDataFromCallback?.docId || sessionData?.docId || null
    };


  }

  function tieneContextoAdminValido(contexto) {
    return !!(contexto && contexto.role === "admin" && contexto.empresa && contexto.sucursal);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initCommonUI();


    try {
      await checkUserSession(async (uid, userDataFromCallback, userDocIdFromCallback, meta) => {
        try {
          if (!uid) {
            if (resolveAdminReady) resolveAdminReady(null);
            redirectToLogin();
            return;
          }

          const sessionData = meta?.sessionData || await getSessionData().catch(() => null);
          const contexto = combinarDatosSesion({
            userDataFromCallback,
            sessionData,
            userDocIdFromCallback
          });

          if (!tieneContextoAdminValido(contexto)) {
            console.warn("Faltan datos mínimos para entrar al panel admin:", {
              uid,
              contexto,
              sessionData,
              userDataFromCallback
            });
            if (resolveAdminReady) resolveAdminReady(null);
            redirectToLogin();
            return;
          }

          if (contexto.role !== "admin") {
            if (resolveAdminReady) resolveAdminReady(null);
            handleUnauthorizedRole(contexto.role);
            return;
          }

          window.adminClaims = null;
          window.adminSessionUserData = {
            ...(userDataFromCallback || {}),
            ...(sessionData || {}),
            role: contexto.role,
            empresa: contexto.empresa,
            sucursal: contexto.sucursal,
            nombre: contexto.nombre,
            email: contexto.email,
            docId: contexto.docId
          };
          window.adminUserDocId = contexto.docId;
          window.adminEmpresa = contexto.empresa;
          window.adminSucursal = contexto.sucursal;

          window.dispatchEvent(new CustomEvent("auth:session-updated", {
            detail: {
              sessionData: window.adminSessionUserData
            }
          }));

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