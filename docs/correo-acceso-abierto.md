# Correo de aviso: acceso abierto

Plantilla: **`docs/correo-acceso-abierto.html`**. Para mandarla desde Resend cuando
abras el acceso a estudiantes desde el panel de admin.

## Asunto y línea de vista previa

- **Asunto:** `Ya puedes crear tu perfil en ZentU`
- **Preview (ya va dentro del HTML):** «Tu perfil te espera. Entra con este mismo
  correo, sin contraseñas.»

Si quieres probar variantes de asunto, dos que funcionan con el mismo cuerpo:
`Tu lugar en ZentU ya está listo` · `Abrimos el acceso — te toca entrar`

## Cómo mandarlo

1. Panel de admin → **Lanzamiento** → abre el acceso a estudiantes.
2. Botón **Copiar correos de estudiantes** (o Exportar CSV en la pestaña Waitlist).
3. Resend → **Broadcasts** → nuevo → pega el HTML de la plantilla en el editor de código.
4. Pega los destinatarios y manda.

**El botón de abrir acceso NO manda correos.** Es a propósito: Resend maneja las
bajas, los reintentos y las estadísticas de apertura mejor que un envío hecho a mano
desde una función.

## Personalizar con el nombre (opcional)

La plantilla dice «Hola,» sin nombre, porque una etiqueta mal puesta se envía
literal y queda peor que no personalizar.

Si usas **Broadcasts** de Resend y tus contactos tienen nombre cargado, cambia:

```
Hola, te apuntaste a ZentU
```

por:

```
Hola {{{FIRST_NAME|}}}, te apuntaste a ZentU
```

Las tres llaves son la sintaxis de Resend, y lo que va tras `|` es el respaldo
cuando el contacto no tiene nombre. **Pruébalo enviándote uno a ti primero:** con
respaldo vacío, un contacto sin nombre renderiza «Hola , te apuntaste», con la coma
suelta. Si no quieres arriesgarte, déjalo sin nombre.

## Baja de suscripción

El pie trae `{{{RESEND_UNSUBSCRIBE_URL}}}`, que **solo se sustituye en Broadcasts**.
Si mandas el correo por la API normal (`/emails`), ese enlace se va literal y roto.
En ese caso, cámbialo por `mailto:hola@zentu.app?subject=Baja` antes de enviar.

## Decisiones técnicas de la plantilla

Van anotadas porque no son obvias y se pierden al editar:

- **Todo en tablas y estilos en línea.** Outlook usa el motor de Word: no entiende
  flexbox, grid ni casi nada de un `<style>`.
- **Degradados con respaldo sólido.** Cada degradado lleva un `bgcolor="#7B68EE"`
  al lado. Outlook ignora `linear-gradient` y se queda con el morado sólido, que
  sigue siendo la marca.
- **Inter no carga en Gmail** (ni en la mayoría). La pila de fuentes cae a la del
  sistema, que en móvil es la que ya usa el usuario. Se acepta a propósito: meter
  una fuente web por `@import` solo funciona en Apple Mail y añade peso.
- **Modo oscuro** con `prefers-color-scheme`: se invierte el lienzo y la tarjeta,
  pero **no** el degradado ni el botón, para que la marca se vea igual en ambos.
  Comprobado en claro, oscuro y móvil.
- **600px de ancho**, que es el estándar seguro, con reglas para móvil que bajan el
  titular a 30px y hacen el botón de ancho completo.
- **El enlace lleva `utm_source=correo&utm_campaign=acceso_abierto`**, para que
  cuando haya analítica se pueda separar quién llegó por este correo.

## Antes de mandarlo a todos

Mándate uno a ti primero y ábrelo en **Gmail móvil** y en **Outlook de escritorio**,
que son los dos que más rompen. Comprueba que el logo carga (viene de
`https://www.zentu.app/logo.png`; si Vercel cae, no se ve) y que el botón lleva a
`acceso.html`.
