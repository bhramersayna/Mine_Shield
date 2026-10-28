// Utility to safely escape and sanitize strings for CSV exports to prevent Spreadsheet Formula Injection (CSV Injection)

/**
 * Escapes and sanitizes a cell value for RFC 4180 CSV export.
 * Neutralizes formula triggers: '=', '+', '-', '@', '\t', '\r'
 * by prefixing with a single apostrophe (') so Excel/LibreOffice/Sheets
 * displays it as literal text instead of executing a formula or DDE command.
 */
function sanitizeCsvValue(value) {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value);

  // If the string starts with a formula trigger character, prepend a single quote
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  // Escape double quotes by doubling them
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Builds a complete CSV file string from headers and array of row objects
 */
function buildCsvString(headers, rows, rowExtractor) {
  const lines = [headers.map(sanitizeCsvValue).join(",")];
  for (const row of rows) {
    const values = rowExtractor(row);
    lines.push(values.map(sanitizeCsvValue).join(","));
  }
  return lines.join("\n");
}

module.exports = {
  sanitizeCsvValue,
  buildCsvString
};
