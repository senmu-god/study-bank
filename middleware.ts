import { NextResponse, NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行静态资源、API、登录页本身
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login") ||
    pathname.includes(".") // 静态文件
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("auth_token")?.value;
  const expected = process.env.SITE_ACCESS_PASSWORD;

  if (!expected) return NextResponse.next(); // 未配置密码则不拦截
  if (token === expected) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
