"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/rbac/context";
import { inviteUserAction, updateUserAction } from "@/lib/users/actions";
import { GENDER_OPTIONS, userBaseSchema } from "@/lib/users/schemas";
import type { UserListRow } from "@/lib/datasets/users";
import type { RoleOption } from "./page";

type FormValues = {
  fullName: string;
  email: string;
  role: "admin" | "staff";
  phone: string;
  department: string;
  birthday: string;
  gender: "" | "male" | "female" | "non_binary" | "prefer_not_to_say";
};

interface UserFormDialogProps {
  mode: "create" | "edit";
  user?: UserListRow | null;
  roles: RoleOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Create (invite) / edit user form. Invites send a Supabase Auth email — the
 * user sets their own password via the link. Email is immutable after create;
 * editing your own row hides the role field (you can’t change your own role).
 */
export function UserFormDialog({ mode, user, roles, open, onOpenChange, onSaved }: UserFormDialogProps) {
  const session = useSession();
  const [submitting, setSubmitting] = useState(false);
  const isSelf = mode === "edit" && user?.id === session.id;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(userBaseSchema),
    defaultValues: {
      fullName: "",
      email: "",
      role: "staff",
      phone: "",
      department: "",
      birthday: "",
      gender: "",
    },
  });

  // Populate when opening in edit mode.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && user) {
      reset({
        fullName: user.full_name,
        email: user.email,
        role: (user.roles?.key as "admin" | "staff") ?? "staff",
        phone: user.phone ?? "",
        department: user.department ?? "",
        birthday: user.birthday ?? "",
        gender: (user.gender as FormValues["gender"]) ?? "",
      });
    } else {
      reset({
        fullName: "",
        email: "",
        role: "staff",
        phone: "",
        department: "",
        birthday: "",
        gender: "",
      });
    }
  }, [open, mode, user, reset]);

  const role = watch("role");

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await inviteUserAction(values)
          : await updateUserAction({ ...values, id: user!.id });
      if (result.ok) {
        toast.success(mode === "create" ? `Invite sent to ${values.email}` : "User updated");
        onOpenChange(false);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Invite a user" : `Edit ${user?.full_name}`}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "They’ll receive an email link to set their password."
              : "Email is managed by the sign-in system and can’t be changed here."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="uf-name">Full name</Label>
            <Input id="uf-name" autoComplete="off" {...register("fullName")} aria-invalid={!!errors.fullName} />
            {errors.fullName ? (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="uf-email">Email</Label>
            <Input
              id="uf-email"
              type="email"
              autoComplete="off"
              disabled={mode === "edit"}
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>

          {isSelf ? null : (
            <div className="space-y-1.5">
              <Label htmlFor="uf-role">Role</Label>
              <Select value={role} onValueChange={(v) => setValue("role", v as "admin" | "staff")}>
                <SelectTrigger id="uf-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uf-phone">Phone (optional)</Label>
              <Input id="uf-phone" autoComplete="off" {...register("phone")} aria-invalid={!!errors.phone} />
              {errors.phone ? <p className="text-xs text-destructive">{errors.phone.message}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uf-dept">Department (optional)</Label>
              <Input id="uf-dept" autoComplete="off" {...register("department")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uf-birthday">Birthday (optional)</Label>
              <Input id="uf-birthday" type="date" {...register("birthday")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uf-gender">Gender (optional)</Label>
              <Select
                value={watch("gender") || "__none__"}
                onValueChange={(v) =>
                  setValue("gender", (v === "__none__" ? "" : v) as FormValues["gender"])
                }
              >
                <SelectTrigger id="uf-gender" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Send invite" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
