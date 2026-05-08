// Redirect every `import "sqlite3"` to a bun:sqlite-backed shim. The native
// sqlite3 addon (`.node` binding) cannot load from inside `bun build --compile`
// output's virtual FS, so the shim substitutes a pure-JS implementation that
// preserves node-sqlite3's variadic callback contract.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BunPlugin } from "bun";

const SHIM_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"sqlite3-bun-shim.cjs",
);

export const redirectSqlite3: BunPlugin = {
	name: "redirect-sqlite3",
	setup(build) {
		build.onResolve({ filter: /^sqlite3$/ }, () => ({ path: SHIM_PATH }));
		build.onResolve(
			{ filter: /[\\/]node_modules[\\/]sqlite3[\\/]lib[\\/]sqlite3\.js$/ },
			() => ({ path: SHIM_PATH }),
		);
	},
};
