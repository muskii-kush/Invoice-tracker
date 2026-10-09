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
 *
 * Drive's OCR conversion has its own strict per-user rate limit, separate
 * from general Drive API quota ("User rate limit exceeded for OCR") — it
 * was built for occasional single-document use, not bulk processing. A
 * backfill over real mailboxes full of PDF invoices will hit it if calls
 * fire back-to-back. Two mitigations below: retry-with-backoff on that
 * specific error, and a deliberate minimum pause after every OCR call
 * (success or failure) so the rate rarely gets high enough to trip it.
 */

var PDF_OCR_MAX_ATTACHMENTS_PER_MESSAGE = 3;
var PDF_OCR_MIN_SPACING_MS = 4000;
var PDF_OCR_MAX_RETRIES = 3;

/** OCRs one PDF Blob via a throwaway Google Doc conversion. Returns '' on any non-retryable failure (never throws — one bad PDF shouldn't fail the whole scan). */
function extractTextFromPdfBlob_(blob) {
  var result = '';
  for (var attempt = 0; attempt <= PDF_OCR_MAX_RETRIES; attempt++) {
    var tempFileId = null;
    try {
      // No mimeType here on purpose: setting it to GOOGLE_DOCS tells Drive
      // the file already IS a Doc, which makes it refuse to OCR it ("OCR is
      // not supported for files of type application/vnd.google-apps.document").
      // Leaving it unset lets Drive infer the source type from the PDF blob
      // itself and convert+OCR it into a new Doc.
      var resource = { title: 'tmp-ocr-' + Utilities.getUuid() };
      var file = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'en' });
      tempFileId = file.id;
      result = DocumentApp.openById(tempFileId).getBody().getText() || '';
      break;
    } catch (e) {
      var isRateLimit = /rate limit/i.test(e.message || '');
      if (isRateLimit && attempt < PDF_OCR_MAX_RETRIES) {
        var waitSec = 20 * (attempt + 1); // 20s, 40s, 60s
        Logger.log('OCR rate-limited for "' + blob.getName() + '", waiting ' + waitSec + 's (attempt ' + (attempt + 1) + '/' + PDF_OCR_MAX_RETRIES + ')');
        Utilities.sleep(waitSec * 1000);
        continue;
      }
      Logger.log('PDF OCR failed for "' + blob.getName() + '": ' + e.message);
      result = '';
      break;
    } finally {
      if (tempFileId) {
        try { Drive.Files.remove(tempFileId); } catch (e2) { /* best-effort cleanup */ }
      }
    }
  }
  Utilities.sleep(PDF_OCR_MIN_SPACING_MS); // throttle: never fire OCR calls back-to-back
  return result;
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
