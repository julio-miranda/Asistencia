export async function crearUsuarioCompleto(payload) {
  const auth = window.firebase?.auth ? window.firebase.auth() : null;
  const db = window.db;

  if (!auth) {
    throw new Error("Firebase Auth no está disponible.");
  }

  if (!db) {
    throw new Error("Firestore no está disponible.");
  }

  if (!payload || !payload.email || !payload.password) {
    throw new Error("El correo y la contraseña son obligatorios.");
  }

  const cred = await auth.createUserWithEmailAndPassword(
    String(payload.email).trim().toLowerCase(),
    String(payload.password)
  );

  const nuevoUser = cred.user;
  if (!nuevoUser) {
    throw new Error("No se pudo crear el usuario en Firebase Auth.");
  }

  const userData = { ...payload };
  delete userData.password;

  userData.email = String(userData.email).trim().toLowerCase();
  userData.authUid = nuevoUser.uid;
  userData.blocked = false;
  userData.activo = true;
  userData.createdAt = payload.createdAt || Date.now();

  try {
    const docRef = await db.collection("usuarios").add(userData);
    return {
      success: true,
      uid: nuevoUser.uid,
      docId: docRef.id,
      message: "Usuario creado correctamente."
    };
  } catch (error) {
    try {
      await nuevoUser.delete();
    } catch (cleanupError) {
      console.warn("No se pudo eliminar el usuario de Auth tras fallo en Firestore:", cleanupError);
    }
    throw error;
  }
}

window.crearUsuarioCompleto = crearUsuarioCompleto;