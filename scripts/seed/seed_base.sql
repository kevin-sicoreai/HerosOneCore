-- Base sales dataset (customers + orders) for the source database.
-- Idempotent: drops & recreates each run.

BEGIN;

DROP TABLE IF EXISTS orders, customers CASCADE;

CREATE TABLE customers (
  id serial PRIMARY KEY, name text, email text, created_at timestamptz DEFAULT now()
);
INSERT INTO customers (name, email) VALUES
  ('Alice', 'a@x.com'), ('Bob', 'b@x.com'), ('Carol', NULL);

CREATE TABLE orders (
  id serial PRIMARY KEY, customer_id int REFERENCES customers(id),
  amount numeric(10,2), status text
);
INSERT INTO orders (customer_id, amount, status) VALUES
  (1, 99.50, 'paid'), (2, 150.75, 'paid'), (3, 5.00, 'pending');

COMMIT;
