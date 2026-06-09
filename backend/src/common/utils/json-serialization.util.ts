/** Allow JSON.stringify to serialize Prisma/SQL Server BigInt fields in API responses. */
export function installBigIntJsonSerialization(): void {
  const proto = BigInt.prototype as bigint & { toJSON?: () => number | string };
  if (typeof proto.toJSON === 'function') return;

  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value(this: bigint): number | string {
      const asNumber = Number(this);
      return Number.isSafeInteger(asNumber) ? asNumber : this.toString();
    },
    configurable: true,
  });
}

export function toApiBigInt(value: bigint | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === 'bigint' ? Number(value) : value;
}
