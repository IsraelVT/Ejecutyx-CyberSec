# Ejecutyx Cyber Cloud

Versión portable de Ejecutyx Cyber para Netlify, Supabase, Google Cloud Run y GitHub.

## Arquitectura

El navegador inicia sesión con Supabase y envía su access token a Cloud Run. La API verifica el token directamente con Supabase Auth, comprueba la membresía de la empresa y obtiene el activo desde la base de datos. Nunca acepta un dominio arbitrario para escanear.

Antes de cualquier conexión, el scanner resuelve el dominio y bloquea loopback, redes privadas, link-local, metadata, puertos explícitos, HTTP y redirecciones hacia destinos no permitidos.

## Requisitos

- Node.js 22+
- Cuenta de Supabase
- Cuenta de Netlify
- Proyecto de Google Cloud con facturación habilitada
- Repositorio de GitHub

## 1. Instalar

Desde la raíz ejecuta: npm install, npm run typecheck y npm run build.

## 2. Configurar Supabase

1. Crea un proyecto.
2. En SQL Editor ejecuta supabase/migrations/202609200001_initial.sql.
3. En Authentication habilita Email.
4. Agrega la URL local y la URL de Netlify como Redirect URLs.
5. Utiliza una llave publishable para el navegador y una llave secret únicamente para Cloud Run.

La migración crea automáticamente una empresa TestCompCy para cada nuevo usuario. Las tablas expuestas tienen RLS y el cliente autenticado recibe solo permisos de lectura. Todas las escrituras sensibles pasan por Cloud Run.

Opcionalmente instala Supabase CLI y ejecuta: supabase test db.

## 3. Ejecutar localmente

Copia apps/web/.env.example como apps/web/.env y services/api/.env.example como services/api/.env. Completa las variables y ejecuta npm run dev:api y npm run dev:web en terminales separadas.

## 4. Desplegar el API en Cloud Run

Desde services/api:

    gcloud run deploy ejecutyx-cyber-api \
      --source . \
      --region us-central1 \
      --memory 1Gi \
      --cpu 1 \
      --concurrency 5 \
      --timeout 300 \
      --min-instances 0 \
      --max-instances 10 \
      --set-env-vars SUPABASE_URL=https://TU_PROYECTO.supabase.co,WEB_ORIGIN=https://TU_SITIO.netlify.app \
      --set-secrets SUPABASE_SECRET_KEY=ejecutyx-supabase-secret:latest

Primero crea ejecutyx-supabase-secret en Google Secret Manager. Para el MVP, el servicio acepta invocaciones públicas a nivel de Cloud Run porque cada ruta /v1 exige y valida un JWT de Supabase. /health no devuelve información sensible.

## 5. Desplegar el dashboard en Netlify

Conecta el repositorio. netlify.toml ya configura apps/web, npm run build y dist.

Agrega VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY y VITE_API_URL en Netlify.

No agregues la llave secreta de Supabase a Netlify ni uses el prefijo VITE_ para secretos.

## Flujo funcional incluido

1. Acceso mediante magic link.
2. Empresa TestCompCy automática.
3. Registro de dominio.
4. TXT de verificación.
5. Verificación de propiedad.
6. Escaneo defensivo de HTTPS, SPF, DMARC y headers.
7. CyberScore, hallazgos, historial y auditoría.

## Límites de este MVP

- El escaneo se ejecuta de forma síncrona.
- No incluye Nmap, escaneo de puertos ni explotación.
- No analiza DKIM porque el selector debe conocerse.
- No incluye todavía Cloud Tasks ni Cloud Run Jobs.
- Administración de miembros y facturación quedan para otro sprint.

Antes de ampliar el scanner, agrega Cloud Tasks, idempotencia por job_id, límites por organización, presupuestos de concurrencia y autorización explícita por tipo de prueba.
