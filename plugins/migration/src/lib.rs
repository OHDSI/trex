extern crate duckdb;
extern crate duckdb_loadable_macros;
extern crate libduckdb_sys;

use chrono::Utc;
use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
    Connection,
};
use libduckdb_sys as ffi;
use siphasher::sip::SipHasher13;
use std::{
    collections::HashMap,
    error::Error,
    fs,
    hash::{Hash, Hasher},
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

/// Execute SQL using the shared trex_pool via a one-off session.
fn execute_sql(sql: &str) -> Result<(), Box<dyn Error>> {
    let sid = trex_pool_client::create_session()
        .map_err(|e| -> Box<dyn Error> { e.into() })?;
    let result = trex_pool_client::session_execute(sid, sql).map(|_| ());
    let _ = trex_pool_client::destroy_session(sid);
    result.map_err(|e| -> Box<dyn Error> { e.into() })
}

/// Run a list of statements inside a single BEGIN/COMMIT on one session.
/// Rolls back and propagates the first failure.
fn execute_statements_in_transaction(statements: &[&str]) -> Result<(), String> {
    let sid = trex_pool_client::create_session()?;
    if let Err(e) = trex_pool_client::session_execute(sid, "BEGIN") {
        let _ = trex_pool_client::destroy_session(sid);
        return Err(e);
    }
    for stmt in statements {
        if let Err(e) = trex_pool_client::session_execute(sid, stmt) {
            let _ = trex_pool_client::session_execute(sid, "ROLLBACK");
            let _ = trex_pool_client::destroy_session(sid);
            return Err(e);
        }
    }
    let commit = trex_pool_client::session_execute(sid, "COMMIT").map(|_| ());
    let _ = trex_pool_client::destroy_session(sid);
    commit
}

struct QueryRow {
    columns: Vec<String>,
}

/// Query SQL using a one-off session and return rows as string columns.
fn query_sql(sql: &str) -> Result<Vec<QueryRow>, Box<dyn Error>> {
    let sid = trex_pool_client::create_session()
        .map_err(|e| -> Box<dyn Error> { e.into() })?;
    let result = trex_pool_client::session_execute(sid, sql);
    let _ = trex_pool_client::destroy_session(sid);
    let (_schema, batches) = result.map_err(|e| -> Box<dyn Error> { e.into() })?;

    let mut rows = Vec::new();
    for batch in &batches {
        for r in 0..batch.num_rows() {
            let mut columns = Vec::new();
            for c in 0..batch.num_columns() {
                let col = batch.column(c);
                let val = if col.is_null(r) {
                    String::new()
                } else {
                    arrow_value_to_string(col.as_ref(), r)
                };
                columns.push(val);
            }
            rows.push(QueryRow { columns });
        }
    }
    Ok(rows)
}

fn arrow_value_to_string(array: &dyn trex_pool_client::arrow_array::Array, row: usize) -> String {
    use trex_pool_client::arrow_array::*;
    use trex_pool_client::arrow_schema::DataType;

    match array.data_type() {
        DataType::Utf8 => {
            array.as_any().downcast_ref::<StringArray>().unwrap().value(row).to_string()
        }
        DataType::LargeUtf8 => {
            array.as_any().downcast_ref::<LargeStringArray>().unwrap().value(row).to_string()
        }
        DataType::Int8 => array.as_any().downcast_ref::<Int8Array>().unwrap().value(row).to_string(),
        DataType::Int16 => array.as_any().downcast_ref::<Int16Array>().unwrap().value(row).to_string(),
        DataType::Int32 => {
            array.as_any().downcast_ref::<Int32Array>().unwrap().value(row).to_string()
        }
        DataType::Int64 => {
            array.as_any().downcast_ref::<Int64Array>().unwrap().value(row).to_string()
        }
        DataType::UInt8 => array.as_any().downcast_ref::<UInt8Array>().unwrap().value(row).to_string(),
        DataType::UInt16 => array.as_any().downcast_ref::<UInt16Array>().unwrap().value(row).to_string(),
        DataType::UInt32 => array.as_any().downcast_ref::<UInt32Array>().unwrap().value(row).to_string(),
        DataType::UInt64 => {
            array.as_any().downcast_ref::<UInt64Array>().unwrap().value(row).to_string()
        }
        DataType::Float32 => array.as_any().downcast_ref::<Float32Array>().unwrap().value(row).to_string(),
        DataType::Float64 => array.as_any().downcast_ref::<Float64Array>().unwrap().value(row).to_string(),
        DataType::Boolean => {
            array.as_any().downcast_ref::<BooleanArray>().unwrap().value(row).to_string()
        }
        DataType::Decimal128(_, scale) => {
            let raw = array.as_any().downcast_ref::<Decimal128Array>().unwrap().value(row);
            format_decimal_string(&raw.to_string(), *scale as i32)
        }
        DataType::Decimal256(_, scale) => {
            let raw = array.as_any().downcast_ref::<Decimal256Array>().unwrap().value(row);
            format_decimal_string(&raw.to_string(), *scale as i32)
        }
        DataType::Date32 => {
            let days = array.as_any().downcast_ref::<Date32Array>().unwrap().value(row);
            chrono::DateTime::from_timestamp(days as i64 * 86400, 0)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_default()
        }
        DataType::Timestamp(_, _) => array.as_any().downcast_ref::<TimestampMicrosecondArray>()
            .map(|a| chrono::DateTime::from_timestamp_micros(a.value(row))
                .map(|dt| dt.to_rfc3339()).unwrap_or_default())
            .unwrap_or_default(),
        DataType::Binary => format_hex(array.as_any().downcast_ref::<BinaryArray>().unwrap().value(row)),
        DataType::LargeBinary => format_hex(array.as_any().downcast_ref::<LargeBinaryArray>().unwrap().value(row)),
        _ => String::new(),
    }
}

fn format_decimal_string(digits: &str, scale: i32) -> String {
    let (neg, digits) = if let Some(rest) = digits.strip_prefix('-') {
        (true, rest)
    } else {
        (false, digits)
    };
    let body = if scale <= 0 {
        let mut out = digits.to_string();
        for _ in 0..(-scale) {
            out.push('0');
        }
        out
    } else {
        let scale = scale as usize;
        if digits.len() <= scale {
            let mut frac = "0".repeat(scale - digits.len());
            frac.push_str(digits);
            format!("0.{}", frac)
        } else {
            let split = digits.len() - scale;
            format!("{}.{}", &digits[..split], &digits[split..])
        }
    };
    if neg { format!("-{}", body) } else { body }
}

fn format_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(2 + bytes.len() * 2);
    s.push_str("\\x");
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

struct MigrationFile {
    version: i32,
    name: String,
    sql: String,
    checksum: u64,
}

impl MigrationFile {
    fn from_path(path: &Path) -> Option<Self> {
        let filename = path.file_name()?.to_str()?;

        if !filename.starts_with('V') || !filename.ends_with(".sql") {
            return None;
        }

        let without_prefix = &filename[1..];
        let without_suffix = &without_prefix[..without_prefix.len() - 4];

        let sep_pos = without_suffix.find("__")?;
        let version_str = &without_suffix[..sep_pos];
        let name = &without_suffix[sep_pos + 2..];

        let version: i32 = version_str.parse().ok()?;
        if version <= 0 {
            return None;
        }

        if name.is_empty() || !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return None;
        }

        let sql = fs::read_to_string(path).ok()?;
        let checksum = compute_checksum(name, version, &sql);

        Some(MigrationFile {
            version,
            name: name.to_string(),
            sql,
            checksum,
        })
    }
}

