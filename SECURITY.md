# Política de seguridad

- Nunca colocar SUPABASE_SECRET_KEY en el frontend, GitHub o archivos versionados.
- Cada escritura valida JWT y membresía desde el servidor.
- Cada recurso persistente lleva organization_id.
- Los dominios deben verificarse antes de analizarlos.
- El scanner no sigue HTTP, puertos explícitos ni destinos privados.
- Los resultados no deben contener secretos, cuerpos completos o credenciales.
- Rotar inmediatamente cualquier llave expuesta.

No incluyas datos personales, credenciales ni información de clientes en issues públicos.
