// Server-only helper for calling Google Sheets/Drive through the connector gateway.
// Never import this from client code — it reads secret env vars.

export const SPREADSHEET_ID = "1ML7MfZBO5Lced3V0_HlRgBmXK4-RQHTcu3vu7bbVtFc";
export const DRIVE_FOLDER_ID = "13ITEK5t7JnYBpQoofM_gWxSOjK8_NCv5";

const SHEETS_BASE = "https://connector-gateway.lovable.dev/google_sheets/v4";
const DRIVE_BASE = "https://connector-gateway.lovable.dev/google_drive";

function headers(connectionKey: string | undefined): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google connection is not configured for this app.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

async function parseOrThrow(response: Response, what: string) {
  if (!response.ok) {
    const body = await response.text();
    console.error(`${what} failed [${response.status}]: ${body}`);
    throw new Error(`${what} failed [${response.status}]: ${body}`);
  }
  return response.json();
}

export async function getValues(range: string): Promise<string[][]> {
  const res = await fetch(`${SHEETS_BASE}/spreadsheets/${SPREADSHEET_ID}/values/${range}`, {
    headers: headers(process.env["GOOGLE_SHEETS_API_KEY"]),
  });
  const data = await parseOrThrow(res, `Read ${range}`);
  return (data.values as string[][]) ?? [];
}

export async function batchGetValues(ranges: string[]): Promise<string[][][]> {
  const qs = ranges.map((r) => `ranges=${r}`).join("&");
  const res = await fetch(`${SHEETS_BASE}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${qs}`, {
    headers: headers(process.env["GOOGLE_SHEETS_API_KEY"]),
  });
  const data = await parseOrThrow(res, "Read master data");
  return (data.valueRanges as { values?: string[][] }[]).map((v) => v.values ?? []);
}

export async function appendRow(range: string, row: (string | number)[]): Promise<void> {
  const res = await fetch(
    `${SHEETS_BASE}/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { ...headers(process.env["GOOGLE_SHEETS_API_KEY"]), "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    },
  );
export async function updateValues(
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const res = await fetch(
    `${SHEETS_BASE}/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        ...headers(process.env["GOOGLE_SHEETS_API_KEY"]),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );
  await parseOrThrow(res, "Update cells");
}

export async function uploadReceipt(
  fileName: string,
  mimeType: string,
  dataBase64: string,
): Promise<string> {
  const bytes = Uint8Array.from(atob(dataBase64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ name: fileName, parents: [DRIVE_FOLDER_ID] })], {
      type: "application/json",
    }),
  );
  form.append("file", new Blob([bytes], { type: mimeType }), fileName);

  const res = await fetch(`${DRIVE_BASE}/upload/drive/v3/files?uploadType=multipart`, {
    method: "POST",
    headers: headers(process.env["GOOGLE_DRIVE_API_KEY"]),
    body: form,
  });
  const data = await parseOrThrow(res, "Upload receipt");
  return data.id as string;
}
