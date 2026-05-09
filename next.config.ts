import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Явная корень трейса, если выше по дереву есть ещё package-lock.json
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
