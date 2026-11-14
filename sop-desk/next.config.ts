import type { NextConfig } from "next";

const config: NextConfig = {
  // The humanizer skill is read from disk at runtime; make sure Vercel bundles it.
  outputFileTracingIncludes: {
    "/api/**": ["./skills/humanizer/**"],
  },
  serverExternalPackages: ["mammoth", "unpdf"],
  devIndicators: false,
};

export default config;
