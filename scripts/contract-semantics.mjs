// M0 reference oracle. Never import this into the application execution path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const clone = value => structuredClone(value);
const escape = key => String(key).replaceAll('~', '~0').replaceAll('/', '~1');
const empty = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const pointerParts = pointer => {
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) throw Error('invalid_pointer');
  return pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
};
function environment(input) {
  const effective = new Map();
  for (const layer of input.layers) {
    const seen = new Set();
    for (const definition of layer.definitions) {
      if (seen.has(definition.name)) return { error: 'duplicate_definition' };
      seen.add(definition.name);
      effective.set(definition.name, { ...definition, source: layer.source });
    }
  }
  const resolve = (name, active) => {
    const d = effective.get(name);
    if (!d) return { name, status: 'definition_missing', source: null, sensitive: false };
    const row = { name, status: 'resolved', source: d.source, sensitive: !!d.sensitive };
    if (active.has(name)) return { ...row, status: 'cycle' };
    if (d.sensitive && !Object.hasOwn(input.personal, d.id)) return { ...row, status: 'personal_missing' };
    const next = new Set(active).add(name);
    const replace = value => {
      if (typeof value === 'string') return value.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/gu, (_, dep) => {
        const resolved = resolve(dep, next);
        row.sensitive ||= resolved.sensitive;
        if (resolved.status !== 'resolved') row.status = resolved.status === 'cycle' ? 'cycle' : 'dependency_missing';
        return typeof resolved.value === 'string' ? resolved.value : JSON.stringify(resolved.value) ?? '';
      });
      if (Array.isArray(value)) return value.map(replace);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
      return value;
    };
    const value = replace(d.sensitive ? input.personal[d.id] : d.value);
    if (row.status === 'resolved' && d.required && empty(value)) row.status = 'required_empty';
    if (row.status === 'resolved' && !((d.type === 'json') || (d.type === 'string' && typeof value === 'string') || (d.type === 'number' && typeof value === 'number' && Number.isFinite(value)) || (d.type === 'boolean' && typeof value === 'boolean'))) row.status = 'type_error';
    return { ...row, value };
  };
  return input.targets.map(name => {
    const row = resolve(name, new Set());
    if (row.sensitive || row.status !== 'resolved') delete row.value;
    return row;
  });
}
const supported = new Set(['$schema','$ref','$defs','type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','minimum','maximum','enum','const','oneOf','anyOf','allOf','title','description','default']);
function schemaSupport(schema, root, active = new Set()) {
  if (typeof schema === 'boolean') return true;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  if (Object.keys(schema).some(key => !supported.has(key))) return false;
  if (schema.$schema && schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') return false;
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/') || active.has(schema.$ref)) return false;
    let target = root;
    try { for (const part of pointerParts(schema.$ref.slice(1))) target = target[part]; } catch { return false; }
    if (!schemaSupport(target, root, new Set(active).add(schema.$ref))) return false;
  }
  const children = [...Object.values(schema.properties ?? {}), ...Object.values(schema.$defs ?? {}), ...(schema.oneOf ?? []), ...(schema.anyOf ?? []), ...(schema.allOf ?? [])];
  if (schema.items !== undefined) children.push(schema.items);
  if (typeof schema.additionalProperties === 'object') children.push(schema.additionalProperties);
  return children.every(child => schemaSupport(child, root, active));
}
const matchesType = (type, value) => ({null: value === null, object: value !== null && typeof value === 'object' && !Array.isArray(value), array: Array.isArray(value), string: typeof value === 'string', number: typeof value === 'number' && Number.isFinite(value), integer: typeof value === 'number' && Number.isSafeInteger(value), boolean: typeof value === 'boolean'})[type] === true;
function validate(schema, value, path, root) {
  if (schema === true) return [];
  if (schema === false) return [path + '#false'];
  const errors = [];
  if (schema.$ref) {
    let target = root;
    for (const part of pointerParts(schema.$ref.slice(1))) target = target[part];
    errors.push(...validate(target, value, path, root));
  }
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(type => matchesType(type, value))) return [...errors, path + '#type'];
  if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) errors.push(path + '#enum');
  if (Object.hasOwn(schema, 'const') && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(path + '#const');
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(path + '#minimum');
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(path + '#maximum');
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(path + '#minLength');
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) errors.push(path + '#maxLength');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(path + '#minItems');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(path + '#maxItems');
    if (schema.items !== undefined) value.forEach((item, i) => errors.push(...validate(schema.items, item, path + '/' + i, root)));
  } else if (value && typeof value === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(path + '/' + escape(key) + '#required');
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key];
      if (child !== undefined) errors.push(...validate(child, item, path + '/' + escape(key), root));
      else if (schema.additionalProperties === false) errors.push(path + '/' + escape(key) + '#additionalProperties');
      else if (typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, item, path + '/' + escape(key), root));
    }
  }
  if (schema.oneOf && schema.oneOf.filter(child => !validate(child, value, path, root).length).length !== 1) errors.push(path + '#oneOf');
  if (schema.anyOf && !schema.anyOf.some(child => !validate(child, value, path, root).length)) errors.push(path + '#anyOf');
  for (const child of schema.allOf ?? []) errors.push(...validate(child, value, path, root));
  return [...new Set(errors)].sort();
}
function schema(input) {
  let value, status, errors;
  try { value = JSON.parse(input.raw); } catch { status = 'invalid_json'; errors = ['#json']; }
  if (!status) {
    for (const pointer of input.skip) {
      const parts = pointerParts(pointer); const key = parts.pop();
      let parent = value;
      for (const part of parts) parent = parent?.[part];
      if (parent && typeof parent === 'object') delete parent[key];
    }
    if (!schemaSupport(input.schema, input.schema)) { status = 'unsupported_schema'; errors = ['#unsupported']; }
    else { errors = validate(input.schema, value, '', input.schema); status = errors.length ? 'schema_error' : 'valid'; }
  }
  return { status, canExecute: status === 'valid', canSavePrivate: status !== 'invalid_json', canPublish: status === 'valid', canStructure: status !== 'invalid_json', errors };
}
function redaction(input) {
  if (input.contentKind === 'binary' || input.contentKind === 'unparseable') return { omitted: true, reason: 'unstructured_content' };
  let value = clone(input.value); const paths = new Set();
  try {
    for (const pointer of input.pointers ?? []) {
      const parts = pointerParts(pointer); const key = parts.pop(); let parent = value;
      for (const part of parts) parent = parent?.[part];
      if (!parent || !Object.hasOwn(parent, key)) throw Error('invalid_pointer');
      parent[key] = '[REDACTED]'; paths.add(pointer);
    }
  } catch { return { error: 'invalid_pointer' }; }
  const walk = (item, path, key) => {
    const secretKey = /^(authorization|proxy-authorization|cookie|set-cookie|token|access_token|refresh_token|api[_-]?key|password|secret|email|phone)$/iu.test(key);
    const tainted = (input.sensitiveValues ?? []).some(secret => typeof item === 'string' && typeof secret === 'string' && secret.length > 0 ? item.includes(secret) : JSON.stringify(item) === JSON.stringify(secret));
    const urlSecret = typeof item === 'string' && /:\/\/[^\s/@:]+:[^\s/@]+@|[?&](?:token|api_key|key|access_token|password|secret)=/iu.test(item);
    if (secretKey || tainted || urlSecret) { paths.add(path); return '[REDACTED]'; }
    if (Array.isArray(item)) return item.map((child, i) => walk(child, path + '/' + i, ''));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v, path + '/' + escape(k), k)]));
    return item;
  };
  value = walk(value, '', '');
  return { value, paths: [...paths].sort(), omitted: false };
}
function run(input) {
  let status = input.start, remoteOutcome = 'unknown';
  for (const event of input.events) {
    if (status !== 'running') continue;
    if (event === 'cancel') status = 'cancelled';
    else if (event === 'timeout' || event === 'interrupted') status = 'failed';
    else if (['success', 'tool_error', 'rpc_error', 'unauthorized'].includes(event)) { status = event === 'success' ? 'succeeded' : 'failed'; remoteOutcome = 'known'; }
  }
  return { status, remoteOutcome };
}
function permission(input) {
  const { teamRole, projectRole, action, self, held } = input;
  const member = ['maintainer','developer','viewer'].includes(projectRole), writer = ['maintainer','developer'].includes(projectRole);
  const allowed = action === 'directory.read' ? ['owner','admin'].includes(teamRole) || member
    : action === 'project.takeover' ? teamRole === 'owner' && self
    : action === 'content.read' ? member
    : action === 'private.read' ? member && self
    : action === 'upload.retry' ? writer && self && held
    : action === 'history.pin' ? projectRole === 'maintainer' : false;
  return { allowed };
}
function restore(input) {
  if (input.newTabId === input.oldTabId) return { error: 'new_tab_required' };
  const marked = value => value === '[REDACTED]' || value === '[TRUNCATED]' || (value && typeof value === 'object' && Object.values(value).some(marked));
  const parameters = {}, removed = [];
  for (const [key,value] of Object.entries(input.parameters)) if (marked(value)) removed.push(key); else parameters[key] = clone(value);
  return { tabId: input.newTabId, status: 'unexecuted', parameters, removed: removed.sort() };
}
export function evaluate(kind, input) {
  if (kind === 'environment') return environment(input);
  if (kind === 'schema') return schema(input);
  if (kind === 'redaction') return redaction(input);
  if (kind === 'run') return run(input);
  if (kind === 'permission') return permission(input);
  if (kind === 'restore') return restore(input);
  if (kind === 'upload') return { status: !input.allowed ? 'forbidden' : !input.sameIdentity ? 'identity_conflict' : input.storedDigest === null ? 'accepted' : input.storedDigest === input.incomingDigest ? 'idempotent' : 'digest_conflict', executeTool: false };
  throw Error('unknown_vector_kind');
}
export function checkSemantics() {
  const fixtures = JSON.parse(readFileSync(new URL('../contracts/fixtures/semantics-v1.json', import.meta.url), 'utf8'));
  assert.equal(fixtures.contractVersion, '1.0.0');
  const ids = new Set();
  for (const vector of fixtures.cases) {
    assert(!ids.has(vector.id), 'duplicate_vector_id'); ids.add(vector.id);
    assert.deepEqual(evaluate(vector.kind, vector.input), vector.expected, vector.id);
  }
  console.log(`Contract semantics JS: ${fixtures.cases.length} shared vectors passed`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) checkSemantics();
