/**
 * Pulls structured signals (vendor, invoice number, PO/PR, amount,
 * currency, dates, P2P links) out of free-text email bodies / Slack
 * messages. Pure text-in, object-out — ported 1:1 from the Python
 * prototype's extractor.py.
 */

function findVendor_(text, knownVendors) {
  var vendors = knownVendors || KNOWN_VENDORS;
  var lowered = (text || '').toLowerCase();
  for (var i = 0; i < vendors.length; i++) {
    if (lowered.indexOf(vendors[i].toLowerCase()) !== -1) return vendors[i];
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

function findDates_(text) {
  // Returns ISO date strings (yyyy-MM-dd) for anything that parses cleanly.
  var tokens = (text || '').match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/g) || [];
  var out = [];
  tokens.forEach(function (t) {
    var d = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      d = new Date(t + 'T00:00:00Z');
    } else {
      var parts = t.split(/[/-]/);
      if (parts.length === 3) {
        // Ambiguous d/m/y vs m/d/y — try both, keep whichever is a valid calendar date.
        var a = Number(parts[0]), b = Number(parts[1]), y = Number(parts[2]);
        if (y < 100) y += 2000;
        var candidate = new Date(Date.UTC(y, b - 1, a));
        if (!isNaN(candidate) && candidate.getUTCDate() === a && candidate.getUTCMonth() === b - 1) {
          d = candidate;
        }
      }
    }
    if (d && !isNaN(d)) out.push(Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'));
  });
  return out;
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

/** Run every extractor over one message body; returns the flat signal object classify_() and match_() consume. */
function extractAll_(text, attachmentNames, knownVendors) {
  text = text || '';
  return {
    vendor: findVendor_(text, knownVendors),
    poNumbers: findPoNumbers_(text),
    prNumbers: findPrNumbers_(text),
    invoiceNumbers: findInvoiceNumbers_(text),
    p2pLinks: findP2pLinks_(text),
    amounts: findAmounts_(text),
    currency: findCurrency_(text),
    dates: findDates_(text),
    attachmentSignal: hasAttachmentSignal_(attachmentNames),
    attachmentNames: attachmentNames || [],
  };
}
