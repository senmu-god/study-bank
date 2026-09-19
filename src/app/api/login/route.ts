import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { password } = await req.json();
  const expected = process.env.SITE_ACCESS_PASSWORD;

  if (!expected) {
    return NextResponse.json({ error: "未配置 SITE_ACCESS_PASSWORD" }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth_token", expected, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30天
  });
  return res;
}
