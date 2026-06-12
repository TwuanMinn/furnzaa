import { redirect } from "next/navigation";

// Middleware sends authenticated users to /dashboard and everyone else to
// /login. This is just a safe server-side fallback for the root route.
export default function Home() {
  redirect("/dashboard");
}
