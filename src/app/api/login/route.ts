import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_TTL_SECONDS, issueToken } from "@/lib/authToken";

export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const expected = process.env.SITE_ACCESS_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "未配置 SITE_ACCESS_PASSWORD" }, { status: 503 });
  }

  // 定长比较，避免通过响应时间推测密码
  const max = Math.max(password.length, expected.length);
  let diff = password.length ^ expected.length;
  for (let i = 0; i < max; i++) {
    diff |= (password.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  if (diff !== 0) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await issueToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_TTL_SECONDS,
  });
  return res;
}
