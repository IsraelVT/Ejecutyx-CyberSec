# Guía de carga — Ejecutyx Cyber

Sigue el orden indicado. No subas archivos individualmente a distintos servicios: **todo el proyecto va primero a GitHub** y cada plataforma toma de ahí lo que necesita.

## 1. GitHub — código completo

1. Descomprime el ZIP.
2. Crea un repositorio privado, por ejemplo `ejecutyx-cyber`.
3. Sube **el contenido de la carpeta `ejecutyx-cyber-cloud`**, no la carpeta ZIP ni `node_modules`.
4. Confirma que se vean en la raíz: `apps`, `services`, `supabase`, `package.json`, `netlify.toml` y `README.md`.

## 2. Supabase — usuarios y base de datos

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor → New query**.
3. Copia y ejecuta completo `supabase/migrations/202609200001_initial.sql`.
4. Después copia y ejecuta `supabase/migrations/202609210002_product_modules.sql`.
5. En **Authentication → URL Configuration**, agrega temporalmente `http://localhost:5173` y después la URL de Netlify.
6. En **Project Settings → API**, conserva:
   - Project URL.
   - Publishable/anon key para Netlify.
   - Secret/service-role key exclusivamente para Cloud Run.

Nunca pongas la llave secret/service-role en GitHub o Netlify.

## 3. Google Cloud — API privada de la aplicación

Selecciona el proyecto `Ejecutyx-CyberSec`, vincula facturación y abre Cloud Shell.

### Activar servicios

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

### Guardar la llave secreta de Supabase

```bash
printf '%s' 'PEGA_AQUI_LA_SECRET_KEY' | gcloud secrets create ejecutyx-supabase-secret --data-file=-
```

Si el secreto ya existe, agrega una versión:

```bash
printf '%s' 'PEGA_AQUI_LA_SECRET_KEY' | gcloud secrets versions add ejecutyx-supabase-secret --data-file=-
```

### Descargar GitHub y desplegar

```bash
git clone URL_DE_TU_REPOSITORIO
cd ejecutyx-cyber/services/api
gcloud run deploy ejecutyx-cyber-api --source . --region us-central1 --allow-unauthenticated --memory 1Gi --cpu 1 --concurrency 5 --timeout 300 --min-instances 0 --max-instances 3 --set-env-vars SUPABASE_URL=https://TU_PROYECTO.supabase.co,WEB_ORIGIN=https://TEMPORAL.netlify.app --set-secrets SUPABASE_SECRET_KEY=ejecutyx-supabase-secret:latest
```

Copia la URL que termina en `run.app`. Aunque Cloud Run permita invocación pública, todas las rutas `/v1` verifican el token del usuario. Sólo `/health` queda abierto.

## 4. Netlify — interfaz web

1. **Add new site → Import an existing project → GitHub**.
2. Selecciona el repositorio.
3. Netlify detectará `netlify.toml`; la carpeta base será `apps/web` y la publicada `dist`.
4. En **Environment variables** agrega:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | llave publishable/anon |
| `VITE_API_URL` | URL completa de Cloud Run, sin `/` final |

5. Ejecuta **Deploy site** y copia la URL final de Netlify.

## 5. Conectar las URLs finales

Vuelve a desplegar Cloud Run sustituyendo `WEB_ORIGIN` por la URL real de Netlify:

```bash
gcloud run services update ejecutyx-cyber-api --region us-central1 --set-env-vars WEB_ORIGIN=https://TU-SITIO.netlify.app
```

En Supabase, agrega esa misma URL en **Authentication → URL Configuration** como Site URL y Redirect URL.

## 6. Primera prueba

1. Abre Netlify e ingresa tu correo.
2. Usa el enlace recibido para entrar.
3. Verás la empresa `TestCompCy` creada automáticamente.
4. Agrega un dominio que controles.
5. Publica el TXT mostrado en el DNS del dominio.
6. Pulsa **Verificar y analizar**.

## Solución rápida de errores

- **Billing account not found:** vincula facturación al proyecto de Google Cloud.
- **CORS / Failed to fetch:** `WEB_ORIGIN` no coincide exactamente con la URL de Netlify.
- **Invalid API key:** revisa las variables de Netlify y vuelve a desplegar.
- **No llega el magic link:** revisa Supabase Authentication Logs y el límite de correo.
- **TXT todavía no visible:** la propagación DNS puede tardar; no vuelvas a crear el dominio, sólo repite la verificación.
