CREATE TABLE person (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO person (first_name, last_name, email) VALUES
  ('Alice', 'Smith', 'alice@example.com'),
  ('Bob', 'Jones', 'bob@example.com'),
  ('Carol', 'Williams', 'carol@example.com');
