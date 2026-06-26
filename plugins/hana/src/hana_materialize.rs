use duckdb::{
    core::{DataChunkHandle, LogicalTypeId},
    vtab::arrow::WritableVector,
    vscalar::{VScalar, ScalarFunctionSignature},
};
use crate::HanaError;

pub struct HanaMaterializeCohortScalar;

impl VScalar for HanaMaterializeCohortScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        _input: &mut DataChunkHandle,
        _output: &mut dyn WritableVector,
    ) -> Result<(), Box<dyn std::error::Error>> {
        Err(Box::new(*HanaError::new("trex_hana_materialize_cohort not implemented")))
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(), // connection_string
                LogicalTypeId::Varchar.into(), // source_sql
                LogicalTypeId::Varchar.into(), // source_params_json
                LogicalTypeId::Varchar.into(), // results_schema
                LogicalTypeId::Bigint.into(),  // cohort_definition_id
                LogicalTypeId::Varchar.into(), // session_vars_json
            ],
            LogicalTypeId::Bigint.into(),      // processed_rows
        )]
    }
}
