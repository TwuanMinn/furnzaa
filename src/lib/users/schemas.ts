import { z } from "zod";

/** Shared validation for User Management forms (client) and actions (server). */

export const PHONE_RE = /^[+\d][\d\s\-().]{5,24}$/;

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const userBaseSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  email: z.string().trim().email("Enter a valid email").max(320).toLowerCase(),
  role: z.enum(["admin", "staff"], { message: "Choose a role" }),
  phone: z
    .string()
    .trim()
    .regex(PHONE_RE, "Enter a valid phone number")
    .max(25)
    .optional()
    .or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  gender: z
    .enum(["male", "female", "non_binary", "prefer_not_to_say"])
    .optional()
    .or(z.literal("")),
});

export const BULK_USER_ACTIONS = ["deactivate", "ban", "assign_role", "soft_delete"] as const;
export type BulkUserAction = (typeof BULK_USER_ACTIONS)[number];

export const bulkUserActionSchema = z
  .object({
    action: z.enum(BULK_USER_ACTIONS),
    userIds: z.array(z.string().uuid()).min(1, "Select at least one user").max(500),
    role: z.enum(["admin", "staff"]).optional(),
    banReason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((v) => v.action !== "assign_role" || !!v.role, {
    message: "Pick the role to assign",
    path: ["role"],
  })
  .refine((v) => v.action !== "ban" || (v.banReason ?? "").trim().length >= 3, {
    message: "A ban needs a reason",
    path: ["banReason"],
  });
export type BulkUserActionInput = z.infer<typeof bulkUserActionSchema>;

export const inviteUserSchema = userBaseSchema;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** Email is managed by Supabase Auth and immutable here. */
export const updateUserSchema = userBaseSchema.omit({ email: true }).extend({
  id: z.string().uuid(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
