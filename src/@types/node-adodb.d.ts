// Fallback ambient type declaration for node-adodb (Windows-only package).
// When node-adodb is installed the real package types take precedence;
// this declaration is used on platforms where the package is not installed.
declare module 'node-adodb' {
  class Connection {
    query(sql: string): Promise<unknown[]>;
    execute(sql: string): Promise<void>;
  }

  namespace adodb {
    type open = Connection;
    const open: (connectionString: string) => Connection;
  }

  export default adodb;
}
