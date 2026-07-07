export default class RegisterModel {
  constructor(db, auth = null) {
    if (!db || typeof db.collection !== "function") {
      throw new Error("Firestore no está disponible.");
    }

    this.db = db;
    this.auth = auth || (window.firebase && typeof window.firebase.auth === "function"
      ? window.firebase.auth()
      : null);
  }

  normalize(value) {
    return String(value || "").trim();
  }

  normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  getAuth() {
    if (this.auth) return this.auth;

    if (window.firebase && typeof window.firebase.auth === "function") {
      this.auth = window.firebase.auth();
      return this.auth;
    }

    return null;
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

    try {
      const auth = this.getAuth();

      if (auth && typeof auth.fetchSignInMethodsForEmail === "function") {
        const methods = await auth.fetchSignInMethodsForEmail(value);
        return Array.isArray(methods) && methods.length > 0;
      }

      console.warn("Auth no está disponible para verificar correo.");
      return false;
    } catch (error) {
      console.warn("No se pudo verificar si el correo existe:", error);
      return false;
    }
  }

  async identificationExists(identificacion) {
    const value = this.normalize(identificacion);
    if (!value) return false;

    try {
      const snap = await this.db.collection("usuarios")
        .where("identificacion", "==", value)
        .limit(1)
        .get();

      return !snap.empty;
    } catch (error) {
      console.warn("No se pudo verificar si la identificación existe:", error);
      return false;
    }
  }
}