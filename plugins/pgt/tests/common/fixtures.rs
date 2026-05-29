//! Canonical PostgreSQL input snippets reused across pgt test files.

pub mod ddl {
    pub const CREATE_TABLE_SERIAL: &str =
        "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)";
    pub const CREATE_TABLE_BIGSERIAL: &str =
        "CREATE TABLE events (id BIGSERIAL PRIMARY KEY, payload JSONB)";
    pub const CREATE_INDEX_USING: &str =
        "CREATE INDEX idx_users_name ON users USING btree (name)";
    pub const DROP_IF_EXISTS: &str = "DROP TABLE IF EXISTS users";
    pub const CREATE_TABLE_AS: &str =
        "CREATE TABLE active_users AS SELECT * FROM users WHERE active = TRUE";
}

pub mod dml {
    pub const INSERT_SIMPLE: &str =
        "INSERT INTO users (name) VALUES ('alice'), ('bob')";
    pub const UPDATE_WHERE: &str =
        "UPDATE users SET active = FALSE WHERE last_seen < NOW() - INTERVAL '30 days'";
    pub const DELETE_WHERE: &str = "DELETE FROM users WHERE id = 1";
}

pub mod types {
    pub const SELECT_BOOL: &str = "SELECT TRUE, FALSE, NULL::BOOLEAN";
    pub const SELECT_TEXT: &str = "SELECT 'hello'::TEXT, name::VARCHAR FROM users";
    pub const SELECT_ARRAY: &str = "SELECT ARRAY[1, 2, 3], tags FROM posts";
    pub const SELECT_INTERVAL: &str = "SELECT INTERVAL '1 day' + NOW()";
}

pub mod funcs {
    pub const NOW: &str = "SELECT NOW()";
    pub const RANDOM: &str = "SELECT RANDOM()";
    pub const STRING_AGG: &str =
        "SELECT STRING_AGG(name, ',') FROM users GROUP BY tenant_id";
    pub const EXTRACT: &str = "SELECT EXTRACT(YEAR FROM created_at) FROM events";
    pub const COALESCE: &str = "SELECT COALESCE(name, email, 'anon') FROM users";
}

pub mod joins {
    pub const FULL_OUTER: &str =
        "SELECT u.id, o.id FROM users u FULL OUTER JOIN orders o ON o.user_id = u.id";
    pub const LATERAL: &str =
        "SELECT * FROM users u, LATERAL (SELECT * FROM orders WHERE user_id = u.id) o";
}

pub mod ctes {
    pub const SIMPLE: &str =
        "WITH active AS (SELECT * FROM users WHERE active) SELECT * FROM active";
    pub const RECURSIVE: &str = "WITH RECURSIVE t(n) AS (\
        SELECT 1 UNION ALL SELECT n + 1 FROM t WHERE n < 10\
    ) SELECT sum(n) FROM t";
}

pub mod windows {
    pub const ROW_NUMBER: &str =
        "SELECT ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at) FROM events";
    pub const LEAD_LAG: &str =
        "SELECT LAG(amount, 1) OVER (ORDER BY ts), LEAD(amount, 1) OVER (ORDER BY ts) FROM tx";
}

pub mod pagination {
    pub const LIMIT_OFFSET: &str = "SELECT * FROM users LIMIT 10 OFFSET 20";
}

pub mod malformed {
    pub const SYNTAX_ERROR: &str = "SELEKT * FORM users";
    pub const UNCLOSED_STRING: &str = "SELECT 'unterminated";
    pub const EMPTY: &str = "";
}
