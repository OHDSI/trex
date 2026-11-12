use duckdb_neo::{
    bind_arguments::BindArgument,
    connection::Context,
    data_chunk::{DataChunkRef, VectorCollection},
    extension::Extension,
    scalar::ScalarCallbacks,
    signature::SignatureBuilder,
    table_function::{BindFunctionHandle, ExecColumnInfo, InitColumnData, TableFunctionCallbacks},
    vector::{Unknown, Vector},
    DuckDBType,
};
use std::error::Error;
use std::sync::Mutex;

use crate::hana_scan::{validate_hana_connection, safe_hana_connect, HanaError};
use crate::hana_state::{
    self, TableAttachmentInfo, AttachedDatabase,
    prefixed_name, attachment_key,
};
use crate::v2_util::{arg_string, bind_error, exec_error, input_string, positional, write_strings};

const OUTPUT_BATCH: usize = 2048;

/// Emit the next batch of VARCHAR rows; an empty batch ends the scan.
fn emit_rows<const N: usize>(
    output: &mut DataChunkRef<'_>,
    rows: &[[String; N]],
    cursor: &Mutex<usize>,
) -> duckdb_neo::Result<()> {
    let mut current = cursor.lock().map_err(|_| exec_error(HanaError::new("lock error")))?;
    let remaining = rows.len().saturating_sub(*current);
    if remaining == 0 {
        return Ok(());
    }
    let batch = std::cmp::min(remaining, OUTPUT_BATCH);
    for col in 0..N {
        let mut vector = output.get_vector_at_mut::<String>(col)?;
        vector.set_size(batch)?;
        let mut writer = vector.writer()?;
        for (i, row) in rows[*current..*current + batch].iter().enumerate() {
            writer.set(i, Some(row[col].as_str()))?;
        }
    }
    *current += batch;
    Ok(())
}

fn add_varchar_columns(context: &Context, bind: &BindFunctionHandle<'_>, names: &[&str]) -> duckdb_neo::Result<()> {
    let varchar = String::logical_type(context)?;
    for name in names {
        bind.add_result_column(name, &varchar)?;
    }
    Ok(())
}

#[derive(Debug)]
pub struct HanaAttachBindData {
    url: String,
    dbname: String,
    schema: String,
    table_names: Vec<String>,
}

#[derive(Debug)]
pub struct HanaAttachInitData {
    tables: Vec<[String; 2]>,
    current_row: Mutex<usize>,
}

pub struct HanaAttachVTab;

impl HanaAttachVTab {
    pub fn signature() -> SignatureBuilder {
        SignatureBuilder::new()
            .param(positional::<String>(0)) // url
            .param(positional::<String>(1)) // dbname
            .param(positional::<String>(2)) // schema
    }

    fn bind_inner(arguments: &[BindArgument]) -> Result<HanaAttachBindData, Box<dyn Error>> {
        let url = arg_string(arguments, 0)?;
        let dbname = arg_string(arguments, 1)?;
        let schema = arg_string(arguments, 2)?;

        validate_hana_connection(&url)?;

        if dbname.is_empty() {
            return Err(HanaError::configuration(
                "dbname cannot be empty", Some("dbname"), None, Some("non-empty string"),
            ));
        }
        if schema.is_empty() {
            return Err(HanaError::configuration(
                "schema cannot be empty", Some("schema"), None, Some("non-empty string"),
            ));
        }

        let hana_conn = safe_hana_connect(url.clone())?;
        let discover_query = format!(
            "SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = '{}'",
            schema.replace('\'', "''")
        );
        let result_set = hana_conn.query(&discover_query).map_err(|e| {
            HanaError::query(
                &format!("Table discovery failed: {}", e),
                Some(&discover_query),
                None,
                "hana_attach bind",
            )
        })?;

        let mut table_names: Vec<String> = Vec::new();
        for row_result in result_set {
            let row = row_result.map_err(|e| {
                HanaError::query(
                    &format!("Row read failed during discovery: {}", e),
                    Some(&discover_query),
                    None,
                    "hana_attach bind",
                )
            })?;
            if let Ok(Some(name)) = row[0].clone().try_into::<Option<String>>() {
                table_names.push(name);
            }
        }

        if table_names.is_empty() {
            return Err(HanaError::schema(
                &format!("No tables found in schema '{}'", schema),
                None,
                "hana_attach bind",
            ));
        }

        Ok(HanaAttachBindData { url, dbname, schema, table_names })
    }
}

impl TableFunctionCallbacks for HanaAttachVTab {
    type BindData = HanaAttachBindData;
    type GlobalState = HanaAttachInitData;
    type LocalState = ();

    fn bind(
        &self,
        context: &Context,
        arguments: Vec<BindArgument>,
        bind_handle: BindFunctionHandle<'_>,
    ) -> duckdb_neo::Result<Self::BindData> {
        let bind_data = Self::bind_inner(&arguments).map_err(bind_error)?;
        add_varchar_columns(context, &bind_handle, &["table_name", "full_name"])?;
        Ok(bind_data)
    }

