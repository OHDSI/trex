use std::sync::Arc;
use std::sync::Once;
use std::thread;

/// rustls 0.23+ requires a CryptoProvider be installed before any TLS handshake.
/// Both `ring` and `aws-lc-rs` features can be linked transitively, so the
/// auto-selection panics with "Could not automatically determine the
/// process-level CryptoProvider". We install `ring` explicitly. Mirrors the
/// pattern in plugins/etl/src/etl_start.rs.
static CRYPTO_INIT: Once = Once::new();

fn ensure_crypto_provider() {
    CRYPTO_INIT.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

use arrow::array::{Array, RecordBatch};
use arrow::ipc::writer::IpcWriteOptions;
use arrow_flight::decode::FlightRecordBatchStream;
use arrow_flight::encode::FlightDataEncoderBuilder;
use arrow_flight::flight_service_server::{FlightService, FlightServiceServer};
use arrow_flight::{
    Action, ActionType, Criteria, Empty, FlightData, FlightDescriptor, FlightInfo,
    HandshakeRequest, HandshakeResponse, PollInfo, PutResult, SchemaAsIpc, SchemaResult, Ticket,
};
use duckdb::params;
use futures::stream::{self, BoxStream};
use futures::{StreamExt, TryStreamExt};
use tonic::transport::{Certificate, Identity, Server, ServerTlsConfig};
use tonic::{Request, Response, Status, Streaming};
use tokio::sync::oneshot;

use crate::logging::SwarmLogger;
use crate::server_registry::ServerRegistry;
use crate::shuffle_descriptor::ShuffleDescriptor;
use crate::shuffle_registry;

fn escape_identifier(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Extract the per-client session token from a Flight request's metadata.
fn extract_session_token<T>(req: &tonic::Request<T>) -> Option<String> {
    req.metadata()
        .get("x-trex-session")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

/// Arrow Flight service backed by the shared trex_pool.
#[derive(Clone)]
pub struct DuckDBFlightService {
    host: String,
    port: u16,
}

impl DuckDBFlightService {
    pub fn new(host: String, port: u16) -> Self {
        Self {
            host,
            port,
        }
    }

    /// Extract the SQL query string from a JSON-encoded ticket.
    /// Expected format: `{"query": "SELECT ..."}`
    fn parse_ticket_query(ticket: &Ticket) -> Result<String, Status> {
        let value: serde_json::Value = serde_json::from_slice(ticket.ticket.as_ref())
            .map_err(|e| {
                Status::invalid_argument(format!(
                    "Invalid ticket format, expected JSON: {}",
                    e
                ))
            })?;

        value
            .get("query")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| {
                Status::invalid_argument(
                    "Ticket JSON must contain a \"query\" field with a string value",
                )
            })
    }

    fn execute_query_pooled(
        sql: &str,
    ) -> Result<(arrow::datatypes::SchemaRef, Vec<arrow::array::RecordBatch>), Status> {
        crate::pool::read_arrow(sql).map_err(|e| {
            Status::internal(format!("Failed to execute '{}': {}", sql, e))
        })
    }

    fn execute_query(
        sql: &str,
    ) -> Result<(arrow::datatypes::SchemaRef, Vec<arrow::array::RecordBatch>), Status> {
        Self::execute_query_pooled(sql)
    }

    /// Execute `sql` on the session associated with `token`. If `token` is None,
    /// run as a one-shot (matches legacy behaviour for the cluster-internal
    /// coordinator). If a token is given but no entry exists, create the
    /// session and store it.
    fn execute_with_session(
        token: Option<&str>,
        sql: &str,
    ) -> Result<(arrow::datatypes::SchemaRef, Vec<arrow::array::RecordBatch>), Status> {
        use crate::flight_sessions::SessionRegistry;

        match token {
            None => Self::execute_query_pooled(sql),
            Some(tok) => {
                let registry = SessionRegistry::instance();
                let sid = match registry.resolve(tok) {
                    Some(s) => s,
                    None => {
                        let new_sid = trex_pool_client::create_session()
                            .map_err(|e| Status::internal(format!("pool create_session: {e}")))?;
                        match registry.put_if_absent(tok, new_sid) {
                            None => new_sid,
                            Some(existing) => {
                                // Lost the race: another thread created and stored a
                                // session for this token first. Release ours.
                                let _ = trex_pool_client::destroy_session(new_sid);
                                existing
                            }
                        }
                    }
                };
                trex_pool_client::session_execute(sid, sql)
                    .map_err(|e| Status::internal(format!("session_execute: {e}")))
            }
        }
    }

    pub fn advertised_action_names(&self) -> Vec<String> {
        vec![
            "query".into(),
            "create_session".into(),
            "destroy_session".into(),
            "refresh_catalog".into(),
        ]
    }

    /// Extract a SQL query from a FlightDescriptor (CMD or PATH).
    fn descriptor_to_query(descriptor: &FlightDescriptor) -> Result<String, Status> {
        match descriptor.r#type() {
            arrow_flight::flight_descriptor::DescriptorType::Cmd => {
                let cmd = std::str::from_utf8(&descriptor.cmd).map_err(|e| {
                    Status::invalid_argument(format!("Invalid UTF-8 in descriptor cmd: {}", e))
                })?;

                if cmd.is_empty() {
                    return Err(Status::invalid_argument("Empty command in descriptor"));
                }

                if cmd.starts_with('{') {
                    let value: serde_json::Value = serde_json::from_str(cmd).map_err(|e| {
                        Status::invalid_argument(format!("Invalid JSON in descriptor cmd: {}", e))
                    })?;
                    if let Some(query) = value.get("query").and_then(|v| v.as_str()) {
                        return Ok(query.to_string());
                    }
                }

                Ok(cmd.to_string())
            }
            arrow_flight::flight_descriptor::DescriptorType::Path => {
                let path = &descriptor.path;
                if path.is_empty() {
                    return Err(Status::invalid_argument("Empty path in descriptor"));
                }
                Ok(format!("SELECT * FROM {}", escape_identifier(&path[0])))
            }
            _ => Err(Status::invalid_argument("Unknown descriptor type")),
        }
    }
}

#[tonic::async_trait]
impl FlightService for DuckDBFlightService {
    type HandshakeStream = BoxStream<'static, Result<HandshakeResponse, Status>>;
    type ListFlightsStream = BoxStream<'static, Result<FlightInfo, Status>>;
    type DoGetStream = BoxStream<'static, Result<FlightData, Status>>;
    type DoPutStream = BoxStream<'static, Result<PutResult, Status>>;
    type DoActionStream = BoxStream<'static, Result<arrow_flight::Result, Status>>;
    type ListActionsStream = BoxStream<'static, Result<ActionType, Status>>;
    type DoExchangeStream = BoxStream<'static, Result<FlightData, Status>>;

    /// Return the node address as a handshake acknowledgement.
    async fn handshake(
        &self,
        _request: Request<Streaming<HandshakeRequest>>,
    ) -> Result<Response<Self::HandshakeStream>, Status> {
        let node_id = format!("{}:{}", self.host, self.port);
        SwarmLogger::debug("handshake", &format!("Handshake request from client, node_id={node_id}"));
        let response = HandshakeResponse {
            protocol_version: 1,
            payload: node_id.into_bytes().into(),
        };

        let output = stream::once(async { Ok(response) }).boxed();
        Ok(Response::new(output))
    }

    /// Return one FlightInfo per trexsql table with schema and endpoint.
    async fn list_flights(
        &self,
        _request: Request<Criteria>,
    ) -> Result<Response<Self::ListFlightsStream>, Status> {
        SwarmLogger::debug("list_flights", &format!("Listing tables on {}:{}", self.host, self.port));
        let host = self.host.clone();
        let port = self.port;

        let flights = tokio::task::spawn_blocking(move || -> Result<Vec<FlightInfo>, Status> {
            crate::local_connections::with_connection(|conn| {
                let mut stmt = conn.prepare("SHOW TABLES").map_err(|e| {
                    format!("Failed to list tables: {}", e)
                })?;

                let table_result = stmt.query_arrow(params![]).map_err(|e| {
                    format!("Failed to execute SHOW TABLES: {}", e)
                })?;

                let batches: Vec<_> = table_result.collect();

                let mut flights = Vec::new();

                for batch in &batches {
                    if batch.num_columns() == 0 {
                        continue;
                    }

                    let col = batch.column(0);
                    let string_array = col
                        .as_any()
                        .downcast_ref::<arrow::array::StringArray>();

                    if let Some(arr) = string_array {
                        for i in 0..arr.len() {
                            if arr.is_null(i) {
                                continue;
                            }
                            let table_name = arr.value(i);

                            let schema_query =
                                format!("SELECT * FROM {} LIMIT 0", escape_identifier(table_name));

                            let schema = match conn.prepare(&schema_query) {
                                Ok(mut s) => match s.query_arrow(params![]) {
                                    Ok(ret) => ret.get_schema(),
                                    Err(_) => continue,
                                },
                                Err(_) => continue,
                            };

                            let descriptor = FlightDescriptor::new_path(vec![table_name.to_string()]);

                            let ticket = Ticket::new(
                                serde_json::json!({"query": format!("SELECT * FROM {}", escape_identifier(table_name))})
                                    .to_string()
                                    .into_bytes(),
                            );

                            let endpoint = arrow_flight::FlightEndpoint::new()
                                .with_ticket(ticket)
                                .with_location(format!("grpc://{}:{}", host, port));

                            let info = FlightInfo::new()
                                .with_descriptor(descriptor)
                                .try_with_schema(&schema)
                                .map_err(|e| {
                                    format!("Failed to encode schema: {}", e)
                                })?
                                .with_endpoint(endpoint)
                                .with_total_records(-1)
                                .with_total_bytes(-1);

                            flights.push(info);
                        }
                    }
                }

                Ok(flights)
            }).map_err(|e| Status::internal(e))
        })
        .await
        .map_err(|e| Status::internal(format!("Task join error: {}", e)))??;

        SwarmLogger::debug("list_flights", &format!("Returning {} flights", flights.len()));

        let output = stream::iter(flights.into_iter().map(Ok)).boxed();
        Ok(Response::new(output))
    }

    /// Return schema and endpoint information for a descriptor.
    async fn get_flight_info(
        &self,
        request: Request<FlightDescriptor>,
    ) -> Result<Response<FlightInfo>, Status> {
        let descriptor = request.into_inner();
        let sql = Self::descriptor_to_query(&descriptor)?;
        let host = self.host.clone();
        let port = self.port;

        let info = tokio::task::spawn_blocking(move || -> Result<FlightInfo, Status> {
            let (schema, batches) = Self::execute_query(&sql)?;

            let total_records: i64 = batches.iter().map(|b| b.num_rows() as i64).sum();

            let ticket = Ticket::new(
                serde_json::json!({"query": sql}).to_string().into_bytes(),
            );

            let endpoint = arrow_flight::FlightEndpoint::new()
                .with_ticket(ticket)
                .with_location(format!("grpc://{}:{}", host, port));

            let info = FlightInfo::new()
                .with_descriptor(descriptor)
                .try_with_schema(&schema)
                .map_err(|e| Status::internal(format!("Failed to encode schema: {}", e)))?
                .with_endpoint(endpoint)
                .with_total_records(total_records)
                .with_total_bytes(-1);

            Ok(info)
        })
        .await
        .map_err(|e| Status::internal(format!("Task join error: {}", e)))??;

        Ok(Response::new(info))
    }

    /// Return the schema for a descriptor without fetching data.
    async fn get_schema(
        &self,
        request: Request<FlightDescriptor>,
    ) -> Result<Response<SchemaResult>, Status> {
        let descriptor = request.into_inner();
        let sql = Self::descriptor_to_query(&descriptor)?;

        let schema_result =
            tokio::task::spawn_blocking(move || -> Result<SchemaResult, Status> {
                let schema_sql = if sql.to_uppercase().starts_with("SELECT")
                    || sql.to_uppercase().starts_with("WITH")
                {
                    format!("SELECT * FROM ({}) AS _schema_probe LIMIT 0", sql)
                } else {
                    sql.clone()
                };

                let (schema, _) = Self::execute_query(&schema_sql)?;

                let ipc_options = IpcWriteOptions::default();
                let schema_result: SchemaResult = SchemaAsIpc::new(&schema, &ipc_options)
                    .try_into()
                    .map_err(|e: arrow::error::ArrowError| {
                        Status::internal(format!("Failed to encode schema: {}", e))
                    })?;

                Ok(schema_result)
            })
            .await
            .map_err(|e| Status::internal(format!("Task join error: {}", e)))??;

        Ok(Response::new(schema_result))
    }

    /// Execute a SQL query from the ticket and stream results as FlightData.
    async fn do_get(
        &self,
        request: Request<Ticket>,
    ) -> Result<Response<Self::DoGetStream>, Status> {
        let token = extract_session_token(&request);
        let ticket = request.into_inner();
        let sql = Self::parse_ticket_query(&ticket)?;
        SwarmLogger::info("do_get", &format!("Executing query on {}:{}", self.host, self.port));
        SwarmLogger::debug("do_get", &format!("SQL: {sql} session={:?}", token));

        let (schema, batches) =
            tokio::task::spawn_blocking(move || Self::execute_with_session(token.as_deref(), &sql))
                .await
                .map_err(|e| Status::internal(format!("Task join error: {}", e)))??;

        SwarmLogger::debug(
            "do_get",
            &format!("Query returned {} batches, {} total rows",
                batches.len(),
                batches.iter().map(|b| b.num_rows()).sum::<usize>()),
        );

        let batch_stream = stream::iter(batches.into_iter().map(Ok));

        let flight_data_stream = FlightDataEncoderBuilder::new()
            .with_schema(schema)
            .build(batch_stream)
            .map_err(|e| Status::internal(format!("Flight encoding error: {}", e)));

        Ok(Response::new(flight_data_stream.boxed()))
    }

    /// Not supported; use SQL via DoGet or DoAction.
    async fn do_put(
        &self,
        _request: Request<Streaming<FlightData>>,
    ) -> Result<Response<Self::DoPutStream>, Status> {
        Err(Status::unimplemented(
            "DoPut is not supported; use SQL statements via DoGet or DoAction",
        ))
    }

    /// Execute a SQL statement via the "query" action type.
    async fn do_action(
        &self,
        request: Request<Action>,
    ) -> Result<Response<Self::DoActionStream>, Status> {
        let token = extract_session_token(&request);
        let action = request.into_inner();

        match action.r#type.as_str() {
            "query" => {
                let body: serde_json::Value = serde_json::from_slice(&action.body).map_err(|e| {
                    Status::invalid_argument(format!("Invalid JSON action body: {}", e))
                })?;
                let sql = body
                    .get("query").and_then(|v| v.as_str())
                    .ok_or_else(|| Status::invalid_argument("Action body must contain a \"query\" field"))?
                    .to_string();

                let token_owned = token.clone();
                tokio::task::spawn_blocking(move || -> Result<(), Status> {
                    let _ = Self::execute_with_session(token_owned.as_deref(), &sql)?;
                    Ok(())
                })
                .await
                .map_err(|e| Status::internal(format!("Task join error: {}", e)))??;

                let result = arrow_flight::Result { body: r#"{"status":"ok"}"#.as_bytes().to_vec().into() };
                let output = stream::once(async { Ok(result) }).boxed();
                Ok(Response::new(output))
            }
            "create_session" => {
                let tok = token.ok_or_else(|| {
                    Status::invalid_argument("create_session requires x-trex-session metadata header")
                })?;
                tokio::task::spawn_blocking(move || -> Result<(), Status> {
                    use crate::flight_sessions::SessionRegistry;
                    let registry = SessionRegistry::instance();
                    if registry.resolve(&tok).is_some() {
                        return Ok(());
                    }
                    let sid = trex_pool_client::create_session()
                        .map_err(|e| Status::internal(format!("pool create_session: {e}")))?;
                    if let Some(_existing) = registry.put_if_absent(&tok, sid) {
                        // Lost a race against another concurrent create_session.
                        let _ = trex_pool_client::destroy_session(sid);
                    }
                    Ok(())
                })
                .await
                .map_err(|e| Status::internal(format!("Task join error: {}", e)))??;

                let body = r#"{"status":"ok"}"#.as_bytes().to_vec();
                let result = arrow_flight::Result { body: body.into() };
                Ok(Response::new(stream::once(async { Ok(result) }).boxed()))
            }
            "destroy_session" => {
                let tok = token.ok_or_else(|| {
                    Status::invalid_argument("destroy_session requires x-trex-session metadata header")
                })?;
                tokio::task::spawn_blocking(move || {
                    use crate::flight_sessions::SessionRegistry;
                    if let Some(sid) = SessionRegistry::instance().remove(&tok) {
                        let _ = trex_pool_client::destroy_session(sid);
                    }
                })
                .await
                .map_err(|e| Status::internal(format!("Task join error: {}", e)))?;

                let body = r#"{"status":"ok"}"#.as_bytes().to_vec();
                let result = arrow_flight::Result { body: body.into() };
                Ok(Response::new(stream::once(async { Ok(result) }).boxed()))
            }
            "refresh_catalog" => {
                tokio::task::spawn_blocking(|| { let _ = crate::catalog::advertise_local_tables(); })
                    .await
                    .map_err(|e| Status::internal(format!("Task join error: {}", e)))?;
                let result = arrow_flight::Result { body: r#"{"status":"ok"}"#.as_bytes().to_vec().into() };
                Ok(Response::new(stream::once(async { Ok(result) }).boxed()))
            }
            other => Err(Status::invalid_argument(format!("Unknown action type: {}", other))),
        }
    }

    async fn list_actions(
        &self,
        _request: Request<Empty>,
    ) -> Result<Response<Self::ListActionsStream>, Status> {
        let actions: Vec<ActionType> = self
            .advertised_action_names()
            .into_iter()
            .map(|name| ActionType {
                r#type: name,
                description: "Flight action".to_string(),
            })
            .collect();

        let output = stream::iter(actions.into_iter().map(Ok)).boxed();
        Ok(Response::new(output))
    }

    /// Handle DoExchange for shuffle partition streaming.
    ///
    /// When the FlightDescriptor cmd contains a ShuffleDescriptor JSON, the
    /// incoming FlightData stream is decoded into RecordBatches and submitted
    /// directly to the shuffle_registry. Since flight and swarm are in the
    /// same cdylib, this is a zero-overhead direct call.
    async fn do_exchange(
        &self,
        request: Request<Streaming<FlightData>>,
    ) -> Result<Response<Self::DoExchangeStream>, Status> {
        let mut inbound = request.into_inner();

        let first_msg = inbound
            .message()
            .await
            .map_err(|e| Status::internal(format!("Failed to read first message: {e}")))?
            .ok_or_else(|| Status::invalid_argument("Empty DoExchange stream"))?;

        let descriptor = match first_msg.flight_descriptor.as_ref() {
            Some(d) => d,
            None => {
                return Err(Status::unimplemented(
                    "DoExchange requires a FlightDescriptor with ShuffleDescriptor",
                ));
            }
        };

        let desc = match ShuffleDescriptor::from_json_bytes(&descriptor.cmd) {
            Ok(d) => d,
            Err(_) => {
                return Err(Status::unimplemented(
                    "DoExchange is only supported for shuffle operations",
                ));
            }
        };

        let partition_id = descriptor
            .path
            .first()
            .and_then(|p| p.parse::<usize>().ok())
            .ok_or_else(|| {
                Status::invalid_argument("Descriptor path must contain partition_id")
            })?;

        SwarmLogger::debug(
            "flight-do-exchange",
            &format!(
                "DoExchange: receiving shuffle '{}' partition {} from stream",
                desc.shuffle_id, partition_id,
            ),
        );

        // Reconstruct stream including the first message (may contain data)
        let first_stream = stream::once(async { Ok(first_msg) });
        let rest_stream = inbound.map_err(|e| arrow_flight::error::FlightError::Tonic(Box::new(e)));
        let full_stream = first_stream
            .map(|r| r.map_err(|e: Status| arrow_flight::error::FlightError::Tonic(Box::new(e))))
            .chain(rest_stream);

        let flight_stream = FlightRecordBatchStream::new_from_flight_data(full_stream);
        futures::pin_mut!(flight_stream);

        let mut batches: Vec<RecordBatch> = Vec::new();
        while let Some(batch) = flight_stream
            .try_next()
            .await
            .map_err(|e| Status::internal(format!("Failed to decode batch: {e}")))?
        {
            batches.push(batch);
        }

        let rows: usize = batches.iter().map(|b| b.num_rows()).sum();
        SwarmLogger::debug(
            "flight-do-exchange",
            &format!(
                "DoExchange: received {} batch(es), {} row(s) for shuffle '{}' partition {}",
                batches.len(),
                rows,
                desc.shuffle_id,
                partition_id,
            ),
        );

        if let Some(ref target_table) = desc.target_table {
            let table_name = target_table.clone();
            let batch_count = batches.len();

            tokio::task::spawn_blocking(move || -> Result<(), Status> {
                crate::local_connections::with_connection(|conn| {
                    let mut app = conn
                        .appender(&table_name)
                        .map_err(|e| format!("Appender for '{}': {}", table_name, e))?;

                    for batch in &batches {
                        if batch.num_rows() == 0 {
                            continue;
                        }
                        app.append_record_batch(batch.clone()).map_err(|e| {
                            format!("Append to '{}': {}", table_name, e)
                        })?;
                    }

                    app.flush().map_err(|e| {
                        format!("Flush appender '{}': {}", table_name, e)
                    })?;

                    Ok(())
                }).map_err(|e| Status::internal(e))
            })
            .await
            .map_err(|e| Status::internal(format!("Task join error: {}", e)))??;

            SwarmLogger::debug(
                "flight-do-exchange",
                &format!(
                    "DoExchange: inserted {} batch(es) ({} rows) into table '{}'",
                    batch_count, rows, target_table,
                ),
            );
        } else {
            shuffle_registry::submit_partition(&desc.shuffle_id, partition_id, batches);
        }

        let ack = stream::empty().boxed();
        Ok(Response::new(ack))
    }

    async fn poll_flight_info(
        &self,
        _request: Request<FlightDescriptor>,
    ) -> Result<Response<PollInfo>, Status> {
        Err(Status::unimplemented("PollFlightInfo is not supported"))
    }
}

/// RAII guard that deregisters a server entry from the ServerRegistry when
/// dropped. Used inside spawned server threads so that any early return —
/// runtime build failure, addr parse error, bind error, or serve() returning
/// Err — cleans up the reserved registry slot. Without this the registry can
/// report a phantom server forever after a failed start.
struct DeregisterOnDrop {
    host: String,
    port: u16,
}

impl DeregisterOnDrop {
    fn new(host: String, port: u16) -> Self {
        Self { host, port }
    }
}

impl Drop for DeregisterOnDrop {
    fn drop(&mut self) {
        ServerRegistry::instance().deregister(&self.host, self.port);
    }
}

/// Start an Arrow Flight gRPC server on a dedicated thread.
pub fn start_flight_server(
    host: String,
    port: u16,
    tls_enabled: bool,
) -> Result<String, String> {
    SwarmLogger::info("server", &format!("Starting flight server on {host}:{port} (tls={tls_enabled})"));

    ensure_crypto_provider();

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    ServerRegistry::instance().reserve(&host, port, shutdown_tx, tls_enabled)?;

    let server_host = host.clone();
    let server_port = port;

    let thread_result = thread::Builder::new()
        .name(format!("flight-server-{}:{}", host, port))
        .spawn(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            // Deregister on any thread exit (Ok or Err) so the registry never
            // reports a phantom server when the spawned thread fails to bind,
            // parses an invalid addr, or returns early from serve().
            let _guard = DeregisterOnDrop::new(server_host.clone(), server_port);

            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?;

            rt.block_on(async move {
                let probe_sid = trex_pool_client::create_session().map_err(|e| {
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Connection pool not available: {}", e),
                    )) as Box<dyn std::error::Error + Send + Sync>
                })?;
                let _ = trex_pool_client::destroy_session(probe_sid);

                crate::flight_sessions::SessionRegistry::instance()
                    .start_sweeper()
                    .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                        Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    })?;

                let service = DuckDBFlightService::new(
                    server_host.clone(),
                    server_port,
                );

                let addr = format!("{}:{}", server_host, server_port)
                    .parse()
                    .map_err(|e| {
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidInput,
                            format!("Invalid address: {}", e),
                        )) as Box<dyn std::error::Error + Send + Sync>
                    })?;

                let server = Server::builder()
                    .add_service(FlightServiceServer::new(service))
                    .serve_with_shutdown(addr, async {
                        let _ = shutdown_rx.await;
                    });

                server.await.map_err(|e| {
                    Box::new(e) as Box<dyn std::error::Error + Send + Sync>
                })?;

                Ok(())
            })
        });

    match thread_result {
        Ok(handle) => {
            ServerRegistry::instance().set_thread_handle(&host, port, handle);
        }
        Err(e) => {
            ServerRegistry::instance().deregister(&host, port);
            return Err(format!("Failed to spawn server thread: {}", e));
        }
    }

    SwarmLogger::info("server", &format!("Flight server started successfully on {host}:{port}"));

    Ok(format!("Started flight server on {}:{}", host, port))
}

