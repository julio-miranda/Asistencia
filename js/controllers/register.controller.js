import RegisterModel from "../models/register.model.js";
import { crearUsuarioCompleto } from "../services/register.service.js";

(function (window, document) {
  "use strict";

  const db = window.db;
  if (!db) {
    console.error("Firestore 'db' no está disponible en window.");
    return;
  }

  const auth = window.firebase && typeof window.firebase.auth === "function"
    ? window.firebase.auth()
    : null;

  const model = new RegisterModel(db, auth);

  const empresaSelect = document.getElementById("register-empresa-select");
  const sucursalSelect = document.getElementById("register-sucursal-select");

  const contSucursal = document.getElementById("sucursal-select-container");
  const contManualSuc = document.getElementById("manual-sucursal-container");
  const inputManualSuc = document.getElementById("register-sucursal-manual");

  const contManualEmpresa = document.getElementById("manual-empresa-container");
  const inputManualEmpresa = document.getElementById("register-empresa-manual");

  const registerForm = document.getElementById("register-form");
  const submitButton = registerForm
    ? registerForm.querySelector('button[type="submit"]')
    : null;

  const inputNumero = document.getElementById("register-numero");
  const selectTipo = document.getElementById("register-identificacionNombre");

  function setVisible(el, visible) {
    if (el) el.style.display = visible ? "block" : "none";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function obtenerTextoInput(el) {
    return String(el?.value || "").trim();
  }

  function normalizarTipoDocumento(valor) {
    const v = String(valor || "").trim().toLowerCase();
    if (v.includes("dui")) return "dui";
    if (v.includes("pasaporte")) return "pasaporte";
    return "";
  }

  function formatearDUI(valor) {
    valor = String(valor || "").replace(/\D/g, "");
    if (valor.length > 8) {
      valor = valor.substring(0, 8) + "-" + valor.substring(8, 9);
    }
    return valor.substring(0, 10);
  }

  function validarDUI(dui) {
    return /^\d{8}-\d{1}$/.test(String(dui || "").trim());
  }

  function resetSucursalSelect() {
    if (!sucursalSelect) return;

    sucursalSelect.innerHTML = "";

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.selected = true;
    optDefault.textContent = "Selecciona una sucursal";
    sucursalSelect.appendChild(optDefault);

    const optOtro = document.createElement("option");
    optOtro.value = "otro";
    optOtro.textContent = "Otro";
    sucursalSelect.appendChild(optOtro);
  }

  function updateSucursalUI(useSelect, useManual) {
    setVisible(contSucursal, useSelect);
    setVisible(contManualSuc, useManual);

    if (sucursalSelect) {
      sucursalSelect.disabled = !useSelect;
      sucursalSelect.required = useSelect;
    }

    if (inputManualSuc) {
      inputManualSuc.required = useManual;
      if (!useManual) inputManualSuc.value = "";
    }
  }

  function updateEmpresaManualUI(show) {
    setVisible(contManualEmpresa, show);

    if (inputManualEmpresa) {
      inputManualEmpresa.required = show;
      if (!show) inputManualEmpresa.value = "";
    }
  }

  async function cargarEmpresas() {
    if (!empresaSelect) return;

    try {
      const empresas = await model.getPublicCompanies();

      empresaSelect.innerHTML = `
        <option value="">Selecciona una empresa</option>
        <option value="otro">Otro</option>
      `;

      empresas.forEach(emp => {
        const opt = document.createElement("option");
        opt.value = emp;
        opt.textContent = emp;
        empresaSelect.insertBefore(opt, empresaSelect.lastElementChild);
      });
    } catch (error) {
      console.error("Error cargando empresas:", error);
    }
  }

  async function cargarSucursalesDeEmpresa(empresa) {
    resetSucursalSelect();

    try {
      const sucursales = await model.getBranchesByCompany(empresa);

      if (!sucursales.length) {
        updateSucursalUI(false, true);
        return;
      }

      sucursales.forEach(suc => {
        const opt = document.createElement("option");
        opt.value = suc;
        opt.textContent = suc;

        const otroOpt = sucursalSelect.querySelector('option[value="otro"]');
        if (otroOpt) {
          sucursalSelect.insertBefore(opt, otroOpt);
        } else {
          sucursalSelect.appendChild(opt);
        }
      });

      updateSucursalUI(true, false);
    } catch (error) {
      console.error("Error cargando sucursales:", error);
      updateSucursalUI(false, true);
    }
  }

  function bindDuiFormat() {
    if (inputNumero && selectTipo) {
      inputNumero.addEventListener("input", () => {
        const tipo = normalizarTipoDocumento(selectTipo.value);
        if (tipo === "dui") {
          inputNumero.value = formatearDUI(inputNumero.value);
        }
      });
    }
  }

  function bindCompanyChange() {
    if (!empresaSelect) return;

    empresaSelect.addEventListener("change", async function () {
      const selectedEmpresa = obtenerTextoInput(this);

      resetSucursalSelect();
      updateEmpresaManualUI(false);

      if (selectedEmpresa === "otro") {
        updateEmpresaManualUI(true);
        updateSucursalUI(false, true);
        return;
      }

      if (!selectedEmpresa) {
        updateSucursalUI(false, false);
        return;
      }

      await cargarSucursalesDeEmpresa(selectedEmpresa);
    });
  }

  function bindBranchChange() {
    if (!sucursalSelect) return;

    sucursalSelect.addEventListener("change", function () {
      const selected = obtenerTextoInput(this);

      if (selected === "otro") {
        updateSucursalUI(false, true);
      } else if (selected) {
        updateSucursalUI(true, false);
      }
    });
  }

  function getSelectedEmpresa() {
    const empresa = obtenerTextoInput(empresaSelect);
    if (empresa === "otro") {
      return obtenerTextoInput(inputManualEmpresa);
    }
    return empresa;
  }

  function getSelectedSucursal() {
    const sucursal = obtenerTextoInput(sucursalSelect);
    if (sucursal === "otro") {
      return obtenerTextoInput(inputManualSuc);
    }
    return sucursal;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (submitButton) submitButton.disabled = true;

    try {
      const nombre = obtenerTextoInput(document.getElementById("register-nombre"));
      const numero = obtenerTextoInput(inputNumero);
      const identificacionNombreRaw = obtenerTextoInput(selectTipo);
      const identificacionNombre = normalizarTipoDocumento(identificacionNombreRaw);
      const fecha = obtenerTextoInput(document.getElementById("register-Fecha"));
      const direccion = obtenerTextoInput(document.getElementById("register-direccion"));
      const telefono = obtenerTextoInput(document.getElementById("register-telefono"));
      const email = obtenerTextoInput(document.getElementById("register-email")).toLowerCase();
      const pass = document.getElementById("register-password")?.value || "";
      const pass2 = document.getElementById("register-password2")?.value || "";

      if (!nombre) return alert("Nombre obligatorio.");
      if (!numero) return alert("Número obligatorio.");
      if (!identificacionNombre) return alert("Selecciona tipo documento.");

      if (identificacionNombre === "dui" && !validarDUI(numero)) {
        return alert("Formato DUI inválido (00000000-0)");
      }

      if (!isValidEmail(email)) return alert("Correo inválido.");
      if (!pass || pass !== pass2) return alert("Contraseñas incorrectas.");

      const empresa = getSelectedEmpresa();
      const sucursal = getSelectedSucursal();

      if (!empresa) return alert("Selecciona o ingresa una empresa.");
      if (!sucursal) return alert("Selecciona o ingresa una sucursal.");

      let emailExiste = false;
      let idExiste = false;

      try {
        emailExiste = await model.emailExists(email);
      } catch (checkErr) {
        console.warn("No se pudo verificar si el correo existe:", checkErr);
      }

      try {
        idExiste = await model.identificationExists(numero);
      } catch (checkErr) {
        console.warn("No se pudo verificar si la identificación existe:", checkErr);
      }

      if (emailExiste) return alert("Correo ya existe.");
      if (idExiste) return alert("Identificación ya existe.");

      const payload = {
        email,
        password: pass,
        nombre,
        identificacion: numero,
        identificacionNombre,
        nacimiento: fecha,
        descripcion: "Sin descripción",
        salarioH: 1.25,
        role: "empleado",
        empresa,
        sucursal,
        direccion,
        telefono,
        activo: true,
        blocked: false,
        createdAt: Date.now()
      };

      const creationResult = await crearUsuarioCompleto(payload, {
        saveIdentificationLookup: false
      });

      const authUid = String(
        creationResult?.authUid ||
        auth?.currentUser?.uid ||
        ""
      ).trim();

      if (!authUid) {
        throw new Error("No se pudo obtener el authUid del usuario creado.");
      }

      try {
        if (auth) await auth.signOut();
      } catch (signOutError) {
        console.warn("No se pudo cerrar sesión después del registro:", signOutError);
      }

      alert("Registro exitoso");
      window.location.href = "index.html";
    } catch (err) {
      console.error(err);
      alert("Error: " + (err.message || err));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function init() {
    bindDuiFormat();
    bindCompanyChange();
    bindBranchChange();

    if (registerForm && !registerForm.dataset.bound) {
      registerForm.dataset.bound = "1";
      registerForm.addEventListener("submit", handleSubmit);
    }

    await cargarEmpresas();
    updateSucursalUI(false, false);
    updateEmpresaManualUI(false);
  }

  document.addEventListener("DOMContentLoaded", init);

})(window, document);