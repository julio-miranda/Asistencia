export default class EmployeeModel {
  constructor(db) {
    if (!db) {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
  }

  getUserByAuthUid(uid) {
    if (!uid) return null;

    return this.db.collection("usuarios")
      .where("authUid", "==", String(uid).trim())
      .limit(1)
      .get()
      .then(snap => (snap.empty ? null : snap.docs[0]));
  }

  getUserByEmail(email) {
    if (!email) return null;

    return this.db.collection("usuarios")
      .where("email", "==", String(email).trim())
      .limit(1)
      .get()
      .then(snap => (snap.empty ? null : snap.docs[0]));
  }

  getUserByLogin(login) {
    const value = String(login || "").trim();
    if (!value) return Promise.resolve(null);

    return this.getUserByAuthUid(value).then(doc => {
      if (doc) return doc;
      return this.getUserByEmail(value);
    });
  }

  getJornadaById(id) {
    if (!id) return null;
    return this.db.collection("jornadas").doc(String(id)).get();
  }

  getJornadasByIds(ids = []) {
    const cleanIds = Array.isArray(ids)
      ? ids.map(v => String(v || "").trim()).filter(Boolean)
      : [];

    if (!cleanIds.length) return Promise.resolve([]);

    return Promise.all(cleanIds.map(id => this.getJornadaById(id)));
  }

  getEmpresaByScope(empresa = "", sucursal = "") {
    let query = this.db.collection("empresas")
      .where("empresa", "==", String(empresa).trim());

    if (String(sucursal).trim()) {
      query = query.where("sucursal", "==", String(sucursal).trim());
    }

    return query.limit(1).get()
      .then(snap => (snap.empty ? null : snap.docs[0]));
  }

  createAsistenciaRef(userId, fecha) {
    return this.db.collection("asistencias").doc(`${String(userId)}_${String(fecha)}`);
  }

  async createEmpresaLocationIfNeeded(empresa, sucursal, lat, lng) {
    if (!empresa || !sucursal) return null;

    return await this.db.collection("empresas").add({
      empresa: String(empresa).trim(),
      sucursal: String(sucursal).trim(),
      lat: Number(lat),
      lng: Number(lng)
    });
  }

  async updateAsistencia(ref, data) {
    if (!ref) throw new Error("Referencia de asistencia inválida.");
    await ref.update(data);
  }

  async setAsistencia(ref, data) {
    if (!ref) throw new Error("Referencia de asistencia inválida.");
    await ref.set(data);
  }
}