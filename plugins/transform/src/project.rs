use serde::Deserialize;
use std::{collections::HashMap, error::Error, fs, path::Path};

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectConfig {
    #[allow(dead_code)]
    pub name: String,
    #[serde(default = "default_models_path")]
    pub models_path: String,
    #[serde(default = "default_seeds_path")]
    pub seeds_path: String,
    #[serde(default = "default_tests_path")]
    pub tests_path: String,
    #[serde(default)]
    pub source_tables: Vec<String>,
}

fn default_models_path() -> String {
    "models".to_string()
}

fn default_seeds_path() -> String {
    "seeds".to_string()
}

fn default_tests_path() -> String {
    "tests".to_string()
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Materialization {
    View,
    Table,
    Incremental,
    Snapshot,
    Ephemeral,
}

impl Materialization {
    pub fn as_str(&self) -> &'static str {
        match self {
            Materialization::View => "view",
            Materialization::Table => "table",
            Materialization::Incremental => "incremental",
            Materialization::Snapshot => "snapshot",
            Materialization::Ephemeral => "ephemeral",
        }
    }
}

impl Default for Materialization {
    fn default() -> Self {
        Materialization::View
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IncrementalStrategy {
    Append,
    DeleteInsert,
    Merge,
    Microbatch,
}

impl IncrementalStrategy {
    pub fn as_str(&self) -> &'static str {
        match self {
            IncrementalStrategy::Append => "append",
            IncrementalStrategy::DeleteInsert => "delete_insert",
            IncrementalStrategy::Merge => "merge",
            IncrementalStrategy::Microbatch => "microbatch",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum UniqueKeyConfig {
    Single(String),
    Composite(Vec<String>),
}

impl UniqueKeyConfig {
    pub fn columns(&self) -> Vec<String> {
        match self {
            UniqueKeyConfig::Single(s) => vec![s.clone()],
            UniqueKeyConfig::Composite(v) => v.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchSize {
    Hour,
    Day,
    Month,
}

impl BatchSize {
    pub fn as_interval(&self) -> &'static str {
        match self {
            BatchSize::Hour => "1 HOUR",
            BatchSize::Day => "1 DAY",
            BatchSize::Month => "1 MONTH",
        }
    }

    pub fn as_trunc(&self) -> &'static str {
        match self {
            BatchSize::Hour => "hour",
            BatchSize::Day => "day",
            BatchSize::Month => "month",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotStrategy {
    Timestamp,
    Check,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EndpointConfig {
    pub path: String,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default = "default_formats")]
    pub formats: Vec<String>,
}

fn default_formats() -> Vec<String> {
    vec!["json".into(), "csv".into(), "arrow".into()]
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelYaml {
    #[serde(default)]
    pub materialized: Option<String>,
    #[serde(default)]
    pub endpoint: Option<EndpointConfig>,
    #[serde(default)]
    pub unique_key: Option<UniqueKeyConfig>,
    #[serde(default)]
    pub incremental_strategy: Option<IncrementalStrategy>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub batch_size: Option<BatchSize>,
    #[serde(default)]
    pub lookback: Option<u32>,
    #[serde(default)]
    pub merge_update_columns: Option<Vec<String>>,
    #[serde(default)]
    pub merge_exclude_columns: Option<Vec<String>>,
    #[serde(default)]
    pub strategy: Option<SnapshotStrategy>,
    #[serde(default)]
    pub check_cols: Option<Vec<String>>,
    #[serde(default)]
    pub pre_hooks: Option<Vec<String>>,
    #[serde(default)]
    pub post_hooks: Option<Vec<String>>,
    #[serde(default)]
    pub columns: Vec<ColumnTest>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ColumnTest {
    pub name: String,
    #[serde(default)]
    pub tests: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Model {
    pub name: String,
    pub sql: String,
    pub materialization: Materialization,
    pub unique_key: Option<Vec<String>>,
    pub incremental_strategy: Option<IncrementalStrategy>,
    pub updated_at: Option<String>,
    pub batch_size: Option<BatchSize>,
    pub lookback: Option<u32>,
    pub merge_update_columns: Option<Vec<String>>,
    pub merge_exclude_columns: Option<Vec<String>>,
    pub strategy: Option<SnapshotStrategy>,
    pub check_cols: Option<Vec<String>>,
    pub pre_hooks: Option<Vec<String>>,
    pub post_hooks: Option<Vec<String>>,
    pub column_tests: Vec<ColumnTest>,
    pub yaml_content: Option<String>,
    pub endpoint: Option<EndpointConfig>,
}

#[derive(Debug, Clone)]
pub struct Seed {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct TestFile {
    pub name: String,
    pub sql: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SourcesConfig {
    pub sources: Vec<SourceDef>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SourceDef {
    pub name: String,
    pub loaded_at_field: String,
    #[serde(default)]
    pub warn_after: Option<FreshnessThreshold>,
    #[serde(default)]
    pub error_after: Option<FreshnessThreshold>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FreshnessThreshold {
    pub count: u32,
    pub period: String,
}

#[derive(Debug)]
pub struct Project {
    #[allow(dead_code)]
    pub config: ProjectConfig,
    pub models: Vec<Model>,
    pub seeds: Vec<Seed>,
    pub tests: Vec<TestFile>,
    pub sources: Vec<SourceDef>,
    pub source_tables: Vec<String>,
    #[allow(dead_code)]
    pub base_path: String,
}

pub fn load_project(path: &str) -> Result<Project, Box<dyn Error>> {
    let base = Path::new(path);
    if !base.exists() {
        return Err(format!("Project directory not found: {}", path).into());
    }

    let config_path = base.join("project.yml");
    if !config_path.exists() {
        return Err(format!("project.yml not found in: {}", path).into());
    }

    let config_str = fs::read_to_string(&config_path)?;
    let config: ProjectConfig = serde_yaml::from_str(&config_str)?;

    let models = discover_models(base, &config.models_path)?;
    let seeds = discover_seeds(base, &config.seeds_path)?;
    let tests = discover_tests(base, &config.tests_path)?;

    let sources_path = base.join("sources.yml");
    let sources = if sources_path.exists() {
        let sources_str = fs::read_to_string(&sources_path)?;
        let sources_config: SourcesConfig = serde_yaml::from_str(&sources_str)?;
        sources_config.sources
    } else {
        Vec::new()
    };

    let source_tables = config.source_tables.clone();

    Ok(Project {
        config,
        models,
        seeds,
        tests,
        sources,
        source_tables,
        base_path: path.to_string(),
    })
}

fn discover_models(base: &Path, models_path: &str) -> Result<Vec<Model>, Box<dyn Error>> {
    let models_dir = base.join(models_path);
    if !models_dir.exists() {
        return Ok(Vec::new());
    }

    let mut sql_files: HashMap<String, String> = HashMap::new();
    let mut yaml_files: HashMap<String, String> = HashMap::new();

    collect_files(&models_dir, &mut sql_files, &mut yaml_files)?;

    let mut models = Vec::new();
    for (name, sql) in &sql_files {
        let yaml_content = yaml_files.get(name);
        let model_yaml = match yaml_content {
            Some(yaml_str) => Some(serde_yaml::from_str::<ModelYaml>(yaml_str)?),
            None => None,
        };

        let materialization = match model_yaml.as_ref().and_then(|y| y.materialized.as_deref()) {
            Some("table") => Materialization::Table,
            Some("incremental") => Materialization::Incremental,
            Some("snapshot") => Materialization::Snapshot,
            Some("ephemeral") => Materialization::Ephemeral,
            Some("view") | None => Materialization::View,
            Some(other) => {
                return Err(format!(
                    "Unknown materialization '{}' for model '{}'",
                    other, name
                )
                .into())
            }
        };

        let model = Model {
            name: name.clone(),
            sql: sql.clone(),
            materialization,
            unique_key: model_yaml.as_ref().and_then(|y| y.unique_key.as_ref().map(|u| u.columns())),
            incremental_strategy: model_yaml.as_ref().and_then(|y| y.incremental_strategy),
            updated_at: model_yaml.as_ref().and_then(|y| y.updated_at.clone()),
            batch_size: model_yaml.as_ref().and_then(|y| y.batch_size),
            lookback: model_yaml.as_ref().and_then(|y| y.lookback),
            merge_update_columns: model_yaml.as_ref().and_then(|y| y.merge_update_columns.clone()),
            merge_exclude_columns: model_yaml.as_ref().and_then(|y| y.merge_exclude_columns.clone()),
            strategy: model_yaml.as_ref().and_then(|y| y.strategy),
            check_cols: model_yaml.as_ref().and_then(|y| y.check_cols.clone()),
            pre_hooks: model_yaml.as_ref().and_then(|y| y.pre_hooks.clone()),
            post_hooks: model_yaml.as_ref().and_then(|y| y.post_hooks.clone()),
            column_tests: model_yaml.as_ref().map(|y| y.columns.clone()).unwrap_or_default(),
            yaml_content: yaml_content.cloned(),
            endpoint: model_yaml.as_ref().and_then(|y| y.endpoint.clone()),
        };

        if model.materialization == Materialization::Incremental {
            validate_incremental_config(&model)?;
        }
        if model.materialization == Materialization::Snapshot {
            validate_snapshot_config(&model)?;
        }

        models.push(model);
    }

    models.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(models)
}

fn collect_files(
    dir: &Path,
    sql_files: &mut HashMap<String, String>,
    yaml_files: &mut HashMap<String, String>,
) -> Result<(), Box<dyn Error>> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, sql_files, yaml_files)?;
        } else if let Some(ext) = path.extension() {
            let stem = path.file_stem().unwrap().to_string_lossy().to_string();
            if ext == "sql" {
                let content = fs::read_to_string(&path)?;
                sql_files.insert(stem, content);
            } else if ext == "yml" || ext == "yaml" {
                let content = fs::read_to_string(&path)?;
                yaml_files.insert(stem, content);
            }
        }
    }
    Ok(())
}

fn validate_incremental_config(model: &Model) -> Result<(), Box<dyn Error>> {
    let strategy = model.incremental_strategy.unwrap_or(IncrementalStrategy::DeleteInsert);
    match strategy {
        IncrementalStrategy::Merge => {
            if model.unique_key.is_none() {
                return Err(format!(
                    "Model '{}': merge strategy requires unique_key",
                    model.name
                )
                .into());
            }
        }
        IncrementalStrategy::Microbatch => {
            if model.updated_at.is_none() {
                return Err(format!(
                    "Model '{}': microbatch strategy requires updated_at",
                    model.name
                )
                .into());
            }
            if model.batch_size.is_none() {
                return Err(format!(
                    "Model '{}': microbatch strategy requires batch_size",
                    model.name
                )
                .into());
            }
        }
        IncrementalStrategy::Append | IncrementalStrategy::DeleteInsert => {}
    }
    Ok(())
}

fn validate_snapshot_config(model: &Model) -> Result<(), Box<dyn Error>> {
    if model.unique_key.is_none() {
        return Err(format!(
            "Model '{}': snapshot requires unique_key",
            model.name
        )
        .into());
    }
    let strategy = model.strategy.unwrap_or(SnapshotStrategy::Timestamp);
    match strategy {
        SnapshotStrategy::Timestamp => {
            if model.updated_at.is_none() {
                return Err(format!(
                    "Model '{}': snapshot timestamp strategy requires updated_at",
                    model.name
                )
                .into());
            }
        }
        SnapshotStrategy::Check => {
            if model.check_cols.is_none() {
                return Err(format!(
                    "Model '{}': snapshot check strategy requires check_cols",
                    model.name
                )
                .into());
            }
        }
    }
    Ok(())
}

fn discover_seeds(base: &Path, seeds_path: &str) -> Result<Vec<Seed>, Box<dyn Error>> {
    let seeds_dir = base.join(seeds_path);
    if !seeds_dir.exists() {
        return Ok(Vec::new());
    }

    let mut seeds = Vec::new();
    for entry in fs::read_dir(&seeds_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "csv" {
                    let name = path.file_stem().unwrap().to_string_lossy().to_string();
                    seeds.push(Seed {
                        name,
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    seeds.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(seeds)
}

fn discover_tests(base: &Path, tests_path: &str) -> Result<Vec<TestFile>, Box<dyn Error>> {
    let tests_dir = base.join(tests_path);
    if !tests_dir.exists() {
        return Ok(Vec::new());
    }

    let mut tests = Vec::new();
    for entry in fs::read_dir(&tests_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "sql" {
                    let name = path.file_stem().unwrap().to_string_lossy().to_string();
                    let sql = fs::read_to_string(&path)?;
                    tests.push(TestFile { name, sql });
                }
            }
        }
    }
    tests.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tests)
}

#[cfg(test)]
mod project_tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    /// Build a model with sensible defaults so individual tests can override only
    /// the fields they care about.
    fn make_model(name: &str, materialization: Materialization) -> Model {
        Model {
            name: name.to_string(),
            sql: "SELECT 1".to_string(),
            materialization,
            unique_key: None,
            incremental_strategy: None,
            updated_at: None,
            batch_size: None,
            lookback: None,
            merge_update_columns: None,
            merge_exclude_columns: None,
            strategy: None,
            check_cols: None,
            pre_hooks: None,
            post_hooks: None,
            column_tests: Vec::new(),
            yaml_content: None,
            endpoint: None,
        }
    }

    /// Write a file, creating parent directories as needed.
    fn write_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(path, contents).expect("write fixture file");
    }

    /// Build a minimal project on disk: `project.yml` + one view model.
    fn minimal_project(name: &str) -> TempDir {
        let dir = TempDir::new().expect("create tempdir");
        write_file(
            &dir.path().join("project.yml"),
            &format!("name: {}\n", name),
        );
        write_file(
            &dir.path().join("models/m1.sql"),
            "SELECT 1 AS x",
        );
        dir
    }

    #[test]
    fn load_project_reads_minimal_layout() {
        let dir = minimal_project("demo");
        let project =
            load_project(dir.path().to_str().unwrap()).expect("minimal project should load");
        assert_eq!(project.config.name, "demo");
        assert_eq!(project.models.len(), 1, "exactly one model expected");
        assert_eq!(project.models[0].name, "m1");
        assert_eq!(project.models[0].materialization, Materialization::View);
        assert!(project.seeds.is_empty());
        assert!(project.tests.is_empty());
        assert!(project.sources.is_empty());
    }

    #[test]
    fn load_project_honors_custom_paths() {
        let dir = TempDir::new().expect("tempdir");
        write_file(
            &dir.path().join("project.yml"),
            "name: custom\nmodels_path: mdl\nseeds_path: sd\ntests_path: ts\n",
        );
        write_file(&dir.path().join("mdl/a.sql"), "SELECT 1");
        write_file(&dir.path().join("sd/people.csv"), "id,name\n1,foo\n");
        write_file(&dir.path().join("ts/t1.sql"), "SELECT 1 WHERE FALSE");

        let project = load_project(dir.path().to_str().unwrap()).expect("load");
        assert_eq!(project.config.models_path, "mdl");
        assert_eq!(project.config.seeds_path, "sd");
        assert_eq!(project.config.tests_path, "ts");
        assert_eq!(project.models.len(), 1, "model under custom path");
        assert_eq!(project.seeds.len(), 1, "seed under custom path");
        assert_eq!(project.tests.len(), 1, "test under custom path");
        assert_eq!(project.seeds[0].name, "people");
        assert_eq!(project.tests[0].name, "t1");
    }

    #[test]
    fn load_project_missing_directory_errs() {
        let err = load_project("/nonexistent/path/that/should/never/exist")
            .expect_err("missing dir must Err");
        assert!(
            err.to_string().contains("Project directory not found"),
            "got: {err}"
        );
    }

    #[test]
    fn load_project_missing_yml_errs() {
        let dir = TempDir::new().expect("tempdir");
        // No project.yml inside.
        let err =
            load_project(dir.path().to_str().unwrap()).expect_err("missing project.yml must Err");
        assert!(err.to_string().contains("project.yml not found"), "got: {err}");
    }

    #[test]
    fn load_project_parses_materialization_variants() {
        let dir = TempDir::new().expect("tempdir");
        write_file(&dir.path().join("project.yml"), "name: mats\n");
        // view (default — no yaml)
        write_file(&dir.path().join("models/m_view.sql"), "SELECT 1");
        // table
        write_file(&dir.path().join("models/m_table.sql"), "SELECT 1");
        write_file(
            &dir.path().join("models/m_table.yml"),
            "materialized: table\n",
        );
        // ephemeral
        write_file(&dir.path().join("models/m_eph.sql"), "SELECT 1");
        write_file(
            &dir.path().join("models/m_eph.yml"),
            "materialized: ephemeral\n",
        );
        // incremental (with delete_insert default — no extra fields required)
        write_file(&dir.path().join("models/m_inc.sql"), "SELECT 1");
        write_file(
            &dir.path().join("models/m_inc.yml"),
            "materialized: incremental\nincremental_strategy: append\n",
        );
        // snapshot — requires unique_key + (timestamp default) updated_at
        write_file(&dir.path().join("models/m_snap.sql"), "SELECT 1");
        write_file(
            &dir.path().join("models/m_snap.yml"),
            "materialized: snapshot\nunique_key: id\nupdated_at: ts\n",
        );

        let project = load_project(dir.path().to_str().unwrap()).expect("load");
        // Models are sorted by name.
        let by_name: HashMap<&str, Materialization> = project
            .models
            .iter()
            .map(|m| (m.name.as_str(), m.materialization))
            .collect();
        assert_eq!(by_name["m_view"], Materialization::View);
        assert_eq!(by_name["m_table"], Materialization::Table);
        assert_eq!(by_name["m_eph"], Materialization::Ephemeral);
        assert_eq!(by_name["m_inc"], Materialization::Incremental);
        assert_eq!(by_name["m_snap"], Materialization::Snapshot);
    }

    #[test]
    fn load_project_unknown_materialization_errs() {
        let dir = TempDir::new().expect("tempdir");
        write_file(&dir.path().join("project.yml"), "name: bad\n");
        write_file(&dir.path().join("models/m.sql"), "SELECT 1");
        write_file(
            &dir.path().join("models/m.yml"),
            "materialized: bogus\n",
        );
        let err =
            load_project(dir.path().to_str().unwrap()).expect_err("unknown materialization");
        assert!(
            err.to_string().contains("Unknown materialization"),
            "got: {err}"
        );
    }

    #[test]
    fn load_project_parses_incremental_strategy_variants() {
        // Each variant is exercised through load_project so we know YAML
        // deserialization wires through to the typed enum.
        let cases = [
            ("append", IncrementalStrategy::Append),
            ("delete_insert", IncrementalStrategy::DeleteInsert),
        ];
        for (yaml_value, expected) in cases {
            let dir = TempDir::new().expect("tempdir");
            write_file(&dir.path().join("project.yml"), "name: s\n");
            write_file(&dir.path().join("models/m.sql"), "SELECT 1");
            write_file(
                &dir.path().join("models/m.yml"),
                &format!(
                    "materialized: incremental\nincremental_strategy: {}\n",
                    yaml_value
                ),
            );
            let project = load_project(dir.path().to_str().unwrap())
                .unwrap_or_else(|e| panic!("variant {yaml_value} should load: {e}"));
            assert_eq!(
                project.models[0].incremental_strategy,
                Some(expected),
                "variant {yaml_value} did not round-trip"
            );
        }

        // Merge needs unique_key; microbatch needs updated_at + batch_size.
        let dir = TempDir::new().expect("tempdir");
        write_file(&dir.path().join("project.yml"), "name: s\n");
        write_file(&dir.path().join("models/m.sql"), "SELECT 1");
        write_file(
            &dir.path().join("models/m.yml"),
            "materialized: incremental\nincremental_strategy: merge\nunique_key: id\n",
        );
        let project = load_project(dir.path().to_str().unwrap()).expect("merge load");
        assert_eq!(
            project.models[0].incremental_strategy,
            Some(IncrementalStrategy::Merge)
        );

        let dir = TempDir::new().expect("tempdir");
        write_file(&dir.path().join("project.yml"), "name: s\n");
        write_file(&dir.path().join("models/m.sql"), "SELECT 1");
        write_file(
            &dir.path().join("models/m.yml"),
            "materialized: incremental\nincremental_strategy: microbatch\nupdated_at: ts\nbatch_size: day\n",
        );
        let project = load_project(dir.path().to_str().unwrap()).expect("microbatch load");
        assert_eq!(
            project.models[0].incremental_strategy,
            Some(IncrementalStrategy::Microbatch)
        );
    }

    #[test]
    fn validate_incremental_merge_requires_unique_key() {
        let mut model = make_model("m", Materialization::Incremental);
        model.incremental_strategy = Some(IncrementalStrategy::Merge);
        let err = validate_incremental_config(&model).expect_err("merge needs unique_key");
        assert!(err.to_string().contains("merge strategy requires unique_key"), "got: {err}");

        model.unique_key = Some(vec!["id".into()]);
        validate_incremental_config(&model).expect("with unique_key now passes");
    }

    #[test]
    fn validate_incremental_microbatch_requires_updated_at_and_batch_size() {
        let mut model = make_model("m", Materialization::Incremental);
        model.incremental_strategy = Some(IncrementalStrategy::Microbatch);

        let err =
            validate_incremental_config(&model).expect_err("microbatch needs updated_at first");
        assert!(
            err.to_string().contains("microbatch strategy requires updated_at"),
            "got: {err}"
        );

        model.updated_at = Some("ts".into());
        let err = validate_incremental_config(&model)
            .expect_err("microbatch still needs batch_size");
        assert!(
            err.to_string().contains("microbatch strategy requires batch_size"),
            "got: {err}"
        );

        model.batch_size = Some(BatchSize::Day);
        validate_incremental_config(&model).expect("microbatch fully configured passes");
    }

    #[test]
    fn validate_incremental_append_and_delete_insert_pass_without_extras() {
        let mut model = make_model("m", Materialization::Incremental);
        model.incremental_strategy = Some(IncrementalStrategy::Append);
        validate_incremental_config(&model).expect("append needs nothing extra");

        model.incremental_strategy = Some(IncrementalStrategy::DeleteInsert);
        validate_incremental_config(&model).expect("delete_insert needs nothing extra");

        // Default (None) behaves like DeleteInsert and must also pass.
        model.incremental_strategy = None;
        validate_incremental_config(&model).expect("default strategy passes");
    }

    #[test]
    fn validate_snapshot_requires_unique_key() {
        let model = make_model("m", Materialization::Snapshot);
        let err = validate_snapshot_config(&model).expect_err("snapshot needs unique_key");
        assert!(
            err.to_string().contains("snapshot requires unique_key"),
            "got: {err}"
        );
    }

    #[test]
    fn validate_snapshot_timestamp_requires_updated_at() {
        let mut model = make_model("m", Materialization::Snapshot);
        model.unique_key = Some(vec!["id".into()]);
        // strategy = None defaults to Timestamp.
        let err = validate_snapshot_config(&model)
            .expect_err("timestamp snapshot needs updated_at");
        assert!(
            err.to_string()
                .contains("snapshot timestamp strategy requires updated_at"),
            "got: {err}"
        );

        model.updated_at = Some("ts".into());
        validate_snapshot_config(&model).expect("timestamp snapshot now valid");
    }

    #[test]
    fn validate_snapshot_check_requires_check_cols() {
        let mut model = make_model("m", Materialization::Snapshot);
        model.unique_key = Some(vec!["id".into()]);
        model.strategy = Some(SnapshotStrategy::Check);

        let err =
            validate_snapshot_config(&model).expect_err("check snapshot needs check_cols");
        assert!(
            err.to_string()
                .contains("snapshot check strategy requires check_cols"),
            "got: {err}"
        );

        model.check_cols = Some(vec!["status".into()]);
        validate_snapshot_config(&model).expect("check snapshot now valid");
    }

    #[test]
    fn materialization_as_str_covers_every_variant() {
        assert_eq!(Materialization::View.as_str(), "view");
        assert_eq!(Materialization::Table.as_str(), "table");
        assert_eq!(Materialization::Incremental.as_str(), "incremental");
        assert_eq!(Materialization::Snapshot.as_str(), "snapshot");
        assert_eq!(Materialization::Ephemeral.as_str(), "ephemeral");
        // Default is View — guards against accidental reorder of the enum.
        assert_eq!(Materialization::default(), Materialization::View);
    }

    #[test]
    fn incremental_strategy_as_str_covers_every_variant() {
        assert_eq!(IncrementalStrategy::Append.as_str(), "append");
        assert_eq!(IncrementalStrategy::DeleteInsert.as_str(), "delete_insert");
        assert_eq!(IncrementalStrategy::Merge.as_str(), "merge");
        assert_eq!(IncrementalStrategy::Microbatch.as_str(), "microbatch");
    }

    #[test]
    fn default_paths_match_documented_defaults() {
        assert_eq!(default_models_path(), "models");
        assert_eq!(default_seeds_path(), "seeds");
        assert_eq!(default_tests_path(), "tests");
    }

    #[test]
    fn unique_key_config_columns_handles_single_and_composite() {
        // Single string round-trips as a one-element column list.
        let single: UniqueKeyConfig = serde_yaml::from_str("id").unwrap();
        assert_eq!(single.columns(), vec!["id".to_string()]);

        // List form preserves order.
        let composite: UniqueKeyConfig =
            serde_yaml::from_str("[customer_id, order_id]").unwrap();
        assert_eq!(
            composite.columns(),
            vec!["customer_id".to_string(), "order_id".to_string()]
        );
    }

    #[test]
    fn load_project_reads_sources_yml_when_present() {
        let dir = minimal_project("with-sources");
        write_file(
            &dir.path().join("sources.yml"),
            "sources:\n  - name: raw_events\n    loaded_at_field: ingested_at\n",
        );
        let project = load_project(dir.path().to_str().unwrap()).expect("load");
        assert_eq!(project.sources.len(), 1);
        assert_eq!(project.sources[0].name, "raw_events");
        assert_eq!(project.sources[0].loaded_at_field, "ingested_at");
    }
}
