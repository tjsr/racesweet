import adodb from 'node-adodb';

const accessDbString = (dbFile: string, password?: string): string => {
  let connectionString = `Provider=Microsoft.Jet.OLEDB.4.0;Data Source="${dbFile}";`;
  if (password) {
    connectionString += `Jet OLEDB:Database Password=${password};`;
  }
  return connectionString;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const accessQueryUsingConnection = <D extends object>(conn: adodb.open, sql: string, params: any[] = []) => new Promise<D[]>((resolve, reject) => {
  if (params.length > 0) {
    // Replace each '?' in the SQL with the corresponding parameter, properly escaped
    params.forEach(param => {
      let value = '?';
      if (Array.isArray(param)) {
        value = `${param.map(p => typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : p).join(', ')}`;
      } else if (typeof param === 'string') {
        value = `'${param.replace(/'/g, "''")}'`;
      } else {
        value = param;
      }
      sql = sql.replace('?', value);
    });
  }
  console.log(`Executing SQL: ${sql} with params: ${JSON.stringify(params)}`);
  conn.query(sql).then((data) => {
    // console.log(data);
    console.log(`Query executed successfully: ${(data as unknown[]).length} rows returned`);
    resolve(data as D[]);
  }).catch(err => {
    console.error(JSON.stringify(err));
    reject(err);
  });
});

export const getConnection = (dbFile: string, password?: string) => {
  const cn = accessDbString(dbFile, password);
  const conn = adodb.open(cn);
  return conn;
};

export const quickAccessQuery = (dbFile: string, password: string | undefined, sql: string, params: unknown[] = []) => {
  const conn = getConnection(dbFile, password);
  return accessQueryUsingConnection(conn, sql, params);
};