/// Start an Arrow Flight gRPC server with mTLS on a dedicated thread.
pub fn start_flight_server_with_tls(
    host: String,
    port: u16,
    cert_path: &str,
    key_path: &str,
    ca_cert_path: &str,
) -> Result<String, String> {
    SwarmLogger::info("server", &format!("Starting flight server with mTLS on {host}:{port}"));

    ensure_crypto_provider();

    let cert = std::fs::read(cert_path)
        .map_err(|e| format!("Failed to read certificate file {cert_path}: {e}"))?;
    let key = std::fs::read(key_path)
        .map_err(|e| format!("Failed to read key file {key_path}: {e}"))?;
    let ca_cert = std::fs::read(ca_cert_path)
        .map_err(|e| format!("Failed to read CA certificate file {ca_cert_path}: {e}"))?;

    validate_pem(&cert, "Server certificate")?;
    validate_pem(&key, "Private key")?;
    validate_pem(&ca_cert, "CA certificate")?;

    let identity = Identity::from_pem(cert, key);
    let client_ca = Certificate::from_pem(ca_cert);

    let tls_config = ServerTlsConfig::new()
        .identity(identity)
        .client_ca_root(client_ca);

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    ServerRegistry::instance().reserve(&host, port, shutdown_tx, true)?;

    let server_host = host.clone();
    let server_port = port;

    let thread_result = thread::Builder::new()
        .name(format!("flight-tls-server-{}:{}", host, port))
        .spawn(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            // Deregister on any thread exit (Ok or Err) so the registry never
            // reports a phantom server when the spawned thread fails.
            let _guard = DeregisterOnDrop::new(server_host.clone(), server_port);

            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?;

            rt.block_on(async move {
                let probe_sid = trex_pool_client::create_session().map_err(|e| {
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Connection pool not available: {}", e),
                    )) as Box<dyn std::error::Error + Send + Sync>
                })?;
                let _ = trex_pool_client::destroy_session(probe_sid);

                crate::flight_sessions::SessionRegistry::instance()
                    .start_sweeper()
                    .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                        Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    })?;

                let service = DuckDBFlightService::new(
                    server_host.clone(),
                    server_port,
                );

                let addr = format!("{}:{}", server_host, server_port)
                    .parse()
                    .map_err(|e| {
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidInput,
                            format!("Invalid address: {}", e),
                        )) as Box<dyn std::error::Error + Send + Sync>
                    })?;

                let server = Server::builder()
                    .tls_config(tls_config)
                    .map_err(|e| {
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("TLS configuration error: {}", e),
                        )) as Box<dyn std::error::Error + Send + Sync>
                    })?
                    .add_service(FlightServiceServer::new(service))
                    .serve_with_shutdown(addr, async {
                        let _ = shutdown_rx.await;
                    });

                server.await.map_err(|e| {
                    Box::new(e) as Box<dyn std::error::Error + Send + Sync>
                })?;

                Ok(())
            })
        });

    match thread_result {
        Ok(handle) => {
            ServerRegistry::instance().set_thread_handle(&host, port, handle);
        }
        Err(e) => {
            ServerRegistry::instance().deregister(&host, port);
            return Err(format!("Failed to spawn server thread: {}", e));
        }
    }

    SwarmLogger::info("server", &format!("Flight server with mTLS started successfully on {host}:{port}"));

    Ok(format!(
        "Started flight server with mTLS on {}:{}",
        host, port
    ))
}

