export function bigIntToJsonValue(value: bigint): number | string {
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
}

/** Recursively replace bigint values before Express JSON serialization. */
export function serializeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') {
    return bigIntToJsonValue(value) as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInts(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = serializeBigInts(nested);
    }
    return out as T;
  }
  return value;
}

/** Allow JSON.stringify to serialize Prisma/SQL Server BigInt fields in API responses. */
export function installBigIntJsonSerialization(): void {
  const proto = BigInt.prototype as bigint & { toJSON?: () => number | string };
  if (typeof proto.toJSON === 'function') return;

  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value(this: bigint): number | string {
      return bigIntToJsonValue(this);
    },
    configurable: true,
  });
}

export function toApiBigInt(value: bigint | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === 'bigint' ? Number(value) : value;
}
