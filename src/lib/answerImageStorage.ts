const STORAGE_REF_PREFIX = "storage://answer-images/";

/** Extract only this app's generated answer image object names. */
export function answerImagePath(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  let path = "";
  if (value.startsWith(STORAGE_REF_PREFIX)) {
    path = value.slice(STORAGE_REF_PREFIX.length);
  } else {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/answer-images\/(.+)$/);
      if (!match) return null;
      path = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return /^answer-[a-zA-Z0-9-]+\.(?:jpg|png|webp)$/.test(path) ? path : null;
}

export function answerImageRef(path: string): string {
  return `${STORAGE_REF_PREFIX}${path}`;
}
