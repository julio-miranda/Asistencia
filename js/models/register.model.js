// js/models/register.model.js
export default class RegisterModel {
  constructor(db) {
    if (!db || typeof db.collection !== "function") {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
  }

  normalize(value) {
    return String(value || "").trim();
  }

  normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  async getPublicCompanies() {
    const snapshot = await this.db.collection("empresas").get();

    const empresas = new Set();
    snapshot.forEach(doc => {
      const data = doc.data() || {};
      const empresa = this.normalize(data.empresa);
      if (empresa) empresas.add(empresa);
    });

    return Array.from(empresas).sort();
  }

  async getBranchesByCompany(empresa) {
    const value = this.normalize(empresa);
    if (!value) return [];

    const snapshot = await this.db.collection("empresas")
      .where("empresa", "==", value)
      .get();

    const sucursales = new Set();

    snapshot.forEach(doc => {
      const data = doc.data() || {};
      const sucursal = this.normalize(data.sucursal);
      if (sucursal) {
        sucursales.add(sucursal);
      }
    });

    return Array.from(sucursales).sort();
  }

  async emailExists(email) {
    const value = this.normalizeEmail(email);
    if (!value) return false;

    const snap = await this.db.collection("usuarios")
      .where("email", "==", value)
      .limit(1)
      .get();

    return !snap.empty;
  }

  async identificationExists(identificacion) {
    const value = this.normalize(identificacion);
    if (!value) return false;

    const snap = await this.db.collection("usuarios")
      .where("identificacion", "==", value)
      .limit(1)
      .get();

    return !snap.empty;
  }
}