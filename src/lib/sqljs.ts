/**
 * sql.js (SQLite compiled to WebAssembly), for reading Anki packages. The
 * import page loads this module only when an Anki file is chosen, so nobody
 * else downloads it.
 */
import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

let loading: Promise<SqlJsStatic> | undefined;

export function loadSqlJs(): Promise<SqlJsStatic> {
    loading ??= initSqlJs({ locateFile: () => wasmUrl }).catch((e) => {
        loading = undefined;
        throw e;
    });
    return loading;
}
