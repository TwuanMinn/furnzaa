"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PERMISSIONS, type PermissionDef } from "@/lib/rbac/permissions";
import { updateRolePermissionsAction } from "@/lib/settings/actions";
import type { RolesData } from "./types";

/**
 * Roles & permissions matrix. Admin is fixed (always every permission);
 * only the Staff column is editable, and only for settings.edit_roles holders.
 */
export function RolesSection({ data, canEdit }: { data: RolesData; canEdit: boolean }) {
  const router = useRouter();
  const [staffKeys, setStaffKeys] = useState<Set<string>>(() => new Set(data.staffKeys));
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of PERMISSIONS) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return [...map.entries()];
  }, []);

  const total = PERMISSIONS.length;
  const granted = staffKeys.size;

  function toggleStaff(key: string, checked: boolean) {
    setStaffKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateRolePermissionsAction({
        roleKey: "staff",
        permissionKeys: [...staffKeys],
      });
      if (res.ok) {
        toast.success("Staff permissions saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Roles &amp; permissions</CardTitle>
        <CardDescription>
          Control what the Staff role can see and do across every module.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          Changes apply to staff sessions within a minute. Admins are not editable, so you
          can never lock yourself out.
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64">Permission</TableHead>
                <TableHead className="w-20 text-center">Admin</TableHead>
                <TableHead className="w-20 text-center">Staff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(([module, perms]) => (
                <ModuleGroup
                  key={module}
                  module={module}
                  perms={perms}
                  staffKeys={staffKeys}
                  canEdit={canEdit}
                  onToggle={toggleStaff}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{granted}</span> of{" "}
            <span className="tabular-nums">{total}</span> granted to Staff
          </p>
          {canEdit ? (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleGroup({
  module,
  perms,
  staffKeys,
  canEdit,
  onToggle,
}: {
  module: string;
  perms: PermissionDef[];
  staffKeys: Set<string>;
  canEdit: boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={3} className="bg-muted/40 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {module}
          </span>
        </TableCell>
      </TableRow>
      {perms.map((p) => (
        <TableRow key={p.key}>
          <TableCell>
            <div className="space-y-0.5">
              <p className="text-sm">{p.description}</p>
              <p className="font-mono text-xs text-muted-foreground">{p.key}</p>
            </div>
          </TableCell>
          <TableCell className="text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex" tabIndex={0}>
                  <Checkbox
                    checked
                    disabled
                    aria-label={`Admin: ${p.description} (always granted)`}
                    className="disabled:cursor-default disabled:opacity-100"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>Admins always hold every permission</TooltipContent>
            </Tooltip>
          </TableCell>
          <TableCell className="text-center">
            <Checkbox
              checked={staffKeys.has(p.key)}
              disabled={!canEdit}
              onCheckedChange={(checked: boolean | "indeterminate") =>
                onToggle(p.key, checked === true)
              }
              aria-label={`Staff: ${p.description}`}
            />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
