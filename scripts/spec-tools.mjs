import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const readJson = (root, name) =>
  JSON.parse(readFileSync(path.join(root, name), "utf8"));
const roots = [
  "app",
  "sql",
  "supabase",
  "tests",
  "e2e",
  "scripts",
  "transactional-emails",
  "public",
  ".github/workflows",
];
const rootFiles = [
  "package.json",
  "database.types.ts",
  "instrument.server.mjs",
  "vite.config.ts",
  "react-router.config.ts",
  "playwright.config.ts",
  "drizzle.config.ts",
  "tsconfig.json",
  "components.json",
  "mdx.d.ts",
  ".nvmrc",
];

function walk(root, dir) {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "meta", ".react-router", "build"].includes(entry.name))
      return [];
    const name = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink())
      throw Error(`Source symlink needs explicit review: ${name}`);
    return entry.isDirectory() ? walk(root, name) : [name];
  });
}

export function sourceFiles(root) {
  return [
    ...roots.flatMap((dir) => walk(root, dir)),
    ...rootFiles.filter((p) => existsSync(path.join(root, p))),
  ]
    .filter(
      (p) => !p.endsWith("package-lock.json") && !p.endsWith(".result.json"),
    )
    .filter(
      (p) =>
        /\.(?:[cm]?[jt]sx?|sql|css|json|mdx|ya?ml|webmanifest)$/.test(p) ||
        p === ".nvmrc",
    )
    .sort();
}

function topicDomains(name) {
  const found = new Set();
  if (
    /booking|schedule|calendar|desktop-booking|cancellation-policy/.test(name)
  )
    found.add("booking");
  if (/booking-integrity|booking-lifecycle|reservation-db-bridge/.test(name)) {
    for (const d of [
      "recurring-schedules",
      "booking",
      "attendance",
      "notifications",
      "student-management",
    ])
      found.add(d);
  }
  if (/attendance/.test(name)) found.add("attendance");
  if (
    /student-(?:management|form|bulk|types|metadata|lifecycle|invite)|student-type/.test(
      name,
    )
  )
    found.add("student-management");
  if (
    /student-(?:learning|hours|streak|week|schedules|schedule-overview)|learning-record/.test(
      name,
    )
  )
    found.add("learning");
  if (/student-invite|auth|email-optional|avatar/.test(name))
    found.add("identity");
  if (
    /security|authorization|privileged|request-security|worker-auth|tenant_integrity/.test(
      name,
    )
  )
    found.add("access-control");
  if (/push|notification|email-idempotency/.test(name))
    found.add("notifications");
  if (/catalog|class-booking/.test(name)) found.add("catalog");
  if (/settings-section/.test(name)) found.add("organization-settings");
  if (/booking-(?:policy|window|days|times)/.test(name))
    found.add("organization-settings");
  if (/consult/.test(name)) found.add("public-service");
  if (/payment/.test(name)) found.add("payments");
  if (
    /node-runtime|dependency-hardening|ssr-stream|query-performance|service-generalization/.test(
      name,
    )
  )
    found.add("platform");
  if (/spec-tools|policy-checks|verify-local/.test(name))
    found.add("spec-governance");
  return [...found];
}

