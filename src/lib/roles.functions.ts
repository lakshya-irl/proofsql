import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mayApprove, mayManageAccess } from "./proofsql/permissions";

export const getPermissions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error("PERMISSIONS_UNAVAILABLE");
  const roles = (data ?? []).map((r) => r.role);
  return { roles, approve: mayApprove(roles), manageAccess: mayManageAccess(roles) };
});

export const approveSharedDefinition = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ dataset: z.enum(["covid", "school"]), key: z.string().min(1).max(60), version: z.number().int().positive(), payload: z.object({ title: z.string().max(100), meaning: z.string().max(2000), expression: z.string().max(1000), grain: z.string().max(200) }).strict() }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error || !mayApprove((rows ?? []).map((r) => r.role))) throw new Error("FORBIDDEN");
    const { error: saveError } = await context.supabase.from("shared_definitions").insert({ dataset_key: data.dataset, definition_key: data.key, version: data.version, payload: data.payload, approved_by: context.userId });
    if (saveError) throw new Error("APPROVAL_SAVE_FAILED");
    return { saved: true };
  });

export const setDatasetAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ datasetId: z.uuid(), userId: z.uuid(), canQuery: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error || !mayManageAccess((roles ?? []).map((r) => r.role))) throw new Error("FORBIDDEN");
    const { error: saveError } = await context.supabase.from("dataset_access").upsert({ dataset_id: data.datasetId, user_id: data.userId, can_query: data.canQuery });
    if (saveError) throw new Error("ACCESS_SAVE_FAILED");
    return { saved: true };
  });