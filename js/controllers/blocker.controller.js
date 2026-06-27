import BlockerModel from "../models/blocker.model.js";
import { checkUserSession, logout } from "../services/session.service.js";

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeRedirectToLogin() {
    logout({ redirect: true }).catch(() => {
      window.location.href = "index.html";
    });
  }

  function redirectByRole(role) {
    if (role === "empleado") {
      window.location.href = "employee.html";
      return;
    }

    if (role === "admin") {
      window.location.href = "admin.html";
      return;
    }

    window.location.href = "index.html";
  }

  async function getSessionUser() {
    if (typeof checkUserSession !== "function") return null;

    return await checkUserSession(async (uid, userData, docId) => {
      return { uid, userData, docId };
    });
  }

  async function enforceBlock(uid) {
    try {
      const userDoc = await model.findUserByAuthUid(uid);
      if (!userDoc || !userDoc.exists) return false;

      const userData = userDoc.data() || {};

      if (userData.blocked === true) {
        safeRedirectToLogin();
        return true;
      }

      const empresa = userData.empresa || "";
      const sucursal = userData.sucursal || "";

      if (empresa) {
        const empresaDoc = await model.findCompanyByScope(empresa, sucursal);
        if (empresaDoc && empresaDoc.exists && empresaDoc.data()?.blocked === true) {
          safeRedirectToLogin();
          return true;
        }
      }

      return false;
    } catch (e) {
      console.error("Error en enforceBlock:", e);
      return false;
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
      logoutBtn.addEventListener("click", () => safeRedirectToLogin());
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

        const dataTable = $.fn.DataTable && $.fn.DataTable.isDataTable("#usuariosTable")
          ? $("#usuariosTable").DataTable()
          : null;

        try {
          if (btn.classList.contains("unblock")) {
            await model.unblockUser(docId);
          } else {
            await model.blockUser(docId);
          }

          if (dataTable) {
            await cargarUsuarios();
          } else if (row.children[5]) {
            const blockedNow = !btn.classList.contains("unblock");
            row.children[5].textContent = blockedNow ? "Sí" : "No";
            btn.classList.toggle("unblock", blockedNow);
            btn.textContent = blockedNow ? "Desbloquear" : "Bloquear";
          }
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
      const session = await getSessionUser();
      if (!session || !session.uid) {
        safeRedirectToLogin();
        return;
      }

      const userDoc = await model.findUserByAuthUid(session.uid);
      if (!userDoc || !userDoc.exists) {
        safeRedirectToLogin();
        return;
      }

      const userData = userDoc.data() || {};

      if (userData.role !== "desarrollador") {
        redirectByRole(userData.role);
        return;
      }

      adminEmpresa = userData.empresa || "";
      adminSucursal = userData.sucursal || "";

      const blocked = await enforceBlock(session.uid);
      if (blocked) return;

      await cargarUsuarios();
      await cargarEmpresas();
    } catch (err) {
      console.error("Error inicializando blocker.controller:", err);
      safeRedirectToLogin();
    }
  }

  document.addEventListener("DOMContentLoaded", initBlockerPage);

  window.cargarUsuarios = cargarUsuarios;
  window.cargarEmpresas = cargarEmpresas;
  window.enforceBlock = enforceBlock;
})();