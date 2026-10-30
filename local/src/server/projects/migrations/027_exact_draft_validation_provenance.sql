DROP TRIGGER validated_asset_links_exact_revision;

CREATE TRIGGER validated_asset_links_exact_revision
BEFORE INSERT ON validated_asset_links
WHEN NOT EXISTS (
  SELECT 1
  FROM validation_sessions session
  JOIN validation_reviews review
    ON review.project_id = session.project_id AND review.session_id = session.id
  WHERE session.project_id = NEW.project_id
    AND session.id = NEW.session_id
    AND session.phase = 'COMPLETED'
    AND review.state = 'APPROVED'
    AND review.revision = NEW.review_revision
    AND session.evidence_version = NEW.evidence_version
    AND (
      (session.source_kind = 'TEST_CASE' AND NEW.asset_kind = 'TEST_CASE'
        AND session.source_id = NEW.asset_id AND session.source_revision = NEW.asset_revision
        AND NEW.draft_local_id IS NULL)
      OR
      (session.source_kind = 'TEST_SUITE' AND NEW.asset_kind = 'TEST_SUITE'
        AND session.source_id = NEW.asset_id AND session.source_revision = NEW.asset_revision
        AND NEW.draft_local_id IS NULL)
      OR
      (session.source_kind = 'DRAFT' AND NEW.draft_local_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM authoring_draft_asset_mappings mapping
        JOIN authoring_draft_apply_results apply_result
          ON apply_result.project_id = mapping.project_id AND apply_result.id = mapping.apply_id
          AND apply_result.draft_id = mapping.draft_id
        WHERE mapping.project_id = NEW.project_id
          AND mapping.draft_id = session.source_id
          AND mapping.draft_local_id = NEW.draft_local_id
          AND mapping.asset_kind = NEW.asset_kind
          AND mapping.formal_asset_id = NEW.asset_id
          AND mapping.formal_revision = NEW.asset_revision
          AND apply_result.status = 'APPLIED'
          AND apply_result.draft_revision = session.source_revision
      ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Validated asset link must match the approved source revision');
END;
