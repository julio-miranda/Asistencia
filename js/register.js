// js/register.js
document.getElementById("register-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const Nombre = document.getElementById("register-nombre").value;
    const numero = document.getElementById("register-numero").value;
    const Fecha = document.getElementById("register-Fecha").value;
    const email = document.getElementById("register-email").value;
    const pass = document.getElementById("register-password").value;
    const pass2 = document.getElementById("register-password2").value;
    const role = document.getElementById("register-role").value;

    if (pass !== pass2) {
        alert("Las contraseñas no coinciden");
        return;
    }

    try {
        // Si el usuario selecciona admin, se verifica que no exista uno previamente.
        if (role === "admin") {
            const adminQuery = await db.collection("usuarios").where("role", "==", "admin").get();
            if (!adminQuery.empty) {
                alert("Ya existe un administrador registrado.");
                return;
            }
        }

        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        // Guarda los datos del usuario en Firestore.
        await db.collection("usuarios").doc(user.uid).set({
            nombre: Nombre,
            identificacion: numero,
            nacimiento: formatearFecha(Fecha),
            email: email,
            role: role
        });
        alert("Registro exitoso, ahora inicia sesión.");
        window.location.href = "index.html";
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById("go-to-login").addEventListener("click", e => {
    e.preventDefault();
    window.location.href = "index.html";
});

function formatearFecha(fechaStr) {
    // Primero, verificamos si la cadena ya está en el formato "dd/mm/yyyy"
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaStr.trim())) {
      return fechaStr;
    }
    
    // Diccionario para convertir el nombre del mes (en español) a número
    const meses = {
      'enero': 1,
      'febrero': 2,
      'marzo': 3,
      'abril': 4,
      'mayo': 5,
      'junio': 6,
      'julio': 7,
      'agosto': 8,
      'septiembre': 9,
      'setiembre': 9,  // también se usa en algunos países
      'octubre': 10,
      'noviembre': 11,
      'diciembre': 12
    };
  
    // Expresión regular para detectar fechas en formato "28 de octubre del 2000" (o variantes)
    const regexEsp = /(\d{1,2})\s*(?:de\s+)?([a-zA-ZñÑ]+)(?:\s*(?:del|de)\s*)?(\d{4})/i;
    let match = fechaStr.match(regexEsp);
    if (match) {
      let dia = match[1];
      let mesTexto = match[2].toLowerCase();
      let anio = match[3];
      if (meses[mesTexto]) {
        let mes = meses[mesTexto];
        // Aseguramos dos dígitos para día y mes
        dia = dia.padStart(2, '0');
        mes = String(mes).padStart(2, '0');
        return `${dia}/${mes}/${anio}`;
      }
    }
    
    // Si no se reconoció el formato en español, se intenta parsear la fecha con Date
    let fecha = new Date(fechaStr);
    if (!isNaN(fecha)) {
      let dia = String(fecha.getDate()).padStart(2, '0');
      let mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Los meses inician en 0
      let anio = fecha.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
    
    return 'Fecha inválida';
}