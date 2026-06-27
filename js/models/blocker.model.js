export default class BlockerModel {
  constructor(db) {
    if (!db) {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
  }

  async findUserByAuthUid(uid) {
    if (!uid) return null;

    const snap = await this.db.collection("usuarios")
      .where("authUid", "==", String(uid).trim())
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0];
  }

  async findUserByEmail(email) {
    if (!email) return null;

    const snap = await this.db.collection("usuarios")
      .where("email", "==", String(email).trim())
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0];
  }

  async findCompanyByScope(empresa, sucursal) {
    if (!empresa) return null;

    let query = this.db.collection("empresas")
      .where("empresa", "==", String(empresa).trim());

    if (String(sucursal || "").trim() !== "") {
      query = query.where("sucursal", "==", String(sucursal).trim());
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
    if (!docId) throw new Error("docId requerido para bloquear usuario");
    await this.db.collection("usuarios").doc(String(docId)).update({ blocked: true });
  }

  async unblockUser(docId) {
    if (!docId) throw new Error("docId requerido para desbloquear usuario");
    await this.db.collection("usuarios").doc(String(docId)).update({ blocked: false });
  }

  async blockCompany(docId) {
    if (!docId) throw new Error("docId requerido para bloquear empresa");
    await this.db.collection("empresas").doc(String(docId)).update({ blocked: true });
  }

  async unblockCompany(docId) {
    if (!docId) throw new Error("docId requerido para desbloquear empresa");
    await this.db.collection("empresas").doc(String(docId)).update({ blocked: false });
  }
}