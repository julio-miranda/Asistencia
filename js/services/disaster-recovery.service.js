export default class DisasterRecoveryService {
  constructor(db, collectionConfig = null) {
    if (!db || typeof db.collection !== "function") {
      throw new Error("Firestore no está disponible.");
    }

    this.db = db;
    this.collectionConfig = collectionConfig || {
      usuarios: { empresaField: "empresa", sucursalField: "sucursal" },
      jornadas: { empresaField: "empresa", sucursalField: "sucursal" },
      asistencias: { empresaField: "empresa", sucursalField: "sucursal" },
      empresas: { empresaField: "empresa", sucursalField: "sucursal" },
    };
  }

  _clean(value) {
    return String(value ?? "").trim();
  }

  _normalize(value) {
    return this._clean(value).toLowerCase();
  }

  _matchesScopeData(data, empresa, sucursal) {
    const scopeEmpresa = this._normalize(empresa);
    const scopeSucursal = this._normalize(sucursal);

    const candidates = [
      { empresa: data?.empresa, sucursal: data?.sucursal },
      { empresa: data?.scope?.empresa, sucursal: data?.scope?.sucursal },
      { empresa: data?.metadata?.empresa, sucursal: data?.metadata?.sucursal },
      { empresa: data?.empresaNombre, sucursal: data?.sucursalNombre }
    ];

    return candidates.some((item) => {
      return this._normalize(item.empresa) === scopeEmpresa
        && this._normalize(item.sucursal) === scopeSucursal;
    });
  }

  _dedupeDocs(docs = []) {
    const map = new Map();

    for (const doc of docs) {
      if (!doc || !doc.collection || !doc.id) continue;
      const key = `${doc.collection}/${doc.id}`;
      if (!map.has(key)) {
        map.set(key, {
          collection: doc.collection,
          id: doc.id,
          path: key,
          data: doc.data || {}
        });
      }
    }

    return [...map.values()];
  }

  async _fetchCollectionDocs(collectionName, empresa, sucursal) {
    const config = this.collectionConfig[collectionName];
    if (!config) return [];

    const empresaField = config.empresaField || "empresa";
    const sucursalField = config.sucursalField || "sucursal";

    try {
      let query = this.db.collection(collectionName);

      // Filtrado directo por empresa y sucursal para evitar exportar documentos fuera de alcance.
      if (empresaField) {
        query = query.where(empresaField, "==", empresa);
      }

      if (sucursalField) {
        query = query.where(sucursalField, "==", sucursal);
      }

      const snapshot = await query.get();
      const docs = [];

      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        if (!this._matchesScopeData(data, empresa, sucursal)) return;

        docs.push({
          collection: collectionName,
          id: doc.id,
          path: `${collectionName}/${doc.id}`,
          data
        });
      });

      return docs;
    } catch (err) {
      console.warn(`Error exportando ${collectionName}:`, err);
      return [];
    }
  }

  async exportBackup({ empresa, sucursal, collections = null }) {
    const scopeEmpresa = this._clean(empresa);
    const scopeSucursal = this._clean(sucursal);

    if (!scopeEmpresa || !scopeSucursal) {
      throw new Error("Empresa y sucursal son requeridas para exportar.");
    }

    const selectedCollections = Array.isArray(collections) && collections.length
      ? collections
      : Object.keys(this.collectionConfig);

    const allDocs = [];

    for (const collectionName of selectedCollections) {
      const docs = await this._fetchCollectionDocs(collectionName, scopeEmpresa, scopeSucursal);
      allDocs.push(...docs);
    }

    const deduped = this._dedupeDocs(allDocs);

    return {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      scope: {
        empresa: scopeEmpresa,
        sucursal: scopeSucursal
      },
      collections: selectedCollections,
      totalDocs: deduped.length,
      docs: deduped
    };
  }

  async downloadBackupFile(backupObject, filenamePrefix = "respaldo") {
    const json = JSON.stringify(backupObject, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const fecha = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `${filenamePrefix}_${fecha}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importBackup(backupObject, { empresa, sucursal, mode = "merge" } = {}) {
    if (!backupObject || typeof backupObject !== "object") {
      throw new Error("El archivo de respaldo no es válido.");
    }

    const scopeEmpresa = this._clean(empresa);
    const scopeSucursal = this._clean(sucursal);

    if (!scopeEmpresa || !scopeSucursal) {
      throw new Error("Empresa y sucursal son requeridas para importar.");
    }

    const docs = Array.isArray(backupObject.docs) ? backupObject.docs : [];
    const uniqueDocs = this._dedupeDocs(docs);

    const imported = [];
    const skipped = [];

    for (const item of uniqueDocs) {
      if (!item.collection || !item.id) {
        skipped.push({ path: item?.path || "", reason: "Documento inválido" });
        continue;
      }

      const data = item.data || {};

      if (!this._matchesScopeData(data, scopeEmpresa, scopeSucursal)) {
        skipped.push({
          path: item.path,
          reason: "Fuera de empresa/sucursal"
        });
        continue;
      }

      try {
        const ref = this.db.collection(item.collection).doc(item.id);

        if (mode === "overwrite") {
          await ref.set(data);
        } else {
          await ref.set(data, { merge: true });
        }

        imported.push(item.path);
      } catch (err) {
        skipped.push({
          path: item.path,
          reason: err.message || String(err)
        });
      }
    }

    return {
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped
    };
  }
}