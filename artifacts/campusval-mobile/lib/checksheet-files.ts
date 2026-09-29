/**
 * Files on the phone: choosing one, sending it, and opening the original.
 *
 * The API calls are the same ones the web app makes (signed link, then the
 * bytes straight to private storage, then registering the document). Only how
 * a file is read and handed to another app is the phone's own.
 *
 * Every request for a stored file carries the student's session token. A file
 * is never reachable by an address alone.
 */
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  createDegreeChecksheet,
  replaceDegreeChecksheetFile,
  requestDegreeChecksheetUploadUrl,
  validateChecksheetFile,
  type DegreeChecksheetCreateInput,
  type DegreeChecksheetDocument,
  type DegreeChecksheetReplaceResult,
} from '@workspace/api-client-react';

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  contentType: string;
}

export type PickResult = { file: PickedFile } | { error: string } | { cancelled: true };

const domain = process.env.EXPO_PUBLIC_DOMAIN;

/** The server's address. Empty on the web build, where requests are same-origin. */
export function apiBase(): string {
  return domain ? `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : '';
}

/** A signed upload link may be a path on CampusVal's own server. */
export function absoluteUrl(url: string): string {
  return url.startsWith('/') ? `${apiBase()}${url}` : url;
}

export function originalFileUrl(id: number): string {
  return `${apiBase()}/api/degree-checksheets/${id}/file`;
}

/** One PDF page, drawn to a PNG by the server (the app has no PDF renderer of its own). 1-based page number. */
export function pdfPageImageUrl(id: number, page: number, scale = 2): string {
  return `${apiBase()}/api/degree-checksheets/${id}/pages/${page}/image?scale=${scale}`;
}

/** Lets the student choose one document from the phone or a connected drive. */
export async function pickChecksheetFile(maxBytes: number): Promise<PickResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ],
  });
  if (picked.canceled) return { cancelled: true };
  const asset = picked.assets?.[0];
  if (!asset) return { cancelled: true };

  let size = asset.size ?? 0;
  if (!size && Platform.OS !== 'web') {
    const info = await FileSystem.getInfoAsync(asset.uri);
    size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
  }
  // The same check the web app makes; the server makes the authoritative one.
  const checked = validateChecksheetFile({ name: asset.name, size }, maxBytes);
  if ('error' in checked) return { error: checked.error };
  return { file: { uri: asset.uri, name: asset.name, size, contentType: checked.contentType } };
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * First 12 hex characters of the file's SHA-256, to notice a file that is
 * already in the library before sending it again. Null when it cannot be
 * computed; uploading is then simply not warned about.
 */
export async function fileFingerprint(file: PickedFile): Promise<string | null> {
  try {
    const bytes = new Uint8Array(await (await fetch(file.uri)).arrayBuffer());
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    return hex(new Uint8Array(digest)).slice(0, 12);
  } catch {
    return null;
  }
}

async function send(file: PickedFile, onPhase: (phase: UploadPhase) => void) {
  onPhase('requesting-url');
  const target = await requestDegreeChecksheetUploadUrl({ name: file.name, size: file.size, contentType: file.contentType });
  onPhase('uploading');
  const url = absoluteUrl(target.uploadURL);
  // The link accepts exactly the type the server named for this file.
  const headers = { 'Content-Type': target.contentType };
  if (Platform.OS === 'web') {
    const body = await (await fetch(file.uri)).blob();
    const put = await fetch(url, { method: 'PUT', headers, body });
    if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
  } else {
    const put = await FileSystem.uploadAsync(url, file.uri, {
      httpMethod: 'PUT',
      headers,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (put.status < 200 || put.status >= 300) throw new Error(`Upload failed (HTTP ${put.status}).`);
  }
  onPhase('processing');
  return { objectPath: target.objectPath, fileName: file.name, fileSize: file.size, contentType: target.contentType };
}

export type UploadPhase = 'idle' | 'requesting-url' | 'uploading' | 'processing';

export const UPLOAD_PHASE_LABEL: Record<UploadPhase, string> = {
  idle: '',
  'requesting-url': 'Preparing upload…',
  uploading: 'Uploading file…',
  processing: 'Checking the file and building its preview…',
};

export type ChecksheetDetails = Omit<DegreeChecksheetCreateInput, 'objectPath' | 'fileName' | 'fileSize' | 'contentType'>;

export async function uploadChecksheet(
  file: PickedFile,
  details: ChecksheetDetails,
  onPhase: (phase: UploadPhase) => void,
): Promise<DegreeChecksheetDocument> {
  try {
    return await createDegreeChecksheet({ ...(await send(file, onPhase)), ...details });
  } finally {
    onPhase('idle');
  }
}

export async function replaceChecksheetFile(
  id: number,
  file: PickedFile,
  onPhase: (phase: UploadPhase) => void,
): Promise<DegreeChecksheetReplaceResult> {
  try {
    return await replaceDegreeChecksheetFile(id, await send(file, onPhase));
  } finally {
    onPhase('idle');
  }
}

const EXTENSION: Record<string, string> = { pdf: 'pdf', xlsx: 'xlsx', xls: 'xls', docx: 'docx', png: 'png', jpg: 'jpg' };

/**
 * Opens the original file: downloads it, with the student's session, into the
 * app's own cache and hands it to the phone's viewer. The copy is removed from
 * the cache when the app next opens a document, and is never written to shared
 * storage by CampusVal.
 */
export async function openOriginal(
  document: Pick<DegreeChecksheetDocument, 'id' | 'sourceFormat' | 'mimeType' | 'sourceVersion'>,
  getToken: () => Promise<string | null>,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('You are signed out. Sign in again to open this document.');
  const url = originalFileUrl(document.id);

  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`The document could not be opened (HTTP ${res.status}).`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    window.open(href, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return;
  }

  const folder = `${FileSystem.cacheDirectory}checksheets/`;
  await FileSystem.deleteAsync(folder, { idempotent: true });
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const target = `${folder}degree-checksheet-${document.id}-v${document.sourceVersion}.${EXTENSION[document.sourceFormat] ?? 'bin'}`;
  const result = await FileSystem.downloadAsync(url, target, { headers: { Authorization: `Bearer ${token}` } });
  if (result.status !== 200) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw new Error(`The document could not be opened (HTTP ${result.status}).`);
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone has no app that can open the document.');
  await Sharing.shareAsync(result.uri, { mimeType: document.mimeType, dialogTitle: 'Open original document' });
}
