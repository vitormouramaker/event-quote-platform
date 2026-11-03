const fs = require("fs");
const os = require("os");
const path = require("path");
const ts = require("typescript");

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "src", "features", "budgets", "migration");
const outFile = path.join(sourceDir, "canonicalSeed.bundle.json");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "canonical-seed-"));

function transpileFile(inputFile, outputFile) {
  const source = fs.readFileSync(inputFile, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: path.basename(inputFile),
  });
  fs.writeFileSync(outputFile, result.outputText, "utf8");
}

try {
  transpileFile(path.join(sourceDir, "canonicalCatalog.ts"), path.join(tempDir, "canonicalCatalog.js"));
  transpileFile(path.join(sourceDir, "canonicalSeed.ts"), path.join(tempDir, "canonicalSeed.js"));

  const { canonicalSeedBundle } = require(path.join(tempDir, "canonicalSeed.js"));
  fs.writeFileSync(outFile, `${JSON.stringify(canonicalSeedBundle, null, 2)}\n`, "utf8");
  console.log(`Canonical seed exportado em ${path.relative(projectRoot, outFile)}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
