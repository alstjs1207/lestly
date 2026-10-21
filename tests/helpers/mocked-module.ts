import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";

/** Run the real handler source with explicit dependencies and no runtime network access. */
export function loadMockedModule<T>(
  sourceUrl: URL,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {},
): T {
  const { outputText } = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
    fileName: sourceUrl.pathname,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} };
  new Script(outputText, { filename: sourceUrl.pathname }).runInNewContext({
    module,
    exports: module.exports,
    Request,
    Response,
    Headers,
    TextEncoder,
    TextDecoder,
    AbortSignal,
    crypto: globalThis.crypto,
    console: { error() {}, log() {} },
    require(id: string) {
      if (!Object.hasOwn(dependencies, id)) {
        throw new Error(`Unmocked dependency: ${id}`);
      }
      return dependencies[id];
    },
    fetch() {
      throw new Error("Unmocked network access forbidden");
    },
    ...globals,
  });
  return module.exports as T;
}
