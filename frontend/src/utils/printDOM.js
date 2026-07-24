/**
 * printDOM — renders arbitrary HTML content into a hidden iframe and
 * triggers the native browser print dialog, with precise @page CSS control
 * over paper size, margins, and print-specific styling.
 *
 * Use this as the fallback path when NOT sending a job directly to a
 * server printer via usePrinter().printPDF().
 */

const DEFAULT_PRINT_CSS = `
  @page {
    size: A4;
    margin: 10mm;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  @media print {
    html, body {
      width: 100%;
      height: 100%;
    }
  }
`;

/**
 * @param {string} htmlContent - the inner HTML/markup to print
 * @param {Object} options
 * @param {string} [options.pageSize='A4'] - e.g. 'A4', 'Letter', '80mm 297mm' (thermal receipt)
 * @param {string} [options.margin='10mm']
 * @param {'portrait'|'landscape'} [options.orientation='portrait']
 * @param {string} [options.extraCSS=''] - additional CSS rules appended after the base rules
 * @param {string} [options.title='Print']
 * @returns {Promise<void>} resolves once the print dialog has been triggered
 */
export function printDOM(htmlContent, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      pageSize    = 'A4',
      margin      = '10mm',
      orientation = 'portrait',
      extraCSS    = '',
      title       = 'Print',
    } = options;

    if (!htmlContent) {
      reject(new Error('No content provided to print.'));
      return;
    }

    // Build the @page rule, including orientation only for standard sizes
    // (thermal/receipt sizes like "80mm 297mm" already imply their own shape)
    const sizeDeclaration = orientation && !pageSize.includes(' ')
      ? `${pageSize} ${orientation}`
      : pageSize;

    const pageCSS = `
      @page {
        size: ${sizeDeclaration};
        margin: ${margin};
      }
    `;

    const fullCSS = `
      ${DEFAULT_PRINT_CSS.replace(/@page\s*{[^}]*}/, pageCSS)}
      ${extraCSS}
    `;

    // Create an isolated hidden iframe so the host page's own styles /
    // layout are never disturbed, and so window.print() only prints the
    // iframe's document rather than the whole app shell.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');

    document.body.appendChild(iframe);

    const cleanup = () => {
      // Give the browser's print dialog a moment before tearing the iframe
      // down — removing it too early can cancel the print job in some browsers.
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      reject(new Error('Failed to access iframe document.'));
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>${fullCSS}</style>
        </head>
        <body>${htmlContent}</body>
      </html>
    `);
    doc.close();

    // Wait for images/fonts inside the iframe to finish loading before
    // printing, so print output isn't missing assets.
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    };

    // Fallback in case onload doesn't fire (some browsers with data: content)
    setTimeout(() => {
      if (iframe.contentWindow) {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          cleanup();
        }
      }
    }, 500);
  });
}

/**
 * Convenience wrapper: print a PDF Blob via the browser's native PDF
 * viewer inside an iframe (uses object URL instead of injected HTML).
 */
export function printPDFBlob(pdfBlob) {
  return new Promise((resolve, reject) => {
    if (!pdfBlob) {
      reject(new Error('No PDF blob provided.'));
      return;
    }

    const blobUrl = URL.createObjectURL(pdfBlob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;

    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    };
  });
}