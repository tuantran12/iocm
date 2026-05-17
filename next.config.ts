import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output cho Docker production build
  // Tạo thư mục .next/standalone chứa tất cả dependencies cần thiết
  output: 'standalone',
}

export default nextConfig
