// team-card.js — Pure renderer for the projector team-card.
//
// Extracted from draft-projector.js so both the draft and group-draw pages
// emit byte-identical HTML for a community's roster card. Pure function:
// no DOM reads, no globals, everything comes in via `opts`.
//
// Usage:
//   const html = TeamCard.render(community, {
//     players:           Array<Player>,    // merged captains + draftees
//     picks:             Array<Pick>,      // Supabase picks (used by slotHtml)
//     avatarsByUserId:   Object<id,url>,   // pre-fetched avatar URLs
//     communityBase:     string,           // base URL for per-team page link
//     isLive:            boolean,          // 'ON CLOCK' badge
//     isNext:            boolean,          // 'NEXT' badge
//     justPickedId:      string|null,      // flash the freshly-picked slot
//     expanded:          boolean,          // .is-expanded mobile state
//   });

window.TeamCard = (function () {
  'use strict';

  const PICKS_PER_TEAM = 8;

  function render(community, opts) {
    opts = opts || {};
    const players          = opts.players          || [];
    const picks            = opts.picks            || [];
    const avatarsByUserId  = opts.avatarsByUserId  || {};
    const communityBase    = (opts.communityBase || '').replace(/\/+$/, '');
    const isLive           = !!opts.isLive;
    const isNext           = !!opts.isNext;
    const isBackToBack     = isLive && isNext;
    const justPickedId     = opts.justPickedId || null;
    const expanded         = !!opts.expanded;

    if (!community) {
      return `<div class="team-card"><div class="tname">—</div><div class="team-logo">?</div></div>`;
    }

    const cls = ['team-card',
      isLive && 'live',
      isNext && 'next',
      isBackToBack && 'back-to-back',
      expanded && 'is-expanded'
    ].filter(Boolean).join(' ');

    const teamColor = community.color || '#6b7a99';
    const tInitials = initials(community.name || community.id);
    const logoHtml = community.logoPath
      ? `<img src="${escapeHtml(community.logoPath)}" alt="${escapeHtml(community.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${escapeHtml(tInitials)}'}))">`
      : escapeHtml(tInitials);
    const { F, M } = rosterFor(community.id, players, picks);
    const teamHref = communityBase
      ? `${communityBase}/${escapeHtml(community.id)}/`
      : `team.html?community=${escapeHtml(community.id)}`;

    const avgTeam   = averageLevel(F.concat(M));
    const avgFemale = averageLevel(F);
    const avgMale   = averageLevel(M);

    const { made: picksMade, remaining: picksRemaining, total: picksTotal } = summaryFor(community.id, picks);
    const summaryHtml = `<span class="count">${picksMade}/${picksTotal} Players</span><span class="sep">·</span>${picksRemaining} Left`;

    return `
      <div class="${cls}" style="--team-color: ${escapeHtml(teamColor)};" data-team-id="${escapeHtml(community.id)}">
        <a class="tname" href="${teamHref}">${escapeHtml(community.name || community.id)}</a>
        <div class="team-card-summary">${summaryHtml}</div>
        <div class="team-card-chevron" aria-hidden="true">▸</div>
        <div class="team-stats">
          <div class="stat stat-female"><span class="stat-label" aria-label="Female">♀</span><span class="stat-val">${avgFemale}</span></div>
          <div class="stat stat-team"><span class="stat-label" aria-label="Team">⚥</span><span class="stat-val">${avgTeam}</span></div>
          <div class="stat stat-male"><span class="stat-label" aria-label="Male">♂</span><span class="stat-val">${avgMale}</span></div>
        </div>
        <div class="team-logo">${logoHtml}</div>
        <div class="roster10">
          <div class="row-female" style="display:contents">
            ${F.map(p => slotHtml(p, 'F', justPickedId, avatarsByUserId, players)).join('')}
          </div>
          <div class="row-male" style="display:contents">
            ${M.map(p => slotHtml(p, 'M', justPickedId, avatarsByUserId, players)).join('')}
          </div>
          <div class="roster-plaque-logo" aria-hidden="true">${logoHtml}</div>
          <div class="roster-plaque-stats" aria-hidden="true">
            <div class="stat stat-female"><span class="stat-label">♀</span><span class="stat-val">${avgFemale}</span></div>
            <div class="stat stat-team"><span class="stat-label">⚥</span><span class="stat-val">${avgTeam}</span></div>
            <div class="stat stat-male"><span class="stat-label">♂</span><span class="stat-val">${avgMale}</span></div>
          </div>
        </div>
        <a class="team-card-nav" href="${teamHref}">View Team Page →</a>
      </div>`;
  }

  function slotHtml(player, row, justPickedId, avatarsByUserId, players) {
    if (!player) return `<div class="slot empty"></div>`;
    const justPicked = justPickedId && justPickedId === player.playerId;
    const cls = ['slot', 'filled', player._captain && 'captain'].filter(Boolean).join(' ');
    const avatarSrc = resolveAvatar(player, avatarsByUserId, players);
    const av = avatarSrc
      ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(player.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${escapeHtml(initials(player.name))}'}))">`
      : escapeHtml(initials(player.name));
    const flag = flagEmoji(countryCodeFor(player.nationality));
    const flagHtml = flag
      ? `<div class="flag" title="${escapeHtml(player.nationality || '')}">${flag}</div>`
      : '';
    return `<div class="${cls}"${justPicked ? ' data-just-picked="1"' : ''}>
      <div class="avatar">${av}${flagHtml}</div>
      <div class="fname">${escapeHtml(firstName(player.name))}</div>
    </div>`;
  }

  function rosterFor(teamId, players, picks) {
    const draftedIds = new Set();
    const drafted = [];
    (picks || []).forEach(p => {
      if (p.is_undone) return;
      if (p.team_id !== teamId) return;
      draftedIds.add(p.player_id);
      const player = players.find(pl => pl.playerId === p.player_id) ||
                     { playerId: p.player_id, name: p.player_id, gender: '', isCaptain: false, avatar: '' };
      drafted.push(Object.assign({}, player, { _pickNumber: p.pick_number }));
    });
    const captains = players.filter(p =>
      p.communityId === teamId && p.isCaptain && !draftedIds.has(p.playerId));

    const fSlots = []; const mSlots = [];
    captains.forEach(p => {
      if (p.gender === 'F') fSlots.push(Object.assign({}, p, { _captain: true }));
      else if (p.gender === 'M') mSlots.push(Object.assign({}, p, { _captain: true }));
    });
    drafted.forEach(p => {
      if (p.gender === 'F') fSlots.push(p);
      else if (p.gender === 'M') mSlots.push(p);
      else (fSlots.length <= mSlots.length ? fSlots : mSlots).push(p);
    });
    while (fSlots.length < 5) fSlots.push(null);
    while (mSlots.length < 5) mSlots.push(null);
    return { F: fSlots.slice(0, 5), M: mSlots.slice(0, 5) };
  }

  function summaryFor(teamId, picks) {
    const made = (picks || [])
      .filter(p => p.team_id === teamId && !p.is_undone)
      .length;
    return { made, remaining: Math.max(0, PICKS_PER_TEAM - made), total: PICKS_PER_TEAM };
  }

  function resolveAvatar(p, avatarsByUserId, players) {
    if (p && p.playerAvatar) return p.playerAvatar;
    const id = p && p.playerId;
    if (!id) return '';
    if (avatarsByUserId && avatarsByUserId[id]) return avatarsByUserId[id];
    const localPlayer = (players || []).find(pl => pl.playerId === id);
    return (localPlayer && localPlayer.avatar) || '';
  }

  function averageLevel(slots) {
    const levels = slots
      .filter(p => p && typeof p.level === 'number' && !isNaN(p.level))
      .map(p => p.level);
    if (!levels.length) return '—';
    return (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1);
  }

  function firstName(full) {
    if (!full) return '';
    return String(full).trim().split(/[\s_]/)[0];
  }
  function initials(s) {
    if (!s) return '?';
    const parts = String(s).trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase();
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  const COUNTRY_CODE = {
    'thailand': 'TH', 'th': 'TH',
    'brazil': 'BR', 'br': 'BR',
    'spain': 'ES', 'es': 'ES',
    'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB', 'scotland': 'GB',
    'turkey': 'TR', 'tr': 'TR',
    'russia': 'RU', 'ru': 'RU',
    'italy': 'IT', 'it': 'IT',
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'france': 'FR', 'fr': 'FR',
    'germany': 'DE', 'de': 'DE',
    'india': 'IN', 'in': 'IN',
    'japan': 'JP', 'jp': 'JP',
    'china': 'CN', 'cn': 'CN',
    'korea': 'KR', 'south korea': 'KR', 'kr': 'KR',
    'argentina': 'AR', 'mexico': 'MX', 'chile': 'CL', 'colombia': 'CO', 'peru': 'PE',
    'australia': 'AU', 'canada': 'CA', 'new zealand': 'NZ',
    'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT',
    'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
    'portugal': 'PT', 'poland': 'PL', 'czech republic': 'CZ', 'czechia': 'CZ',
    'singapore': 'SG', 'malaysia': 'MY', 'indonesia': 'ID', 'philippines': 'PH',
    'vietnam': 'VN', 'hong kong': 'HK', 'taiwan': 'TW',
    'south africa': 'ZA', 'ireland': 'IE', 'greece': 'GR', 'israel': 'IL',
    'uae': 'AE', 'united arab emirates': 'AE', 'saudi arabia': 'SA',
    'ukraine': 'UA', 'romania': 'RO', 'hungary': 'HU', 'serbia': 'RS', 'croatia': 'HR',
    'bangladesh': 'BD', 'sri lanka': 'LK', 'luxembourg': 'LU',
    'myanmar': 'MM', 'burma': 'MM', 'myanmar [burma]': 'MM',
  };
  function countryCodeFor(name) {
    if (!name) return '';
    const key = String(name).trim().toLowerCase();
    return COUNTRY_CODE[key] || (key.length === 2 ? key.toUpperCase() : '');
  }
  function flagEmoji(code) {
    if (!code || code.length !== 2) return '';
    return `<span class="fi fi-${code.toLowerCase()}"></span>`;
  }

  return { render, rosterFor, summaryFor, averageLevel, firstName, initials, escapeHtml, resolveAvatar, countryCodeFor, flagEmoji };
})();
