import { google } from "googleapis";
import { Readable } from "stream";

// Google Drive service - requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
// These are set via webdev_request_secrets

let driveClient: ReturnType<typeof google.drive> | null = null;
let rootFolderId: string | null = null;

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function getDriveClient() {
  if (!driveClient) {
    const auth = getOAuth2Client();
    driveClient = google.drive({ version: "v3", auth });
  }
  return driveClient;
}

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

async function getOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const drive = getDriveClient();

  // Search for existing folder
  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({ q: query, fields: "files(id, name)" });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });

  return folder.data.id!;
}

async function getRootFolder(): Promise<string> {
  if (rootFolderId) return rootFolderId;
  rootFolderId = await getOrCreateFolder("ELEVAY Contracts");
  return rootFolderId;
}

export async function uploadContractToDrive(
  buffer: Buffer,
  filename: string,
  contractCode: string
): Promise<string> {
  const drive = getDriveClient();
  const rootId = await getRootFolder();
  const contractsFolderId = await getOrCreateFolder("Contracts", rootId);

  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [contractsFolderId],
      description: `Contract ${contractCode}`,
    },
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: stream,
    },
    fields: "id, webViewLink",
  });

  return res.data.id!;
}

export async function uploadInvoiceToDrive(
  buffer: Buffer,
  filename: string,
  invoiceCode: string
): Promise<string> {
  const drive = getDriveClient();
  const rootId = await getRootFolder();
  const invoicesFolderId = await getOrCreateFolder("Invoices", rootId);

  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [invoicesFolderId],
      description: `Invoice ${invoiceCode}`,
    },
    media: {
      mimeType: "application/pdf",
      body: stream,
    },
    fields: "id, webViewLink",
  });

  return res.data.id!;
}

export async function getDriveStatus(): Promise<{ configured: boolean; connected: boolean; rootFolderUrl?: string }> {
  if (!isDriveConfigured()) {
    return { configured: false, connected: false };
  }

  try {
    const drive = getDriveClient();
    const rootId = await getRootFolder();
    await drive.files.get({ fileId: rootId, fields: "id, name" });
    return {
      configured: true,
      connected: true,
      rootFolderUrl: `https://drive.google.com/drive/folders/${rootId}`,
    };
  } catch (error) {
    return { configured: true, connected: false };
  }
}
