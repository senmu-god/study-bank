/**
 * 访问令牌。
 *
 * 旧实现把密码原文写进 cookie，等于把密码分发给浏览器；
 * 中间件又用 `pathname.includes(".")` 放行，任何带点号的路径都能绕过。
 * 这里改为：cookie 只放「过期时间 + HMAC 签名」，签名密钥由服务端密码派生，
 * 因此不需要额外配置项，泄露 cookie 也不等于泄露密码。
 */

export const AUTH_COOKIE = "auth_token";
/** 30 天 */
export const AUTH_TTL_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

async function sign(password: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(new Uint8Array(mac));
}

/** 签发：返回 `<过期时间戳>.<签名>` */
export async function issueToken(password: string, now = Date.now()): Promise<string> {
  const exp = now + AUTH_TTL_SECONDS * 1000;
  return `${exp}.${await sign(password, `v1:${exp}`)}`;
}

/** 校验：签名不符、过期、格式错误一律拒绝 */
export async function verifyToken(
  token: string | undefined | null,
  password: string,
  now = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = await sign(password, `v1:${exp}`);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * 静态资源判定。
 * 只放行明确的静态扩展名，不再用「路径里含点」这种宽松规则，
 * 否则 `/api/xxx.json`、`/api/x.y/z` 之类都能绕过鉴权。
 */
const STATIC_EXT = /\.(?:png|jpe?g|svg|ico|webp|gif|css|js|mjs|map|woff2?|ttf|otf)$/i;

export function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    STATIC_EXT.test(pathname)
  );
}