fn validate_pem(data: &[u8], label: &str) -> Result<(), String> {
    let s = std::str::from_utf8(data)
        .map_err(|_| format!("{label} file is not valid UTF-8"))?;
    if !s.contains("-----BEGIN ") {
        return Err(format!("{label} file is not valid PEM format"));
    }
    Ok(())
}

/// Stop a running Arrow Flight server and deregister it.
pub fn stop_flight_server(host: &str, port: u16) -> Result<String, String> {
    SwarmLogger::info("server", &format!("Stopping flight server on {host}:{port}"));
    let result = ServerRegistry::instance().stop_server(host, port);
    if result.is_ok() {
        SwarmLogger::info("server", &format!("Flight server stopped on {host}:{port}"));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_session_token_handles_missing() {
        let mut req = tonic::Request::new(());
        assert_eq!(extract_session_token(&req), None);
        req.metadata_mut().insert("x-trex-session", "abc".parse().unwrap());
        assert_eq!(extract_session_token(&req).as_deref(), Some("abc"));
    }

    #[test]
    fn list_actions_includes_session_lifecycle() {
        let svc = DuckDBFlightService::new("127.0.0.1".into(), 0);
        let names = svc.advertised_action_names();
        assert!(names.contains(&"query".to_string()));
        assert!(names.contains(&"create_session".to_string()));
        assert!(names.contains(&"destroy_session".to_string()));
    }
}
