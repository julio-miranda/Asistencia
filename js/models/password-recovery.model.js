export default class PasswordRecoveryModel {
  constructor(db) {
    if (!db) {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
  }

  async getUserByEmail(email) {
    const value = String(email || "").trim();
    if (!value) return null;

    const snap = await this.db.collection("usuarios")
      .where("email", "==", value)
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0];
  }

  async getUserByIdentification(identificacion) {
    const value = String(identificacion || "").trim();
    if (!value) return null;

    const snap = await this.db.collection("usuarios")
      .where("identificacion", "==", value)
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0];
  }

  async resolveEmailFromLogin(login) {
    const value = String(login || "").trim();
    if (!value) return null;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailPattern.test(value)) {
      return value;
    }

    const docByEmail = await this.getUserByEmail(value);
    if (docByEmail) {
      const data = docByEmail.data() || {};
      return String(data.email || "").trim() || null;
    }

    const docById = await this.getUserByIdentification(value);
    if (docById) {
      const data = docById.data() || {};
      return String(data.email || "").trim() || null;
    }

    return null;
  }
}