fn compute_checksum(name: &str, version: i32, sql: &str) -> u64 {
    let mut hasher = SipHasher13::new();
    name.hash(&mut hasher);
    version.hash(&mut hasher);
    sql.hash(&mut hasher);
    hasher.finish()
}


fn discover_migrations(dir_path: &str) -> Result<Vec<MigrationFile>, Box<dyn Error>> {
    let path = Path::new(dir_path);
    if !path.exists() {
        return Err(format!("Directory not found: {}", dir_path).into());
    }
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path).into());
    }

    let mut migrations = Vec::new();

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let file_path = entry.path();
        if file_path.is_file() {
            if let Some(migration) = MigrationFile::from_path(&file_path) {
                migrations.push(migration);
            }
        }
    }

    if migrations.is_empty() {
        return Err(format!("No migration files found in: {}", dir_path).into());
    }

    let mut seen_versions: HashMap<i32, String> = HashMap::new();
    for m in &migrations {
        if let Some(existing) = seen_versions.get(&m.version) {
            return Err(format!(
                "Duplicate version {}: found in both '{}' and 'V{}__{}.sql'",
                m.version, existing, m.version, m.name
            )
            .into());
        }
        seen_versions.insert(m.version, format!("V{}__{}.sql", m.version, m.name));
    }

    migrations.sort_by_key(|m| m.version);
    Ok(migrations)
}


