/**
 * Typert Remote gateway exposing the memory store to the web client.
 *
 * Remote methods are registered without the decorator syntax: the exported
 * `Remote(name)` decorator factory is invoked manually with a minimal
 * standard-decorator context, which is exactly what the compiler-generated
 * decorator would do (marker initializer recorded per prototype, run per
 * instance in the constructor). Keeps the package build-free plain JS.
 *
 * Contract: methods return BARE values validated by the declared result
 * schemas; failures throw plain Errors (rc.6 has no RemoteError vocabulary —
 * the gateway folds any throw into the wire's `{ ok: false, error }` envelope
 * with an `internal` code and the message intact).
 */
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** Unwrap a `{ok,value}|{ok,error}` store result into a bare value or a throw. */
function unwrap(result) {
	if (result?.ok === true) return result.value;
	const error = result?.error;
	throw new Error(error?.message ?? "memory store failed");
}

/**
 * @param store - memory store created by `createMemoryStore`.
 * @returns the gateway Service class bound to that store.
 */
export function createMemoryGateway(store) {
	const initializers = [];

	/** Record one Remote marker for `method` using the exported decorator factory. */
	function markRemote(method) {
		const decorator = Remote(method);
		decorator(undefined, {
			name: method,
			private: false,
			static: false,
			addInitializer(fn) {
				initializers.push(fn);
			},
		});
	}

	class ZcodeMemoryGateway extends TypertRemoteService {
		static inject = [];

		constructor(ctx) {
			super(ctx, "zcodeMemory");
			for (const init of initializers) init.call(this);
		}

		status() {
			return store.status();
		}

		listProjects() {
			return unwrap(store.listProjects());
		}

		setRoot(request) {
			return unwrap(store.setRoot(request.memoryRoot));
		}

		listFiles(request) {
			return unwrap(store.listFiles(request));
		}

		readFile(request) {
			return unwrap(store.readFile(request));
		}
	}

	for (const method of ["status", "listProjects", "setRoot", "listFiles", "readFile"]) {
		markRemote(method);
	}

	return ZcodeMemoryGateway;
}
