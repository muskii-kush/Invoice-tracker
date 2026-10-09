/**
 * Pulls structured signals (vendor, invoice number, PO/PR, amount,
 * currency, dates, P2P links) out of free-text email bodies / Slack
 * messages. Pure text-in, object-out — ported 1:1 from the Python
 * prototype's extractor.py, later extended with sender-domain vendor
 * inference and labeled invoice/due date extraction.
 */

// Domains we never want to guess a vendor name from — our own company
// domain and generic public mail providers would produce nonsense vendors.
var EXCLUDED_SENDER_DOMAINS = [
  'cars24.com', 'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com',
  'yahoo.com', 'icloud.com', 'protonmail.com', 'live.com', 'aol.com',
];

// Two-label TLDs (co.in, com.au, ...) — stripped together, not just the
// last label, so "vendor.co.in" doesn't derive "Co" as the vendor name.
var MULTI_PART_TLDS = ['co.in', 'com.au', 'co.uk', 'com.sg', 'co.nz', 'co.za', 'net.in'];

function extractSenderEmail_(senderHeader) {
  var s = senderHeader || '';
  var angled = s.match(/<([^>]+)>/);
  if (angled) return angled[1].trim().toLowerCase();
  var bare = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return bare ? bare[0].trim().toLowerCase() : null;
}

function extractSenderDomain_(senderHeader) {
  var email = extractSenderEmail_(senderHeader);
  if (!email) return null;
  var at = email.lastIndexOf('@');
  return at === -1 ? null : email.slice(at + 1);
}

/** "Ozonetel Billing <billing@ozonetel.com>" -> "Ozonetel Billing". Null if the header is a bare address with no display name. */
function extractSenderName_(senderHeader) {
  var m = (senderHeader || '').match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  return m ? m[1].trim() : null;
}

/** "billing.ozonetel.com" -> "Ozonetel". Handles subdomains and two-label TLDs. Returns null for domains too short/odd to trust. */
function deriveVendorNameFromDomain_(domain) {
  if (!domain) return null;
  var labels = domain.toLowerCase().split('.');
  var lastTwo = labels.slice(-2).join('.');
  labels = (MULTI_PART_TLDS.indexOf(lastTwo) !== -1) ? labels.slice(0, -2) : labels.slice(0, -1);
  if (!labels.length) return null;
  var company = labels[labels.length - 1];
  if (!company || company.length < 2) return null;
  return company.charAt(0).toUpperCase() + company.slice(1);
}

/**
 * Vendor resolution, in priority order:
 *  1. Known vendor name appears literally in the message text (existing behavior).
 *  2. Sender's domain matches a "Known Vendor Email Domain" from Vendor Reference (confident).
 *  3. Sender's domain doesn't match anything known — guess a vendor name from
 *     the domain itself (e.g. billing@exotel.in -> "Exotel"). Lower confidence;
 *     callers should treat this as a candidate, not a confirmed vendor.
 * Returns {name, source} where source is 'text-match' | 'known-domain' | 'guessed-domain', or null.
 */
function findVendor_(text, knownVendors, senderDomain, domainVendorMap) {
  var vendors = knownVendors || KNOWN_VENDORS;
  var lowered = (text || '').toLowerCase();
  for (var i = 0; i < vendors.length; i++) {
    if (lowered.indexOf(vendors[i].toLowerCase()) !== -1) {
      return { name: vendors[i], source: 'text-match' };
    }
  }
  if (senderDomain) {
    if (domainVendorMap && domainVendorMap[senderDomain]) {
      return { name: domainVendorMap[senderDomain], source: 'known-domain' };
    }
    if (EXCLUDED_SENDER_DOMAINS.indexOf(senderDomain) === -1) {
      var guess = deriveVendorNameFromDomain_(senderDomain);
      if (guess) return { name: guess, source: 'guessed-domain' };
    }
  }
  return null;
}

function findMatches_(text, patterns) {
  var found = [];
  patterns.forEach(function (pattern) {
    var re = new RegExp(pattern.source, pattern.flags.indexOf('g') === -1 ? pattern.flags + 'g' : pattern.flags);
    var m;
    while ((m = re.exec(text)) !== null) {
      found.push(m[0]);
      if (m.index === re.lastIndex) re.lastIndex++; // guard zero-width matches
    }
  });
  var seen = {}, ordered = [];
  found.forEach(function (v) {
    if (!seen[v]) { seen[v] = true; ordered.push(v); }
  });
  return ordered;
}

function findPoNumbers_(text) { return findMatches_(text, PO_NUMBER_PATTERNS); }
function findPrNumbers_(text) { return findMatches_(text, PR_NUMBER_PATTERNS); }
function findInvoiceNumbers_(text) { return findMatches_(text, INVOICE_NUMBER_PATTERNS); }

function findP2pLinks_(text) {
  var urls = (text || '').match(/https?:\/\/\S+/g) || [];
  return urls.filter(function (u) {
    return P2P_LINK_PATTERNS.some(function (p) { return p.test(u); });
  });
}

var CURRENCY_HINTS = { inr: 'INR', rs: 'INR', 'rs.': 'INR', '₹': 'INR', usd: 'USD', '$': 'USD' };

