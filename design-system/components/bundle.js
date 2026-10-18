/* @ds-bundle: {"format":4,"namespace":"CardVault","components":[{"name":"Button"},{"name":"CreditCard"},{"name":"Avatar"},{"name":"StatusBadge"},{"name":"AmountText"},{"name":"LedgerRow"},{"name":"BalanceCard"},{"name":"OtpShareSheet"},{"name":"TabBar"},{"name":"StatTile"},{"name":"DataTable"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function omit(obj, keys) { var o = {}; for (var k in obj) if (keys.indexOf(k) < 0) o[k] = obj[k]; return o; }

  var SYMBOL = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  function formatMoney(minor, currency) {
    var c = currency || 'INR';
    var n = Math.abs(minor || 0) / 100;
    var s = n.toLocaleString(c === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return (SYMBOL[c] || c + ' ') + s;
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
  }
  function groupDigits(s) { return String(s).replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 '); }

  var ICON = {
    check: 'M5 12.5l4.5 4.5L19 7.5',
    clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
    vault: 'M3 7h18v12H3zM3 11h18M7 15h4',
    friends: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6',
    ledger: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4'
  };
  function Icon(props) {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: ICON[props.name] }));
  }

  function Button(props) {
    var variant = props.variant || 'secondary';
    var rest = omit(props, ['variant', 'size', 'block', 'className', 'children', 'type']);
    return h('button', Object.assign({ type: props.type || 'button' }, rest, {
      className: cx('cv-btn', 'cv-btn-' + variant, props.size === 'sm' && 'cv-btn-sm', props.block && 'cv-btn-block', props.className)
    }), props.children);
  }

  var NETWORK = { visa: 'Visa', mastercard: 'Mastercard', rupay: 'RuPay', amex: 'Amex', diners: 'Diners' };
  function CreditCard(props) {
    var face = props.face || 'onyx';
    var number = props.revealed && props.number ? groupDigits(props.number) : '•••• •••• •••• ' + (props.last4 || '0000');
    var tag = props.sharedWith ? 'Shared with ' + props.sharedWith : props.sharedBy ? 'From ' + props.sharedBy : null;
    return h('div', {
      className: cx('cv-card', 'cv-card-' + face, props.compact && 'cv-card-compact', props.className),
      role: 'group',
      'aria-label': (props.nickname || 'Card') + ', ' + (NETWORK[props.network] || '') + ' ending ' + (props.last4 || '') + (tag ? ', ' + tag : '')
    },
      h('div', { className: 'cv-card-top' },
        h('span', { className: 'cv-card-nick' }, props.nickname || 'Card'),
        tag ? h('span', { className: 'cv-card-tag' }, tag) : null),
      h('div', { className: 'cv-card-chip', 'aria-hidden': true }),
      h('div', { className: 'cv-card-number', 'aria-hidden': true }, number),
      h('div', { className: 'cv-card-bottom' },
        h('div', { className: 'cv-card-meta' },
          props.holder ? h('div', null, h('span', { className: 'cv-card-label' }, 'Card holder'), h('span', { className: 'cv-card-value' }, props.holder)) : null,
          props.expiry ? h('div', null, h('span', { className: 'cv-card-label' }, 'Valid thru'), h('span', { className: 'cv-card-value' }, props.expiry)) : null),
        h('span', { className: 'cv-card-network' }, NETWORK[props.network] || props.network || '')));
  }

  var TONES = ['vault', 'lent', 'neutral'];
  function Avatar(props) {
    var size = props.size || 40;
    var name = props.name || '';
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    var tone = props.tone || TONES[hash % TONES.length];
    return h('span', {
      className: cx('cv-avatar', 'cv-avatar-' + tone, props.className),
      style: { width: size, height: size, fontSize: Math.round(size * 0.38) },
      role: 'img', 'aria-label': name
    }, initials(name));
  }

  var STATUS = {
    pending: { label: 'Pending', glyph: '○' },
    confirmed: { label: 'Confirmed', glyph: '●' },
    settled: { label: 'Settled', glyph: '✓' },
    disputed: { label: 'Disputed', glyph: '!' },
    expired: { label: 'Expired', glyph: '–' },
    shared: { label: 'Shared', glyph: '↗' }
  };
  function StatusBadge(props) {
    var s = STATUS[props.status] || STATUS.pending;
    return h('span', { className: cx('cv-badge', 'cv-badge-' + (STATUS[props.status] ? props.status : 'pending'), props.className) },
      h('span', { className: 'cv-badge-glyph', 'aria-hidden': true }, s.glyph),
      props.children || s.label);
  }

  var DIR_WORD = { lent: 'owed to you', owe: 'you owe', neutral: '' };
  function AmountText(props) {
    var dir = props.direction || 'neutral';
    var sign = dir === 'lent' ? '+' : dir === 'owe' ? '−' : '';
    return h('span', { className: cx('cv-amt', 'cv-amt-' + (props.size || 'sm'), 'cv-amt-' + dir, props.className) },
      h('span', { 'aria-hidden': true }, (props.signed === false ? '' : sign) + formatMoney(props.minor, props.currency)),
      h('span', { className: 'cv-sr' }, formatMoney(props.minor, props.currency) + (DIR_WORD[dir] ? ' ' + DIR_WORD[dir] : '')));
  }

  function LedgerRow(props) {
    var dir = props.direction || 'lent';
    var sub = [props.time, props.cardLast4 ? 'card ••' + props.cardLast4 : null].filter(Boolean).join(' · ');
    return h('div', { className: cx('cv-lrow', props.className), role: 'listitem' },
      h(Avatar, { name: props.name, size: 40 }),
      h('div', { className: 'cv-lrow-main' },
        h('div', { className: 'cv-lrow-title' }, props.merchant ? props.merchant + ' · ' + props.name : props.name),
        h('div', { className: 'cv-lrow-sub' }, sub)),
      h('div', { className: 'cv-lrow-end' },
        h(AmountText, { minor: props.minor, currency: props.currency, direction: dir }),
        props.status ? h(StatusBadge, { status: props.status }) : null));
  }

  function BalanceCard(props) {
    var net = props.netMinor || 0;
    var dir = net > 0 ? 'lent' : net < 0 ? 'owe' : 'neutral';
    return h('div', { className: cx('cv-bal', props.className) },
      h(Avatar, { name: props.name, size: 44 }),
      h('div', null,
        h('div', { className: 'cv-bal-name' }, props.name),
        net === 0
          ? h('div', { className: 'cv-bal-even' }, 'All settled')
          : h('div', null,
              h('div', { className: 'cv-bal-dir' }, dir === 'lent' ? 'owes you' : 'you owe'),
              h(AmountText, { minor: net, currency: props.currency, direction: dir, size: 'md', signed: false }))),
      props.action === false || net === 0 ? null
        : h(Button, { size: 'sm', variant: 'secondary', onClick: props.onAction }, props.actionLabel || (dir === 'lent' ? 'Remind' : 'Settle up')));
  }

  function fmtTimer(sec) { sec = Math.max(0, sec | 0); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function OtpShareSheet(props) {
    var state = props.state || 'request';
    var who = props.requester || 'Your friend';
    var amount = formatMoney(props.minor, props.currency);
    var total = props.validFor || 180;
    var left = props.expiresIn == null ? total : props.expiresIn;
    var otp = String(props.otp || '');
    var otpShown = otp.length === 6 ? otp.slice(0, 3) + ' ' + otp.slice(3) : otp;

    var facts = h('dl', { className: 'cv-facts' },
      h('dt', null, 'Merchant'), h('dd', null, props.merchant || '—'),
      h('dt', null, 'Amount'), h('dd', null, amount),
      h('dt', null, 'Card'), h('dd', null, (props.cardName ? props.cardName + ' ' : '') + '••' + (props.cardLast4 || '')));

    var body;
    if (state === 'request') {
      body = [
        h('div', { key: 'otp', className: 'cv-otp' },
          h('span', { className: 'cv-otp-digits', 'aria-label': 'One-time password ' + otp.split('').join(' ') }, otpShown),
          h('span', { className: 'cv-otp-timer' }, 'Expires in ' + fmtTimer(left))),
        h('div', { key: 'bar', className: 'cv-bar', role: 'progressbar', 'aria-label': 'Time left', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': left },
          h('div', { className: 'cv-bar-fill', style: { width: Math.round(100 * left / total) + '%' } })),
        h('div', { key: 'facts' }, facts),
        h('p', { key: 'note', className: 'cv-sheet-note' }, who + ' sees the OTP once. If the payment succeeds, ' + amount + ' is recorded as owed to you.'),
        h('div', { key: 'act', className: 'cv-sheet-actions' },
          h(Button, { variant: 'primary', block: true, onClick: props.onShare }, 'Share OTP with ' + who),
          h(Button, { variant: 'quiet', block: true, onClick: props.onDecline }, 'Decline'))
      ];
    } else if (state === 'shared') {
      body = [
        h('div', { key: 'r', className: 'cv-sheet-result cv-sheet-result-wait', role: 'status' }, h(Icon, { name: 'clock' }),
          h('div', null, h('strong', null, 'Shared with ' + who), 'Waiting for the bank to confirm the payment. Nothing is recorded until it succeeds.')),
        h('div', { key: 'facts' }, facts),
        h('div', { key: 'act', className: 'cv-sheet-actions' },
          h(Button, { variant: 'danger', block: true, onClick: props.onRevoke }, 'Report a problem'))
      ];
    } else {
      body = [
        h('div', { key: 'r', className: 'cv-sheet-result', role: 'status' }, h(Icon, { name: 'check' }),
          h('div', null, h('strong', null, 'Payment successful'), who + ' owes you ' + amount + '. It’s in both of your ledgers.')),
        h('div', { key: 'facts' }, facts),
        h('div', { key: 'act', className: 'cv-sheet-actions' },
          h(Button, { variant: 'primary', block: true, onClick: props.onDone }, 'Done'))
      ];
    }

    var titles = { request: who + ' needs an OTP', shared: 'OTP shared', success: amount + ' added to your ledger' };
    return h('section', { className: cx('cv-sheet', props.className), 'aria-label': 'OTP request' },
      h('div', { className: 'cv-sheet-grab', 'aria-hidden': true }),
      h('div', { className: 'cv-sheet-kicker' }, 'OTP request'),
      h('h2', { className: 'cv-sheet-title' }, titles[state] || titles.request),
      body);
  }

  var DEFAULT_TABS = [{ id: 'vault', label: 'Vault' }, { id: 'friends', label: 'Friends' }, { id: 'ledger', label: 'Ledger' }, { id: 'settings', label: 'Settings' }];
  function TabBar(props) {
    var items = props.items || DEFAULT_TABS;
    var active = props.active || items[0].id;
    return h('nav', { className: cx('cv-tabbar', props.className), 'aria-label': 'Main' },
      items.map(function (t) {
        return h('button', {
          key: t.id, type: 'button', className: 'cv-tab',
          'aria-current': t.id === active ? 'page' : undefined,
          onClick: props.onChange ? function () { props.onChange(t.id); } : undefined
        }, ICON[t.icon || t.id] ? h(Icon, { name: t.icon || t.id }) : null, t.label);
      }));
  }

  function StatTile(props) {
    var tone = props.deltaTone || 'neutral';
    var arrow = props.trend === 'up' ? '▲ ' : props.trend === 'down' ? '▼ ' : '';
    return h('div', { className: cx('cv-stat', props.className) },
      h('div', { className: 'cv-stat-label' }, props.label),
      h('div', { className: 'cv-stat-value' }, props.value),
      props.delta ? h('div', { className: cx('cv-stat-delta', tone !== 'neutral' && 'cv-stat-delta-' + tone) }, arrow + props.delta) : null);
  }

  function DataTable(props) {
    var cols = props.columns || [];
    return h('div', { className: cx('cv-table-wrap', props.className) },
      h('table', { className: cx('cv-table', props.dense && 'cv-table-dense') },
        props.caption ? h('caption', { className: 'cv-sr' }, props.caption) : null,
        h('thead', null, h('tr', null, cols.map(function (c) {
          return h('th', { key: c.key, scope: 'col', className: cx(c.align === 'right' && 'cv-right') }, c.label);
        }))),
        h('tbody', null, (props.rows || []).map(function (r, i) {
          return h('tr', { key: r.id || i }, cols.map(function (c) {
            var v = c.render ? c.render(r) : r[c.key];
            return h('td', { key: c.key, className: cx(c.align === 'right' && 'cv-right', c.mono && 'cv-mono') }, v);
          }));
        }))));
  }

  var api = {
    Button: Button, CreditCard: CreditCard, Avatar: Avatar, StatusBadge: StatusBadge, AmountText: AmountText,
    LedgerRow: LedgerRow, BalanceCard: BalanceCard, OtpShareSheet: OtpShareSheet, TabBar: TabBar, StatTile: StatTile, DataTable: DataTable,
    formatMoney: formatMoney
  };
  window.CardVault = Object.assign(window.CardVault || {}, api);
})();
