import { NextResponse, NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行静态资源和登录页本身
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/login") ||
    pathname.includes(".") // 静态文件
  ) {
    return NextResponse.next();
  }

  // /api/login 必须放行（提交密码本身不需要 cookie）
  if (pathname === "/api/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get("auth_token")?.value;
  const expected = process.env.SITE_ACCESS_PASSWORD;

  // 未配置密码则不拦截（本地开发兜底）
  if (!expected) return NextResponse.next();

  if (token === expected) return NextResponse.next();

  // API 请求未授权：返回 401 JSON，不重定向
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 页面请求未授权：重定向到登录页
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};