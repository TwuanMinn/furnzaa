"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBrowserClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import { GENDER_OPTIONS } from "@/lib/users/schemas";
import { updateProfileAction, changePasswordAction } from "@/lib/settings/actions";
import type { ProfileInput } from "@/lib/settings/schemas";
import type { ProfileData } from "./types";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** My Profile: personal details + avatar, and a change-password card. */
export function ProfileSection({ data }: { data: ProfileData }) {
  const router = useRouter();

  // ── Profile card state ──────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(data.fullName);
  const [phone, setPhone] = useState(data.phone);
  const [department, setDepartment] = useState(data.department);
  const [birthday, setBirthday] = useState(data.birthday);
  const [gender, setGender] = useState(data.gender || "__none__");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(data.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Password card state ─────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Images must be PNG, JPEG or WebP");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error("Image is too large (max 5 MB)");
      return;
    }
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      // RLS on the avatars bucket requires the first folder to be the auth uid.
      const sanitizedName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60);
      const path = `${data.id}/${crypto.randomUUID()}-${sanitizedName}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(pub.publicUrl);
      toast.success("Photo uploaded — save to apply");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateProfileAction({
        fullName,
        phone,
        department,
        birthday,
        gender: (gender === "__none__" ? "" : gender) as ProfileInput["gender"],
        avatarUrl,
      });
      if (res.ok) {
        toast.success("Profile saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setChanging(true);
    try {
      const res = await changePasswordAction({ currentPassword, password, confirm });
      if (res.ok) {
        toast.success("Password changed");
        setCurrentPassword("");
        setPassword("");
        setConfirm("");
      } else {
        toast.error(res.error);
      }
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My profile</CardTitle>
          <CardDescription>
            Your personal details — shown across orders, messages and activity logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={(e) => void saveProfile(e)} className="space-y-4">
            <div className="flex items-center gap-4">
              <label
                className="grid size-16 cursor-pointer place-items-center rounded-full border-2 border-dashed border-border text-muted-foreground hover:border-primary/50"
                aria-label="Upload profile photo"
              >
                {uploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Avatar className="size-14">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                    <AvatarFallback>{initials(fullName)}</AvatarFallback>
                  </Avatar>
                )}
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => {
                    void uploadAvatar(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Profile photo</p>
                  <Badge variant="secondary">{data.roleName}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">PNG, JPEG or WebP — up to 5 MB.</p>
                {avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setAvatarUrl(null)}
                    disabled={uploading}
                  >
                    Remove photo
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full name</Label>
                <Input
                  id="profile-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" type="email" value={data.email} disabled />
                <p className="text-xs text-muted-foreground">
                  Sign-in email is managed by an administrator
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Phone</Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={25}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-department">Department</Label>
                <Input
                  id="profile-department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-birthday">Birthday</Label>
                <Input
                  id="profile-birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-gender">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="profile-gender" className="w-full">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not specified</SelectItem>
                    {GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={saving || uploading}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Update the password you sign in with.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={(e) => void changePassword(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="password-current">Current password</Label>
                <Input
                  id="password-current"
                  type="password"
                  autoComplete="new-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-new">New password</Label>
                <Input
                  id="password-new"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-confirm">Confirm new password</Label>
                <Input
                  id="password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Must satisfy the organization password policy.
            </p>
            <Button type="submit" disabled={changing}>
              {changing ? <Loader2 className="size-4 animate-spin" /> : null}
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
