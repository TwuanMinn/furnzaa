import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // React Compiler (Next 16, top-level) — auto-memoizes components. Turbopack
  // uses its built-in Babel for this, so no extra dependency is required.
  reactCompiler: true,
  // @react-pdf/renderer must stay in the Node runtime (not bundled for edge).
  serverExternalPackages: ["@react-pdf/renderer"],
  typescript: { ignoreBuildErrors: false },
  images: {
    // Supabase Storage public assets (e.g. avatars / company logo) for next/image.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
