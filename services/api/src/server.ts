import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import { z } from "zod";
import { env } from "./env.js";
import { requireMembership, requireUser } from "./auth.js";
import { normalizeDomain, scanDomain, verifyDomain } from "./scanner.js";
import { admin } from "./supabase.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  if (req.headers.origin === env.WEB_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", env.WEB_ORIGIN);
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/v1", requireUser);

app.get("/v1/organizations", async (req, res) => {
  const { data: links } = await admin.from("memberships").select("organization_id, role, organizations(id,name,slug)").eq("user_id", req.userId);
  res.json({ organizations: (links ?? []).map(link => ({ ...(link.organizations as unknown as Record<string, unknown>), role: link.role })) });
});

app.get("/v1/dashboard", async (req, res) => {
  const organizationId = z.string().uuid().safeParse(req.query.organizationId);
  if (!organizationId.success || !await requireMembership(req.userId!, organizationId.data)) return res.status(403).json({ error: "Acceso denegado." });
  const [assets, scans, findings, incidents, audits] = await Promise.all([
    admin.from("assets").select("*").eq("organization_id", organizationId.data).order("created_at"),
    admin.from("scan_results").select("*").eq("organization_id", organizationId.data).order("scanned_at", { ascending: false }).limit(20),
    admin.from("findings").select("*").eq("organization_id", organizationId.data).order("detected_at", { ascending: false }),
    admin.from("incidents").select("*").eq("organization_id", organizationId.data).order("created_at", { ascending: false }).limit(50),
    admin.from("audit_events").select("*").eq("organization_id", organizationId.data).order("created_at", { ascending: false }).limit(50),
  ]);
  res.json({ assets: assets.data ?? [], history: scans.data ?? [], findings: findings.data ?? [], incidents: incidents.data ?? [], audits: audits.data ?? [] });
});

app.patch("/v1/organizations/:id", async (req, res) => {
  const member = await requireMembership(req.userId!, req.params.id);
  if (!member || !["owner", "admin"].includes(member.role)) return res.status(403).json({ error: "Se requiere rol administrador." });
  const parsed = z.object({ name: z.string().trim().min(2).max(80), sector: z.string().trim().max(80), employeeCount: z.number().int().positive().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos de empresa inválidos." });
  const { data, error } = await admin.from("organizations").update({ name: parsed.data.name, sector: parsed.data.sector || null, employee_count: parsed.data.employeeCount }).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: "No pudimos actualizar la empresa." });
  await admin.from("audit_events").insert({ organization_id: req.params.id, actor_user_id: req.userId, action: "organization.updated", target_type: "organization", target_id: req.params.id });
  res.json({ organization: data });
});

