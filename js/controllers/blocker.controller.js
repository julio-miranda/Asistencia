import BlockerModel from "../models/blocker.model.js";
import {
    getSessionData,
    logout
} from "../services/session.service.js";

import {
    ensureCurrentUserCanonicalProfile
} from "../services/usuario.migration.service.js";

(function () {
  "use strict";

  const db = window.db;
  if (!db) {
    console.error("Firestore no está inicializado.");
    return;
  }

  const model = new BlockerModel(db);

  let adminEmpresa = "";
  let adminSucursal = "";
  let currentSessionUser = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function safeRedirectToLogin() {
    try {
      await logout({ redirect: false });
    } catch (e) {
      console.warn("Error cerrando sesión:", e);
    } finally {
      window.location.replace("index.html");
    }
  }

  function redirectByRole(role) {
    if (role === "empleado") {
      window.location.replace("index.html");
      return;
    }

    if (role === "admin") {
      window.location.replace("index.html");
      return;
    }

    window.location.replace("index.html");
  }

  async function waitForFirebaseUser(timeoutMs = 12000) {
    const auth = window.firebase?.auth ? window.firebase.auth() : null;
    if (!auth) return null;

    if (auth.currentUser) {
      return auth.currentUser;
    }

    return await new Promise((resolve, reject) => {
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("Timeout esperando a Firebase Auth."));
      }, timeoutMs);

      try {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (typeof unsubscribe === "function") unsubscribe();
          resolve(user || null);
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async function refreshSessionIfPossible() {
    if (typeof window.refreshSession === "function") {
      try {
        await window.refreshSession();
      } catch (e) {
        console.warn("No se pudo refrescar la sesión local:", e);
      }
    }
  }

  function initDataTable(selector, columns) {
    if (!window.jQuery || !$.fn || !$.fn.DataTable) {
      throw new Error("DataTables no está disponible.");
    }

    try {
      return $(selector).DataTable({
        destroy: true,
        autoWidth: false,
        scrollX: true,
        columns
      });
    } catch (e) {
      console.warn("Inicialización de DataTable:", e);
      return $(selector).DataTable({ destroy: true, autoWidth: false, scrollX: true });
    }
  }

  function bindNavigation() {
    const logoutBtn = document.getElementById("logout-button");
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", () => {
        safeRedirectToLogin();
      });
    }
  }

  function isDeveloperRole(data) {
    return String(data?.role || "").trim() === "desarrollador";
  }

  function isAdminRole(data) {
    return String(data?.role || "").trim() === "admin";
  }

  async function resolveCurrentSessionUser() {
    await refreshSessionIfPossible();

    const authUser = await waitForFirebaseUser().catch(() => null);
    const sessionData = await getSessionData().catch(() => null);

    if (!authUser && !sessionData?.uid) {
      return null;
    }

    const uid = String(authUser?.uid || sessionData?.uid || "").trim();
    const email = String(authUser?.email || sessionData?.email || "").trim();

    let userDoc = null;
    let userData = null;

    try {
      if (uid) {
        userDoc = await model.findUserByAuthUid(uid);
      }

      if (!userDoc && email) {
        userDoc = await model.findUserByEmail(email);
      }

      if (userDoc && userDoc.exists) {
        userData = userDoc.data() || {};
      }
    } catch (e) {
      console.warn("No se pudo resolver el perfil del usuario actual:", e);
    }

    if (userData && userDoc && userDoc.exists) {
      try {
        const migration = await ensureCurrentUserCanonicalProfile({
          uid,
          profileData: userData,
          currentDocId: userDoc.id,
          deleteLegacyDoc: false
        });

        if (migration?.migrated && migration?.profile) {
          userData = migration.profile;
        }
      } catch (mErr) {
        console.warn("No se pudo asegurar perfil canónico:", mErr);
      }
    }

    const merged = {
      uid,
      email,
      id: userDoc?.id || sessionData?.docId || uid,
      authUid: userData?.authUid || uid,
      nombre: userData?.nombre || sessionData?.nombre || "",
      role: userData?.role || sessionData?.role || null,
      empresa: userData?.empresa || sessionData?.empresa || "",
      sucursal: userData?.sucursal || sessionData?.sucursal || "",
      blocked: userData?.blocked === true || sessionData?.blocked === true,
      activo: userData?.activo !== undefined ? userData.activo : (sessionData?.activo !== undefined ? sessionData.activo : true),
      docId: userDoc?.id || sessionData?.docId || uid
    };

    return {
      authUser,
      sessionData,
      userDoc,
      userData: merged
    };
  }

  async function enforceBlock(uid) {
    try {
      const userDoc = await model.findUserByAuthUid(uid);
      if (!userDoc || !userDoc.exists) return false;

      const userData = userDoc.data() || {};

      if (userData.blocked === true) {
        await safeRedirectToLogin();
        return true;
      }

      const empresa = userData.empresa || "";
      const sucursal = userData.sucursal || "";

      if (empresa) {
        const empresaDoc = await model.findCompanyByScope(empresa, sucursal);
        if (empresaDoc && empresaDoc.exists && empresaDoc.data()?.blocked === true) {
          await safeRedirectToLogin();
          return true;
        }
      }

      return false;
    } catch (e) {
      console.error("Error en enforceBlock:", e);
      return false;
    }
  }

  async function cargarUsuarios() {
    const tableSelector = "#usuariosTable";
    const tableEl = document.getElementById("usuariosTable");
    if (!tableEl) return;

    let table = null;
    try {
      table = initDataTable(tableSelector, [
        { data: "nombre" },
        { data: "email" },
        { data: "empresa" },
        { data: "sucursal" },
        { data: "role" },
        { data: "blocked", render: b => (b ? "Sí" : "No") },
        { data: "accion", orderable: false }
      ]);
      table.clear();
    } catch (e) {
      console.warn("No se pudo inicializar tabla de usuarios:", e);
    }

    try {
      const snap = await model.listUsers();
      const rows = [];

      snap.forEach(doc => {
        const d = doc.data() || {};
        if (d.role === "desarrollador") return;

        const bloqueado = d.blocked === true;
        rows.push({
          nombre: escapeHtml(d.nombre || ""),
          email: escapeHtml(d.email || ""),
          empresa: escapeHtml(d.empresa || ""),
          sucursal: escapeHtml(d.sucursal || ""),
          role: escapeHtml(d.role || ""),
          blocked: bloqueado,
          accion: `
            <button type="button" class="block-btn ${bloqueado ? "unblock" : ""}" data-kind="user" data-id="${doc.id}">
              ${bloqueado ? "Desbloquear" : "Bloquear"}
            </button>
          `,
          DT_RowId: `user_${doc.id}`
        });
      });

      if (table) {
        table.clear();
        rows.forEach(row => table.row.add(row));
        table.draw();
      } else {
        const tbody = tableEl.querySelector("tbody");
        if (tbody) {
          tbody.innerHTML = "";
          rows.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>${row.nombre}</td>
              <td>${row.email}</td>
              <td>${row.empresa}</td>
              <td>${row.sucursal}</td>
              <td>${row.role}</td>
              <td>${row.blocked ? "Sí" : "No"}</td>
              <td>${row.accion}</td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    } catch (e) {
      console.error("Error cargando usuarios:", e);
      if (e?.code === "permission-denied") {
        console.warn("Firestore rechazó leer usuarios. Verifica reglas publicadas y rol del perfil.");
      }
    }
  }

  async function cargarEmpresas() {
    const tableSelector = "#empresasTable";
    const tableEl = document.getElementById("empresasTable");
    if (!tableEl) return;

    let table = null;
    try {
      table = initDataTable(tableSelector, [
        { data: "empresa" },
        { data: "sucursal" },
        { data: "blocked", render: b => (b ? "Sí" : "No") },
        { data: "accion", orderable: false }
      ]);
      table.clear();
    } catch (e) {
      console.warn("No se pudo inicializar tabla de empresas:", e);
    }

    try {
      const snap = await model.listCompanies();
      const rows = [];

      snap.forEach(doc => {
        const d = doc.data() || {};
        const bloqueado = d.blocked === true;

        rows.push({
          empresa: escapeHtml(d.empresa || ""),
          sucursal: escapeHtml(d.sucursal || ""),
          blocked: bloqueado,
          accion: `
            <button type="button" class="block-btn ${bloqueado ? "unblock" : ""}" data-kind="company" data-id="${doc.id}">
              ${bloqueado ? "Desbloquear" : "Bloquear"}
            </button>
          `,
          DT_RowId: `company_${doc.id}`
        });
      });

      if (table) {
        table.clear();
        rows.forEach(row => table.row.add(row));
        table.draw();
      } else {
        const tbody = tableEl.querySelector("tbody");
        if (tbody) {
          tbody.innerHTML = "";
          rows.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>${row.empresa}</td>
              <td>${row.sucursal}</td>
              <td>${row.blocked ? "Sí" : "No"}</td>
              <td>${row.accion}</td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    } catch (e) {
      console.error("Error cargando empresas:", e);
      if (e?.code === "permission-denied") {
        console.warn("Firestore rechazó leer empresas. Verifica reglas publicadas y rol del perfil.");
      }
    }
  }

  function bindTablesEvents() {
    const usuariosBody = document.querySelector("#usuariosTable tbody");
    if (usuariosBody && !usuariosBody.dataset.bound) {
      usuariosBody.dataset.bound = "1";
      usuariosBody.addEventListener("click", async (e) => {
        const btn = e.target.closest(".block-btn");
        if (!btn || btn.dataset.kind !== "user") return;

        const docId = btn.dataset.id;
        const row = btn.closest("tr");
        if (!row) return;

        try {
          if (btn.classList.contains("unblock")) {
            await model.unblockUser(docId);
          } else {
            await model.blockUser(docId);
          }

          await cargarUsuarios();
        } catch (err) {
          alert("Error: " + (err.message || err));
        }
      });
    }

    const empresasBody = document.querySelector("#empresasTable tbody");
    if (empresasBody && !empresasBody.dataset.bound) {
      empresasBody.dataset.bound = "1";
      empresasBody.addEventListener("click", async (e) => {
        const btn = e.target.closest(".block-btn");
        if (!btn || btn.dataset.kind !== "company") return;

        const docId = btn.dataset.id;

        try {
          if (btn.classList.contains("unblock")) {
            await model.unblockCompany(docId);
          } else {
            await model.blockCompany(docId);
          }

          await cargarEmpresas();
        } catch (err) {
          alert("Error: " + (err.message || err));
        }
      });
    }
  }

  async function initBlockerPage() {
    bindNavigation();
    bindTablesEvents();

    try {
      const sessionPack = await resolveCurrentSessionUser();
      const userData = sessionPack?.userData || null;

      if (!userData || !userData.uid) {
        await safeRedirectToLogin();
        return;
      }

      if (!isDeveloperRole(userData)) {
        redirectByRole(userData.role);
        return;
      }

      currentSessionUser = userData;
      adminEmpresa = userData.empresa || "";
      adminSucursal = userData.sucursal || "";

      const blocked = await enforceBlock(userData.uid);
      if (blocked) return;

      window.adminSessionUserData = userData;
      window.adminUserDocId = userData.docId || userData.id || userData.uid;
      window.adminEmpresa = adminEmpresa;
      window.adminSucursal = adminSucursal;

      await cargarUsuarios();
      await cargarEmpresas();
    } catch (err) {
      console.error("Error inicializando blocker.controller:", err);
      await safeRedirectToLogin();
    }
  }

  document.addEventListener("DOMContentLoaded", initBlockerPage);

  window.cargarUsuarios = cargarUsuarios;
  window.cargarEmpresas = cargarEmpresas;
  window.enforceBlock = enforceBlock;
})();