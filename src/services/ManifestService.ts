import * as fs from 'node:fs';
import { EventLogFileRecord, EventLogManifest } from '../types/eventLogTypes.js';

export const MANIFEST_FILENAME = '.eventlog-manifest.json';
export const MANIFEST_VERSION = '1.0';

/**
 * Creates an empty manifest structure.
 */
export function createEmptyManifest(orgId: string): EventLogManifest {
  return {
    version: MANIFEST_VERSION,
    orgId,
    lastFetch: new Date().toISOString(),
    files: {},
  };
}

/**
 * Loads manifest from disk.
 * Returns a new empty manifest if the file doesn't exist or is corrupted.
 */
export function loadManifest(
  manifestPath: string,
  currentOrgId: string,
  warnFn: (msg: string) => void
): EventLogManifest {
  if (!fs.existsSync(manifestPath)) {
    return createEmptyManifest(currentOrgId);
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as EventLogManifest;

    // Check org ID mismatch
    if (manifest.orgId !== currentOrgId) {
      warnFn(`Manifest was created for org ${manifest.orgId}, but current org is ${currentOrgId}`);
    }

    return manifest;
  } catch {
    // Backup corrupted manifest and create new one
    warnFn('Existing manifest file is corrupted. Creating backup and starting fresh.');
    const backupPath = `${manifestPath}.backup.${Date.now()}`;
    if (fs.existsSync(manifestPath)) {
      fs.renameSync(manifestPath, backupPath);
    }
    return createEmptyManifest(currentOrgId);
  }
}

/**
 * Saves manifest to disk.
 */
export function saveManifest(manifestPath: string, manifest: EventLogManifest): void {
  const updatedManifest = { ...manifest, lastFetch: new Date().toISOString() };
  fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
}

/**
 * Filters records to only those that need to be downloaded.
 */
export function filterFilesToDownload(
  records: EventLogFileRecord[],
  manifest: EventLogManifest,
  force: boolean
): EventLogFileRecord[] {
  if (force) {
    return records;
  }
  return records.filter((record) => !manifest.files[record.Id]);
}
