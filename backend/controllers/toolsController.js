/**
 * controllers/toolsController.js  (SFMS — Document Toolkit)
 *
 * Stateless, in-memory PDF/file utilities. Nothing here touches the DB or
 * the on-disk storage tree — every operation works off multer memory
 * buffers and streams a result straight back to the client.
 *
 * Endpoints:
 *   POST /api/tools/pdf/info        -> page count + per-page size/rotation
 *   POST /api/tools/pdf/organize    -> reorder / delete / rotate pages
 *   POST /api/tools/pdf/watermark   -> text and/or logo overlay
 *   POST /api/tools/pdf/compress    -> rasterize + re-encode to shrink size
 *   POST /api/tools/pdf/flatten     -> lock AcroForm field values
 *   POST /api/tools/images-to-pdf   -> compile images into one PDF
 *   POST /api/tools/zip             -> bundle files into a .zip
 */

const { PDFDocument, degrees, rgb, StandardFonts } = require('pdf-lib');
const pdfjsLib          = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas }  = require('canvas');
const sharp             = require('sharp');
const PDFKit            = require('pdfkit');
const archiver          = require('archiver');

const MAX_COMPRESS_PAGES = 300; // safety valve against runaway rasterization

function sendBuffer(res, buffer, filename, mime) {
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

// ── 1. PDF info ───────────────────────────────────────────────────────────
const getPdfPageInfo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
    const doc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
    const pages = doc.getPages().map((p, i) => {
      const { width, height } = p.getSize();
      return { index: i, width, height, rotation: p.getRotation().angle };
    });
    res.json({ pageCount: doc.getPageCount(), pages });
  } catch (err) {
    console.error('getPdfPageInfo error:', err.message);
    res.status(400).json({ error: 'Could not read that PDF. It may be corrupted, password-protected, or not a valid PDF.' });
  }
};

// ── 2. Organize (reorder / delete / rotate) ─────────────────────────────
// body.order = JSON string: [{ index, rotate }, ...] in the FINAL desired
// order. Pages the user deleted are simply omitted from the array.
const organizePdf = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
    let order;
    try { order = JSON.parse(req.body.order || '[]'); } catch (_) { order = []; }
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'No page order supplied' });
    }

    const srcDoc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
    const outDoc = await PDFDocument.create();

    const indices = order.map(o => o.index);
    const copiedPages = await outDoc.copyPages(srcDoc, indices);

    copiedPages.forEach((page, i) => {
      const extraRotation = order[i].rotate || 0;
      if (extraRotation) {
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + extraRotation + 360) % 360));
      }
      outDoc.addPage(page);
    });

    const bytes = await outDoc.save();
    sendBuffer(res, Buffer.from(bytes), 'organized.pdf', 'application/pdf');
  } catch (err) {
    console.error('organizePdf error:', err.message);
    res.status(500).json({ error: 'Failed to reorganize the PDF' });
  }
};

// ── 3. Watermark ─────────────────────────────────────────────────────────
const watermarkPdf = async (req, res) => {
  try {
    const pdfFile  = req.files?.file?.[0];
    const logoFile = req.files?.logo?.[0];
    if (!pdfFile) return res.status(400).json({ error: 'No PDF uploaded' });

    const text     = (req.body.text || '').trim();
    const opacity  = Math.min(1, Math.max(0.05, parseFloat(req.body.opacity) || 0.3));
    const position = req.body.position || 'center';
    const fontSize = Math.min(120, Math.max(10, parseInt(req.body.fontSize) || 48));

    if (!text && !logoFile) {
      return res.status(400).json({ error: 'Provide watermark text or a logo image' });
    }

    const doc = await PDFDocument.load(pdfFile.buffer, { ignoreEncryption: true });
    const font = text ? await doc.embedFont(StandardFonts.HelveticaBold) : null;

    let logoImage = null;
    if (logoFile) {
      logoImage = logoFile.mimetype.includes('png')
        ? await doc.embedPng(logoFile.buffer)
        : await doc.embedJpg(logoFile.buffer);
    }

    const place = (w, h, pageW, pageH) => {
      switch (position) {
        case 'top-left':     return { x: 24,               y: pageH - 24 - h };
        case 'top-right':    return { x: pageW - 24 - w,    y: pageH - 24 - h };
        case 'bottom-left':  return { x: 24,                y: 24 };
        case 'bottom-right': return { x: pageW - 24 - w,    y: 24 };
        default:              return { x: (pageW - w) / 2,  y: (pageH - h) / 2 }; // center / diagonal
      }
    };

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();

      if (text) {
        const tw = font.widthOfTextAtSize(text, fontSize);
        const th = font.heightAtSize(fontSize);
        const { x, y } = place(tw, th, width, height);
        page.drawText(text, {
          x, y, size: fontSize, font, color: rgb(0.5, 0.5, 0.5), opacity,
          rotate: position === 'diagonal' ? degrees(45) : degrees(0),
        });
      }

      if (logoImage) {
        const scale = Math.min((width * 0.3) / logoImage.width, (height * 0.3) / logoImage.height, 1);
        const w = logoImage.width * scale, h = logoImage.height * scale;
        const { x, y } = place(w, h, width, height);
        page.drawImage(logoImage, { x, y, width: w, height: h, opacity });
      }
    }

    const bytes = await doc.save();
    sendBuffer(res, Buffer.from(bytes), 'watermarked.pdf', 'application/pdf');
  } catch (err) {
    console.error('watermarkPdf error:', err.message);
    res.status(500).json({ error: 'Failed to watermark the PDF' });
  }
};

