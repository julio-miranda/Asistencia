# Proyecto de Asistencia

## Descripción
Este proyecto es un sistema de control de asistencia basado en autenticación con Firebase y escaneo de códigos QR. Permite gestionar empleados, registrar asistencias y generar reportes.

## Características
- **Inicio de sesión y registro de usuarios** con autenticación en Firebase.
- **Control de asistencia** mediante escaneo de código QR.
- **Validación de ubicación** para el registro de asistencia.
- **Panel de administración** para la gestión de empleados y visualización de asistencias.
- **Planilla semanal** con horas trabajadas y cálculo de pagos.
- **Seguridad**: Sesiones encriptadas y manejo de permisos por roles.

## Tecnologías Utilizadas
- **Frontend**: HTML, CSS, JavaScript.
- **Backend y Base de Datos**: Firebase Firestore.
- **Autenticación**: Firebase Authentication.
- **Escaneo QR**: html5-qrcode.
- **Visualización de datos**: DataTables.
- **Generación de reportes**: JavaScript y manejo de DOM.

## Instalación y Configuración
1. Clona el repositorio:
   ```sh
   git clone https://github.com/tu_usuario/proyecto-asistencia.git
   ```
2. Configura Firebase:
   - Crea un proyecto en Firebase.
   - Habilita Authentication y Firestore.
   - Configura `firebase-config.js` con las credenciales de tu proyecto.
3. Abre el archivo `index.html` en un navegador o súbelo a un hosting estático.

## Uso
- **Inicio de sesión**: Los empleados y administradores deben autenticarse.
- **Registro de asistencia**: Los empleados escanean el QR al ingresar y salir.
- **Panel de administración**: Los administradores pueden gestionar empleados y visualizar registros.
- **Planilla semanal**: Se generan reportes automáticos de asistencia y cálculo de pagos.

## Contribución
1. Crea un fork del repositorio.
2. Realiza cambios y súbelos a tu rama.
3. Envía un pull request para revisión.

## Licencia
Este proyecto está licenciado bajo MIT License.

---

**Autor:** Julio Miranda
**Repositorio:** [GitHub](https://github.com/julio_miranda/Aistencia)
