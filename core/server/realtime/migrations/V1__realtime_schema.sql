-- V1__realtime_schema.sql
-- Vendored Supabase Realtime WALRUS schema (the `realtime` Postgres schema).
--
-- Source of truth: pg_dump of the consolidated `realtime` schema after replaying
-- all 79 upstream tenant migrations against Postgres 16 (see task-2 handoff).
--
-- Deviations from upstream, applied deliberately here:
--   * realtime.messages is a PLAIN uuid-keyed table (upstream partitions it by day).
--     The final send()/send_binary() insert a uuid id and create no partitions, so a
--     plain table matches their behaviour. The dump's partitioned bigint messages
--     table and its sequences are intentionally NOT copied.
--   * realtime.list_changes(...) is dropped — the wal2json polling path is unused
--     (trex decodes pgoutput in JS), and keeping it would imply a wal2json dependency.
--   * Ownership / ALTER ... OWNER TO supabase_realtime_admin lines are omitted.
--   * Grants target trex's PG roles (anon/authenticated/service_role).
--   * Publications supabase_realtime (empty) and trex_realtime_messages are added.
--
-- Idempotent / re-runnable: CREATE OR REPLACE FUNCTION, IF NOT EXISTS on tables and
-- indexes, DO $$ IF NOT EXISTS (pg_type ...) guards for types, CREATE OR REPLACE
-- TRIGGER, and IF NOT EXISTS publication guards.

CREATE SCHEMA IF NOT EXISTS realtime;

--
-- Types (guarded so re-runs are no-ops)
--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'realtime' AND t.typname = 'action') THEN
    CREATE TYPE realtime.action AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ERROR');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'realtime' AND t.typname = 'equality_op') THEN
    CREATE TYPE realtime.equality_op AS ENUM (
      'eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in',
      'like', 'ilike', 'is', 'match', 'imatch', 'isdistinct'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'realtime' AND t.typname = 'user_defined_filter') THEN
    CREATE TYPE realtime.user_defined_filter AS (
      column_name text,
      op realtime.equality_op,
      value text,
      negate boolean
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'realtime' AND t.typname = 'wal_column') THEN
    CREATE TYPE realtime.wal_column AS (
      name text,
      type_name text,
      type_oid oid,
      value jsonb,
      is_pkey boolean,
      is_selectable boolean
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'realtime' AND t.typname = 'wal_rls') THEN
    CREATE TYPE realtime.wal_rls AS (
      wal jsonb,
      is_rls_enabled boolean,
      subscription_ids uuid[],
      errors text[]
    );
  END IF;
END $$;

--
-- Leaf helper functions (no cross-function deps) first, so SQL-language functions
-- that reference them can be validated at creation time.
--

CREATE OR REPLACE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


CREATE OR REPLACE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
    select nullif(current_setting('realtime.topic', true), '')::text;
    $$;


