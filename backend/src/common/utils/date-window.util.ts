import { BadRequestException } from '@nestjs/common';

/** Asia/Dubai is UTC+4 year-round (no DST) — the server and designers both operate on this clock. */
const BUSINESS_UTC_OFFSET_MINUTES = 240;

/** Business-local (Dubai) calendar date, as YYYY-MM-DD. Not the server/UTC date — see BUSINESS_UTC_OFFSET_MINUTES. */
export function utcDateOnlyString(d = new Date()): string {
  const shifted = new Date(d.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().split('T')[0];
}

function parseUtcDateOnly(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    throw new BadRequestException('Date must be YYYY-MM-DD');
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Days from `dateStr` to today (business/Dubai date). 0 = today, 1 = yesterday, etc. */
export function daysBeforeTodayUtc(dateStr: string): number {
  const today = parseUtcDateOnly(utcDateOnlyString());
  const target = parseUtcDateOnly(dateStr);
  return Math.floor((today.getTime() - target.getTime()) / 86_400_000);
}

/** Regularization: today and previous 2 days only */
export function assertRegularizationDateAllowed(dateStr: string): void {
  const daysBack = daysBeforeTodayUtc(dateStr);
  if (daysBack < 0) {
    throw new BadRequestException('Regularization date cannot be in the future');
  }
  if (daysBack > 2) {
    throw new BadRequestException(
      'Regularization is only allowed for today, yesterday, or the day before yesterday',
    );
  }
}

/** Overtime: today only */
export function assertOvertimeDateIsToday(dateStr: string): void {
  if (dateStr.trim() !== utcDateOnlyString()) {
    throw new BadRequestException('Overtime can only be submitted for today');
  }
}

export function minRegularizationDateUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 2);
  return utcDateOnlyString(d);
}

export function maxRegularizationDateUtc(): string {
  return utcDateOnlyString();
}
