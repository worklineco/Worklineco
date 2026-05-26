import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import * as XLSX from "xlsx";

const GST_PORTAL_LOGIN_URL = "https://services.gst.gov.in/services/login";
const DEFAULT_WORKBOOK_PATH = path.join(os.homedir(), "Downloads", "WorkLineCo.xlsx");
const OUTPUT_DIR = path.join(process.cwd(), "collector-output");
const ENV_FILES = [".env.local", ".env"];

const FIELD_NAMES = [
  "sNo",
  "typeOfNotice",
  "description",
  "refId",
  "dateOfIssue",
  "caseId",
  "status",
  "taxPeriod",
  "dueDate",
  "section",
  "replyFiling",
];

const HEADER_ALIASES = new Map([
  ["sno", "sNo"],
  ["s no", "sNo"],
  ["serial no", "sNo"],
  ["sr no", "sNo"],
  ["sl no", "sNo"],
  ["slno", "sNo"],
  ["type of notice", "typeOfNotice"],
  ["notice type", "typeOfNotice"],
  ["notice/order", "typeOfNotice"],
  ["notice order", "typeOfNotice"],
  ["notice/order type", "typeOfNotice"],
  ["notice order type", "typeOfNotice"],
  ["type", "typeOfNotice"],
  ["description", "description"],
  ["details", "description"],
  ["proceeding description", "description"],
  ["ref id", "refId"],
  ["reference id", "refId"],
  ["reference no", "refId"],
  ["reference number", "refId"],
  ["ref no", "refId"],
  ["arn", "refId"],
  ["date of issue", "dateOfIssue"],
  ["issue date", "dateOfIssue"],
  ["date of issuance", "dateOfIssue"],
  ["issued on", "dateOfIssue"],
  ["case id", "caseId"],
  ["case no", "caseId"],
  ["case number", "caseId"],
  ["proceeding id", "caseId"],
  ["status", "status"],
  ["case status", "status"],
  ["proceeding status", "status"],
  ["tax period", "taxPeriod"],
  ["period", "taxPeriod"],
  ["return period", "taxPeriod"],
  ["financial year", "taxPeriod"],
  ["due date", "dueDate"],
  ["reply due date", "dueDate"],
  ["due date for reply", "dueDate"],
  ["due date of reply", "dueDate"],
  ["section", "section"],
  ["section/rule", "section"],
  ["section rule", "section"],
  ["act/section", "section"],
  ["act section", "section"],
  ["reply filing", "replyFiling"],
  ["reply status", "replyFiling"],
  ["reply filing status", "replyFiling"],
  ["reply filed", "replyFiling"],
]);

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.:#]/g, "")
    .trim()
    .toLowerCase();
}

function cleanCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseBooleanFlag(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function parseArgs() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const item = process.argv[index];
    if (item.startsWith("--")) {
      const next = process.argv[index + 1];
      if (!next || next.startsWith("--")) {
        args.set(item.slice(2), true);
      } else {
        args.set(item.slice(2), next);
        index += 1;
      }
    }
  }

  return {
    clientName: args.get("client-name") || "",
    dryRun: parseBooleanFlag(args.get("dry-run")),
    expectedGstin: String(args.get("expect-gstin") || "").trim().toUpperCase(),
    loginOnly: parseBooleanFlag(args.get("login-only")),
    outputDir: path.resolve(args.get("out") || OUTPUT_DIR),
    rowNumber: Number(args.get("row") || 2),
    saveHtml: parseBooleanFlag(args.get("save-html")),
    sync: parseBooleanFlag(args.get("sync")),
    workbookPath: path.resolve(args.get("file") || DEFAULT_WORKBOOK_PATH),
    worklineEmail: args.get("workline-email") || process.env.WORKLINE_EMAIL || "",
    worklinePassword: args.get("workline-password") || process.env.WORKLINE_PASSWORD || "",
  };
}

