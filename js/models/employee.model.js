export default class EmployeeModel {
  constructor(db) {
    if (!db || typeof db.collection !== "function") {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
  }

  _cleanString(value) {
    return String(value || "").trim();
  }

  async getUserByAuthUid(uid) {
    try {
      const clean = this._cleanString(uid);
      if (!clean) return null;

      const snap = await this.db.collection("usuarios")
        .where("authUid", "==", clean)
        .limit(1)
        .get();

      return snap.empty ? null : snap.docs[0];
    } catch (e) {
      console.warn("Error getUserByAuthUid:", e);
      return null;
    }
  }

  async getUserByEmail(email) {
    try {
      const clean = this._cleanString(email);
      if (!clean) return null;

      const snap = await this.db.collection("usuarios")
        .where("email", "==", clean)
        .limit(1)
        .get();

      return snap.empty ? null : snap.docs[0];
    } catch (e) {
      console.warn("Error getUserByEmail:", e);
      return null;
    }
  }

  async getUserByLogin(login) {
    const value = this._cleanString(login);
    if (!value) return null;

    try {
      const byAuth = await this.getUserByAuthUid(value);
      if (byAuth) return byAuth;
      return await this.getUserByEmail(value);
    } catch (e) {
      console.warn("Error getUserByLogin:", e);
      return null;
    }
  }

  async createOrUpdateUser(profile = {}) {
    try {
      const authUid = this._cleanString(profile.authUid || profile.id);
      if (!authUid) throw new Error("authUid es requerido para crear/actualizar usuario.");

      const ref = this.db.collection("usuarios").doc(authUid);
      const data = {
        ...profile,
        authUid,
        docId: authUid
      };

      await ref.set(data, { merge: true });
      return ref;
    } catch (e) {
      console.warn("Error createOrUpdateUser:", e);
      throw e;
    }
  }

  async ensureUserByAuthUid(authUid, profileFallback = {}) {
    try {
      const clean = this._cleanString(authUid);
      if (!clean) return null;

      const existing = await this.getUserByAuthUid(clean);
      if (existing && existing.exists) {
        return existing;
      }

      const ref = this.db.collection("usuarios").doc(clean);
      const data = {
        authUid: clean,
        docId: clean,
        role: profileFallback.role || "empleado",
        empresa: profileFallback.empresa || "",
        sucursal: profileFallback.sucursal || "",
        email: profileFallback.email || "",
        nombre: profileFallback.nombre || "",
        blocked: profileFallback.blocked === true,
        activo: profileFallback.activo !== undefined ? !!profileFallback.activo : true,
        jornadas: Array.isArray(profileFallback.jornadas) ? profileFallback.jornadas : [],
        jornada: profileFallback.jornada || "",
        jornadaId: profileFallback.jornadaId || "",
        jornadaData: profileFallback.jornadaData || null,
        jornadasData: Array.isArray(profileFallback.jornadasData) ? profileFallback.jornadasData : [],
        jornadasDetalle: Array.isArray(profileFallback.jornadasDetalle) ? profileFallback.jornadasDetalle : [],
        ...profileFallback
      };

      await ref.set(data, { merge: true });
      const snap = await ref.get();
      return snap.exists ? snap : null;
    } catch (e) {
      console.warn("Error ensureUserByAuthUid:", e);
      return null;
    }
  }

  async getJornadaById(id) {
    try {
      const clean = this._cleanString(id);
      if (!clean) return null;

      const doc = await this.db.collection("jornadas").doc(clean).get();
      return doc && doc.exists ? doc : null;
    } catch (e) {
      console.warn("Error getJornadaById:", e);
      return null;
    }
  }

  async getJornadasByIds(ids = []) {
    try {
      const cleanIds = Array.isArray(ids)
        ? ids.map(v => this._cleanString(v)).filter(Boolean)
        : [];

      if (!cleanIds.length) return [];

      const results = await Promise.all(cleanIds.map(id => this.getJornadaById(id)));
      return results.filter(Boolean);
    } catch (e) {
      console.warn("Error getJornadasByIds:", e);
      return [];
    }
  }

  async getEmpresaByScope(empresa = "", sucursal = "") {
    try {
      const e = this._cleanString(empresa);
      if (!e) return null;

      let query = this.db.collection("empresas").where("empresa", "==", e);

      const s = this._cleanString(sucursal);
      if (s) {
        query = query.where("sucursal", "==", s);
      }

      const snap = await query.limit(1).get();
      return snap.empty ? null : snap.docs[0];
    } catch (e) {
      console.warn("Error getEmpresaByScope:", e);
      return null;
    }
  }

  async createEmpresaLocationIfNeeded(empresa, sucursal, lat, lng) {
    try {
      const e = this._cleanString(empresa);
      const s = this._cleanString(sucursal);
      if (!e) return null;

      const existing = await this.getEmpresaByScope(e, s);
      if (existing) {
        return existing.ref || (existing && existing.id ? this.db.collection("empresas").doc(existing.id) : null);
      }

      const ref = await this.db.collection("empresas").add({
        empresa: e,
        sucursal: s,
        lat: Number(lat) || 0,
        lng: Number(lng) || 0,
        creadoEn: new Date().toISOString()
      });

      return ref;
    } catch (err) {
      console.warn("Error createEmpresaLocationIfNeeded:", err);
      return null;
    }
  }

  createAsistenciaRef(userId, fecha) {
    const u = this._cleanString(userId);
    const f = this._cleanString(fecha);
    return this.db.collection("asistencias").doc(`${u}_${f}`);
  }

  async getAsistencia(userId, fecha) {
    try {
      const ref = this.createAsistenciaRef(userId, fecha);
      const snap = await ref.get();
      return snap && snap.exists ? snap : null;
    } catch (e) {
      console.warn("Error getAsistencia:", e);
      return null;
    }
  }

  async updateAsistencia(ref, data) {
    try {
      if (!ref) throw new Error("Referencia de asistencia inválida.");
      const docRef = typeof ref === "string" ? this.db.doc(ref) : ref;
      await docRef.update(data);
      return true;
    } catch (e) {
      console.warn("Error updateAsistencia:", e);
      return false;
    }
  }

  async setAsistencia(ref, data) {
    try {
      if (!ref) throw new Error("Referencia de asistencia inválida.");
      const docRef = typeof ref === "string" ? this.db.doc(ref) : ref;
      await docRef.set(data, { merge: true });
      return true;
    } catch (e) {
      console.warn("Error setAsistencia:", e);
      return false;
    }
  }
}