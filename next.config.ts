import type {
  NextConfig,
} from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: "/dashboard/leads",
        destination: "/dashboard/crm",
        permanent: false,
      },
      {
        source: "/dashboard/appointments",
        destination: "/dashboard/booking",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;