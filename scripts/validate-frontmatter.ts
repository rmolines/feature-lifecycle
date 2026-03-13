#!/usr/bin/env bun
/**
 * Validates frontmatter of all existing initiative documents against Zod schemas.
 * Run after migration: bun scripts/validate-frontmatter.ts
 */
import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parseDocument } from "../src/parser.js";
import { SCHEMAS } from "../src/schemas.js";

const root = join(homedir(), ".claude", "initiatives");

if (!existsSync(root)) {
  console.log("No initiatives directory found.");
  process.exit(0);
}

let total = 0;
let valid = 0;
let invalid = 0;
let skipped = 0;
const errors: Array<{ path: string; issues: string[] }> = [];

const projects = readdirSync(root).filter((e) => {
  const full = join(root, e);
  return statSync(full).isDirectory() && !e.startsWith("_");
});

for (const project of projects) {
  const projectDir = join(root, project);
  const entries = readdirSync(projectDir);

  for (const entry of entries) {
    const entryPath = join(projectDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    // Check top-level docs (vision.md at project level is handled below)
    const dirs = entry === "archived" ? [] : [entryPath];

    // Handle archived subdirs
    if (entry === "archived") {
      const archivedEntries = readdirSync(entryPath).filter(
        (e) => statSync(join(entryPath, e)).isDirectory()
      );
      for (const ae of archivedEntries) {
        dirs.push(join(entryPath, ae));
      }
    }

    for (const dir of dirs) {
      const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const schema = SCHEMAS[file];
        if (!schema) {
          skipped++;
          continue;
        }

        total++;
        const filePath = join(dir, file);
        try {
          const doc = await parseDocument(filePath);
          const result = schema.safeParse(doc.data);
          if (result.success) {
            valid++;
          } else {
            invalid++;
            errors.push({
              path: filePath.replace(root + "/", ""),
              issues: result.error.issues.map(
                (i) => `${i.path.join(".")}: ${i.message}`
              ),
            });
          }
        } catch (err) {
          invalid++;
          errors.push({
            path: filePath.replace(root + "/", ""),
            issues: [String(err)],
          });
        }
      }

      // Check cycles/ subdirectory
      const cyclesDir = join(dir, "cycles");
      if (existsSync(cyclesDir) && statSync(cyclesDir).isDirectory()) {
        const cycleFiles = readdirSync(cyclesDir).filter((f) =>
          f.endsWith(".md")
        );
        const cycleSchema = SCHEMAS["cycle.md"];
        for (const cf of cycleFiles) {
          total++;
          const cfPath = join(cyclesDir, cf);
          try {
            const doc = await parseDocument(cfPath);
            const result = cycleSchema.safeParse(doc.data);
            if (result.success) {
              valid++;
            } else {
              invalid++;
              errors.push({
                path: cfPath.replace(root + "/", ""),
                issues: result.error.issues.map(
                  (i) => `${i.path.join(".")}: ${i.message}`
                ),
              });
            }
          } catch (err) {
            invalid++;
            errors.push({
              path: cfPath.replace(root + "/", ""),
              issues: [String(err)],
            });
          }
        }
      }
    }
  }

  // Check project-level vision.md
  const visionPath = join(projectDir, "vision.md");
  if (existsSync(visionPath)) {
    total++;
    const schema = SCHEMAS["vision.md"];
    try {
      const doc = await parseDocument(visionPath);
      const result = schema.safeParse(doc.data);
      if (result.success) {
        valid++;
      } else {
        invalid++;
        errors.push({
          path: visionPath.replace(root + "/", ""),
          issues: result.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`
          ),
        });
      }
    } catch (err) {
      invalid++;
      errors.push({
        path: visionPath.replace(root + "/", ""),
        issues: [String(err)],
      });
    }
  }
}

console.log(`\nFrontmatter validation results:`);
console.log(`  Total:   ${total}`);
console.log(`  Valid:   ${valid}`);
console.log(`  Invalid: ${invalid}`);
console.log(`  Skipped: ${skipped} (no schema)`);

if (errors.length > 0) {
  console.log(`\nErrors:`);
  for (const e of errors) {
    console.log(`  ${e.path}`);
    for (const issue of e.issues) {
      console.log(`    - ${issue}`);
    }
  }
}

process.exit(invalid > 0 ? 1 : 0);