#[allow(dead_code)]
struct AppliedMigration {
    version: i32,
    name: String,
    applied_on: String,
    checksum: u64,
}

fn ensure_history_table() -> Result<(), Box<dyn Error>> {
    execute_sql(
        "CREATE TABLE IF NOT EXISTS refinery_schema_history(\
            version INT4 PRIMARY KEY,\
            name VARCHAR(255),\
            applied_on VARCHAR(255),\
            checksum VARCHAR(255)\
        );",
    )
}

fn query_applied_migrations() -> Result<Vec<AppliedMigration>, Box<dyn Error>> {
    let rows = query_sql(
        "SELECT version, name, applied_on, checksum \
         FROM refinery_schema_history ORDER BY version",
    )?;

    let mut result = Vec::new();
    for row in rows {
        if row.columns.len() < 4 {
            continue;
        }
        let version: i32 = row.columns[0]
            .parse()
            .map_err(|_| format!("Invalid version in schema history: {}", row.columns[0]))?;
        let checksum: u64 = row.columns[3]
            .parse()
            .map_err(|_| format!("Invalid checksum in schema history: {}", row.columns[3]))?;
        result.push(AppliedMigration {
            version,
            name: row.columns[1].clone(),
            applied_on: row.columns[2].clone(),
            checksum,
        });
    }
    Ok(result)
}

fn insert_migration_record(migration: &MigrationFile) -> Result<(), Box<dyn Error>> {
    let sql = build_insert_migration_sql(migration);
    execute_sql(&sql)
}

/// Build the INSERT SQL for a migration history record.
fn build_insert_migration_sql(migration: &MigrationFile) -> String {
    let applied_on = Utc::now().to_rfc3339();
    format!(
        "INSERT INTO refinery_schema_history (version, name, applied_on, checksum) \
         VALUES ({}, '{}', '{}', '{}')",
        migration.version,
        migration.name.replace('\'', "''"),
        applied_on.replace('\'', "''"),
        migration.checksum,
    )
}


fn verify_migrations(
    discovered: &[MigrationFile],
    applied: &[AppliedMigration],
) -> Result<Vec<usize>, Box<dyn Error>> {
    let applied_map: HashMap<i32, &AppliedMigration> =
        applied.iter().map(|a| (a.version, a)).collect();

    let mut pending_indices = Vec::new();

    for (idx, migration) in discovered.iter().enumerate() {
        if let Some(applied_migration) = applied_map.get(&migration.version) {
            if applied_migration.checksum != migration.checksum {
                return Err(format!(
                    "Checksum mismatch for migration V{}__{}: \
                     file has been modified since it was applied",
                    migration.version, migration.name
                )
                .into());
            }
        } else {
            pending_indices.push(idx);
        }
    }

    Ok(pending_indices)
}


struct MigrationResult {
    version: i32,
    name: String,
    status: String,
}

