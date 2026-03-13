/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats an ISO date string to YYYY-MM-DD format.
 */
export function formatDate(isoDate: string): string {
  return isoDate.split('T')[0];
}

/**
 * Sanitizes a string for use as a directory or file name.
 * Removes characters that are invalid in file paths.
 */
export function sanitizeForPath(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}
