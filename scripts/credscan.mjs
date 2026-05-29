import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !isIgnoredPath(file));

const findings = [];
const secretPatterns = [
  {
    name: "OpenAI API key",
    regex: /sk-[A-Za-z0-9_-]{20,}/g
  },
  {
    name: "GitHub token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g
  },
  {
    name: "AWS access key",
    regex: /\bA(?:KIA|SIA)[A-Z0-9]{16}\b/g
  },
  {
    name: "Postgres connection string with embedded password",
    regex: /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@[^/\s]+\/[^\s"'`]+/g
  },
  {
    name: "Secret environment assignment",
    regex: /\b[A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*\s*=\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/g
  }
];

for (const file of trackedFiles) {
  let content;

  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of secretPatterns) {
    for (const match of content.matchAll(pattern.regex)) {
      const value = match[0];

      if (isAllowedValue(value)) {
        continue;
      }

      findings.push({
        file,
        name: pattern.name,
        line: lineNumber(content, match.index ?? 0)
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Credential scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.name}`);
  }
  process.exit(1);
}

console.log(`Credential scan passed across ${trackedFiles.length} tracked files.`);

function isIgnoredPath(file) {
  return (
    file.startsWith(".git/") ||
    file.startsWith(".next/") ||
    file.startsWith("node_modules/") ||
    file.endsWith("package-lock.json")
  );
}

function isAllowedValue(value) {
  const lowerValue = value.toLowerCase();

  return (
    lowerValue.includes("[your-password]") ||
    lowerValue.includes("postgres:postgres@localhost") ||
    lowerValue.includes("postgres://postgres:tmkdmtad@2@localhost") ||
    lowerValue.includes("example") ||
    lowerValue.includes("placeholder")
  );
}

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}