fn execute_migrations(
    discovered: &[MigrationFile],
    pending_indices: &[usize],
) -> Result<Vec<MigrationResult>, Box<dyn Error>> {
    let mut results = Vec::new();
    let pending_set: std::collections::HashSet<usize> =
        pending_indices.iter().copied().collect();

    for (idx, migration) in discovered.iter().enumerate() {
        if !pending_set.contains(&idx) {
            results.push(MigrationResult {
                version: migration.version,
                name: migration.name.clone(),
                status: "skipped".to_string(),
            });
        }
    }

    for &idx in pending_indices {
        let migration = &discovered[idx];

        // Run migration + insert record in a single transaction via session
        let insert_sql = build_insert_migration_sql(migration);
        let sid = trex_pool_client::create_session()
            .map_err(|e| -> Box<dyn Error> { e.into() })?;

        let txn_result: Result<(), Box<dyn Error>> = (|| {
            trex_pool_client::session_execute(sid, "BEGIN")
                .map_err(|e| -> Box<dyn Error> { e.into() })?;

            if let Err(e) = trex_pool_client::session_execute(sid, &migration.sql) {
                let _ = trex_pool_client::session_execute(sid, "ROLLBACK");
                return Err(e.into());
            }

            if let Err(e) = trex_pool_client::session_execute(sid, &insert_sql) {
                let _ = trex_pool_client::session_execute(sid, "ROLLBACK");
                return Err(e.into());
            }

            trex_pool_client::session_execute(sid, "COMMIT")
                .map(|_| ())
                .map_err(|e| -> Box<dyn Error> { e.into() })
        })();

        let _ = trex_pool_client::destroy_session(sid);

        if let Err(e) = txn_result {
            return Err(format!(
                "Migration V{}__{} failed: {}", migration.version, migration.name, e
            ).into());
        }

        results.push(MigrationResult {
            version: migration.version,
            name: migration.name.clone(),
            status: "applied".to_string(),
        });
    }

    results.sort_by_key(|r| r.version);
    Ok(results)
}


#[repr(C)]
struct MigrateBindData {
    path: String,
}

#[repr(C)]
struct MigrateInitData {
    results: Vec<MigrationResult>,
    index: AtomicUsize,
}

struct MigrateVTab;

impl VTab for MigrateVTab {
    type InitData = MigrateInitData;
    type BindData = MigrateBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("version", LogicalTypeHandle::from(LogicalTypeId::Integer));
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        Ok(MigrateBindData { path })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let path = unsafe { (*bind_data).path.clone() };

        let discovered = discover_migrations(&path)?;
        ensure_history_table()?;
        let applied = query_applied_migrations()?;
        let pending_indices = verify_migrations(&discovered, &applied)?;
        let results = execute_migrations(&discovered, &pending_indices)?;

