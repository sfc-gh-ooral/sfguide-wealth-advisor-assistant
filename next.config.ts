import type { NextConfig } from "next";

// `npm run build:example` sets this to export the in-browser sample-data example for GitHub Pages.
const hostedExample = process.env.NEXT_PUBLIC_HOSTED_EXAMPLE === "true";
const basePath = "/sfguide-wealth-advisor-assistant/try";

const nextConfig: NextConfig = hostedExample
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
      // Lets the browser build fetch per-household sample files under the base path.
      env: { NEXT_PUBLIC_BASE_PATH: basePath },
    }
  : {
      // snowflake-sdk is server-only and loaded at runtime in live mode.
      serverExternalPackages: ["snowflake-sdk"],
      // Keeps the dev-mode badge out of screenshots.
      devIndicators: false,
    };

export default nextConfig;
