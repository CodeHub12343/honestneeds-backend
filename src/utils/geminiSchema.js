/**
 * JSON Schema → Gemini responseSchema converter.
 *
 * The Claude structured-output calls (AIProviderService.completeJSON) pass
 * standard JSON Schema objects that use `additionalProperties: false`, union
 * `type` arrays, etc. Gemini's `responseSchema` only understands an OpenAPI 3.0
 * Schema subset: it rejects `additionalProperties`, `$schema`, `$id`, `$ref`,
 * `definitions`/`$defs`, and prefers UPPERCASE type names plus an explicit
 * `propertyOrdering` for deterministic field order.
 *
 * This converter rewrites a schema into that subset so the exact same feature
 * schemas work unchanged on Gemini. It is intentionally conservative: anything
 * Gemini doesn't support is dropped rather than passed through (which would
 * make the API reject the request).
 */

// JSON Schema primitive type → Gemini Type enum (string form accepted by the SDK).
const TYPE_MAP = {
  object: 'OBJECT',
  array: 'ARRAY',
  string: 'STRING',
  integer: 'INTEGER',
  number: 'NUMBER',
  boolean: 'BOOLEAN',
  // Gemini has no NULL type; null-ability is expressed via the `nullable` flag.
  null: 'STRING',
};

// Keywords Gemini's Schema understands and we forward verbatim.
const PASSTHROUGH_KEYS = [
  'description',
  'enum',
  'format',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
];

/**
 * Recursively convert a JSON Schema node to a Gemini-compatible schema node.
 * @param {Object} schema
 * @returns {Object}
 */
function convert(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  // Normalize union types, e.g. ["string", "null"] → STRING + nullable.
  let type = schema.type;
  let nullable = schema.nullable === true;
  if (Array.isArray(type)) {
    nullable = nullable || type.includes('null');
    type = type.find((t) => t !== 'null') || 'string';
  }

  const out = {};
  if (type) out.type = TYPE_MAP[type] || String(type).toUpperCase();
  if (nullable) out.nullable = true;

  for (const key of PASSTHROUGH_KEYS) {
    if (schema[key] !== undefined) out[key] = schema[key];
  }

  // Object: convert each property and emit deterministic ordering.
  if (type === 'object' || schema.properties) {
    const props = schema.properties || {};
    const keys = Object.keys(props);
    out.type = out.type || 'OBJECT';
    out.properties = {};
    for (const k of keys) out.properties[k] = convert(props[k]);

    const required = Array.isArray(schema.required) ? schema.required.filter((k) => keys.includes(k)) : [];
    if (required.length) out.required = [...required];

    // required fields first (declared order), then the rest.
    out.propertyOrdering = [...required, ...keys.filter((k) => !required.includes(k))];
  }

  // Array: convert the item schema.
  if (type === 'array' || schema.items) {
    out.type = out.type || 'ARRAY';
    if (schema.items) out.items = convert(schema.items);
  }

  return out;
}

module.exports = { convertToGeminiSchema: convert };
