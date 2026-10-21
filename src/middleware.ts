import { NextResponse, NextRequest } from "next/server";
import { AUTH_COOKIE, isStaticAsset, verifyToken } from "@/lib/authToken";

/**
 * 访问控制。规则：
 *   1. 静态资源放行（白名单扩展名，不再用「路径含点」判断）；
 *   2. 登录页与 /api/login 放行；
 *   3. 未配置 SITE_ACCESS_PASSWORD 时：
 *        本地开发放行，生产环境一律拒绝（否则等于全站公开）；
 *   4. cookie 只校验 HMAC 签名，不保存密码原文。
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticAsset(pathname)) return NextResponse.next();
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const expected = process.env.SITE_ACCESS_PASSWORD;

  if (!expected) {
    const devAllowed =
      process.env.NODE_ENV !== "production" || process.env.ALLOW_NO_PASSWORD === "1";
    if (devAllowed) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "server_misconfigured", message: "未配置 SITE_ACCESS_PASSWORD，已拒绝访问" },
        { status: 503 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?reason=unconfigured";
    return NextResponse.redirect(url);
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (await verifyToken(token, expected)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
