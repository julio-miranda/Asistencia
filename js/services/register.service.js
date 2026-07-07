export default class RegisterService {
  constructor(db, auth = null) {
    if (!db || typeof db.collection !== "function") {
      throw new Error("Firestore no está disponible.");
    }
    this.db = db;
    this.auth = auth || null;
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

  getDb() {
    return this.db;
  }

  buildProfilePayload(payload = {}, authUid) {
    const cleanAuthUid = this.normalize(authUid);
    const cleanEmail = this.normalizeEmail(payload.email);


    return {
      ...payload,
      authUid: cleanAuthUid,
      docId: cleanAuthUid,
      email: cleanEmail,
      blocked: payload.blocked === true ? true : false,
      activo: payload.activo !== undefined ? !!payload.activo : true,
      createdAt: payload.createdAt || Date.now(),
      updatedAt: Date.now()
    };


  }

  async createAuthUser(email, password) {
    const auth = this.getAuth();
    if (!auth) {
      throw new Error("Firebase Auth no está disponible.");
    }


    const cleanEmail = this.normalizeEmail(email);
    const cleanPassword = String(password || "").trim();

    if (!cleanEmail) {
      throw new Error("Correo obligatorio.");
    }

    if (!cleanPassword) {
      throw new Error("Contraseña obligatoria.");
    }

    const credential = await auth.createUserWithEmailAndPassword(cleanEmail, cleanPassword);
    const user = credential?.user || null;

    if (!user || !user.uid) {
      throw new Error("No se pudo crear el usuario en Firebase Auth.");
    }

    return {
      credential,
      user,
      authUid: user.uid
    };


  }

  async writeUserProfile(authUid, payload = {}) {
    const cleanAuthUid = this.normalize(authUid);
    if (!cleanAuthUid) {
      throw new Error("authUid inválido para crear perfil.");
    }


    const data = this.buildProfilePayload(payload, cleanAuthUid);
    const ref = this.db.collection("usuarios").doc(cleanAuthUid);

    await ref.set(data, { merge: true });

    return {
      ref,
      data
    };


  }

  async crearUsuarioCompleto(payload = {}, options = {}) {
    const cleanEmail = this.normalizeEmail(payload.email);
    const cleanPassword = String(payload.password || "").trim();


    if (!cleanEmail) {
      throw new Error("El correo es obligatorio.");
    }

    if (!cleanPassword) {
      throw new Error("La contraseña es obligatoria.");
    }

    const authResult = await this.createAuthUser(cleanEmail, cleanPassword);

    const profileData = this.buildProfilePayload(
      {
        ...payload,
        email: cleanEmail,
        blocked: payload.blocked === true ? true : false,
        activo: payload.activo !== undefined ? payload.activo : true
      },
      authResult.authUid
    );

    let profileWrite = null;

    if (options.saveProfileToFirestore !== false) {
      profileWrite = await this.writeUserProfile(authResult.authUid, profileData);
    }

    return {
      authUid: authResult.authUid,
      user: authResult.user,
      credential: authResult.credential,
      profile: profileData,
      profileWrite
    };


  }
}

export async function crearUsuarioCompleto(payload = {}, options = {}) {
  const db = window.db;
  if (!db) {
    throw new Error("Firestore no está disponible.");
  }

  const auth = window.firebase && typeof window.firebase.auth === "function"
    ? window.firebase.auth()
    : null;

  const service = new RegisterService(db, auth);
  return await service.crearUsuarioCompleto(payload, options);
}

window.crearUsuarioCompleto = crearUsuarioCompleto;