    fn init_global_state(
        &self,
        bind_ref: &Self::BindData,
        _context: &Context,
        _column_data: InitColumnData<'_>,
    ) -> duckdb_neo::Result<(Option<Self::GlobalState>, Option<usize>)> {
        let url = &bind_ref.url;
        let dbname = &bind_ref.dbname;
        let schema = &bind_ref.schema;
        let table_names = &bind_ref.table_names;

        let mut tables: Vec<[String; 2]> = Vec::new();

        // Registry only: the replacement scan resolves both the flat names and
        // `<dbname>_<schema>.<table>`, so no catalog DDL runs from inside the query.
        hana_state::write_state(|state| {
            let att_key = attachment_key(dbname, schema);
            if let Some(prev) = state.attachments.remove(&att_key) {
                for t in &prev.table_names {
                    let key = prefixed_name(&prev.dbname, &prev.schema, t).to_uppercase();
                    state.table_registry.remove(&key);
                }
            }

            for table in table_names {
                let flat = prefixed_name(dbname, schema, table);
                let key = flat.to_uppercase();
                state.table_registry.insert(
                    key,
                    TableAttachmentInfo {
                        url: url.clone(),
                        hana_schema: schema.clone(),
                        hana_table: table.clone(),
                    },
                );
                tables.push([table.clone(), flat]);
            }

            state.attachments.insert(
                att_key,
                AttachedDatabase {
                    url: url.clone(),
                    dbname: dbname.clone(),
                    schema: schema.clone(),
                    table_names: table_names.clone(),
                },
            );
        });

        Ok((Some(HanaAttachInitData { tables, current_row: Mutex::new(0) }), Some(1)))
    }

    fn exec(
        &self,
        _bind_data: &Self::BindData,
        global_state: Option<&Self::GlobalState>,
        _local_state: Option<&mut Self::LocalState>,
        _context: &Context,
        mut output: DataChunkRef<'_>,
        _column_info: ExecColumnInfo<'_>,
    ) -> duckdb_neo::Result<()> {
        let init_data = global_state.ok_or_else(|| exec_error(HanaError::new("lock error")))?;
        emit_rows(&mut output, &init_data.tables, &init_data.current_row)
    }
}

pub struct HanaDetachScalar;

impl HanaDetachScalar {
    pub fn signature(extension: &Extension) -> duckdb_neo::Result<SignatureBuilder> {
        Ok(SignatureBuilder::new()
            .param(positional::<String>(0)) // dbname
            .param(positional::<String>(1)) // schema
            .return_type(String::logical_type(extension)?))
    }
}

impl ScalarCallbacks for HanaDetachScalar {
    type BindData = ();
    type InitData = ();

    fn exec(
        &self,
        _bind_data: Option<&Self::BindData>,
        _init_data: Option<&mut Self::InitData>,
        _context: &Context,
        input: &mut VectorCollection,
        output: Vector<'_, Unknown>,
    ) -> duckdb_neo::Result<()> {
        let rows = input.row_count()?;
        if rows == 0 {
            return Err(exec_error("No input provided"));
        }

        let dbname = input_string(input, 0, 0)?;
        let schema = input_string(input, 1, 0)?;

        let removed_count = hana_state::write_state(|state| {
            let att_key = attachment_key(&dbname, &schema);
            let mut count = 0usize;
            if let Some(att) = state.attachments.remove(&att_key) {
                for table in &att.table_names {
                    let key = prefixed_name(&att.dbname, &att.schema, table).to_uppercase();
                    if state.table_registry.remove(&key).is_some() {
                        count += 1;
                    }
                }
            }
            count
        });

        let mut results = vec![None; rows];
        results[0] = Some(format!("Detached {} tables from {}.{}", removed_count, dbname, schema));
        write_strings(output, &results)
    }
}

#[derive(Debug)]
pub struct HanaTablesBindData {
    rows: Vec<[String; 4]>,
}

#[derive(Debug)]
pub struct HanaTablesInitData {
    current_row: Mutex<usize>,
}

pub struct HanaTablesVTab;

impl HanaTablesVTab {
    pub fn signature() -> SignatureBuilder {
        SignatureBuilder::new()
    }
}

impl TableFunctionCallbacks for HanaTablesVTab {
    type BindData = HanaTablesBindData;
    type GlobalState = HanaTablesInitData;
    type LocalState = ();

    fn bind(
        &self,
        context: &Context,
        _arguments: Vec<BindArgument>,
        bind_handle: BindFunctionHandle<'_>,
    ) -> duckdb_neo::Result<Self::BindData> {
        add_varchar_columns(context, &bind_handle, &["table_name", "schema_name", "dbname", "full_name"])?;

        let rows = hana_state::read_state(|state| {
            let mut out = Vec::new();
            for att in state.attachments.values() {
                for table in &att.table_names {
                    let flat = prefixed_name(&att.dbname, &att.schema, table);
                    out.push([table.clone(), att.schema.clone(), att.dbname.clone(), flat]);
                }
            }
            out
        });

        Ok(HanaTablesBindData { rows })
    }

    fn init_global_state(
        &self,
        _bind_data: &Self::BindData,
        _context: &Context,
        _column_data: InitColumnData<'_>,
    ) -> duckdb_neo::Result<(Option<Self::GlobalState>, Option<usize>)> {
        Ok((Some(HanaTablesInitData { current_row: Mutex::new(0) }), Some(1)))
    }

    fn exec(
        &self,
        bind_data: &Self::BindData,
        global_state: Option<&Self::GlobalState>,
        _local_state: Option<&mut Self::LocalState>,
        _context: &Context,
        mut output: DataChunkRef<'_>,
        _column_info: ExecColumnInfo<'_>,
    ) -> duckdb_neo::Result<()> {
        let init_data = global_state.ok_or_else(|| exec_error(HanaError::new("lock error")))?;
        emit_rows(&mut output, &bind_data.rows, &init_data.current_row)
    }
}
