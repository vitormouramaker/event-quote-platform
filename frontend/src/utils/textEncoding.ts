const suspiciousMojibakePattern =
  /ï¿½|�|[ÃÂâ][\u0080-\u00FF]/;
const suspiciousMojibakePatternGlobal =
  /ï¿½|�|[ÃÂâ][\u0080-\u00FF]/g;

function decodeLatin1AsUtf8(input: string): string {
  const bytes = Uint8Array.from(input, (char) => char.charCodeAt(0) & 0xff);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function countSuspiciousMarkers(value: string): number {
  return value.match(suspiciousMojibakePatternGlobal)?.length ?? 0;
}

export function fixMojibakeText(value: string): string {
  if (!suspiciousMojibakePattern.test(value)) return value;

  let best = value;
  let bestScore = countSuspiciousMarkers(value);
  let current = value;

  for (let i = 0; i < 4; i += 1) {
    try {
      const decoded = decodeLatin1AsUtf8(current);
      if (decoded === current) break;

      const currentScore = countSuspiciousMarkers(current);
      const decodedScore = countSuspiciousMarkers(decoded);

      if (decodedScore < bestScore) {
        best = decoded;
        bestScore = decodedScore;
      }

      if (decodedScore >= currentScore) break;

      current = decoded;
      if (bestScore === 0) break;
    } catch {
      break;
    }
  }

  return best;
}

export function deepFixMojibake<T>(value: T): T {
  if (typeof value === "string") {
    return fixMojibakeText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepFixMojibake(item)) as T;
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = deepFixMojibake(item);
    }
    return output as T;
  }

  return value;
}
