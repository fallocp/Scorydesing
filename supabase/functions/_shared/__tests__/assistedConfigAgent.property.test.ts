/**
 * Property 13: Generic agent schema independence
 * **Validates: Requirements 10.4**
 *
 * The `validateAgainstSchema` function must work correctly with ANY schema
 * definition, not just the compliance schema. Properties:
 *
 * 1. For any valid TargetSchema with N fields, an object that has all N fields
 *    with correct types passes validation
 * 2. For any valid TargetSchema, an object missing any field fails validation
 * 3. For any valid TargetSchema, an object with wrong types for any field fails validation
 * 4. The function works identically for schemas with different numbers of fields (1, 2, 5, 10 fields)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateAgainstSchema } from '../assistedConfigAgent';
import type { TargetSchema, SchemaField } from '../assistedConfigAgent';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid field keys (unique, safe identifiers) */
const arbFieldKey = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter(
    (s) =>
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) &&
      !s.includes('__proto__') &&
      !s.includes('constructor') &&
      !s.includes('prototype'),
  );

/** Generator for field types */
const arbFieldType: fc.Arbitrary<'string_array' | 'record_string_string'> = fc.oneof(
  fc.constant('string_array' as const),
  fc.constant('record_string_string' as const),
);

/** Generator for a single SchemaField */
const arbSchemaField: fc.Arbitrary<SchemaField> = fc.record({
  key: arbFieldKey,
  type: arbFieldType,
  label: fc.string({ minLength: 1, maxLength: 50 }),
});

/** Generator for a TargetSchema with N unique-key fields */
function arbTargetSchemaWithNFields(n: number): fc.Arbitrary<TargetSchema> {
  return fc
    .uniqueArray(arbSchemaField, { minLength: n, maxLength: n, selector: (f) => f.key })
    .map((fields) => ({
      name: `TestSchema_${n}`,
      fields,
    }));
}

/** Generator for a TargetSchema with variable number of fields (1-10) */
const arbTargetSchema: fc.Arbitrary<TargetSchema> = fc
  .integer({ min: 1, max: 10 })
  .chain((n) => arbTargetSchemaWithNFields(n));

/** Generate a valid value for a given field type */
function arbValueForType(type: 'string_array' | 'record_string_string'): fc.Arbitrary<unknown> {
  switch (type) {
    case 'string_array':
      return fc.array(fc.string({ minLength: 0, maxLength: 30 }), { minLength: 0, maxLength: 10 });
    case 'record_string_string':
      return fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !s.includes('__proto__') && !s.includes('constructor'),
        ),
        fc.string({ minLength: 0, maxLength: 30 }),
        { minKeys: 0, maxKeys: 5 },
      );
  }
}

/** Generate an invalid value for a given field type (wrong type) */
function arbInvalidValueForType(type: 'string_array' | 'record_string_string'): fc.Arbitrary<unknown> {
  switch (type) {
    case 'string_array':
      // Return things that are NOT valid string arrays
      return fc.oneof(
        fc.constant(42),
        fc.constant('not an array'),
        fc.constant(null),
        fc.constant({ key: 'value' }),
        fc.constant([1, 2, 3]), // array of non-strings
        fc.constant([null, undefined]),
        fc.constant(true),
      );
    case 'record_string_string':
      // Return things that are NOT valid Record<string, string>
      return fc.oneof(
        fc.constant(42),
        fc.constant('not an object'),
        fc.constant(null),
        fc.constant([]), // array instead of object
        fc.constant({ key: 123 }), // non-string values
        fc.constant({ key: null }),
        fc.constant(true),
      );
  }
}