async function loadLocalEnv() {
  for (const fileName of ENV_FILES) {
    const filePath = path.join(process.cwd(), fileName);
    const content = await fs.readFile(filePath, "utf8").catch(() => "");

    if (!content) {
      continue;
    }

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function readClientFromWorkbook({ rowNumber, workbookPath }) {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const rowIndex = rowNumber - 1;
  const clientRow = rows[rowIndex] ?? [];
  const [gstin, userId, password] = clientRow.map((value) =>
    String(value ?? "").trim(),
  );

  if (!gstin || !userId || !password) {
    throw new Error(
      `Missing client credentials in ${workbookPath}. Use row ${rowNumber}: A = GSTIN, B = GST user ID, C = password.`,
    );
  }

  return { gstin, userId, password };
}

function parsePortalDate(value) {
  const text = cleanCell(value);
  if (!text || ["-", "na", "n/a"].includes(text.toLowerCase())) {
    return null;
  }

  const directDate = new Date(text);
  if (!Number.isNaN(directDate.getTime()) && /^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    return directDate.toISOString().slice(0, 10);
  }

  const match = text.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, yearValue] = match;
  const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeExtractedRow(row, index) {
  return {
    serial_no: Number.parseInt(cleanCell(row.sNo), 10) || index + 1,
    notice_type: cleanCell(row.typeOfNotice) || null,
    description: cleanCell(row.description) || null,
    ref_id: cleanCell(row.refId) || null,
    date_of_issue: parsePortalDate(row.dateOfIssue),
    case_id: cleanCell(row.caseId) || null,
    status: cleanCell(row.status) || null,
    tax_period: cleanCell(row.taxPeriod) || null,
    due_date: parsePortalDate(row.dueDate),
    section: cleanCell(row.section) || null,
    reply_filing_status: cleanCell(row.replyFiling) || null,
  };
}

async function launchChrome() {
  const launchOptions = {
    headless: false,
    args: ["--start-maximized"],
  };

  try {
    return await chromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    try {
      return await chromium.launch({ ...launchOptions, channel: "msedge" });
    } catch (error) {
      throw new Error(
        `Could not launch Chrome or Edge through Playwright. Install Chrome/Edge and try again. Original error: ${error.message}`,
      );
    }
  }
}

async function fillFirstVisible(page, selectors, value, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, 5); index += 1) {
      const input = locator.nth(index);
      const visible = await input.isVisible({ timeout: 500 }).catch(() => false);

      if (visible) {
        await input.fill(value);
        console.log(`Filled ${label}.`);
        return true;
      }
    }
  }

  console.log(`Could not auto-fill ${label}. Please type it manually in the browser.`);
  return false;
}

async function clickFirstVisible(page, selectors, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, 5); index += 1) {
      const element = locator.nth(index);
      const visible = await element.isVisible({ timeout: 500 }).catch(() => false);
      const enabled = await element.isEnabled({ timeout: 500 }).catch(() => false);

      if (visible && enabled) {
        await element.click();
        console.log(`Clicked ${label}.`);
        return true;
      }
    }
  }

  console.log(`Could not auto-click ${label}. Please click it manually in the browser.`);
  return false;
}