// Keep feature branches explicit: a new app/features/foo must not silently land in a catch-all.
export function classify(file) {
  if (file.startsWith("app/features/")) {
    const rest = file.slice("app/features/".length);
    if (rest.startsWith("auth/")) return ["identity"];
    if (rest.startsWith("app-settings/"))
      return ["organization-settings", "booking"];
    if (rest.startsWith("organizations/"))
      return ["student-management", "access-control"];
    if (/^(programs|instructors)\//.test(rest)) return ["catalog"];
    if (rest.startsWith("class/")) return ["catalog", "public-service"];
    if (rest.startsWith("attendance/")) return ["attendance"];
    if (/^(notifications|cron)\//.test(rest)) return ["notifications"];
    if (rest.startsWith("payments/")) return ["payments"];
    if (/^(contact|legal)\//.test(rest)) return ["public-service"];
    if (rest.startsWith("settings/")) return ["platform"];
    if (rest.startsWith("super-admin/"))
      return ["access-control", "notifications", "organization-settings"];
    if (rest.startsWith("schedules/"))
      return [
        "booking",
        ...(/learning|student-(hours|streak|week)/.test(rest)
          ? ["learning"]
          : []),
      ];
    if (rest.startsWith("users/"))
      return [
        /\/(api|components\/forms)\/|\/account\.tsx$|\/schema\.ts$|connect-provider/.test(
          rest,
        )
          ? "identity"
          : "learning",
      ];
    if (rest.startsWith("admin/")) {
      if (/\/guards\.server\.ts$|\/layouts\//.test(rest))
        return ["access-control"];
      if (/\/schedules\/|\/schedule-form\.tsx$/.test(rest))
        return ["recurring-schedules", "booking"];
      if (/\/students\/|student-(?!type-settings)/.test(rest))
        return ["student-management"];
      if (
        /\/programs\/|\/instructors\/|catalog-form|program-form|instructor-form/.test(
          rest,
        )
      )
        return ["catalog"];
      if (/settings|booking-|cancellation-policy/.test(rest))
        return ["organization-settings"];
      if (/\/organization\//.test(rest)) return ["organization-settings"];
      return ["platform", "student-management"]; // shared admin queries/dashboard/navigation
    }
    return [];
  }
  if (
    file.startsWith("app/core/lib/") &&
    /auth|supa-|guards|request-|site-origin|web-url|avatar/.test(file)
  )
    return ["access-control", "identity"];
  if (file.startsWith("app/")) return ["platform"];
  if (file.startsWith("supabase/")) return ["access-control", "notifications"];
  if (file.startsWith("transactional-emails/"))
    return ["identity", "notifications"];
  if (file === "public/push-sw.js") return ["notifications"];
  if (file.startsWith("public/")) return ["platform"];
  if (file.startsWith("sql/migrations/")) {
    const n = Number(path.basename(file).slice(0, 4));
    const mapping = {
      15: ["identity", "student-management"],
      16: ["access-control", "booking", "recurring-schedules"],
      17: ["identity"],
      18: ["student-management"],
      19: ["access-control"],
      20: ["access-control"],
      21: ["learning", "booking"],
      22: ["booking"],
      23: ["notifications"],
      24: ["student-management", "identity", "notifications"],
      25: ["student-management", "identity"],
      26: ["student-management"],
      27: ["attendance", "learning", "booking"],
      28: ["booking"],
      29: ["student-management"],
      30: ["student-management"],
      31: ["student-management"],
      32: ["booking", "attendance", "organization-settings"],
      33: ["booking"],
      34: ["booking", "organization-settings"],
      35: ["booking", "organization-settings"],
      36: ["catalog", "booking", "attendance"],
      37: ["booking", "attendance"],
      38: ["organization-settings"],
      39: ["recurring-schedules", "booking", "notifications"],
    };
    if (mapping[n]) return mapping[n];
    if (n <= 14)
      return [
        "platform",
        "access-control",
        "identity",
        "catalog",
        "booking",
        "notifications",
      ];
    return []; // new migration needs deliberate policy ownership
  }
  if (file.startsWith("sql/functions/"))
    return ["access-control", "identity", "notifications"];
  if (file.startsWith("sql/checks/") || file.startsWith("tests/")) {
    if (/helpers\/mocked-module/.test(file)) return ["platform"];
    return topicDomains(path.basename(file));
  }
  if (file.startsWith("sql/operations/"))
    return ["platform", ...topicDomains(path.basename(file))];
  if (file.startsWith("e2e/")) {
    const topics = topicDomains(file);
    if (topics.length) return topics;
    if (/admin\/students/.test(file)) return ["student-management"];
    if (/admin\/(programs|instructors)/.test(file)) return ["catalog"];
    if (/admin\/signup|users\//.test(file)) return ["identity"];
    if (/settings\//.test(file)) return ["platform"];
    return ["platform"];
  }
  if (/spec-tools|policy-checks|verify-local/.test(file))
    return ["spec-governance"];
  if (file.startsWith("scripts/")) return ["platform"];
  if (rootFiles.includes(file)) return ["platform"];
  return [];
}

export function makeIndex(root) {
  return {
    version: 1,
    files: sourceFiles(root).map((file) => ({
      path: file,
      domains: [...new Set(classify(file))].sort(),
    })),
  };
}

function safeText(root, relative) {
  if (
    typeof relative !== "string" ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).includes("..")
  )
    throw Error(`Invalid evidence path: ${relative}`);
  return readFileSync(path.join(root, relative), "utf8");
}

function specText(root, domain) {
  const current = `openspec/specs/${domain}/spec.md`;
  if (existsSync(path.join(root, current))) return safeText(root, current);
  const changes = path.join(root, "openspec/changes");
  const candidates = existsSync(changes)
    ? readdirSync(changes)
        .filter((p) => p !== "archive")
        .map((p) => `openspec/changes/${p}/specs/${domain}/spec.md`)
        .filter((p) => existsSync(path.join(root, p)))
    : [];
  if (candidates.length !== 1)
    throw Error(`Missing or ambiguous current spec: ${domain}`);
  return safeText(root, candidates[0]);
}

export function checkPolicies(root) {
  const map = readJson(root, "openspec/policy-map.json");
  if (map.version !== 1 || !Array.isArray(map.domains) || !map.domains.length)
    throw Error("Invalid policy-map schema");
  const domains = new Set(),
    ids = new Set();
  let scenarios = 0,
    automated = 0,
    sourceReviewed = 0;
  for (const domain of map.domains) {
    if (!/^[a-z][a-z0-9-]*$/.test(domain.id) || domains.has(domain.id))
      throw Error(`Invalid/duplicate domain: ${domain.id}`);
    domains.add(domain.id);
    const text = specText(root, domain.id);
    const blocks = [
      ...text.matchAll(
        /^### Requirement: ([A-Z]+-\d{3}) (.+)\n([\s\S]*?)(?=^### Requirement: |$(?![\s\S]))/gm,
      ),
    ];
    const headingCount = (text.match(/^### Requirement:/gm) ?? []).length;
    if (!blocks.length || headingCount !== blocks.length)
      throw Error(`Invalid requirement heading: ${domain.id}`);
    const requirementMap = new Map(domain.requirements.map((r) => [r.id, r]));
    if (requirementMap.size !== domain.requirements.length)
      throw Error(`Duplicate policy-map ID: ${domain.id}`);
    for (const [, id, , body] of blocks) {
      if (ids.has(id)) throw Error(`Duplicate requirement ID: ${id}`);
      ids.add(id);
      const record = requirementMap.get(id);
      if (!record) throw Error(`Unmapped requirement: ${id}`);
      requirementMap.delete(id);
      const cases = body.split(/^#### Scenario: /m).slice(1);
      if (
        !cases.length ||
        cases.some((s) => !s.includes("**WHEN**") || !s.includes("**THEN**"))
      )
        throw Error(`Missing WHEN/THEN scenario: ${id}`);
      scenarios += cases.length;
      if (!record.sources?.length)
        throw Error(`No implementation evidence: ${id}`);
      if (!["automated", "source-reviewed"].includes(record.verification))
        throw Error(`Invalid verification state: ${id}`);
      if (record.verification === "automated" && !record.tests?.length)
        throw Error(`Automated without tests: ${id}`);
      for (const file of [...record.sources, ...record.tests]) {
        try {
          safeText(root, file);
        } catch (error) {
          throw Error(`${id}: ${error.message}`);
        }
      }
      if (record.tests.some((p) => !/^(tests|e2e|sql\/checks)\//.test(p)))
        throw Error(`Invalid test evidence: ${id}`);
      if (!record.anchors?.length)
        throw Error(`No implementation anchor: ${id}`);
      for (const anchor of record.anchors) {
        if (
          !record.sources.includes(anchor.path) ||
          typeof anchor.contains !== "string" ||
          !anchor.contains.trim() ||
          !safeText(root, anchor.path).includes(anchor.contains)
        )
          throw Error(`Missing implementation anchor: ${id} ${anchor.path}`);
      }
      if (record.verification === "automated") automated++;
      else sourceReviewed++;
    }
    if (requirementMap.size)
      throw Error(
        `Stale policy-map IDs: ${[...requirementMap.keys()].join(", ")}`,
      );
  }
  const liveSpecRoot = path.join(root, "openspec/specs");
  if (existsSync(liveSpecRoot)) {
    const live = readdirSync(liveSpecRoot, { withFileTypes: true })
      .filter((p) => p.isDirectory())
      .map((p) => p.name);
    for (const d of live)
      if (!domains.has(d)) throw Error(`Unmapped spec domain: ${d}`);
  }
  const actual = makeIndex(root);
  for (const file of actual.files) {
    if (!file.domains.length || file.domains.some((d) => !domains.has(d)))
      throw Error(`Unclassified source: ${file.path}`);
  }
  const saved = readJson(root, "openspec/source-index.json");
  if (JSON.stringify(saved) !== JSON.stringify(actual))
    throw Error(
      "Source index is stale; run npm run spec:index and review ownership",
    );
  return {
    domains: domains.size,
    requirements: ids.size,
    scenarios,
    automated,
    sourceReviewed,
    files: actual.files.length,
  };
}

export function assertChangeEvidence(changedPaths, catalog, read) {
  const behavior = changedPaths.filter((p) =>
    /^(app|supabase)\/|^public\/push-sw\.js$|^sql\/(migrations|functions)\//.test(
      p,
    ),
  );
  const affected = new Set(behavior.flatMap(classify));
  for (const p of behavior)
    if (!classify(p).length) throw Error(`Unclassified changed source: ${p}`);
  const records = changedPaths
    .filter((p) => /^openspec\/changes\/.+\.md$/.test(p))
    .map((p) => read(p))
    .join("\n");
  for (const id of affected) {
    if (changedPaths.includes(`openspec/specs/${id}/spec.md`)) continue;
    const domain = catalog.domains.find((d) => d.id === id);
    if (
      !domain ||
      !domain.requirements.some((r) =>
        new RegExp(`\\b${r.id}\\b`).test(records),
      )
    ) {
      throw Error(
        `Missing policy/change evidence for ${id}; cite a requirement ID in an OpenSpec change or update its spec`,
      );
    }
  }
  return [...affected];
}

function main(root, command, value) {
  if (command === "index") {
    const index = makeIndex(root);
    const unknown = index.files.filter((f) => !f.domains.length);
    if (unknown.length)
      throw Error(
        `Unclassified sources:\n${unknown.map((f) => f.path).join("\n")}`,
      );
    writeFileSync(
      path.join(root, "openspec/source-index.json"),
      JSON.stringify(index, null, 2) + "\n",
    );
    console.log(`Indexed ${index.files.length} files`);
  } else if (command === "check") {
    console.log("Policy evidence:", JSON.stringify(checkPolicies(root)));
  } else if (command === "context") {
    const catalog = readJson(root, "openspec/policy-map.json");
    const selected = value
      ? catalog.domains.filter(
          (d) => d.id === value || classify(value).includes(d.id),
        )
      : [];
    if (!selected.length) {
      console.log(
        "Select a domain or source path:\n" +
          catalog.domains.map((d) => `${d.id}: ${d.title}`).join("\n"),
      );
      if (value) throw Error(`Unknown domain or path: ${value}`);
      return;
    }
    for (const d of selected) {
      console.log(
        `\n${d.id}: ${d.title}\nRead openspec/specs/${d.id}/spec.md\nCommands: ${d.commands.join("; ")}`,
      );
      for (const r of d.requirements)
        console.log(
          `${r.id} [${r.verification}]\n  source: ${r.sources.join(", ")}\n  find: ${r.anchors.map((a) => a.contains).join(", ")}\n  tests: ${r.tests.join(", ") || "no linked automated regression"}`,
        );
    }
    console.log(
      "\nAlso read openspec/known-gaps.md and relevant active changes (exclude archive by default).",
    );
  } else if (command === "changed") {
    if (!value || value.startsWith("-"))
      throw Error("Pass an explicit Git base SHA/ref");
    execFileSync("git", ["rev-parse", "--verify", `${value}^{commit}`], {
      cwd: root,
      stdio: "pipe",
    });
    const changed = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACDMRT", "-z", value, "--"],
      { cwd: root },
    )
      .toString()
      .split("\0")
      .filter(Boolean);
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd: root },
    )
      .toString()
      .split("\0")
      .filter(Boolean);
    const affected = assertChangeEvidence(
      [...new Set([...changed, ...untracked])],
      readJson(root, "openspec/policy-map.json"),
      (p) => (existsSync(path.join(root, p)) ? safeText(root, p) : ""),
    );
    console.log(
      `Change evidence: ${affected.join(", ") || "no runtime policy changes"}`,
    );
  } else
    throw Error(
      "Use index, check, context <domain-or-path>, or changed <base-ref>",
    );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(repositoryRoot, process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
