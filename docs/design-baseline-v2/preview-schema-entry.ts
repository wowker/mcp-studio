// The preview uses the same validator and dialect resolution as the application.
import { validateJsonSchema } from '../../src/shared/json-schema.js';
(window as unknown as { previewSchema: typeof validateJsonSchema }).previewSchema = validateJsonSchema;