        Ok(MigrateInitData {
            results,
            index: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let current_index = init_data.index.fetch_add(1, Ordering::Relaxed);

        if current_index >= init_data.results.len() {
            output.set_len(0);
            return Ok(());
        }

        let result = &init_data.results[current_index];

        let mut version_vector = output.flat_vector(0);
        version_vector.as_mut_slice::<i32>()[0] = result.version;

        let name_vector = output.flat_vector(1);
        name_vector.insert(0, result.name.as_str());

        let status_vector = output.flat_vector(2);
        status_vector.insert(0, result.status.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![LogicalTypeHandle::from(LogicalTypeId::Varchar)])
    }
}


struct MigrationStatusResult {
    version: i32,
    name: String,
    status: String,
    applied_on: String,
    checksum: String,
}

#[repr(C)]
struct MigrationStatusBindData {
    path: String,
}

#[repr(C)]
struct MigrationStatusInitData {
    results: Vec<MigrationStatusResult>,
    index: AtomicUsize,
}

struct MigrationStatusVTab;

impl VTab for MigrationStatusVTab {
    type InitData = MigrationStatusInitData;
    type BindData = MigrationStatusBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("version", LogicalTypeHandle::from(LogicalTypeId::Integer));
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "applied_on",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("checksum", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        Ok(MigrationStatusBindData { path })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let path = unsafe { (*bind_data).path.clone() };

        let discovered = discover_migrations(&path)?;
        ensure_history_table()?;
        let applied = query_applied_migrations()?;

        let applied_map: HashMap<i32, &AppliedMigration> =
            applied.iter().map(|a| (a.version, a)).collect();

        let mut results = Vec::new();
        for migration in &discovered {
            let (status, applied_on) = match applied_map.get(&migration.version) {
                Some(am) => {
                    if am.checksum == migration.checksum {
                        ("applied".to_string(), am.applied_on.clone())
                    } else {
                        ("checksum_mismatch".to_string(), am.applied_on.clone())
                    }
                }
                None => ("pending".to_string(), String::new()),
            };

            results.push(MigrationStatusResult {
                version: migration.version,
                name: migration.name.clone(),
                status,
                applied_on,
                checksum: migration.checksum.to_string(),
            });
        }

        Ok(MigrationStatusInitData {
            results,
            index: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let current_index = init_data.index.fetch_add(1, Ordering::Relaxed);

        if current_index >= init_data.results.len() {
            output.set_len(0);
            return Ok(());
        }

        let result = &init_data.results[current_index];

        let mut version_vector = output.flat_vector(0);
        version_vector.as_mut_slice::<i32>()[0] = result.version;

        let name_vector = output.flat_vector(1);
        name_vector.insert(0, result.name.as_str());

        let status_vector = output.flat_vector(2);
        status_vector.insert(0, result.status.as_str());

        let applied_on_vector = output.flat_vector(3);
        applied_on_vector.insert(0, result.applied_on.as_str());

        let checksum_vector = output.flat_vector(4);
        checksum_vector.insert(0, result.checksum.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![LogicalTypeHandle::from(LogicalTypeId::Varchar)])
    }
}


fn escape_sql_ident(s: &str) -> String {
    s.replace('"', "\"\"")
}

fn escape_sql_str(s: &str) -> String {
    s.replace('\'', "''")
}

fn is_postgres_database(database: &str) -> Result<bool, Box<dyn Error>> {
    let rows = query_sql(&format!(
        "SELECT type FROM duckdb_databases() WHERE database_name = '{}'",
        escape_sql_str(database)
    ))?;
    Ok(rows
        .first()
        .map(|r| r.columns[0] == "postgres")
        .unwrap_or(false))
}

fn postgres_execute_sql(database: &str, sql: &str) -> Result<(), Box<dyn Error>> {
    let escaped_sql = escape_sql_str(sql);
    execute_sql(&format!(
        "CALL postgres_execute('{}', '{}')",
        escape_sql_str(database),
        escaped_sql
    ))
}

fn setup_schema_context(
    schema: &str,
    database: &str,
    is_postgres: bool,
) -> Result<(), Box<dyn Error>> {
    if is_postgres {
        postgres_execute_sql(
            database,
            &format!("CREATE SCHEMA IF NOT EXISTS \"{}\"", escape_sql_ident(schema)),
        )?;
    } else {
        execute_sql(&format!(
            "CREATE SCHEMA IF NOT EXISTS \"{}\".\"{}\"",
            escape_sql_ident(database),
            escape_sql_ident(schema)
        ))?;
        execute_sql(&format!(
            "USE \"{}\".\"{}\"",
            escape_sql_ident(database),
            escape_sql_ident(schema)
        ))?;
    }
    Ok(())
}

fn teardown_schema_context(is_postgres: bool) -> Result<(), Box<dyn Error>> {
    if !is_postgres {
        execute_sql("USE memory.main")?;
    }
    Ok(())
}

fn ensure_history_table_in(
    schema: &str,
    database: &str,
    is_postgres: bool,
) -> Result<(), Box<dyn Error>> {
    let ddl = format!(
        "CREATE TABLE IF NOT EXISTS \"{}\".refinery_schema_history(\
            version INT4 PRIMARY KEY,\
            name VARCHAR(255),\
            applied_on VARCHAR(255),\
            checksum VARCHAR(255)\
        );",
        escape_sql_ident(schema)
    );
    if is_postgres {
        postgres_execute_sql(database, &ddl)
    } else {
        // Table resolves via active USE context
        execute_sql(
            "CREATE TABLE IF NOT EXISTS refinery_schema_history(\
                version INT4 PRIMARY KEY,\
                name VARCHAR(255),\
                applied_on VARCHAR(255),\
                checksum VARCHAR(255)\
            );",
        )
    }
}

fn query_applied_migrations_from(
    schema: &str,
    database: &str,
) -> Result<Vec<AppliedMigration>, Box<dyn Error>> {
    let fq_table = format!(
        "\"{}\".\"{}\".refinery_schema_history",
        escape_sql_ident(database),
        escape_sql_ident(schema)
    );
    let rows = query_sql(&format!(
        "SELECT version, name, applied_on, checksum FROM {} ORDER BY version",
        fq_table
    ))
    .unwrap_or_default();

    let mut result = Vec::new();
    for row in rows {
        if row.columns.len() < 4 {
            continue;
        }
        let version: i32 = row.columns[0]
            .parse()
            .map_err(|_| format!("Invalid version in schema history: {}", row.columns[0]))?;
        let checksum: u64 = row.columns[3]
            .parse()
            .map_err(|_| format!("Invalid checksum in schema history: {}", row.columns[3]))?;
        result.push(AppliedMigration {
            version,
            name: row.columns[1].clone(),
            applied_on: row.columns[2].clone(),
            checksum,
        });
    }
    Ok(result)
}

fn insert_migration_record_in(
    migration: &MigrationFile,
    schema: &str,
    database: &str,
    is_postgres: bool,
) -> Result<(), Box<dyn Error>> {
    let applied_on = Utc::now().to_rfc3339();
    let checksum_str = migration.checksum.to_string();

    if is_postgres {
        let sql = format!(
            "INSERT INTO \"{schema}\".refinery_schema_history (version, name, applied_on, checksum) \
             VALUES ({}, '{}', '{}', '{}')",
            migration.version,
            escape_sql_str(&migration.name),
            escape_sql_str(&applied_on),
            escape_sql_str(&checksum_str),
            schema = escape_sql_ident(schema),
        );
        postgres_execute_sql(database, &sql)
    } else {
        // Uses active USE context
        insert_migration_record(migration)
    }
}

fn execute_migration_sql(
    sql: &str,
    database: &str,
    is_postgres: bool,
) -> Result<(), Box<dyn Error>> {
    if is_postgres {
        postgres_execute_sql(database, sql)
    } else {
        execute_sql(sql)
    }
}

fn execute_migrations_in_schema(
    discovered: &[MigrationFile],
    pending_indices: &[usize],
    schema: &str,
    database: &str,
    is_postgres: bool,
) -> Result<Vec<MigrationResult>, Box<dyn Error>> {
    let mut results = Vec::new();
    let pending_set: std::collections::HashSet<usize> =
        pending_indices.iter().copied().collect();

    for (idx, migration) in discovered.iter().enumerate() {
        if !pending_set.contains(&idx) {
            results.push(MigrationResult {
                version: migration.version,
                name: migration.name.clone(),
                status: "skipped".to_string(),
            });
        }
    }

    if !is_postgres {
        for &idx in pending_indices {
            let migration = &discovered[idx];

            let insert_sql = build_insert_migration_sql(migration);
            execute_statements_in_transaction(&[&migration.sql, &insert_sql])
                .map_err(|e| -> Box<dyn Error> {
                    format!(
                        "Migration V{}__{} failed: {}",
                        migration.version, migration.name, e
                    )
                    .into()
                })?;

            results.push(MigrationResult {
                version: migration.version,
                name: migration.name.clone(),
                status: "applied".to_string(),
            });
        }
    } else {
        // Postgres handles transactions internally via postgres_execute
        for &idx in pending_indices {
            let migration = &discovered[idx];
            match execute_migration_sql(&migration.sql, database, is_postgres) {
                Ok(_) => match insert_migration_record_in(migration, schema, database, is_postgres)
                {
                    Ok(_) => {
                        results.push(MigrationResult {
                            version: migration.version,
                            name: migration.name.clone(),
                            status: "applied".to_string(),
                        });
                    }
                    Err(e) => {
                        return Err(format!(
                            "Migration V{}__{} failed to record: {}",
                            migration.version, migration.name, e
                        )
                        .into());
                    }
                },
                Err(e) => {
                    return Err(format!(
                        "Migration V{}__{} failed: {}",
                        migration.version, migration.name, e
                    )
                    .into());
                }
            }
        }
    }

    results.sort_by_key(|r| r.version);
    Ok(results)
}


#[repr(C)]
struct MigrateSchemaBindData {
    path: String,
    schema: String,
    database: String,
}

#[repr(C)]
struct MigrateSchemaInitData {
    results: Vec<MigrationResult>,
    index: AtomicUsize,
}

struct MigrateSchemaVTab;

impl VTab for MigrateSchemaVTab {
    type InitData = MigrateSchemaInitData;
    type BindData = MigrateSchemaBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("version", LogicalTypeHandle::from(LogicalTypeId::Integer));
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        let schema = bind.get_parameter(1).to_string();
        let database = bind.get_parameter(2).to_string();
        Ok(MigrateSchemaBindData {
            path,
            schema,
            database,
        })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let (path, schema, database) = unsafe {
            (
                (*bind_data).path.clone(),
                (*bind_data).schema.clone(),
                (*bind_data).database.clone(),
            )
        };

        let is_pg = is_postgres_database(&database)?;
        setup_schema_context(&schema, &database, is_pg)?;

        let run = (|| -> Result<Vec<MigrationResult>, Box<dyn Error>> {
            let discovered = discover_migrations(&path)?;
            ensure_history_table_in(&schema, &database, is_pg)?;
            let applied = query_applied_migrations_from(&schema, &database)?;
            let pending_indices = verify_migrations(&discovered, &applied)?;
            execute_migrations_in_schema(&discovered, &pending_indices, &schema, &database, is_pg)
        })();

        teardown_schema_context(is_pg)?;

        let results = run?;

        Ok(MigrateSchemaInitData {
            results,
            index: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let current_index = init_data.index.fetch_add(1, Ordering::Relaxed);

        if current_index >= init_data.results.len() {
            output.set_len(0);
            return Ok(());
        }

        let result = &init_data.results[current_index];

        let mut version_vector = output.flat_vector(0);
        version_vector.as_mut_slice::<i32>()[0] = result.version;

        let name_vector = output.flat_vector(1);
        name_vector.insert(0, result.name.as_str());

        let status_vector = output.flat_vector(2);
        status_vector.insert(0, result.status.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        ])
    }
}


#[repr(C)]
struct MigrationStatusSchemaBindData {
    path: String,
    schema: String,
    database: String,
}

#[repr(C)]
struct MigrationStatusSchemaInitData {
    results: Vec<MigrationStatusResult>,
    index: AtomicUsize,
}

struct MigrationStatusSchemaVTab;

impl VTab for MigrationStatusSchemaVTab {
    type InitData = MigrationStatusSchemaInitData;
    type BindData = MigrationStatusSchemaBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("version", LogicalTypeHandle::from(LogicalTypeId::Integer));
        bind.add_result_column("name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column(
            "applied_on",
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        );
        bind.add_result_column("checksum", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let path = bind.get_parameter(0).to_string();
        let schema = bind.get_parameter(1).to_string();
        let database = bind.get_parameter(2).to_string();
        Ok(MigrationStatusSchemaBindData {
            path,
            schema,
            database,
        })
    }

    fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        let bind_data = init.get_bind_data::<Self::BindData>();
        if bind_data.is_null() {
            return Err("Bind data is null".into());
        }
        let (path, schema, database) = unsafe {
            (
                (*bind_data).path.clone(),
                (*bind_data).schema.clone(),
                (*bind_data).database.clone(),
            )
        };

        let is_pg = is_postgres_database(&database)?;
        setup_schema_context(&schema, &database, is_pg)?;

        let run = (|| -> Result<Vec<MigrationStatusResult>, Box<dyn Error>> {
            let discovered = discover_migrations(&path)?;
            ensure_history_table_in(&schema, &database, is_pg)?;
            let applied = query_applied_migrations_from(&schema, &database)?;

            let applied_map: HashMap<i32, &AppliedMigration> =
                applied.iter().map(|a| (a.version, a)).collect();

            let mut results = Vec::new();
            for migration in &discovered {
                let (status, applied_on) = match applied_map.get(&migration.version) {
                    Some(am) => {
                        if am.checksum == migration.checksum {
                            ("applied".to_string(), am.applied_on.clone())
                        } else {
                            ("checksum_mismatch".to_string(), am.applied_on.clone())
                        }
                    }
                    None => ("pending".to_string(), String::new()),
                };

                results.push(MigrationStatusResult {
                    version: migration.version,
                    name: migration.name.clone(),
                    status,
                    applied_on,
                    checksum: migration.checksum.to_string(),
                });
            }
            Ok(results)
        })();

        teardown_schema_context(is_pg)?;

        let results = run?;

        Ok(MigrationStatusSchemaInitData {
            results,
            index: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let current_index = init_data.index.fetch_add(1, Ordering::Relaxed);

        if current_index >= init_data.results.len() {
            output.set_len(0);
            return Ok(());
        }

        let result = &init_data.results[current_index];

        let mut version_vector = output.flat_vector(0);
        version_vector.as_mut_slice::<i32>()[0] = result.version;

        let name_vector = output.flat_vector(1);
        name_vector.insert(0, result.name.as_str());

        let status_vector = output.flat_vector(2);
        status_vector.insert(0, result.status.as_str());

        let applied_on_vector = output.flat_vector(3);
        applied_on_vector.insert(0, result.applied_on.as_str());

        let checksum_vector = output.flat_vector(4);
        checksum_vector.insert(0, result.checksum.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
            LogicalTypeHandle::from(LogicalTypeId::Varchar),
        ])
    }
}


unsafe fn extension_entrypoint(connection: Connection) -> Result<(), Box<dyn Error>> {
    connection.register_table_function::<MigrateVTab>("trex_migration_run")?;
    connection.register_table_function::<MigrationStatusVTab>("trex_migration_status")?;
    connection.register_table_function::<MigrateSchemaVTab>("trex_migration_run_schema")?;
    connection
        .register_table_function::<MigrationStatusSchemaVTab>("trex_migration_status_schema")?;
    Ok(())
}

unsafe fn migration_init_c_api_internal(
    info: ffi::duckdb_extension_info,
    access: *const ffi::duckdb_extension_access,
) -> Result<bool, Box<dyn Error>> {
    let have_api_struct =
        ffi::duckdb_rs_extension_api_init(info, access, "v1.3.2")?;

    if !have_api_struct {
        return Ok(false);
    }

    let db: ffi::duckdb_database = *(*access).get_database.unwrap()(info);

    // Pool already initialized by db plugin
    let connection = Connection::open_from_raw(db.cast())?;
    extension_entrypoint(connection)?;

    Ok(true)
}

#[no_mangle]
pub unsafe extern "C" fn migration_init_c_api(
    info: ffi::duckdb_extension_info,
    access: *const ffi::duckdb_extension_access,
) -> bool {
    let init_result = migration_init_c_api_internal(info, access);

    match init_result {
        Ok(val) => val,
        Err(x) => {
            let error_c_string = std::ffi::CString::new(x.to_string());
            match error_c_string {
                Ok(e) => {
                    (*access).set_error.unwrap()(info, e.as_ptr());
                }
                Err(_) => {
                    let error_msg =
                        c"An error occurred but the extension failed to allocate an error string";
                    (*access).set_error.unwrap()(info, error_msg.as_ptr());
                }
            }
            false
        }
    }
}

#[cfg(test)]
mod arrow_value_tests {
    use super::*;
    use trex_pool_client::arrow_array::*;

    #[test]
    fn format_decimal_basic() {
        assert_eq!(format_decimal_string("12345", 2), "123.45");
        assert_eq!(format_decimal_string("-12345", 2), "-123.45");
        assert_eq!(format_decimal_string("5", 3), "0.005");
        assert_eq!(format_decimal_string("-5", 3), "-0.005");
        assert_eq!(format_decimal_string("0", 0), "0");
    }

    #[test]
    fn format_decimal_negative_scale() {
        assert_eq!(format_decimal_string("123", -2), "12300");
    }

    #[test]
    fn format_decimal_high_precision() {
        let huge = "12345678901234567890123456789012345678";
        assert_eq!(
            format_decimal_string(huge, 10),
            "1234567890123456789012345678.9012345678"
        );
    }

    #[test]
    fn format_hex_bytes() {
        assert_eq!(format_hex(&[0xDE, 0xAD, 0xBE, 0xEF]), "\\xdeadbeef");
    }

    #[test]
    fn arrow_value_decimal128() {
        let arr = Decimal128Array::from(vec![12345i128])
            .with_precision_and_scale(10, 2)
            .unwrap();
        assert_eq!(arrow_value_to_string(&arr, 0), "123.45");
    }

    #[test]
    fn arrow_value_int_and_float() {
        let i = Int32Array::from(vec![42]);
        assert_eq!(arrow_value_to_string(&i, 0), "42");
        let f = Float64Array::from(vec![1.5]);
        assert_eq!(arrow_value_to_string(&f, 0), "1.5");
    }
}
