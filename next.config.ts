import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Standaardlimiet (1 MB) is te klein voor geüploade CSV/XLSX-bestanden.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
