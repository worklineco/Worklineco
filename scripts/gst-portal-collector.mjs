import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { chromium } from "playwright-core";
import * as XLSX from "xlsx";

const GST_PORTAL_LOGIN_URL = "https://services.gst.gov.in/services/login";
const WORKBOOK_PATH = path.join(os.homedir(), "Downloads", "WorkLineCo.xlsx");
const OUTPUT_DIR = path.join(process.cwd(), "collector-output");

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
  ["type of notice", "typeOfNotice"],
  ["notice type", "typeOfNotice"],
  ["description", "description"],
  ["ref id", "refId"],
  ["reference id", "refId"],
  ["date of issue", "dateOfIssue"],
  ["issue date", "dateOfIssue"],
  ["case id", "caseId"],
  ["status", "status"],
  ["tax period", "taxPeriod"],
  ["due date", "dueDate"],
  ["section", "section"],
  ["reply filing", "replyFiling"],
  ["reply status", "replyFiling"],
]);

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.:#]/g, "")
    .trim()
    .toLowerCase();
}

function readFirstClientFromWorkbook() {
  const workbook = XLSX.readFile(WORKBOOK_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const firstClient = rows[1] ?? [];
  const [gstin, userId, password] = firstClient.map((value) =>
    String(value ?? "").trim(),
  );

  if (!gstin || !userId || !password) {
    throw new Error(
      `Missing client credentials in ${WORKBOOK_PATH}. Use A2 = GSTIN, B2 = GST user ID, C2 = password.`,
    );
  }

  return { gstin, userId, password };
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

      const candidates = [...document.querySelectorAll("table")]
        .map((table) => {
          const headerNodes = [
            ...table.querySelectorAll("thead th"),
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

      const bodyRows = [...best.table.querySelectorAll("tbody tr")];
      const allRows = [...best.table.querySelectorAll("tr")];
      const dataRows = bodyRows.length ? bodyRows : allRows.slice(1);

      const rows = dataRows
        .map((row) => {
          const cells = [...row.querySelectorAll("td, th")].map(visibleText);
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

async function main() {
  const client = readFirstClientFromWorkbook();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`Loaded GSTIN ${client.gstin} from ${WORKBOOK_PATH}.`);
  console.log("Password stays local and is not written to WorkLine or Git.");

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

  console.log("");
  console.log("In the browser: solve CAPTCHA, sign in, and open the GST litigation/notices/proceedings table.");
  await rl.question("When the table is visible, return here and press Enter to extract rows...");

  const extraction = await extractLitigationRows(page);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(
    OUTPUT_DIR,
    `gst-litigation-${client.gstin}-${new Date().toISOString().slice(0, 10)}.json`,
  );

  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        gstin: client.gstin,
        source: "gst-portal-local-browser",
        extractedAt: new Date().toISOString(),
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
  console.log("Keep the browser open if you want to inspect the portal page. Close it manually when done.");

  await rl.close();
}

main().catch((error) => {
  console.error("");
  console.error(error.message);
  process.exitCode = 1;
});