function findAmounts_(text) {
  text = text || '';
  var candidates = [];
  var symRe = /[₹$]|Rs\.?|INR|USD/gi;
  var m;
  while ((m = symRe.exec(text)) !== null) {
    var window = text.slice(m.index + m[0].length, m.index + m[0].length + 20);
    var numMatch = window.match(/[\d,]+(?:\.\d{1,2})?/);
    if (numMatch) {
      var val = parseFloat(numMatch[0].replace(/,/g, ''));
      if (!isNaN(val)) candidates.push(val);
    }
  }
  var bracketRe = /\((\d[\d,]{3,}(?:\.\d{1,2})?)\)/g;
  while ((m = bracketRe.exec(text)) !== null) {
    var val2 = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(val2)) candidates.push(val2);
  }
  return candidates;
}

function findCurrency_(text) {
  var lowered = (text || '').toLowerCase();
  for (var hint in CURRENCY_HINTS) {
    if (lowered.indexOf(hint) !== -1) return CURRENCY_HINTS[hint];
  }
  return null;
}

/** One date token ("12/09/2026", "2026-09-12") -> ISO yyyy-MM-dd, or null if it doesn't parse as a real calendar date. */
function parseDateToken_(token) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
    var iso = new Date(token + 'T00:00:00Z');
    return isNaN(iso) ? null : Utilities.formatDate(iso, 'UTC', 'yyyy-MM-dd');
  }
  var parts = token.split(/[/-]/);
  if (parts.length !== 3) return null;
  // Ambiguous d/m/y vs m/d/y — try both, keep whichever is a valid calendar date.
  var a = Number(parts[0]), b = Number(parts[1]), y = Number(parts[2]);
  if (y < 100) y += 2000;
  var candidate = new Date(Date.UTC(y, b - 1, a));
  if (!isNaN(candidate) && candidate.getUTCDate() === a && candidate.getUTCMonth() === b - 1) {
    return Utilities.formatDate(candidate, 'UTC', 'yyyy-MM-dd');
  }
  return null;
}

function findDates_(text) {
  var tokens = (text || '').match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/g) || [];
  var out = [];
  tokens.forEach(function (t) {
    var parsed = parseDateToken_(t);
    if (parsed) out.push(parsed);
  });
  return out;
}

var DATE_TOKEN_RE = '(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})';

/** Finds a date that's explicitly labeled nearby (within ~25 chars after the label). Returns ISO date or null. */
function findLabeledDate_(text, labelPattern) {
  // Non-capturing group around the label is required: labelPattern can be
  // a top-level alternation (a|b|c), and without the group, concatenating
  // the date-token suffix directly would only attach to the LAST
  // alternative — the others would match the label alone with no date,
  // leaving the capture group (and parseDateToken_'s input) undefined.
  var re = new RegExp('(?:' + labelPattern.source + ')' + '\\s*(?:is|:|-)?\\s*.{0,25}?' + DATE_TOKEN_RE, 'i');
  var m = (text || '').match(re);
  return m ? parseDateToken_(m[1]) : null;
}

function findInvoiceDate_(text) {
  return findLabeledDate_(text, /invoice\s*date/i);
}

function findDueDate_(text) {
  return findLabeledDate_(text, /due\s*date|payment\s*due|due\s*by/i);
}

function hasAttachmentSignal_(attachmentNames) {
  var names = attachmentNames || [];
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var ext = name.indexOf('.') !== -1 ? name.split('.').pop().toLowerCase() : '';
    for (var category in ATTACHMENT_EXTENSIONS) {
      if (ATTACHMENT_EXTENSIONS[category].indexOf(ext) !== -1) return category;
    }
  }
  return null;
}

/**
 * Run every extractor over one message. senderHeader (the raw "Name
 * <email>" From header) and domainVendorMap (domain -> known vendor name,
 * from Vendor Reference) are optional — omit them and vendor resolution
 * falls back to text-matching only, same as before this was added.
 */
function extractAll_(text, attachmentNames, knownVendors, senderHeader, domainVendorMap) {
  text = text || '';
  var senderDomain = extractSenderDomain_(senderHeader);
  var vendorResult = findVendor_(text, knownVendors, senderDomain, domainVendorMap);
  var dates = findDates_(text);
  var invoiceDate = findInvoiceDate_(text);
  var dueDate = findDueDate_(text);
  // If neither date was explicitly labeled and exactly one date exists in
  // the whole message, keep the old behavior of treating it as the due
  // date (most manual-tracker remarks that mention one date mean "due by").
  if (!invoiceDate && !dueDate && dates.length === 1) {
    dueDate = dates[0];
  }

  return {
    vendor: vendorResult ? vendorResult.name : null,
    vendorSource: vendorResult ? vendorResult.source : null,
    senderDomain: senderDomain,
    senderName: extractSenderName_(senderHeader),
    poNumbers: findPoNumbers_(text),
    prNumbers: findPrNumbers_(text),
    invoiceNumbers: findInvoiceNumbers_(text),
    p2pLinks: findP2pLinks_(text),
    amounts: findAmounts_(text),
    currency: findCurrency_(text),
    dates: dates,
    invoiceDate: invoiceDate,
    dueDate: dueDate,
    attachmentSignal: hasAttachmentSignal_(attachmentNames),
    attachmentNames: attachmentNames || [],
  };
}
