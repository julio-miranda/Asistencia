export default class BlockerModel {
  constructor(db) {
    if (!db || typeof db.collection !== "function") {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
  }

  normalize(value) {
    return String(value || "").trim();
  }

  async findUserByAuthUid(uid) {
    const clean = this.normalize(uid);
    if (!clean) return null;

    const snap = await this.db.collection("usuarios")
      .where("authUid", "==", clean)
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0];
  }

  async findUserByEmail(email) {
    const clean = this.normalize(email);
    if (!clean) return null;

    const snap = await this.db.collection("usuarios")
      .where("email", "==", clean)
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0];
  }

  async findCompanyByScope(empresa, sucursal) {
    const cleanEmpresa = this.normalize(empresa);
    const cleanSucursal = this.normalize(sucursal);

    if (!cleanEmpresa) return null;

    let query = this.db.collection("empresas")
      .where("empresa", "==", cleanEmpresa);

    if (cleanSucursal !== "") {
      query = query.where("sucursal", "==", cleanSucursal);
    }

    const snap = await query.limit(1).get();
    return snap.empty ? null : snap.docs[0];
  }

  async listUsers() {
    return await this.db.collection("usuarios").get();
  }

  async listCompanies() {
    return await this.db.collection("empresas").get();
  }

  async blockUser(docId) {
    const clean = this.normalize(docId);
    if (!clean) throw new Error("docId requerido para bloquear usuario");
    await this.db.collection("usuarios").doc(clean).update({ blocked: true });
  }

  async unblockUser(docId) {
    const clean = this.normalize(docId);
    if (!clean) throw new Error("docId requerido para desbloquear usuario");
    await this.db.collection("usuarios").doc(clean).update({ blocked: false });
  }

  async blockCompany(docId) {
    const clean = this.normalize(docId);
    if (!clean) throw new Error("docId requerido para bloquear empresa");
    await this.db.collection("empresas").doc(clean).update({ blocked: true });
  }

  async unblockCompany(docId) {
    const clean = this.normalize(docId);
    if (!clean) throw new Error("docId requerido para desbloquear empresa");
    await this.db.collection("empresas").doc(clean).update({ blocked: false });
  }
}