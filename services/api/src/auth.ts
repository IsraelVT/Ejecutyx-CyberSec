import type { NextFunction, Request, Response } from "express";
import { admin } from "./supabase.js";

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: "Sesión requerida." });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Sesión inválida." });
  req.userId = data.user.id;
  next();
}

export async function requireMembership(userId: string, organizationId: string) {
  const { data } = await admin.from("memberships").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  return data;
}