CREATE OR REPLACE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      -- Prefix `\`, `,`, `.`, and any whitespace with `\`
      SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
    $$;


CREATE OR REPLACE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      SELECT
        realtime.wal2json_escape_identifier(nsp.nspname::text)
        || '.'
        || realtime.wal2json_escape_identifier(pc.relname::text)
      FROM pg_class pc
      JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
      WHERE pc.oid = entity
    $$;


CREATE OR REPLACE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


CREATE OR REPLACE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    /*
    Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
    */
    declare
        op_symbol text = (
            case
                when op = 'eq' then '='
                when op = 'neq' then '!='
                when op = 'lt' then '<'
                when op = 'lte' then '<='
                when op = 'gt' then '>'
                when op = 'gte' then '>='
                when op = 'in' then '= any'
                else 'UNKNOWN OP'
            end
        );
        res boolean;
    begin
        execute format(
            'select %L::'|| type_::text || ' ' || op_symbol
            || ' ( %L::'
            || (
                case
                    when op = 'in' then type_::text || '[]'
                    else type_::text end
            )
            || ')', val_1, val_2) into res;
        return res;
    end;
    $$;


CREATE OR REPLACE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
    declare
        op_symbol text;
        res boolean;
    begin
        -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
        if op = 'isdistinct' then
            execute format(
                'select %L::%s %s %L::%s',
                val_1,
                type_::text,
                case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
                val_2,
                type_::text
            ) into res;
            return res;
        end if;

        -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
        if op = 'is' then
            if val_2 not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            execute format(
                'select %L::%s %s %s',
                val_1,
                type_::text,
                case when negate then 'IS NOT' else 'IS' end,
                upper(val_2)
            ) into res;
            return res;
        end if;

        op_symbol = case
            when op = 'eq'    then '='
            when op = 'neq'   then '!='
            when op = 'lt'    then '<'
            when op = 'lte'   then '<='
            when op = 'gt'    then '>'
            when op = 'gte'   then '>='
            when op = 'in'    then '= any'
            when op = 'like'   then 'LIKE'
            when op = 'ilike'  then 'ILIKE'
            when op = 'match'  then '~'
            when op = 'imatch' then '~*'
            else null
        end;

        if op_symbol is null then
            raise exception 'unsupported equality operator: %', op::text;
        end if;

        execute format(
            'select %L::%s %s (%L::%s)',
            val_1,
            type_::text,
            op_symbol,
            val_2,
            case when op = 'in' then type_::text || '[]' else type_::text end
        ) into res;

        return case when negate then not res else res end;
    end;
    $$;


CREATE OR REPLACE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
        select
            filters is null
            or array_length(filters, 1) is null
            or coalesce(
                count(col.name) = count(1)
                and sum(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                        val_1:=col.value #>> '{}',
                        val_2:=f.value,
                        negate:=coalesce(f.negate, false)
                    )::int
                ) filter (where col.name is not null) = count(col.name),
                false
            )
        from
            unnest(filters) f
            left join unnest(columns) col
                on f.column_name = col.name;
    $$;


CREATE OR REPLACE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


CREATE OR REPLACE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    declare
        col_names text[] = coalesce(
                array_agg(a.attname order by a.attnum),
                '{}'::text[]
            )
            from
                pg_catalog.pg_attribute a
            where
                a.attrelid = new.entity
                and a.attnum > 0
                and not a.attisdropped
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    a.attrelid,
                    a.attnum,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;
        in_val jsonb;
        selected_col text;
    begin
        for filter in select * from unnest(new.filters) loop
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            elsif filter.op = 'is'::realtime.equality_op then
                -- `is` requires a keyword RHS rather than a typed literal
                if filter.value not in ('null', 'true', 'false', 'unknown') then
                    raise exception 'invalid value for is filter: must be null, true, false, or unknown';
                end if;
                -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
                -- operand. Reject the non-null keywords on non-boolean columns here so they
                -- don't abort apply_rls at WAL time.
                if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                    raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
                end if;
            elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
                -- like/ilike apply the text pattern operator (~~); reject column types that
                -- have no such operator instead of failing at WAL time
                if not exists (
                    select 1 from pg_catalog.pg_operator
                    where oprname = '~~' and oprleft = col_type
                ) then
                    raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
                end if;
            elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
                -- match/imatch apply the regex operators ~ / ~*; reject column types that have
                -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
                -- like/ilike guard above.
                if not exists (
                    select 1 from pg_catalog.pg_operator
                    where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                      and oprleft = col_type
                      and oprright = col_type
                      and oprresult = 'boolean'::regtype
                ) then
                    raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
                end if;
                -- validate the regex eagerly so a bad pattern is rejected here, not inside
                -- apply_rls where it would abort the WAL stream for the entity
                begin
                    perform '' ~ filter.value;
                exception when others then
                    raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
                end;
            else
                -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
                perform realtime.cast(filter.value, col_type);
            end if;
        end loop;

        if new.selected_columns is not null then
            for selected_col in select * from unnest(new.selected_columns) loop
                if not selected_col = any(col_names) then
                    raise exception 'invalid column for select %', selected_col;
                end if;
            end loop;
        end if;

        -- Apply consistent order to filters so the unique constraint can't be tricked by a
        -- different filter order. negate is part of the sort key.
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value, f.negate),
            '{}'
        ) from unnest(new.filters) f;

        new.selected_columns = (
            select array_agg(c order by c)
            from unnest(new.selected_columns) c
        );

        return new;
    end;
    $$;


--
-- subscription table + trigger + indexes.
-- Defined before apply_rls because apply_rls declares a variable of the
-- table's composite type (realtime.subscription[]), which must already exist.
--

CREATE TABLE IF NOT EXISTS realtime.subscription (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    selected_columns text[],
    action_filter text NOT NULL DEFAULT '*' CHECK (action_filter IN ('*', 'INSERT', 'UPDATE', 'DELETE')),
    CONSTRAINT pk_subscription PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_realtime_subscription_entity
    ON realtime.subscription USING btree (entity);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_subscription_id_entity_filters_action_filter_key
    ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);

CREATE OR REPLACE TRIGGER tr_check_filters
    BEFORE INSERT OR UPDATE ON realtime.subscription
    FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();

--
-- messages table (plain uuid-keyed; deviation from upstream partitioned table)
--

CREATE TABLE IF NOT EXISTS realtime.messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    binary_payload bytea,
    event text,
    private boolean DEFAULT false,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS messages_topic_index ON realtime.messages (topic);

--
-- apply_rls and the send() broadcast helpers (reference the tables above).
--

CREATE OR REPLACE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
    declare
        -- Regclass of the table e.g. public.notes
        entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

        -- I, U, D, T: insert, update ...
        action realtime.action = (
            case wal ->> 'action'
                when 'I' then 'INSERT'
                when 'U' then 'UPDATE'
                when 'D' then 'DELETE'
                else 'ERROR'
            end
        );

        -- Is row level security enabled for the table
        is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

        subscriptions realtime.subscription[] = array_agg(subs)
            from
                realtime.subscription subs
            where
                subs.entity = entity_
                -- Filter by action early - only get subscriptions interested in this action
                -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
                and (subs.action_filter = '*' or subs.action_filter = action::text);

        -- Subscription vars
        working_role regrole;
        working_selected_columns text[];
        claimed_role regrole;
        claims jsonb;

        subscription_id uuid;
        subscription_has_access bool;
        visible_to_subscription_ids uuid[] = '{}';

        -- structured info for wal's columns
        columns realtime.wal_column[];
        -- previous identity values for update/delete
        old_columns realtime.wal_column[];

        error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

        -- Primary jsonb output for record
        output jsonb;

        -- Loop record for iterating unique roles (outer loop)
        role_record record;
        -- Loop record for iterating unique selected_columns within a role (inner loop)
        cols_record record;
        -- Subscription ids visible at the role level (before fanning out by selected_columns)
        visible_role_sub_ids uuid[] = '{}';

    begin
        perform set_config('role', null, true);

        columns =
            array_agg(
                (
                    x->>'name',
                    x->>'type',
                    x->>'typeoid',
                    realtime.cast(
                        (x->'value') #>> '{}',
                        coalesce(
                            (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                            (x->>'type')::regtype
                        )
                    ),
                    (pks ->> 'name') is not null,
                    true
                )::realtime.wal_column
            )
            from
                jsonb_array_elements(wal -> 'columns') x
                left join jsonb_array_elements(wal -> 'pk') pks
                    on (x ->> 'name') = (pks ->> 'name');

        old_columns =
            array_agg(
                (
                    x->>'name',
                    x->>'type',
                    x->>'typeoid',
                    realtime.cast(
                        (x->'value') #>> '{}',
                        coalesce(
                            (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                            (x->>'type')::regtype
                        )
                    ),
                    (pks ->> 'name') is not null,
                    true
                )::realtime.wal_column
            )
            from
                jsonb_array_elements(wal -> 'identity') x
                left join jsonb_array_elements(wal -> 'pk') pks
                    on (x ->> 'name') = (pks ->> 'name');

        for role_record in
            select claims_role
            from (select distinct claims_role from unnest(subscriptions)) t
            order by claims_role::text
        loop
            working_role := role_record.claims_role;

            -- Update `is_selectable` for columns and old_columns (once per role)
            columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(columns) c;

            old_columns =
                    array_agg(
                        (
                            c.name,
                            c.type_name,
                            c.type_oid,
                            c.value,
                            c.is_pkey,
                            pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                        )::realtime.wal_column
                    )
                    from
                        unnest(old_columns) c;

            if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
                -- Fan out 400 error per distinct selected_columns for this role
                for cols_record in
                    select selected_columns
                    from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                    order by coalesce(array_to_string(selected_columns, ','), '')
                loop
                    working_selected_columns := cols_record.selected_columns;
                    return next (
                        jsonb_build_object(
                            'schema', wal ->> 'schema',
                            'table', wal ->> 'table',
                            'type', action
                        ),
                        is_rls_enabled,
                        (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                        array['Error 400: Bad Request, no primary key']
                    )::realtime.wal_rls;
                end loop;

            -- The claims role does not have SELECT permission to the primary key of entity
            elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
                -- Fan out 401 error per distinct selected_columns for this role
                for cols_record in
                    select selected_columns
                    from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                    order by coalesce(array_to_string(selected_columns, ','), '')
                loop
                    working_selected_columns := cols_record.selected_columns;
                    return next (
                        jsonb_build_object(
                            'schema', wal ->> 'schema',
                            'table', wal ->> 'table',
                            'type', action
                        ),
                        is_rls_enabled,
                        (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                        array['Error 401: Unauthorized']
                    )::realtime.wal_rls;
                end loop;

            else
                -- Create the prepared statement (once per role)
                if is_rls_enabled and action <> 'DELETE' then
                    if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                        deallocate walrus_rls_stmt;
                    end if;
                    execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
                end if;

                -- Collect all visible subscription IDs for this role (filter check + RLS check)
                visible_role_sub_ids = '{}';

                for subscription_id, claims in (
                        select
                            subs.subscription_id,
                            subs.claims
                        from
                            unnest(subscriptions) subs
                        where
                            subs.entity = entity_
                            and subs.claims_role = working_role
                            and (
                                realtime.is_visible_through_filters(columns, subs.filters)
                                or (
                                  action = 'DELETE'
                                  and realtime.is_visible_through_filters(old_columns, subs.filters)
                                )
                            )
                ) loop

                    if not is_rls_enabled or action = 'DELETE' then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    else
                        -- Check if RLS allows the role to see the record
                        perform
                            -- Trim leading and trailing quotes from working_role because set_config
                            -- doesn't recognize the role as valid if they are included
                            set_config('role', trim(both '"' from working_role::text), true),
                            set_config('request.jwt.claims', claims::text, true);

                        execute 'execute walrus_rls_stmt' into subscription_has_access;

                        if subscription_has_access then
                            visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                        end if;
                    end if;
                end loop;

                perform set_config('role', null, true);

                -- Inner loop: per distinct selected_columns for this role
                for cols_record in
                    select selected_columns
                    from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                    order by coalesce(array_to_string(selected_columns, ','), '')
                loop
                    working_selected_columns := cols_record.selected_columns;

                    output = jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action,
                        'commit_timestamp', to_char(
                            ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                        ),
                        'columns', (
                            select
                                jsonb_agg(
                                    jsonb_build_object(
                                        'name', pa.attname,
                                        'type', pt.typname
                                    )
                                    order by pa.attnum asc
                                )
                            from
                                pg_attribute pa
                                join pg_type pt
                                    on pa.atttypid = pt.oid
                                left join (
                                    select unnest(conkey) as pkey_attnum
                                    from pg_constraint
                                    where conrelid = entity_ and contype = 'p'
                                ) pk on pk.pkey_attnum = pa.attnum
                            where
                                attrelid = entity_
                                and attnum > 0
                                and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                                and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                        )
                    )
                    -- Add "record" key for insert and update
                    || case
                        when action in ('INSERT', 'UPDATE') then
                            jsonb_build_object(
                                'record',
                                (
                                    select
                                        jsonb_object_agg(
                                            -- if unchanged toast, get column name and value from old record
                                            coalesce((c).name, (oc).name),
                                            case
                                                when (c).name is null then (oc).value
                                                else (c).value
                                            end
                                        )
                                    from
                                        unnest(columns) c
                                        full outer join unnest(old_columns) oc
                                            on (c).name = (oc).name
                                    where
                                        coalesce((c).is_selectable, (oc).is_selectable)
                                        and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                        else '{}'::jsonb
                    end
                    -- Add "old_record" key for update and delete
                    || case
                        when action = 'UPDATE' then
                            jsonb_build_object(
                                    'old_record',
                                    (
                                        select jsonb_object_agg((c).name, (c).value)
                                        from unnest(old_columns) c
                                        where
                                            (c).is_selectable
                                            and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    )
                                )
                        when action = 'DELETE' then
                            jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                        and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                                )
                            )
                        else '{}'::jsonb
                    end;

                    -- Filter visible_role_sub_ids to those matching the current selected_columns group
                    visible_to_subscription_ids = coalesce(
                        (
                            select array_agg(s.subscription_id)
                            from unnest(subscriptions) s
                            where s.claims_role = working_role
                              and (s.selected_columns is not distinct from working_selected_columns)
                              and s.subscription_id = any(visible_role_sub_ids)
                        ),
                        '{}'::uuid[]
                    );

                    return next (
                        output,
                        is_rls_enabled,
                        visible_to_subscription_ids,
                        case
                            when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                            else '{}'
                        end
                    )::realtime.wal_rls;
                end loop;

            end if;
        end loop;

        perform set_config('role', null, true);
    end;
    $$;


CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
      generated_id uuid;
      final_payload jsonb;
    BEGIN
      BEGIN
        generated_id := gen_random_uuid();

        -- Check if payload has an 'id' key, if not, add the generated UUID
        IF payload ? 'id' THEN
          final_payload := payload;
        ELSE
          final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
        END IF;

        -- Set the topic configuration
        EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

        INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
        VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
      END;
    END;
    $$;


CREATE OR REPLACE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
      generated_id uuid;
    BEGIN
      BEGIN
        generated_id := gen_random_uuid();

        EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

        INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
        VALUES (generated_id, payload, event, topic, private, 'broadcast');
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
      END;
    END;
    $$;

--
-- Grants for trex PG roles.
-- RLS on realtime.messages is added by later tasks (Task 10 authz tests), not here.
--

GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON realtime.messages TO anon, authenticated, service_role;
GRANT SELECT ON realtime.subscription TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION realtime.topic() TO anon, authenticated, service_role;

--
-- Publications (idempotent)
--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'trex_realtime_messages') THEN
    CREATE PUBLICATION trex_realtime_messages FOR TABLE realtime.messages;
  END IF;
END $$;