// ── 4. Compress ──────────────────────────────────────────────────────────
// Rasterizes each page at a quality-dependent scale, re-encodes as JPEG,
// then rebuilds a lightweight PDF. Real, visible size reduction for
// image-heavy scanned documents (text-only PDFs won't shrink much this way,
// so callers should expect the best gains on scans/photo-heavy files).
const compressPdf = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
    const quality = req.body.quality || 'medium';
    const settings = {
      low:    { scale: 1.0, jpegQuality: 42 },
      medium: { scale: 1.4, jpegQuality: 62 },
      high:   { scale: 1.9, jpegQuality: 78 },
    }[quality] || { scale: 1.4, jpegQuality: 62 };

    const originalSize = req.file.buffer.length;
    const pdfData = new Uint8Array(req.file.buffer);
    const srcDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const numPages = Math.min(srcDoc.numPages, MAX_COMPRESS_PAGES);

    const outPdf = new PDFKit({ autoFirstPage: false });
    const chunks = [];
    outPdf.on('data', c => chunks.push(c));
    const finished = new Promise((resolve, reject) => {
      outPdf.on('end', resolve);
      outPdf.on('error', reject);
    });

    for (let i = 1; i <= numPages; i++) {
      const page = await srcDoc.getPage(i);
      const viewport = page.getViewport({ scale: settings.scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegBuffer = await sharp(canvas.toBuffer('image/png'))
        .jpeg({ quality: settings.jpegQuality })
        .toBuffer();

      outPdf.addPage({ size: [viewport.width, viewport.height], margin: 0 });
      outPdf.image(jpegBuffer, 0, 0, { width: viewport.width, height: viewport.height });
      page.cleanup();
    }

    outPdf.end();
    await finished;
    const outBuffer = Buffer.concat(chunks);

    res.setHeader('Access-Control-Expose-Headers', 'X-Original-Size, X-Compressed-Size');
    res.setHeader('X-Original-Size', String(originalSize));
    res.setHeader('X-Compressed-Size', String(outBuffer.length));
    sendBuffer(res, outBuffer, 'compressed.pdf', 'application/pdf');
  } catch (err) {
    console.error('compressPdf error:', err.message);
    res.status(500).json({ error: 'Failed to compress the PDF' });
  }
};

// ── 5. Flatten form ──────────────────────────────────────────────────────
const flattenPdf = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
    const doc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
    const form = doc.getForm();
    const fieldCount = form.getFields().length;
    if (fieldCount === 0) {
      return res.status(400).json({ error: 'This PDF has no fillable form fields to flatten' });
    }
    form.flatten();
    const bytes = await doc.save();
    sendBuffer(res, Buffer.from(bytes), 'flattened.pdf', 'application/pdf');
  } catch (err) {
    console.error('flattenPdf error:', err.message);
    res.status(500).json({ error: 'Failed to flatten the PDF form' });
  }
};

// ── 6. Images -> PDF ─────────────────────────────────────────────────────
const imagesToPdf = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

    const fitToImage = (req.body.pageSize || 'a4') === 'fit';
    const margin = 36; // 0.5"
    const A4 = [595.28, 841.89];

    const doc = new PDFKit({ autoFirstPage: false });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const finished = new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    for (const f of files) {
      const normalized = await sharp(f.buffer).rotate().jpeg({ quality: 88 }).toBuffer();
      const meta = await sharp(normalized).metadata();

      let pageW, pageH;
      if (fitToImage) {
        pageW = meta.width + margin * 2;
        pageH = meta.height + margin * 2;
      } else {
        [pageW, pageH] = A4;
      }

      doc.addPage({ size: [pageW, pageH], margin: 0 });
      const availW = pageW - margin * 2, availH = pageH - margin * 2;
      const scale = Math.min(availW / meta.width, availH / meta.height, 1);
      const w = meta.width * scale, h = meta.height * scale;
      doc.image(normalized, (pageW - w) / 2, (pageH - h) / 2, { width: w, height: h });
    }

    doc.end();
    await finished;
    sendBuffer(res, Buffer.concat(chunks), 'images.pdf', 'application/pdf');
  } catch (err) {
    console.error('imagesToPdf error:', err.message);
    res.status(500).json({ error: 'Failed to compile images into a PDF' });
  }
};

// ── 7. Zip creator ───────────────────────────────────────────────────────
const zipFiles = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="archive.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('zipFiles archive error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to build zip archive' });
      else res.end();
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const f of files) {
      let name = f.originalname;
      let counter = 1;
      while (usedNames.has(name)) {
        const dot = f.originalname.lastIndexOf('.');
        name = dot === -1
          ? `${f.originalname} (${counter})`
          : `${f.originalname.slice(0, dot)} (${counter})${f.originalname.slice(dot)}`;
        counter++;
      }
      usedNames.add(name);
      archive.append(f.buffer, { name });
    }

    await archive.finalize();
  } catch (err) {
    console.error('zipFiles error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to create zip' });
  }
};

module.exports = {
  getPdfPageInfo,
  organizePdf,
  watermarkPdf,
  compressPdf,
  flattenPdf,
  imagesToPdf,
  zipFiles,
};