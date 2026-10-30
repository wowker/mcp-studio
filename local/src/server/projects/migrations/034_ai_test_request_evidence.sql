-- The claim owns a sanitized request only until a Run owns the actual request.
-- Also discard any old copy when ON DELETE SET NULL removes that Run.
CREATE TRIGGER ai_test_request_ownership AFTER UPDATE OF run_id ON ai_test_calls
WHEN NEW.run_id IS NOT NULL OR OLD.run_id IS NOT NULL
BEGIN
  UPDATE ai_test_calls SET lineage_json = json_remove(lineage_json, '$.arguments')
    WHERE id = NEW.id;
END;

UPDATE ai_test_calls SET lineage_json = json_remove(lineage_json, '$.arguments')
  WHERE run_id IS NOT NULL OR json_extract(payload_json, '$.payloadState') = 'CLEARED';
