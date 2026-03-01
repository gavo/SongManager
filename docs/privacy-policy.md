# Política de Privacidad

**Última actualización:** Marzo de 2026

## 1. Introducción
Bienvenido a **SongManager**. Respetamos tu privacidad y estamos comprometidos a proteger tus datos personales. Esta política de privacidad explica cómo manejamos tu información al usar nuestra aplicación.

## 2. Información que Recopilamos
Nuestra aplicación **no recopila, no rastrea ni almacena** datos personales en servidores de terceros.
Sin embargo, utilizamos la API de Google Drive para brindarte la funcionalidad de guardar y cargar tus canciones. Al usar esta función, la aplicación:
- Solicita tu dirección de correo electrónico básica (exclusivamente para la pantalla de inicio de sesión de Google `SignIn`).
- Accede a tu Google Drive para crear una carpeta específica llamada `SongManager App` y leer/escribir archivos de texto plano tipo cancioneros creados dentro de esa carpeta.

**Garantía de Privacidad de Google Drive:**
SongManager no tiene acceso a tus fotos, documentos personales, ni correos. El permiso `drive.file` que utilizamos está **estrictamente limitado** a los archivos que nuestra misma aplicación ha creado.

## 3. Almacenamiento Local (AsyncStorage)
La aplicación almacena la canción que estás editando momentáneamente y tu sesión en la memoria de tu teléfono (caché local) para que no pierdas tu progreso si cierras accidentalmente la aplicación. Esta información jamás abandona tu dispositivo móvil a menos que presiones "Guardar en Drive".

## 4. Compartir Información a Terceros
Nosotros **no compartimos, no vendemos y no cedemos** ninguno de tus datos, canciones, correos o nombres a terceros, agencias de publicidad, ni sistemas de analítica.

## 5. Eliminar tus Datos
Dado que los archivos están guardados directamente en tu propio Google Drive, disfrutas de control total. Puedes eliminar la carpeta `SongManager App` en cualquier momento entrando a `drive.google.com`. Al revocar los permisos de nuestra aplicación desde tu cuenta de Google, perderemos acceso inmediato a futuras escrituras.

## 6. Contacto
Si tienes alguna duda sobre el manejo de tu información o sobre el funcionamiento de código abierto de esta aplicación, puedes contactarnos a través de nuestro repositorio en GitHub.
