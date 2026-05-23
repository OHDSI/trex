use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use etl_lib::state::table::TableReplicationPhase;
use etl_lib::store::cleanup::CleanupStore;
use etl_lib::store::schema::SchemaStore;
use etl_lib::store::state::StateStore;
use etl_lib::types::Type;
use etl_postgres::types::{ColumnSchema, TableId, TableName, TableSchema};

use etl::store::DuckDbStore;

fn make_store() -> (Arc<Mutex<HashMap<TableId, TableSchema>>>, DuckDbStore) {
    let schemas = Arc::new(Mutex::new(HashMap::new()));
    let store = DuckDbStore::new("test_pipeline".to_string(), schemas.clone());
    (schemas, store)
}

fn make_schema(id: u32, table: &str) -> TableSchema {
    TableSchema {
        id: TableId::new(id),
        name: TableName {
            schema: "public".to_string(),
            name: table.to_string(),
        },
        column_schemas: vec![ColumnSchema {
            name: "id".to_string(),
            typ: Type::INT4,
            modifier: -1,
            nullable: false,
            primary: true,
        }],
    }
}

// --- StateStore: replication states ---

#[tokio::test]
async fn get_replication_state_returns_none_when_absent() {
    let (_, store) = make_store();
    let res = store.get_table_replication_state(TableId::new(1)).await.unwrap();
    assert!(res.is_none());
}

#[tokio::test]
async fn update_then_get_replication_state() {
    let (_, store) = make_store();
    let tid = TableId::new(7);
    store
        .update_table_replication_states(vec![(tid, TableReplicationPhase::Init)])
        .await
        .unwrap();

    let got = store.get_table_replication_state(tid).await.unwrap();
    assert_eq!(got, Some(TableReplicationPhase::Init));
}

#[tokio::test]
async fn get_all_replication_states() {
    let (_, store) = make_store();
    store
        .update_table_replication_states(vec![
            (TableId::new(1), TableReplicationPhase::Init),
            (TableId::new(2), TableReplicationPhase::Init),
        ])
        .await
        .unwrap();

    let all = store.get_table_replication_states().await.unwrap();
    assert_eq!(all.len(), 2);
    assert!(all.contains_key(&TableId::new(1)));
    assert!(all.contains_key(&TableId::new(2)));
}

#[tokio::test]
async fn rollback_pops_history_stack_lifo() {
    let (_, store) = make_store();
    let tid = TableId::new(99);

    // Three sequential updates → history stack should contain Init, DataSync (in that order).
    store
        .update_table_replication_states(vec![(tid, TableReplicationPhase::Init)])
        .await
        .unwrap();
    store
        .update_table_replication_states(vec![(tid, TableReplicationPhase::DataSync)])
        .await
        .unwrap();
    store
        .update_table_replication_states(vec![(tid, TableReplicationPhase::FinishedCopy)])
        .await
        .unwrap();

    // First rollback pops DataSync.
    let prev1 = store.rollback_table_replication_state(tid).await.unwrap();
    assert_eq!(prev1, TableReplicationPhase::DataSync);
    assert_eq!(
        store.get_table_replication_state(tid).await.unwrap(),
        Some(TableReplicationPhase::DataSync)
    );

    // Second rollback pops Init.
    let prev2 = store.rollback_table_replication_state(tid).await.unwrap();
    assert_eq!(prev2, TableReplicationPhase::Init);
    assert_eq!(
        store.get_table_replication_state(tid).await.unwrap(),
        Some(TableReplicationPhase::Init)
    );

    // Third rollback errors — history exhausted.
    assert!(store.rollback_table_replication_state(tid).await.is_err());
}

#[tokio::test]
async fn rollback_with_no_history_errors() {
    let (_, store) = make_store();
    let tid = TableId::new(99);
    // No prior update, no history.
    let err = store.rollback_table_replication_state(tid).await;
    assert!(err.is_err());
}

// --- StateStore: table mappings (read-only paths only) ---

#[tokio::test]
async fn get_table_mapping_returns_none_when_absent() {
    let (_, store) = make_store();
    let got = store.get_table_mapping(&TableId::new(1)).await.unwrap();
    assert!(got.is_none());
}

#[tokio::test]
async fn get_table_mappings_empty() {
    let (_, store) = make_store();
    let all = store.get_table_mappings().await.unwrap();
    assert!(all.is_empty());
}

#[tokio::test]
async fn load_table_mappings_returns_zero_when_empty() {
    let (_, store) = make_store();
    let n = store.load_table_mappings().await.unwrap();
    assert_eq!(n, 0);
}

// --- SchemaStore ---

#[tokio::test]
async fn get_table_schema_returns_none_when_absent() {
    let (_, store) = make_store();
    let got = store.get_table_schema(&TableId::new(1)).await.unwrap();
    assert!(got.is_none());
}

#[tokio::test]
async fn store_and_get_table_schema() {
    let (cache, store) = make_store();
    let schema = make_schema(42, "users");
    store.store_table_schema(schema.clone()).await.unwrap();

    let got = store.get_table_schema(&TableId::new(42)).await.unwrap();
    let got_schema = got.as_ref().expect("schema should be present").as_ref();
    assert_eq!(got_schema, &schema);

    // Verify the shared schema cache was also written through with the same value.
    let cache_guard = cache.lock().unwrap();
    assert_eq!(cache_guard.get(&TableId::new(42)), Some(&schema));
}

#[tokio::test]
async fn get_table_schemas_returns_all() {
    let (_, store) = make_store();
    store.store_table_schema(make_schema(1, "a")).await.unwrap();
    store.store_table_schema(make_schema(2, "b")).await.unwrap();

    let all = store.get_table_schemas().await.unwrap();
    assert_eq!(all.len(), 2);
}

#[tokio::test]
async fn load_table_schemas_returns_count() {
    let (_, store) = make_store();
    assert_eq!(store.load_table_schemas().await.unwrap(), 0);
    store.store_table_schema(make_schema(1, "a")).await.unwrap();
    assert_eq!(store.load_table_schemas().await.unwrap(), 1);
}

// --- CleanupStore ---

#[tokio::test]
async fn cleanup_clears_all_per_table_state() {
    let (_, store) = make_store();
    let tid = TableId::new(5);

    // Two updates so history has one entry.
    store
        .update_table_replication_states(vec![(tid, TableReplicationPhase::Init)])
        .await
        .unwrap();
    store
        .update_table_replication_states(vec![(tid, TableReplicationPhase::FinishedCopy)])
        .await
        .unwrap();
    store.store_table_schema(make_schema(5, "t")).await.unwrap();

    store.cleanup_table_state(tid).await.unwrap();

    assert!(store.get_table_replication_state(tid).await.unwrap().is_none());
    assert!(store.get_table_schema(&tid).await.unwrap().is_none());
    // History must also be gone — otherwise rollback would succeed.
    assert!(store.rollback_table_replication_state(tid).await.is_err());
}
