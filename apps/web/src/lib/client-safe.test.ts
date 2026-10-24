import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los archivos de `lib/` y `components/` los puede importar código que corre en el navegador. Si
 * uno trae un módulo de Node (`node:crypto`, `node:fs`…), el empaquetador lo reemplaza por un
 * polyfill: así, un solo import de `node:crypto` sumó ~440 KB de JavaScript a la ficha del
 * arquero, el alta y la importación (hito 7, rendimiento). Si un archivo necesita Node, tiene que
 * declararse `import "server-only"`: desde ahí, importarlo desde el navegador rompe el build.
 */
const ROOT = join(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("los archivos compartidos con el navegador no traen módulos de Node", () => {
  const NODE_IMPORT =
    /from\s+["'](?:node:[a-z/_]+|crypto|fs|path|os|child_process|stream|buffer)["']/;
  const compartidos = [...files(join(ROOT, "lib")), ...files(join(ROOT, "components"))];

  it("hay archivos que revisar", () => {
    expect(compartidos.length).toBeGreaterThan(20);
  });

  for (const path of compartidos) {
    const source = readFileSync(path, "utf8");
    if (!NODE_IMPORT.test(source)) continue;
    it(`${path.slice(ROOT.length + 1).replaceAll("\\", "/")} usa Node y se declara server-only`, () => {
      expect(source).toMatch(/^import "server-only";/m);
    });
  }
});
