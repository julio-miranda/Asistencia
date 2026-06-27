import { verifyResetCode, confirmPasswordReset } from "../services/password-recovery.service.js";

(function () {
  const form = document.getElementById("reset-form");
  const statusMsg = document.getElementById("status-msg");
  const backBtn = document.getElementById("btn-back");

  let oobCode = null;

  function setStatus(text) {
    if (statusMsg) statusMsg.textContent = text || "";
  }

  function getParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      mode: urlParams.get("mode"),
      oobCode: urlParams.get("oobCode")
    };
  }

  function isStrongPassword(pass) {
    return !!pass && pass.length >= 6;
  }

  async function verificarLink() {
    try {
      const params = getParams();
      oobCode = params.oobCode;

      if (!oobCode) {
        setStatus("Link inválido o expirado.");
        if (form) form.style.display = "none";
        return;
      }

      const email = await verifyResetCode(oobCode);
      setStatus("Correo verificado: " + email);

      if (form) form.style.display = "block";
    } catch (err) {
      console.error(err);
      setStatus("El enlace es inválido o ha expirado.");
      if (form) form.style.display = "none";
    }
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        const pass = String(document.getElementById("new-password")?.value || "").trim();
        const pass2 = String(document.getElementById("confirm-password")?.value || "").trim();

        if (!isStrongPassword(pass)) {
          alert("La contraseña debe tener al menos 6 caracteres.");
          return;
        }

        if (pass !== pass2) {
          alert("Las contraseñas no coinciden.");
          return;
        }

        await confirmPasswordReset(oobCode, pass);

        alert("Contraseña actualizada correctamente.");
        window.location.href = "index.html";
      } catch (err) {
        console.error(err);
        alert("Error al cambiar contraseña: " + (err.message || err));
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  verificarLink();
})();