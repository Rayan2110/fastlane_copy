/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), 'better-sqlite3', 'archiver'];
    return config;
  },
};

export default nextConfig;
