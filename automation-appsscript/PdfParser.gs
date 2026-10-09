/**
 * PDF -> text via Google Drive's built-in OCR conversion. No external API
 * key and no Cloud Console click — just enable the "Drive API" Advanced
 * Service in this Apps Script project (see README: Services (+) > Drive
 * API > version v2 > Add).
 *
 * This is the one place in the whole project that downloads attachment
 * CONTENT rather than just a filename — that's the necessary tradeoff for
 * actually reading what's inside a PDF invoice. The temp Doc created for
 * OCR is deleted immediately after reading; nothing is kept in Drive.
 */

var PDF_OCR_MAX_ATTACHMENTS_PER_MESSAGE = 3;

/** OCRs one PDF Blob via a throwaway Google Doc conversion. Returns '' on any failure (never throws — one bad PDF shouldn't fail the whole scan). */
function extractTextFromPdfBlob_(blob) {
  var tempFileId = null;
  try {
    // No mimeType here on purpose: setting it to GOOGLE_DOCS tells Drive
    // the file already IS a Doc, which makes it refuse to OCR it ("OCR is
    // not supported for files of type application/vnd.google-apps.document").
    // Leaving it unset lets Drive infer the source type from the PDF blob
    // itself and convert+OCR it into a new Doc.
    var resource = {
      title: 'tmp-ocr-' + Utilities.getUuid(),
    };
    var file = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'en' });
    tempFileId = file.id;
    return DocumentApp.openById(tempFileId).getBody().getText() || '';
  } catch (e) {
    Logger.log('PDF OCR failed for "' + blob.getName() + '": ' + e.message);
    return '';
  } finally {
    if (tempFileId) {
      try { Drive.Files.remove(tempFileId); } catch (e2) { /* best-effort cleanup */ }
    }
  }
}

/**
 * Runs OCR on every PDF attachment in the list (capped, so one message
 * with a dozen attachments can't blow the execution time budget) and
 * returns their text concatenated together.
 */
function extractPdfTextFromAttachments_(attachments) {
  var pdfBlobs = attachments
    .filter(function (a) { return a.getName().toLowerCase().endsWith('.pdf'); })
    .slice(0, PDF_OCR_MAX_ATTACHMENTS_PER_MESSAGE);

  return pdfBlobs.map(extractTextFromPdfBlob_).join('\n');
}