/** Build a conforming object for a given schema */
function arbConformingObject(schema: TargetSchema): fc.Arbitrary<Record<string, unknown>> {
  if (schema.fields.length === 0) {
    return fc.constant({});
  }

  const entries = schema.fields.map((field) =>
    arbValueForType(field.type).map((value) => [field.key, value] as [string, unknown]),
  );

  return fc.tuple(...(entries as [fc.Arbitrary<[string, unknown]>, ...fc.Arbitrary<[string, unknown]>[]])).map(
    (pairs) => Object.fromEntries(pairs),
  );
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 13: Generic agent schema independence', () => {
  it('Property 1: For any valid TargetSchema with N fields, an object with all N fields and correct types passes validation', () => {
    fc.assert(
      fc.property(arbTargetSchema, (schema) => {
        // Generate a conforming object inline using synchronous approach
        const obj: Record<string, unknown> = {};
        for (const field of schema.fields) {
          if (field.type === 'string_array') {
            obj[field.key] = ['test_value_1', 'test_value_2'];
          } else {
            obj[field.key] = { sample_key: 'sample_value' };
          }
        }

        expect(validateAgainstSchema(obj, schema)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('Property 1 (randomized values): conforming objects with random valid values pass validation', () => {
    fc.assert(
      fc.property(
        arbTargetSchema.chain((schema) =>
          arbConformingObject(schema).map((obj) => ({ schema, obj })),
        ),
        ({ schema, obj }) => {
          expect(validateAgainstSchema(obj, schema)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Property 2: For any valid TargetSchema, an object missing any field fails validation', () => {
    fc.assert(
      fc.property(
        arbTargetSchema.filter((s) => s.fields.length >= 1),
        fc.nat(),
        (schema, indexSeed) => {
          // Build a complete conforming object
          const obj: Record<string, unknown> = {};
          for (const field of schema.fields) {
            if (field.type === 'string_array') {
              obj[field.key] = ['value1', 'value2'];
            } else {
              obj[field.key] = { k: 'v' };
            }
          }

          // Remove one field (pick by index)
          const fieldToRemove = schema.fields[indexSeed % schema.fields.length];
          delete obj[fieldToRemove.key];

          expect(validateAgainstSchema(obj, schema)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Property 3: For any valid TargetSchema, an object with wrong types for any field fails validation', () => {
    fc.assert(
      fc.property(
        arbTargetSchema.filter((s) => s.fields.length >= 1),
        fc.nat(),
        (schema, indexSeed) => {
          // Build a complete conforming object
          const obj: Record<string, unknown> = {};
          for (const field of schema.fields) {
            if (field.type === 'string_array') {
              obj[field.key] = ['value1', 'value2'];
            } else {
              obj[field.key] = { k: 'v' };
            }
          }

          // Corrupt one field with wrong type
          const fieldToCorrupt = schema.fields[indexSeed % schema.fields.length];
          if (fieldToCorrupt.type === 'string_array') {
            // Replace string array with something invalid
            obj[fieldToCorrupt.key] = { not: 'an array' };
          } else {
            // Replace record with something invalid
            obj[fieldToCorrupt.key] = ['not', 'a', 'record'];
          }

          expect(validateAgainstSchema(obj, schema)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Property 4: The function works identically for schemas with different numbers of fields (1, 2, 5, 10)', () => {
    const fieldCounts = [1, 2, 5, 10];

    for (const n of fieldCounts) {
      fc.assert(
        fc.property(arbTargetSchemaWithNFields(n), (schema) => {
          // Valid object passes
          const validObj: Record<string, unknown> = {};
          for (const field of schema.fields) {
            if (field.type === 'string_array') {
              validObj[field.key] = ['a', 'b'];
            } else {
              validObj[field.key] = { x: 'y' };
            }
          }
          expect(validateAgainstSchema(validObj, schema)).toBe(true);

          // Object missing first field fails
          const missingObj = { ...validObj };
          delete missingObj[schema.fields[0].key];
          expect(validateAgainstSchema(missingObj, schema)).toBe(false);

          // Object with wrong type on first field fails
          const wrongTypeObj = { ...validObj };
          if (schema.fields[0].type === 'string_array') {
            wrongTypeObj[schema.fields[0].key] = 'not_array';
          } else {
            wrongTypeObj[schema.fields[0].key] = [1, 2, 3];
          }
          expect(validateAgainstSchema(wrongTypeObj, schema)).toBe(false);

          // Null/undefined/primitives always fail
          expect(validateAgainstSchema(null, schema)).toBe(false);
          expect(validateAgainstSchema(undefined, schema)).toBe(false);
          expect(validateAgainstSchema(42, schema)).toBe(false);
          expect(validateAgainstSchema('string', schema)).toBe(false);
        }),
        { numRuns: 100 },
      );
    }
  });

  it('Property 3 (randomized invalid values): wrong-typed values always cause failure', () => {
    fc.assert(
      fc.property(
        arbTargetSchema.filter((s) => s.fields.length >= 1),
        fc.nat(),
        (schema, indexSeed) => {
          // Build a complete conforming object
          const obj: Record<string, unknown> = {};
          for (const field of schema.fields) {
            if (field.type === 'string_array') {
              obj[field.key] = ['val'];
            } else {
              obj[field.key] = { k: 'v' };
            }
          }

          // Corrupt one field with various invalid values
          const fieldToCorrupt = schema.fields[indexSeed % schema.fields.length];
          const invalidValues: unknown[] =
            fieldToCorrupt.type === 'string_array'
              ? [null, 42, 'string', { obj: true }, [1, 2, 3], true]
              : [null, 42, 'string', [], [1, 2], true, { k: 123 }];

          for (const invalidVal of invalidValues) {
            const corruptedObj = { ...obj, [fieldToCorrupt.key]: invalidVal };
            expect(validateAgainstSchema(corruptedObj, schema)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
