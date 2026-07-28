const fs = require('fs');
const path = require('path');
const { getPrinters, print } = require('pdf-to-printer');
const { logAction } = require('../utils/auditLogger');

const TMP_DIR = path.join(__dirname, '..', 'tmp');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const isSafePrinterName = (name) => {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > 200) return false;
  return /^[a-zA-Z0-9 _\-.()]+$/.test(name);
};

const sanitizePaperSize = (size) => {
  const allowed = ['A4', 'A3', 'A5', 'Letter', 'Legal', '80mm', '58mm'];
  if (!size) return null;
  return allowed.includes(size) ? size : null;
};

const sanitizeOrientation = (orientation) => {
  if (!orientation) return 'portrait';
  const val = orientation.toLowerCase();
  return val === 'landscape' ? 'landscape' : 'portrait';
};

const sanitizeCopies = (copies) => {
  const n = parseInt(copies, 10);
  if (isNaN(n) || n < 1) return 1;
  return Math.min(n, 50);
};

const listPrinters = async (req, res) => {
  try {
    const printers = await getPrinters();
    const formatted = printers.map(p => ({
      name: p.name,
      isDefault: !!p.isDefault,
    }));
    res.status(200).json({ success: true, printers: formatted });
  } catch (err) {
    console.error('List printers error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve printer list from server host.',
    });
  }
};

const submitPrintJob = async (req, res) => {
  let tempFilePath = null;
  const jobId = Date.now(); // unique tag so overlapping logs from concurrent jobs don't get confused
  const timings = {}; // collect all stage durations to log as one summary at the end

  const mark = (label, fn) => {
    // Wraps a stage, records how long it took, returns the fn's result
    const t0 = process.hrtime.bigint();
    return Promise.resolve(fn()).then(result => {
      const t1 = process.hrtime.bigint();
      timings[label] = Number(t1 - t0) / 1_000_000; // ms
      return result;
    });
  };

  console.log(`\n[PRINT ${jobId}] ── Job received ──`);
  const requestStart = process.hrtime.bigint();

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file was uploaded.' });
    }

    tempFilePath = req.file.path;
    console.log(`[PRINT ${jobId}] File received: ${req.file.originalname}, size: ${(req.file.size / 1024).toFixed(1)} KB, saved to ${tempFilePath}`);

    const { printerName, copies, paperSize, orientation } = req.body;

    if (!printerName || !isSafePrinterName(printerName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or unsafe printer name.',
      });
    }

    // ── Stage 1: fetching printer list to validate the target exists ──
    const availablePrinters = await mark('1_getPrinters_validation', () => getPrinters());
    const printerExists = availablePrinters.some(p => p.name === printerName);
    if (!printerExists) {
      return res.status(404).json({
        success: false,
        error: `Printer "${printerName}" was not found on the server host.`,
      });
    }

    const safeCopies      = sanitizeCopies(copies);
    const safePaperSize   = sanitizePaperSize(paperSize);
    const safeOrientation = sanitizeOrientation(orientation);

    const printOptions = {
      printer: printerName,
      copies: safeCopies,
    };

    const printSettings = [];
    if (safeOrientation) printSettings.push(safeOrientation);
    if (safePaperSize)   printSettings.push(`paper=${safePaperSize}`);
    if (printSettings.length > 0) {
      printOptions.printSettings = printSettings.join(',');
    }

    console.log(`[PRINT ${jobId}] Sending to SumatraPDF — printer: "${printerName}", copies: ${safeCopies}, settings: ${JSON.stringify(printSettings)}`);

    // ── Stage 2: the actual print() call — this wraps SumatraPDF spawn +
    //    rasterization + spooler handoff, all as one opaque duration ──
    await mark('2_sumatra_print_call', () => print(tempFilePath, printOptions));

    const requestEnd = process.hrtime.bigint();
    timings.total_request = Number(requestEnd - requestStart) / 1_000_000;

    // ── Summary log — this tells you exactly where the time went ──
    console.log(`[PRINT ${jobId}] ── TIMING SUMMARY ──`);
    console.log(`  Printer validation (getPrinters): ${timings['1_getPrinters_validation'].toFixed(0)}ms`);
    console.log(`  SumatraPDF print() call:          ${timings['2_sumatra_print_call'].toFixed(0)}ms  ← this is SumatraPDF+driver+spooler combined`);
    console.log(`  Total request time:                ${timings.total_request.toFixed(0)}ms`);
    console.log(`[PRINT ${jobId}] ── End ──\n`);
    await logAction({
  req, action: 'print.job_submitted', targetType: 'print', targetLabel: req.file.originalname,
  metadata: { printerName, copies: safeCopies, paperSize: safePaperSize, orientation: safeOrientation }
});

    res.status(200).json({
      success: true,
      message: 'Job submitted',
      details: {
        printer: printerName,
        copies: safeCopies,
        paperSize: safePaperSize || 'default',
        orientation: safeOrientation,
        timings, // exposed in the response too, so the frontend/Postman can show it directly
      },
    });
  } catch (err) {
    console.error(`[PRINT ${jobId}] Print job error:`, err);
    await logAction({ req, action: 'print.job_failed', targetType: 'print', status: 'failure', metadata: { error: err.message } });
    res.status(500).json({
      success: false,
      error: 'Failed to submit print job.',
      detail: err.message,
      timings,
    });
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath, (unlinkErr) => {
        if (unlinkErr) console.error(`[PRINT ${jobId}] Failed to delete temp print file:`, unlinkErr);
      });
    }
  }
};

module.exports = {
  listPrinters,
  submitPrintJob,
};