/** Module filter options (client-safe; mirrors ActivityModule in lib/activity/log). */
export const ACTIVITY_MODULES = [
  "auth",
  "users",
  "customers",
  "orders",
  "notifications",
  "messages",
  "logs",
  "analytics",
  "settings",
] as const;
