ALTER TABLE test_executions ADD COLUMN scenario_data_flow_json TEXT
  CHECK (scenario_data_flow_json IS NULL OR
    (json_valid(scenario_data_flow_json) AND json_type(scenario_data_flow_json) = 'array'));

ALTER TABLE test_execution_steps ADD COLUMN skip_reason TEXT
  CHECK (skip_reason IS NULL OR skip_reason IN ('CONDITION_FALSE', 'DEPENDENCY_BLOCKED'));
