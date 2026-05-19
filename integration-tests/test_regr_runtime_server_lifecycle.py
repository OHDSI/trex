"""Regression test: trex_runtime (trexas) server start/stop/start lifecycle.

Bug: stop_server only removed the entry from ServerManager and dropped the
JoinHandle from SERVER_THREADS without ever signalling the spawned tokio
runtime to exit. The trex-server thread kept running indefinitely and held
the listening socket, so an immediate restart on the same port would either
fail to bind or race with the previous bind.

Fix: stop_server now sends a TerminationToken cancel (which the
base::server::listen() select! arm awaits as input_termination_token) and
joins the worker thread before returning. SERVER_THREADS cleanup happens
after the thread exits, not before.

This regression test starts a trex_server, stops it, and immediately
re-starts it on the same port. The cycle repeats several times. PASS = no
"address already in use" error and no zombie thread; the second start
returns a fresh server id (not "Error: ...").
"""
import json



def _start_payload(host: str, port: int) -> str:
    """Minimal server config JSON. We don't need a real main_service —
    we never actually hit it, we only care that the server binds the
    port, listens, and then releases it cleanly on shutdown."""
    cfg = {
        "host": host,
        "port": port,
        # main.ts under cwd; the start path normalizes it. The server
        # tolerates a non-existent path enough to bind and listen for the
        # short window before we call stop.
        "main_service_path": "main.ts",
        "no_module_cache": True,
        # Short request_idle_timeout / graceful exit so stop returns fast.
        "graceful_exit_deadline_sec": 5,
        "request_idle_timeout_ms": 1000,
    }
    return json.dumps(cfg).replace("'", "''")


def test_runtime_server_restart_same_port(node_factory):
    """trex_runtime_start / stop / start on the same port works repeatedly."""
    node = node_factory(load_db=False, load_trexas=True)

    # High port to avoid CI collisions.
    port = 28291
    host = "127.0.0.1"
    cfg_json = _start_payload(host, port)

    for cycle in range(3):
        started = node.execute(
            f"SELECT trex_runtime_start_with_config('{cfg_json}')",
            timeout=120,
        )
        assert len(started) == 1
        msg = started[0][0]
        # Either "Trex server started: trex_..." (fresh) or an error if
        # the previous thread never released the port. We assert success.
        assert "started" in msg.lower(), (
            f"cycle {cycle}: expected start success, got {msg!r}"
        )
        assert "error" not in msg.lower(), (
            f"cycle {cycle}: start returned an error: {msg!r}"
        )

        # Pull the server_id out of the response so we can stop *exactly*
        # this server (the id includes a unix-second timestamp, so two
        # back-to-back starts produce different ids).
        # Format: "Trex server started: trex_<port>_<unixsec>"
        server_id = msg.split("Trex server started:", 1)[1].strip()
        assert server_id.startswith("trex_"), (
            f"cycle {cycle}: unexpected server_id {server_id!r}"
        )

        stopped = node.execute(
            f"SELECT trex_runtime_stop('{server_id}')", timeout=60
        )
        assert len(stopped) == 1
        stop_msg = stopped[0][0]
        assert "stopped" in stop_msg.lower(), (
            f"cycle {cycle}: expected stop success, got {stop_msg!r}"
        )

    # After the final stop, trex_runtime_list should not list any of the
    # servers we just stopped. (It may show other servers spun up in the
    # same process for unrelated reasons, but ours should be gone.)
    listing = node.execute("SELECT * FROM trex_runtime_list()", timeout=30)
    for row in listing:
        sid = row[0] if row else ""
        assert f"_{port}_" not in sid, (
            f"phantom server still listed after stop: {row}"
        )


def test_runtime_stop_releases_port_for_external_bind(node_factory):
    """After stop, the underlying TCP port is actually free.

    This is the load-bearing assertion for the fix: if the spawned tokio
    runtime were still running, the listening socket would remain bound
    and an external Python socket.bind() on the same port would fail with
    EADDRINUSE.
    """
    node = node_factory(load_db=False, load_trexas=True)

    port = 28292
    host = "127.0.0.1"
    cfg_json = _start_payload(host, port)

    started = node.execute(
        f"SELECT trex_runtime_start_with_config('{cfg_json}')", timeout=120
    )
    msg = started[0][0]
    assert "started" in msg.lower(), msg
    server_id = msg.split("Trex server started:", 1)[1].strip()

    stopped = node.execute(
        f"SELECT trex_runtime_stop('{server_id}')", timeout=60
    )
    assert "stopped" in stopped[0][0].lower(), stopped

    # The port must be free now. If the worker thread were still alive we
    # would get EADDRINUSE here.
    import socket

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((host, port))
    finally:
        s.close()
