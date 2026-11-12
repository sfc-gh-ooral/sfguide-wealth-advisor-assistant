// Live mode: Snowflake connections, one per persona role, so the row access policies in
// sql/setup.sql decide what each "View as" persona can see. Server only.
// Every statement uses bind variables; nothing user-supplied is concatenated into SQL.
import snowflake from 'snowflake-sdk';

snowflake.configure({ logLevel: 'ERROR' });

const pool = new Map<string, Promise<snowflake.Connection>>();

export function isSnowflakeConfigured(): boolean {
  return !!(process.env.SNOWFLAKE_ACCOUNT && process.env.SNOWFLAKE_USERNAME &&
    (process.env.SNOWFLAKE_PRIVATE_KEY_PATH || process.env.SNOWFLAKE_TOKEN || process.env.SNOWFLAKE_BROWSER_AUTH === 'true'));
}

function config(role: string): snowflake.ConnectionOptions {
  const base: snowflake.ConnectionOptions = {
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USERNAME!,
    role,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? 'WAA_WH',
    database: process.env.SNOWFLAKE_DATABASE ?? 'WEALTH_ADVISOR_DEMO',
    schema: 'BOOK',
    clientSessionKeepAlive: true,
  };
  // Key-pair auth is recommended. A programmatic access token or browser SSO also work for local testing.
  if (process.env.SNOWFLAKE_PRIVATE_KEY_PATH) return { ...base, authenticator: 'SNOWFLAKE_JWT', privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH };
  if (process.env.SNOWFLAKE_TOKEN) return { ...base, authenticator: 'PROGRAMMATIC_ACCESS_TOKEN', token: process.env.SNOWFLAKE_TOKEN };
  return { ...base, authenticator: 'EXTERNALBROWSER' };
}

async function connect(role: string): Promise<snowflake.Connection> {
  const conn = snowflake.createConnection(config(role));
  await new Promise<void>((resolve, reject) => {
    const cb = (err: snowflake.SnowflakeError | undefined) => (err ? reject(err) : resolve());
    if (process.env.SNOWFLAKE_BROWSER_AUTH === 'true' && !process.env.SNOWFLAKE_PRIVATE_KEY_PATH && !process.env.SNOWFLAKE_TOKEN) conn.connectAsync(cb);
    else conn.connect(cb);
  });
  // Only the persona role counts: no secondary roles, so CURRENT_ROLE() is the whole story.
  await run(conn, 'USE SECONDARY ROLES NONE');
  return conn;
}

function run<T>(conn: snowflake.Connection, sqlText: string, binds?: snowflake.Binds): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.execute({ sqlText, binds, complete: (err, _s, rows) => (err ? reject(new Error(err.message)) : resolve((rows ?? []) as T[])) });
  });
}

export async function query<T = Record<string, unknown>>(role: string, sqlText: string, binds?: snowflake.Binds): Promise<T[]> {
  let p = pool.get(role);
  if (!p) { p = connect(role); pool.set(role, p); p.catch(() => pool.delete(role)); }
  const conn = await p;
  if (!conn.isUp()) { pool.delete(role); return query(role, sqlText, binds); }
  return run<T>(conn, sqlText, binds);
}
