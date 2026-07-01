import { Prisma } from '@prisma/client';

type PrismaSqlParts = {
  strings: string[];
  values: unknown[];
};

/** Unwraps a Prisma.sql object for security-focused unit tests. */
export function extractPrismaSqlParts(query: unknown): PrismaSqlParts {
  const sql = query as { strings?: readonly string[]; values?: readonly unknown[] };
  return {
    strings: [...(sql.strings ?? [])],
    values: [...(sql.values ?? [])],
  };
}

/** Recursively collects bound values from nested Prisma.sql fragments. */
export function collectPrismaSqlValues(query: unknown): unknown[] {
  const { strings, values } = extractPrismaSqlParts(query);
  const collected: unknown[] = [];

  for (const value of values) {
    if (value && typeof value === 'object' && 'strings' in (value as object) && 'values' in (value as object)) {
      collected.push(...collectPrismaSqlValues(value));
      continue;
    }
    collected.push(value);
  }

  // Include nested sql from string slots (Prisma.empty has no values)
  if (strings.length > 1 && values.length === 0) {
    return collected;
  }

  return collected;
}

/**
 * Asserts user-controlled input is passed as a bound parameter, not concatenated into SQL text.
 * Fails when dangerous substrings appear in static SQL string parts.
 */
export function expectInputParameterized(
  query: unknown,
  userInput: string,
  dangerousFragments: string[] = ["';", 'DROP TABLE', 'DROP DATABASE', 'OR 1=1', '--'],
): void {
  const { strings } = extractPrismaSqlParts(query);
  const sqlText = strings.join('?');

  for (const fragment of dangerousFragments) {
    if (userInput.includes(fragment) || fragment === "';") {
      expect(sqlText.toUpperCase()).not.toContain(fragment.toUpperCase());
    }
  }

  if (!userInput.trim()) {
    return;
  }

  const boundValues = collectPrismaSqlValues(query);
  const serialized = JSON.stringify(boundValues);
  expect(serialized).toContain(userInput);
}

export function isPrismaSql(query: unknown): query is Prisma.Sql {
  return Boolean(
    query &&
      typeof query === 'object' &&
      'strings' in query &&
      'values' in query,
  );
}
