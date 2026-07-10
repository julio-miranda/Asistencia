import DisasterRecoveryService from "../services/disaster-recovery.service.js";
import { getSessionData } from "../services/session.service.js";

const db = window.db;
const service = new DisasterRecoveryService(db);

const AVAILABLE_COLLECTIONS = [
  { key: "usuarios", label: "Usuarios" },
  { key: "jornadas", label: "Jornadas" },
  { key: "asistencias", label: "Asistencias" },
  { key: "empresas", label: "Empresas" },
];

function setStatus(message, isError = false) {
  const el = document.getElementById("backupStatus");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#b00020" : "#1b5e20";
  console.log(message);
}

function getCheckedCollections() {
  return AVAILABLE_COLLECTIONS
    .filter(({ key }) => {
      const input = document.getElementById(`collection_${key}`);
      return input ? input.checked : false;
    })
    .map(({ key }) => key);
}

function buildCollectionsUI() {
  const container = document.getElementById("collectionsList");
  if (!container) return;

  container.innerHTML = "";

  for (const item of AVAILABLE_COLLECTIONS) {
    const wrap = document.createElement("label");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    wrap.style.margin = "0";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `collection_${item.key}`;
    input.checked = true;

    const span = document.createElement("span");
    span.textContent = item.label;

    wrap.appendChild(input);
    wrap.appendChild(span);
    container.appendChild(wrap);
  }
}

async function getCurrentScopeDefaults() {
  const session = await getSessionData().catch(() => null);
  return {
    empresa: String(session?.empresa || "").trim(),
    sucursal: String(session?.sucursal || "").trim(),
    role: String(session?.role || "").trim()
  };
}

async function initScopeInputs() {
  const defaults = await getCurrentScopeDefaults();

  const empresaInput = document.getElementById("empresaInput");
  const sucursalInput = document.getElementById("sucursalInput");

  if (empresaInput && !empresaInput.value) {
    empresaInput.value = defaults.empresa || "";
  }

  if (sucursalInput && !sucursalInput.value) {
    sucursalInput.value = defaults.sucursal || "";
  }
}

async function assertBackupPermission() {
  const session = await getSessionData().catch(() => null);
  const role = String(session?.role || "").trim();

  if (role !== "admin" && role !== "desarrollador") {
    throw new Error("Este módulo solo puede ser usado por administradores o desarrolladores.");
  }

  return session;
}

async function handleExport() {
  try {
    await assertBackupPermission();

    const empresa = document.getElementById("empresaInput")?.value || "";
    const sucursal = document.getElementById("sucursalInput")?.value || "";
    const collections = getCheckedCollections();

    if (!empresa.trim() || !sucursal.trim()) {
      setStatus("Debes indicar empresa y sucursal.", true);
      return;
    }

    if (!collections.length) {
      setStatus("Debes seleccionar al menos una colección.", true);
      return;
    }

    setStatus("Exportando respaldo...");

    const backup = await service.exportBackup({
      empresa,
      sucursal,
      collections
    });

    await service.downloadBackupFile(backup, `respaldo_${empresa}_${sucursal}`);
    setStatus(`Respaldo exportado. Documentos incluidos: ${backup.totalDocs}`);
  } catch (err) {
    console.error(err);
    setStatus(`Error al exportar: ${err.message || err}`, true);
  }
}

async function readJsonFile(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "{}")));
      } catch (_) {
        reject(new Error("El archivo no contiene JSON válido."));
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsText(file);
  });
}

async function handleImport() {
  try {
    await assertBackupPermission();

    const fileInput = document.getElementById("importFileInput");
    const empresa = document.getElementById("empresaInput")?.value || "";
    const sucursal = document.getElementById("sucursalInput")?.value || "";
    const mode = document.getElementById("importMode")?.value || "merge";

    if (!empresa.trim() || !sucursal.trim()) {
      setStatus("Debes indicar empresa y sucursal.", true);
      return;
    }

    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      setStatus("Selecciona un archivo JSON de respaldo.", true);
      return;
    }

    const file = fileInput.files[0];
    const backup = await readJsonFile(file);

    if (!backup || typeof backup !== "object" || !Array.isArray(backup.docs)) {
      setStatus("El archivo no tiene la estructura de respaldo esperada.", true);
      return;
    }

    if (!confirm(`Se importarán documentos para empresa "${empresa}" y sucursal "${sucursal}".`)) {
      setStatus("Importación cancelada.");
      return;
    }

    setStatus("Importando respaldo...");

    const result = await service.importBackup(backup, {
      empresa,
      sucursal,
      mode
    });

    setStatus(
      `Importación terminada. Importados: ${result.importedCount}. Omitidos: ${result.skippedCount}.`
    );
  } catch (err) {
    console.error(err);
    setStatus(`Error al importar: ${err.message || err}`, true);
  }
}

function initBackupModule() {
  buildCollectionsUI();
  initScopeInputs();

  const exportBtn = document.getElementById("btnExportBackup");
  const importBtn = document.getElementById("btnImportBackup");

  if (exportBtn) {
    exportBtn.addEventListener("click", handleExport);
  }

  if (importBtn) {
    importBtn.addEventListener("click", handleImport);
  }

  setStatus("Módulo de recuperación listo.");
}

document.addEventListener("DOMContentLoaded", initBackupModule);