// Utility to inspect magic bytes and validate actual file content against claimed extensions

const SIGNATURES = {
  PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
  PNG: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  JPEG: [0xFF, 0xD8, 0xFF],
  XLSX: [0x50, 0x4B, 0x03, 0x04] // PK.. (ZIP archive)
};

function matchesMagicBytes(buffer, signature) {
  if (!buffer || buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function isPlainText(buffer) {
  if (!buffer || buffer.length === 0) return true;
  const sampleSize = Math.min(buffer.length, 1024);
  for (let i = 0; i < sampleSize; i++) {
    // Null byte usually indicates binary executable or non-text format
    if (buffer[i] === 0x00) return false;
  }
  return true;
}

function validateFileContent(buffer, extension) {
  const ext = extension.toLowerCase().replace(".", "");

  if (ext === "pdf") {
    if (!matchesMagicBytes(buffer, SIGNATURES.PDF)) {
      return { isValid: false, error: "File content does not match PDF format (missing %PDF header)." };
    }
    return { isValid: true, detectedType: "PDF" };
  }

  if (ext === "png") {
    if (!matchesMagicBytes(buffer, SIGNATURES.PNG)) {
      return { isValid: false, error: "File content does not match PNG image format." };
    }
    return { isValid: true, detectedType: "PNG" };
  }

  if (ext === "jpg" || ext === "jpeg") {
    if (!matchesMagicBytes(buffer, SIGNATURES.JPEG)) {
      return { isValid: false, error: "File content does not match JPEG image format." };
    }
    return { isValid: true, detectedType: "JPEG" };
  }

  if (ext === "xlsx") {
    if (!matchesMagicBytes(buffer, SIGNATURES.XLSX)) {
      return { isValid: false, error: "File content does not match Microsoft Excel OpenXML format." };
    }
    return { isValid: true, detectedType: "XLSX" };
  }

  if (ext === "csv" || ext === "txt") {
    if (!isPlainText(buffer)) {
      return { isValid: false, error: "File claims to be plain text/CSV but contains binary payload data." };
    }
    return { isValid: true, detectedType: ext.toUpperCase() };
  }

  return { isValid: false, error: `Unsupported or unverified file extension: .${ext}` };
}

module.exports = {
  validateFileContent,
  matchesMagicBytes,
  isPlainText
};