async function extractBestTableFromFrame(frame) {
  return frame.evaluate(
    ({ aliases, fieldNames }) => {
      const aliasMap = new Map(aliases);

      function clean(value) {
        return String(value ?? "")
          .replace(/\s+/g, " ")
          .replace(/[.:#]/g, "")
          .trim()
          .toLowerCase();
      }

      function visibleText(node) {
        return String(node?.innerText ?? node?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function mapHeader(header) {
        const normalized = clean(header);
        return aliasMap.get(normalized) ?? null;
      }

      const candidates = [...document.querySelectorAll("table, [role='table']")]
        .map((table) => {
          const headerNodes = [
            ...table.querySelectorAll("thead th"),
            ...table.querySelectorAll("[role='columnheader']"),
            ...table.querySelectorAll("tr:first-child th"),
            ...table.querySelectorAll("tr:first-child td"),
          ];
          const headerTexts = [...new Set(headerNodes.map(visibleText).filter(Boolean))];
          const mappedHeaders = headerTexts.map(mapHeader);
          const score = mappedHeaders.filter(Boolean).length;

          return {
            table,
            headerTexts,
            mappedHeaders,
            score,
          };
        })
        .filter((candidate) => candidate.score >= 3)
        .sort((left, right) => right.score - left.score);

      const best = candidates[0];
      if (!best) {
        return { headers: [], rows: [] };
      }

      const bodyRows = [...best.table.querySelectorAll("tbody tr, [role='rowgroup'] [role='row']")];
      const allRows = [...best.table.querySelectorAll("tr, [role='row']")];
      const dataRows = bodyRows.length ? bodyRows : allRows.slice(1);

      const rows = dataRows
        .map((row) => {
          const cells = [...row.querySelectorAll("td, th, [role='cell'], [role='gridcell']")].map(visibleText);
          const record = Object.fromEntries(fieldNames.map((name) => [name, ""]));

          best.headerTexts.forEach((header, index) => {
            const field = mapHeader(header);
            if (field) {
              record[field] = cells[index] ?? "";
            }
          });

          return record;
        })
        .filter((row) => Object.values(row).some(Boolean));

      return { headers: best.headerTexts, rows };
    },
    {
      aliases: [...HEADER_ALIASES.entries()],
      fieldNames: FIELD_NAMES,
    },
  );
}

async function extractLitigationRows(page) {
  const frameResults = [];

  for (const frame of page.frames()) {
    try {
      const result = await extractBestTableFromFrame(frame);
      if (result.rows.length) {
        frameResults.push(result);
      }
    } catch {
      // Some portal frames can be inaccessible while navigating. Skip and keep scanning.
    }
  }

  frameResults.sort((left, right) => right.rows.length - left.rows.length);
  return frameResults[0] ?? { headers: [], rows: [] };
}

async function saveDebugHtml(page, outputDir, gstin) {
  const debugDir = path.join(outputDir, "debug");
  await fs.mkdir(debugDir, { recursive: true });

  for (const [index, frame] of page.frames().entries()) {
    const html = await frame.content().catch(() => "");
    if (!html) {
      continue;
    }

    await fs.writeFile(
      path.join(debugDir, `gst-${gstin}-frame-${index + 1}.html`),
      html,
    );
  }
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function promptForWorkLineLogin(rl, options) {
  if (!options.sync || options.dryRun) {
    return options;
  }

  const worklineEmail = options.worklineEmail || (await rl.question("WorkLine email for Supabase sync: "));
  const worklinePassword =
    options.worklinePassword || (await rl.question("WorkLine password for this sync only: "));

  return {
    ...options,
    worklineEmail: worklineEmail.trim(),
    worklinePassword,
  };
}

async function syncRowsToSupabase({ client, extractedAt, options, rows }) {
  if (!rows.length) {
    return { insertedOrUpdated: 0, registrationId: "" };
  }

  const supabase = createSupabaseClient();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: options.worklineEmail,
    password: options.worklinePassword,
  });

  if (signInError || !signInData.user) {
    throw new Error(`Could not sign in to WorkLine for Supabase sync: ${signInError?.message ?? "No user returned."}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("organisation_id")
    .eq("id", signInData.user.id)
    .single();

  if (profileError || !profile?.organisation_id) {
    throw new Error(`Could not resolve WorkLine organisation: ${profileError?.message ?? "Missing organisation_id."}`);
  }

  const organisationId = profile.organisation_id;
  const { data: existingRegistration, error: registrationError } = await supabase
    .from("gst_registrations")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("gstin", client.gstin)
    .maybeSingle();

  if (registrationError) {
    throw new Error(`Could not find GST registration: ${registrationError.message}`);
  }

  let registrationId = existingRegistration?.id;

  if (!registrationId) {
    const { data: createdRegistration, error: createError } = await supabase
      .from("gst_registrations")
      .insert({
        organisation_id: organisationId,
        client_name: options.clientName || client.gstin,
        gstin: client.gstin,
      })
      .select("id")
      .single();

    if (createError || !createdRegistration?.id) {
      throw new Error(`Could not create GST registration for ${client.gstin}: ${createError?.message ?? "No id returned."}`);
    }

    registrationId = createdRegistration.id;
  }

  const payload = rows.map((row, index) => {
    const normalized = normalizeExtractedRow(row, index);

    return {
      ...normalized,
      organisation_id: organisationId,
      gst_registration_id: registrationId,
      source: "gst-portal-local-collector",
      raw_payload: row,
      scraped_at: extractedAt,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await supabase
    .from("gst_litigation_cases")
    .upsert(payload, {
      onConflict: "organisation_id,gst_registration_id,ref_id,case_id",
    });

  if (upsertError) {
    throw new Error(`Could not sync litigation rows to WorkLine: ${upsertError.message}`);
  }

  return { insertedOrUpdated: payload.length, registrationId };
}

async function main() {
  await loadLocalEnv();
  let options = parseArgs();
  const client = readClientFromWorkbook(options);

  if (options.expectedGstin && client.gstin.toUpperCase() !== options.expectedGstin) {
    throw new Error(
      `Excel row ${options.rowNumber} contains GSTIN ${client.gstin}, but selected client is ${options.expectedGstin}.`,
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  options = await promptForWorkLineLogin(rl, options);

  console.log(`Loaded GSTIN ${client.gstin} from ${options.workbookPath}, row ${options.rowNumber}.`);
  console.log("Password stays local and is not written to WorkLine or Git.");
  if (options.sync && !options.dryRun) {
    console.log("Supabase sync is enabled. Only extracted litigation rows will be sent to WorkLine.");
  }

  const browser = await launchChrome();
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  await page.goto(GST_PORTAL_LOGIN_URL, { waitUntil: "domcontentloaded" });

  await fillFirstVisible(
    page,
    [
      "input#username",
      "input[name='username']",
      "input[formcontrolname='username']",
      "input[type='text']",
    ],
    client.userId,
    "GST user ID",
  );

  await fillFirstVisible(
    page,
    [
      "input#user_pass",
      "input#password",
      "input[name='user_pass']",
      "input[name='password']",
      "input[type='password']",
    ],
    client.password,
    "GST password",
  );

  await clickFirstVisible(
    page,
    [
      "button:has-text('LOGIN')",
      "button:has-text('Login')",
      "input[type='submit'][value='LOGIN']",
      "input[type='submit'][value='Login']",
      "input[type='button'][value='LOGIN']",
      "input[type='button'][value='Login']",
      "a:has-text('LOGIN')",
      "a:has-text('Login')",
    ],
    "GST portal login button",
  );

  if (options.loginOnly) {
    console.log("");
    console.log("GST portal opened, credentials were filled from Excel, and login was clicked.");
    console.log("Solve any CAPTCHA or portal prompt in the browser. Keep this process running while the browser is in use.");
    await new Promise(() => {});
    return;
  }

  console.log("");
  console.log("In the browser: solve CAPTCHA, sign in, and open the GST litigation/notices/proceedings table.");
  await rl.question("When the table is visible, return here and press Enter to extract rows...");

  const extraction = await extractLitigationRows(page);
  const extractedAt = new Date().toISOString();

  await fs.mkdir(options.outputDir, { recursive: true });
  const outputPath = path.join(
    options.outputDir,
    `gst-litigation-${client.gstin}-${extractedAt.slice(0, 10)}.json`,
  );

  if (options.saveHtml) {
    await saveDebugHtml(page, options.outputDir, client.gstin);
  }

  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        gstin: client.gstin,
        source: "gst-portal-local-browser",
        extractedAt,
        headers: extraction.headers,
        rows: extraction.rows,
      },
      null,
      2,
    ),
  );

  console.log("");
  console.log(`Extracted ${extraction.rows.length} rows.`);
  console.log(`Saved local output: ${outputPath}`);

  if (options.sync && !options.dryRun) {
    const result = await syncRowsToSupabase({
      client,
      extractedAt,
      options,
      rows: extraction.rows,
    });
    console.log(`Synced ${result.insertedOrUpdated} rows to WorkLine registration ${result.registrationId}.`);
  } else if (options.sync && options.dryRun) {
    console.log("Dry run enabled, so no rows were sent to WorkLine.");
  }

  console.log("Keep the browser open if you want to inspect the portal page. Close it manually when done.");

  await rl.close();
}

main().catch((error) => {
  console.error("");
  console.error(error.message);
  process.exitCode = 1;
});
