export default class RegisterModel {
  constructor(db) {
    if (!db) {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
  }

  async getAdminCompanies() {
    const snapshot = await this.db.collection("usuarios")
      .where("role", "==", "admin")
      .get();

    const empresas = new Set();

    snapshot.forEach(doc => {
      const data = doc.data() || {};
      if (data.empresa) {
        empresas.add(String(data.empresa).trim());
      }
    });

    return Array.from(empresas).sort();
  }

  async getBranchesByCompany(empresa) {
    const value = String(empresa || "").trim();
    if (!value) return [];

    const snapshot = await this.db.collection("usuarios")
      .where("empresa", "==", value)
      .get();

    const sucursales = new Set();

    snapshot.forEach(doc => {
      const data = doc.data() || {};
      if (data.sucursal) {
        sucursales.add(String(data.sucursal).trim());
      }
    });

    return Array.from(sucursales).sort();
  }

  async emailExists(email) {
    const value = String(email || "").trim().toLowerCase();
    if (!value) return false;

    const snap = await this.db.collection("usuarios")
      .where("email", "==", value)
      .limit(1)
      .get();

    return !snap.empty;
  }

  async identificationExists(identificacion) {
    const value = String(identificacion || "").trim();
    if (!value) return false;

    const snap = await this.db.collection("usuarios")
      .where("identificacion", "==", value)
      .limit(1)
      .get();

    return !snap.empty;
  }

  async adminExistsInScope(empresa, sucursal) {
    const emp = String(empresa || "").trim();
    const suc = String(sucursal || "").trim();

    if (!emp || !suc) return false;

    const snap = await this.db.collection("usuarios")
      .where("empresa", "==", emp)
      .where("sucursal", "==", suc)
      .where("role", "==", "admin")
      .limit(1)
      .get();

    return !snap.empty;
  }
}