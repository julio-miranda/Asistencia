export function getAuth() {
  if (!window.firebase || typeof window.firebase.auth !== "function") {
    throw new Error("Firebase Auth no disponible.");
  }
  return window.firebase.auth();
}

export async function verifyResetCode(oobCode) {
  const auth = getAuth();
  return await auth.verifyPasswordResetCode(oobCode);
}

export async function confirmPasswordReset(oobCode, newPassword) {
  const auth = getAuth();
  return await auth.confirmPasswordReset(oobCode, newPassword);
}

export async function sendPasswordResetEmail(email) {
  const auth = getAuth();
  return await auth.sendPasswordResetEmail(email);
}