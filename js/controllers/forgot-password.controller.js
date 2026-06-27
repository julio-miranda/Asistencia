import PasswordRecoveryModel from "../models/password-recovery.model.js";
import { sendPasswordResetEmail } from "../services/password-recovery.service.js";

(function () {
  const form = document.getElementById("forgot-password-form");
  const msg = document.getElementById("forgot-msg");
  const btnBack = document.getElementById("btn-back-login");

  const db = window.db;
  if (!db) {
    console.error("Firestore no está inicializado.");
    if (msg) {
      msg.textContent = "Firestore no está disponible.";
      msg.style.color = "red";
    }
    return;
  }

  const model = new PasswordRecoveryModel(db);

  function setMessage(text, color = "") {
    if (!msg) return;
    msg.textContent = text || "";
    if (color) msg.style.color = color;
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMessage("");

      try {
        const login = String(document.getElementById("forgot-login")?.value || "").trim();

        if (!login) {
          setMessage("Ingresa un correo o identificación.", "red");
          return;
        }

        const email = await model.resolveEmailFromLogin(login);

        if (!email) {
          setMessage("No se encontró un usuario con ese dato.", "red");
          return;
        }

        await sendPasswordResetEmail(email);

        setMessage("Se envió un enlace de recuperación a tu correo.", "green");
      } catch (err) {
        console.error(err);
        setMessage("Error enviando recuperación: " + (err.message || err), "red");
      }
    });
  }

  if (btnBack) {
    btnBack.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
})();