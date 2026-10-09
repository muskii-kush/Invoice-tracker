/**
 * Read-only Slack access via UrlFetchApp + the Slack Web API — no separate
 * Python process, no slack_sdk. Only touches channels listed in the Setup
 * tab's "Slack approved channels" field, per the master prompt's "search
 * only explicitly approved channels/conversations" rule.
 */

function slackFetch_(method, params, token) {
  var maxRetries = 4;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    var resp = UrlFetchApp.fetch('https://slack.com/api/' + method, {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token },
      payload: params,
      muteHttpExceptions: true,
    });
    var json = JSON.parse(resp.getContentText());
    if (json.ok) return json;

    if (json.error === 'ratelimited' && attempt < maxRetries) {
      var headers = resp.getHeaders();
      var retryAfterSec = Number(headers['Retry-After'] || headers['retry-after'] || 10);
      Logger.log('Slack rate-limited on ' + method + ', waiting ' + retryAfterSec + 's (attempt ' + (attempt + 1) + '/' + maxRetries + ')');
      Utilities.sleep((retryAfterSec + 1) * 1000);
      continue;
    }
    throw new Error('Slack API error (' + method + '): ' + json.error);
  }
}

function resolveSlackChannelId_(token, nameOrId) {
  if (/^[CG][A-Z0-9]{6,}$/.test(nameOrId)) return nameOrId;
  var target = nameOrId.replace(/^#/, '');
  var cursor = '';
  do {
    var resp = slackFetch_('conversations.list',
      { types: 'public_channel,private_channel', cursor: cursor, limit: 200 }, token);
    var found = resp.channels.filter(function (c) { return c.name === target; })[0];
    if (found) return found.id;
    cursor = (resp.response_metadata && resp.response_metadata.next_cursor) || '';
  } while (cursor);
  return null;
}

function normalizeSlackMessage_(token, channelId, msg) {
  var files = (msg.files || []).map(function (f) { return f.name || f.id; });
  var permalink = null;
  try {
    permalink = slackFetch_('chat.getPermalink', { channel: channelId, message_ts: msg.ts }, token).permalink;
  } catch (e) {
    // Permalink lookup can fail for ephemeral/system messages — not fatal.
  }
  return {
    ts: msg.ts, user: msg.user || msg.bot_id || 'unknown', text: msg.text || '',
    files: files, permalink: permalink, threadTs: msg.thread_ts || null,
    isThreadReply: !!(msg.thread_ts && msg.thread_ts !== msg.ts),
  };
}

function listSlackChannelMessages_(token, channelId, oldestTs) {
  var out = [];
  var cursor = '';
  do {
    var params = { channel: channelId, limit: 200, cursor: cursor };
    if (oldestTs) params.oldest = oldestTs;
    var resp = slackFetch_('conversations.history', params, token);
    resp.messages.forEach(function (m) { out.push(normalizeSlackMessage_(token, channelId, m)); });
    cursor = resp.has_more ? (resp.response_metadata && resp.response_metadata.next_cursor) : '';
  } while (cursor);
  return out;
}

function listSlackThreadReplies_(token, channelId, threadTs) {
  var out = [];
  var cursor = '';
  do {
    var resp = slackFetch_('conversations.replies', { channel: channelId, ts: threadTs, limit: 200, cursor: cursor }, token);
    resp.messages.forEach(function (m) {
      if (m.ts === threadTs) return; // parent already captured by listSlackChannelMessages_
      out.push(normalizeSlackMessage_(token, channelId, m));
    });
    cursor = resp.has_more ? (resp.response_metadata && resp.response_metadata.next_cursor) : '';
  } while (cursor);
  return out;
}

/**
 * Scans every approved channel since its stored cursor (or defaultOldestTs
 * if the channel has no cursor yet — e.g. a first backfill run, bounded to
 * the configured lookback window rather than the channel's entire history).
 * Calls onMessage for each message and each thread reply.
 */
function scanSlack_(config, cursors, onMessage, defaultOldestTs) {
  if (!config.slackToken) {
    Logger.log('No SLACK_BOT_TOKEN set in Script Properties — skipping Slack.');
    return 0;
  }
  var scanned = 0;
  config.slackApprovedChannels.forEach(function (channelName) {
    if (!channelName) return;
    var channelId = resolveSlackChannelId_(config.slackToken, channelName);
    if (!channelId) {
      Logger.log('Slack: could not resolve channel "' + channelName + '" — is the bot invited?');
      return;
    }
    var oldest = cursors[channelId] || defaultOldestTs;
    var messages = listSlackChannelMessages_(config.slackToken, channelId, oldest);
    messages.forEach(function (msg) {
      onMessage(msg, 'channel:' + channelName);
      scanned++;
      cursors[channelId] = cursors[channelId] ? Math.max(Number(cursors[channelId]), Number(msg.ts)) : msg.ts;
      if (msg.threadTs === msg.ts) { // this message is a thread parent — fetch replies too
        listSlackThreadReplies_(config.slackToken, channelId, msg.ts).forEach(function (reply) {
          onMessage(reply, 'channel:' + channelName + ':thread');
          scanned++;
        });
      }
    });
  });
  return scanned;
}
