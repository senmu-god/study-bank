/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 默认仍使用 .next；本地并行验证时可用 NEXT_DIST_DIR 指向独立目录，
  // 避免与正在运行的预览服务抢占同一份构建缓存。
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