app.patch("/v1/findings/:id", async (req, res) => {
  const parsed = z.object({ status: z.enum(["open", "accepted", "resolved"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Estado inválido." });
  const { data: finding } = await admin.from("findings").select("*").eq("id", req.params.id).maybeSingle();
  if (!finding || !await requireMembership(req.userId!, finding.organization_id)) return res.status(404).json({ error: "Riesgo no encontrado." });
  const { data } = await admin.from("findings").update({ status: parsed.data.status, resolved_at: parsed.data.status === "resolved" ? new Date().toISOString() : null }).eq("id", finding.id).select().single();
  await admin.from("audit_events").insert({ organization_id: finding.organization_id, actor_user_id: req.userId, action: `finding.${parsed.data.status}`, target_type: "finding", target_id: finding.id });
  res.json({ finding: data });
});

app.post("/v1/incidents", async (req, res) => {
  const parsed = z.object({ organizationId: z.string().uuid(), title: z.string().trim().min(3).max(140), description: z.string().trim().max(3000), severity: z.enum(["critical", "high", "medium", "low"]) }).safeParse(req.body);
  if (!parsed.success || !await requireMembership(req.userId!, parsed.data.organizationId)) return res.status(403).json({ error: "Solicitud no autorizada." });
  const { data, error } = await admin.from("incidents").insert({ organization_id: parsed.data.organizationId, title: parsed.data.title, description: parsed.data.description, severity: parsed.data.severity, created_by: req.userId }).select().single();
  if (error) return res.status(400).json({ error: "No pudimos registrar el incidente." });
  await admin.from("audit_events").insert({ organization_id: parsed.data.organizationId, actor_user_id: req.userId, action: "incident.created", target_type: "incident", target_id: data.id });
  res.status(201).json({ incident: data });
});

app.patch("/v1/incidents/:id", async (req, res) => {
  const parsed = z.object({ status: z.enum(["open", "contained", "resolved"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Estado inválido." });
  const { data: incident } = await admin.from("incidents").select("*").eq("id", req.params.id).maybeSingle();
  if (!incident || !await requireMembership(req.userId!, incident.organization_id)) return res.status(404).json({ error: "Incidente no encontrado." });
  const { data } = await admin.from("incidents").update({ status: parsed.data.status, resolved_at: parsed.data.status === "resolved" ? new Date().toISOString() : null }).eq("id", incident.id).select().single();
  await admin.from("audit_events").insert({ organization_id: incident.organization_id, actor_user_id: req.userId, action: `incident.${parsed.data.status}`, target_type: "incident", target_id: incident.id });
  res.json({ incident: data });
});

app.post("/v1/assets/domain", async (req, res) => {
  const parsed = z.object({ organizationId: z.string().uuid(), domain: z.string().min(4) }).safeParse(req.body);
  if (!parsed.success || !await requireMembership(req.userId!, parsed.data.organizationId)) return res.status(403).json({ error: "Solicitud no autorizada." });
  let domain: string;
  try { domain = normalizeDomain(parsed.data.domain); } catch { return res.status(400).json({ error: "Dominio inválido." }); }
  const token = crypto.randomUUID();
  const { data, error } = await admin.from("assets").insert({ organization_id: parsed.data.organizationId, type: "domain", value: domain, verification_status: "pending", verification_token: token }).select().single();
  if (error) return res.status(409).json({ error: "El dominio ya existe en esta empresa." });
  res.status(201).json({ asset: data, dns: { type: "TXT", name: "_ejecutyx", value: `ejecutyx-verification=${token}` } });
});

app.post("/v1/assets/:id/verify", async (req, res) => {
  const { data: asset } = await admin.from("assets").select("*").eq("id", req.params.id).maybeSingle();
  if (!asset || !await requireMembership(req.userId!, asset.organization_id)) return res.status(404).json({ error: "Activo no encontrado." });
  const verified = await verifyDomain(asset.value, asset.verification_token);
  if (!verified) return res.status(422).json({ error: "El registro TXT todavía no está visible." });
  await admin.from("assets").update({ verification_status: "verified", verified_at: new Date().toISOString() }).eq("id", asset.id);
  res.json({ verified: true });
});

app.post("/v1/assets/:id/scan", async (req, res) => {
  const { data: asset } = await admin.from("assets").select("*").eq("id", req.params.id).maybeSingle();
  if (!asset || asset.verification_status !== "verified" || !await requireMembership(req.userId!, asset.organization_id)) return res.status(403).json({ error: "Activo no autorizado o sin verificar." });
  const result = await scanDomain(asset.value);
  await admin.from("scan_results").insert({ organization_id: asset.organization_id, asset_id: asset.id, score: result.score, checks: result.checks });
  const controls = [
    ["web.https", "Activa HTTPS", "critical", 20, result.checks.https],
    ["email.spf", "Configura SPF", "high", 15, result.checks.spf],
    ["email.dmarc", "Configura DMARC", "high", 15, result.checks.dmarc],
    ["web.headers", "Refuerza los encabezados web", "medium", 6, result.checks.securityHeaders >= 2],
  ] as const;
  for (const [controlKey, title, severity, impact, passes] of controls) {
    const existing = await admin.from("findings").select("id").eq("asset_id", asset.id).eq("control_key", controlKey).eq("status", "open").maybeSingle();
    if (passes && existing.data) await admin.from("findings").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", existing.data.id);
    if (!passes && !existing.data) await admin.from("findings").insert({ organization_id: asset.organization_id, asset_id: asset.id, control_key: controlKey, title, severity, status: "open", score_impact: impact, evidence: `El control ${controlKey} no pasó la comprobación.` });
  }
  await admin.from("audit_events").insert({ organization_id: asset.organization_id, actor_user_id: req.userId, action: "domain.scan.completed", target_type: "asset", target_id: asset.id, metadata: { score: result.score } });
  res.json(result);
});

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Error interno." });
});
app.listen(env.PORT, "0.0.0.0", () => console.log(`Ejecutyx Cyber API listening on ${env.PORT}`));
