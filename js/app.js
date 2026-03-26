// PadelThailand.com — Tournament Calendar App
// Data source: Google Sheets (published CSV)
// Features: Calendar/List views, multi-day bars, countdown, tooltips,
//           Google Calendar, share, dark/light mode, Thai/English, keyboard nav

const SHEET_ID = '1uEk015Jv8tNGFYlQ7f5Q_DuO4FZbL8ls3cmZLPwsjsk';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const LEAGUES_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Leagues`;
const DAILY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Daily%20Events`;
const CLUBS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Clubs`;

// ---- i18n ----
const i18n = {
  en: {
    nav_calendar: 'Calendar',
    filter_all: 'All',
    filter_organizer: 'Organizer',
    filter_location: 'Location',
    filter_category: 'Category',
    today_btn: 'Today',
    tbc_title: 'Dates To Be Confirmed',
    days_short: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    months_short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    empty_month: 'No tournaments this month',
    empty_list: 'No upcoming tournaments found.',
    loading: 'Loading tournaments...',
    error: 'Unable to load tournaments. Please try again later.',
    register: 'Register Now',
    add_gcal: 'Add to Google Calendar',
    share: 'Copy Link',
    copied: 'Link copied to clipboard!',
    countdown_today: 'Today',
    countdown_tomorrow: 'Tomorrow',
    countdown_days: 'In {n} days',
    countdown_weeks: 'In {n} weeks',
    modal_date: 'Date',
    modal_city: 'City',
    modal_country: 'Country',
    modal_club: 'Club',
    modal_prize: 'Prize',
    view_instagram: 'Instagram',
    featured: 'Featured',
    organizers_title: 'Organizers',
    date_tbc: 'TBC',
    summary_upcoming: '{n} upcoming',
    summary_this_month: '{n} this month',
    summary_organizers: '{n} organizers',
    expand_all: 'Expand All',
    collapse_all: 'Collapse All',
    hide_past: 'Hide Past',
    show_past: 'Show Past',
    search_placeholder: 'Search competitions...',
    register_2: 'Register',
    tournament_details: 'Tournament Details',
    empty_try_search: 'Try a different search term or clear the search',
    empty_try_filter: 'Try selecting a different organizer filter',
    countdown_live: 'Happening Now',
    year_more: '+{n} more',
    filters_btn: 'Filters',
    filter_type: 'Type',
    type_league: 'League',
    type_tournament: 'Tournament',
    org_upcoming: 'Upcoming Competitions',
    org_past: 'Past Competitions',
    org_back: '← Back',
    org_no_events: 'No competitions found for this organizer.',
    type_daily: 'Daily Event',
    modal_time: 'Time',
    map_view: 'Map',
    map_courts: 'courts',
    map_upcoming_events: 'Upcoming Events',
    map_directions: 'Directions',
    map_website: 'Website',
    map_no_clubs: 'No padel clubs found.',
    empty_week: 'No tournaments this week',
  },
  th: {
    nav_calendar: 'ปฏิทิน',
    filter_all: 'ทั้งหมด',
    filter_organizer: 'ผู้จัดงาน',
    filter_location: 'สถานที่',
    filter_category: 'ประเภท',
    today_btn: 'วันนี้',
    tbc_title: 'รอยืนยันวันที่',
    days_short: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
    months: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
    months_short: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    empty_month: 'ไม่มีทัวร์นาเมนต์ในเดือนนี้',
    empty_list: 'ไม่พบทัวร์นาเมนต์ที่กำลังจะมาถึง',
    loading: 'กำลังโหลด...',
    error: 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่',
    register: 'ลงทะเบียน',
    add_gcal: 'เพิ่มใน Google Calendar',
    share: 'คัดลอกลิงก์',
    copied: 'คัดลอกลิงก์แล้ว!',
    countdown_today: 'วันนี้',
    countdown_tomorrow: 'พรุ่งนี้',
    countdown_days: 'อีก {n} วัน',
    countdown_weeks: 'อีก {n} สัปดาห์',
    modal_date: 'วันที่',
    modal_city: 'เมือง',
    modal_country: 'ประเทศ',
    modal_club: 'สนาม',
    modal_prize: 'เงินรางวัล',
    view_instagram: 'Instagram',
    featured: 'แนะนำ',
    organizers_title: 'ผู้จัดงาน',
    date_tbc: 'TBC',
    summary_upcoming: '{n} รายการที่จะมาถึง',
    summary_this_month: '{n} เดือนนี้',
    summary_organizers: '{n} ผู้จัดงาน',
    expand_all: 'ขยายทั้งหมด',
    collapse_all: 'ยุบทั้งหมด',
    hide_past: 'ซ่อนที่ผ่านแล้ว',
    show_past: 'แสดงที่ผ่านแล้ว',
    search_placeholder: 'ค้นหาการแข่งขัน...',
    register_2: 'ลงทะเบียน',
    tournament_details: 'รายละเอียดทัวร์นาเมนต์',
    empty_try_search: 'ลองค้นหาด้วยคำอื่น หรือล้างการค้นหา',
    empty_try_filter: 'ลองเลือกตัวกรองผู้จัดงานอื่น',
    countdown_live: 'กำลังแข่งขัน',
    year_more: '+{n} เพิ่มเติม',
    filters_btn: 'ตัวกรอง',
    filter_type: 'ประเภทงาน',
    type_league: 'ลีก',
    type_tournament: 'ทัวร์นาเมนต์',
    org_upcoming: 'การแข่งขันที่กำลังจะมาถึง',
    org_past: 'การแข่งขันที่ผ่านมา',
    org_back: '← กลับ',
    org_no_events: 'ไม่พบการแข่งขันสำหรับผู้จัดงานนี้',
    type_daily: 'อีเวนต์รายวัน',
    modal_time: 'เวลา',
    map_view: 'แผนที่',
    map_courts: 'สนาม',
    map_upcoming_events: 'การแข่งขันที่กำลังจะมาถึง',
    map_directions: 'เส้นทาง',
    map_website: 'เว็บไซต์',
    map_no_clubs: 'ไม่พบสนามแพเดิล',
    empty_week: 'ไม่มีทัวร์นาเมนต์สัปดาห์นี้',
  }
};

// ---- State ----
let tournaments = [];
let organizerMeta = {}; // { name: { color, logoUrl, instagram, facebook, website } }
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let activeFilters = new Set();        // empty = all organizers
let activeLocationFilters = new Set(); // empty = all locations
let activeCategoryFilters = new Set(); // empty = all categories
let activeTypeFilters = new Set();     // empty = all types
let activeView = 'calendar';
let currentYearView = new Date().getFullYear();
function safeGetItem(key, fallback) {
  try { return localStorage.getItem(key); } catch (e) { return fallback; }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage full or private browsing */ }
}
let currentLang = safeGetItem('pt-lang', null) || 'en';
let currentTheme = safeGetItem('pt-theme', null) || 'dark';
let searchQuery = '';
let hidePast = safeGetItem('pt-hide-past', null) === 'true';
let filtersExpanded = false;
let selectedOrganizer = null;
let previousView = 'calendar';
const IS_ORGANIZER_PAGE = !!document.getElementById('page-organizer');
const IS_COMPETITION_PAGE = !!document.getElementById('page-competition');

function toSlug(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
let currentWeekStart = null; // Date, always a Monday
let listShouldScroll = true;
let modalScrollY = 0;
let clubs = [];
let mapInstance = null;
let mapMarkerCluster = null;
let mapTileLayer = null;

const MAP_TILES = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  }
};

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);
  applyLang(currentLang);
  if (IS_ORGANIZER_PAGE) {
    fetchAndRenderOrganizer();
  } else if (IS_COMPETITION_PAGE) {
    fetchAndRenderCompetition();
  } else {
    fetchTournaments();
    bindEvents();
  }
});

// ---- Data Fetching ----
async function fetchTournaments() {
  showLoading();
  try {
    // Fetch tournaments, leagues, daily events, and clubs tabs in parallel
    const [respTournaments, respLeagues, respDaily, respClubs] = await Promise.all([
      fetch(SHEET_URL),
      fetch(LEAGUES_URL),
      fetch(DAILY_URL),
      fetch(CLUBS_URL)
    ]);
    if (!respTournaments.ok) throw new Error('Failed to fetch tournaments');

    const csvTournaments = await respTournaments.text();
    const tournamentData = parseCSV(csvTournaments);

    // Leagues tab: map headers, parse, force type='league'
    let leagueData = [];
    if (respLeagues.ok) {
      const csvLeagues = await respLeagues.text();
      const mappedCsv = mapLeagueHeaders(csvLeagues);
      leagueData = parseCSV(mappedCsv);
      leagueData.forEach(l => { l.type = 'league'; });
      leagueData.forEach((l, i) => { l.id = tournamentData.length + i; });
    }

    // Daily Events tab: map headers, parse, force type='daily'
    let dailyData = [];
    if (respDaily.ok) {
      const csvDaily = await respDaily.text();
      const mappedCsv = mapDailyHeaders(csvDaily);
      dailyData = parseCSV(mappedCsv);
      dailyData.forEach(d => { d.type = 'daily'; });
      dailyData.forEach((d, i) => { d.id = tournamentData.length + leagueData.length + i; });
    }

    // Clubs tab: parse club data for map
    if (respClubs.ok) {
      const csvClubs = await respClubs.text();
      clubs = parseClubs(csvClubs);
    }

    tournaments = [...tournamentData, ...leagueData, ...dailyData];

    buildOrganizerMeta();
    buildFilters();
    buildLocationFilters();
    buildCategoryFilters();
    buildTypeFilters();
    render();
    checkDeepLink();
  } catch (err) {
    console.error('Error loading tournaments:', err);
    showError();
  }
}

// ---- Organizer Page Init ----
async function fetchAndRenderOrganizer() {
  // Restore clean URL from 404.html redirect via sessionStorage
  const savedPath = sessionStorage.getItem('spa-redirect');
  if (savedPath) {
    sessionStorage.removeItem('spa-redirect');
    history.replaceState(null, '', savedPath);
  }
  // Extract slug from clean URL path or query param fallback
  const currentPath = savedPath || window.location.pathname;
  const pathSlug = currentPath.split('/').filter(Boolean).pop();
  const urlParams = new URLSearchParams(window.location.search);
  const orgSlug = urlParams.get('slug') || pathSlug;
  if (!orgSlug || orgSlug === 'organizer.html') { window.location.href = '/'; return; }

  try {
    const [respTournaments, respLeagues, respDaily] = await Promise.all([
      fetch(SHEET_URL),
      fetch(LEAGUES_URL),
      fetch(DAILY_URL)
    ]);
    if (!respTournaments.ok) throw new Error('Failed to fetch tournaments');

    const csvTournaments = await respTournaments.text();
    const tournamentData = parseCSV(csvTournaments);

    let leagueData = [];
    if (respLeagues.ok) {
      const csvLeagues = await respLeagues.text();
      const mappedCsv = mapLeagueHeaders(csvLeagues);
      leagueData = parseCSV(mappedCsv);
      leagueData.forEach(l => { l.type = 'league'; });
      leagueData.forEach((l, i) => { l.id = tournamentData.length + i; });
    }

    let dailyData = [];
    if (respDaily.ok) {
      const csvDaily = await respDaily.text();
      const mappedCsv = mapDailyHeaders(csvDaily);
      dailyData = parseCSV(mappedCsv);
      dailyData.forEach(d => { d.type = 'daily'; });
      dailyData.forEach((d, i) => { d.id = tournamentData.length + leagueData.length + i; });
    }

    tournaments = [...tournamentData, ...leagueData, ...dailyData];
    buildOrganizerMeta();

    // Find organizer by slug
    const orgName = Object.keys(organizerMeta).find(o => toSlug(o) === orgSlug);
    if (!orgName) { window.location.href = '/'; return; }

    selectedOrganizer = orgName;
    document.title = orgName + ' — Padel Thailand';
    renderOrganizerDetail();

    // Bind minimal events for organizer page
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    const langToggle = document.getElementById('lang-toggle');
    if (langToggle) langToggle.addEventListener('click', () => {
      toggleLang();
      document.title = selectedOrganizer + ' — Padel Thailand';
      renderOrganizerDetail();
    });
    document.addEventListener('keydown', handleKeyboard);

    // Modal close
    const modalOverlay = document.getElementById('modal-overlay');
    const modalClose = document.getElementById('modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    // Back to top
    const backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      window.addEventListener('scroll', () => {
        backToTop.classList.toggle('visible', window.scrollY > 300);
      });
      backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  } catch (err) {
    console.error('Error loading organizer:', err);
    const container = document.getElementById('org-detail-events');
    if (container) container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Unable to load data. Please try again later.</p>';
  }
}

// ---- Competition Page Init ----
async function fetchAndRenderCompetition() {
  // Restore clean URL from 404.html redirect via sessionStorage
  const savedPath = sessionStorage.getItem('spa-redirect');
  if (savedPath) {
    sessionStorage.removeItem('spa-redirect');
    history.replaceState(null, '', savedPath);
  }
  // Extract slug from clean URL path or query param fallback
  const currentPath = savedPath || window.location.pathname;
  const pathSlug = currentPath.split('/').filter(Boolean).pop();
  const urlParams = new URLSearchParams(window.location.search);
  const compSlug = urlParams.get('slug') || pathSlug;
  if (!compSlug || compSlug === 'competition.html') { window.location.href = '/'; return; }

  try {
    const [respTournaments, respLeagues, respDaily] = await Promise.all([
      fetch(SHEET_URL),
      fetch(LEAGUES_URL),
      fetch(DAILY_URL)
    ]);
    if (!respTournaments.ok) throw new Error('Failed to fetch tournaments');

    const csvTournaments = await respTournaments.text();
    const tournamentData = parseCSV(csvTournaments);

    let leagueData = [];
    if (respLeagues.ok) {
      const csvLeagues = await respLeagues.text();
      const mappedCsv = mapLeagueHeaders(csvLeagues);
      leagueData = parseCSV(mappedCsv);
      leagueData.forEach(l => { l.type = 'league'; });
      leagueData.forEach((l, i) => { l.id = tournamentData.length + i; });
    }

    let dailyData = [];
    if (respDaily.ok) {
      const csvDaily = await respDaily.text();
      const mappedCsv = mapDailyHeaders(csvDaily);
      dailyData = parseCSV(mappedCsv);
      dailyData.forEach(d => { d.type = 'daily'; });
      dailyData.forEach((d, i) => { d.id = tournamentData.length + leagueData.length + i; });
    }

    tournaments = [...tournamentData, ...leagueData, ...dailyData];
    buildOrganizerMeta();

    // Find competition by slug
    const ev = tournaments.find(t => t.slug === compSlug);
    if (!ev) { window.location.href = '/'; return; }

    document.title = ev.name + ' — Padel Thailand';

    // Render competition detail (reuses modal content layout)
    const content = document.getElementById('competition-content');
    const dateRange = ev.dateTBC ? formatMonthTBC(ev) : (ev.startDate ? formatDateRange(ev) : 'TBC');
    const countdown = (ev.startDate && !ev.dateTBC) ? getCountdownText(ev) : '';
    const gcalUrl = (ev.startDate && !ev.dateTBC) ? buildGoogleCalendarUrl(ev) : '';
    const shareUrl = window.location.href;

    const today = stripTime(new Date());
    let isPast = false;
    if (ev.dateTBC) {
      isPast = new Date(ev.tbcYear, ev.tbcMonth + 1, 0) < today;
    } else {
      const end = ev.endDate ? stripTime(ev.endDate) : (ev.startDate ? stripTime(ev.startDate) : null);
      isPast = end ? end < today : false;
    }

    const meta = organizerMeta[ev.organizer] || {};
    const logoHtml = meta.logoUrl ? '<img class="modal-org-logo" src="' + esc(meta.logoUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' : '';
    const igEmbedHtml = ev.instagramUrl
      ? '<div class="modal-ig-embed"><blockquote class="instagram-media" data-instgrm-permalink="' + esc(ev.instagramUrl) + '" style="max-width:100%; min-width:280px; width:100%;"></blockquote></div>'
      : '';
    const categoriesHtml = ev.categories.length > 0 ? '<div class="modal-tags">' + ev.categories.map(function(c) { return '<span class="modal-tag">' + esc(c) + '</span>'; }).join('') + '</div>' : '';
    const featuredBadge = ev.featured ? '<span class="modal-featured-badge">' + SVG_STAR + ' ' + t('featured') + '</span>' : '';
    const leagueBadge = ev.type === 'league' ? '<span class="modal-league-badge">' + t('type_league') + '</span>' : '';
    const dailyBadge = ev.type === 'daily' ? '<span class="modal-daily-badge">' + t('type_daily') + '</span>' : '';
    const igAction = ev.instagramUrl ? '<a href="' + esc(ev.instagramUrl) + '" target="_blank" rel="noopener" class="modal-action-btn">' + SVG_INSTAGRAM + ' ' + t('view_instagram') + '</a>' : '';

    content.innerHTML =
      '<div class="modal-header-row">' +
        '<span class="modal-organizer" style="background:' + ev.color + '">' + logoHtml + esc(ev.organizer) + '</span>' +
        leagueBadge + dailyBadge + featuredBadge +
      '</div>' +
      '<h2 class="modal-title">' + esc(ev.name) + (countdown ? ' <span class="countdown-badge">' + countdown + '</span>' : '') + '</h2>' +
      categoriesHtml +
      '<div class="modal-details">' +
        '<div class="modal-detail">' +
          '<span class="modal-detail-icon">&#128197;</span>' +
          '<span class="modal-detail-label">' + t('modal_date') + '</span>' +
          '<span class="modal-detail-value">' + esc(dateRange) + '</span>' +
        '</div>' +
        (ev.timeSlot ? '<div class="modal-detail"><span class="modal-detail-icon">&#128340;</span><span class="modal-detail-label">' + t('modal_time') + '</span><span class="modal-detail-value">' + esc(ev.timeSlot) + '</span></div>' : '') +
        '<div class="modal-detail">' +
          '<span class="modal-detail-icon">&#128205;</span>' +
          '<span class="modal-detail-label">' + t('modal_city') + '</span>' +
          '<span class="modal-detail-value">' + esc(ev.city) + (ev.country ? ', ' + esc(ev.country) : '') + '</span>' +
        '</div>' +
        (ev.club && ev.club !== 'TBC' ? '<div class="modal-detail"><span class="modal-detail-icon">&#127934;</span><span class="modal-detail-label">' + t('modal_club') + '</span><span class="modal-detail-value">' + esc(ev.club) + '</span></div>' : '') +
        (ev.prize ? '<div class="modal-detail"><span class="modal-detail-icon">&#127942;</span><span class="modal-detail-label">' + t('modal_prize') + '</span><span class="modal-detail-value">' + esc(ev.prize) + '</span></div>' : '') +
      '</div>' +
      '<div class="modal-actions">' +
        (ev.regUrl ? '<a href="' + esc(ev.regUrl) + '" target="_blank" rel="noopener" class="modal-register" style="background:' + ev.color + '">' + (isPast ? t('tournament_details') : (ev.regUrl1Label ? esc(ev.regUrl1Label) : t('register'))) + '</a>' : '') +
        (ev.regUrl2 ? '<a href="' + esc(ev.regUrl2) + '" target="_blank" rel="noopener" class="modal-register" style="background:' + ev.color + '">' + (isPast ? t('tournament_details') : (ev.regUrl2Label ? esc(ev.regUrl2Label) : t('register_2'))) + '</a>' : '') +
        '<div class="modal-secondary-actions">' +
          (gcalUrl ? '<a href="' + gcalUrl + '" target="_blank" rel="noopener" class="modal-action-btn">&#128197; ' + t('add_gcal') + '</a>' : '') +
          igAction +
          '<button class="modal-action-btn modal-share-btn" data-share-url="' + esc(shareUrl) + '">&#128279; ' + t('share') + '</button>' +
        '</div>' +
      '</div>' +
      igEmbedHtml;

    // Bind share button
    const shareBtn = content.querySelector('.modal-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function() { shareTournament(shareBtn.dataset.shareUrl); });
    }

    // Re-process Instagram embeds
    if (ev.instagramUrl && window.instgrm) {
      window.instgrm.Embeds.process();
    }

    // Bind minimal events for competition page
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    const langToggle = document.getElementById('lang-toggle');
    if (langToggle) langToggle.addEventListener('click', function() {
      toggleLang();
      document.title = ev.name + ' — Padel Thailand';
      // Re-render content with new language
      fetchAndRenderCompetition();
    });
    document.addEventListener('keydown', handleKeyboard);

    // Back to top
    const backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      window.addEventListener('scroll', function() {
        backToTop.classList.toggle('visible', window.scrollY > 300);
      });
      backToTop.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    }
  } catch (err) {
    console.error('Error loading competition:', err);
    const container = document.getElementById('competition-content');
    if (container) container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Unable to load data. Please try again later.</p>';
  }
}

// Convert Google Drive share links to direct image URLs
function toDirectImageUrl(url) {
  if (!url) return '';
  // Google Drive file link: https://drive.google.com/file/d/FILE_ID/view...
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w400`;
  }
  return url;
}

// Map Leagues tab column headers to match Tournament column headers
function mapLeagueHeaders(csv) {
  const lines = csv.split('\n');
  if (lines.length < 1) return csv;
  lines[0] = lines[0]
    .replace(/League Name/gi, 'Tournament Name')
    .replace(/Organizer Name/gi, 'Organizer')
    .replace(/Club\(s\)/gi, 'Club')
    .replace(/League Instagram URL/gi, 'Tournament Instagram URL');
  return lines.join('\n');
}

// Map Daily Events tab column headers to match Tournament column headers
function mapDailyHeaders(csv) {
  const lines = csv.split('\n');
  if (lines.length < 1) return csv;
  lines[0] = lines[0]
    .replace(/Event Name/gi, 'Tournament Name')
    .replace(/Organizer Name/gi, 'Organizer')
    .replace(/Registration URL Label/gi, 'Registration URL Label #1')
    .replace(/Registration URL/gi, 'Tournament Registration URL #1')
    .replace(/Instagram URL/gi, 'Tournament Instagram URL');
  return lines.join('\n');
}

function parseClubs(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line, idx) => {
    const cols = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (cols[i] || '').trim();
    });
    if (!(obj['Club Name'] || '').trim()) return null;
    const lat = parseFloat(obj['Latitude']);
    const lng = parseFloat(obj['Longitude']);
    if (isNaN(lat) || isNaN(lng)) return null;
    return {
      id: idx,
      name: obj['Club Name'] || '',
      nameTh: obj['Club Name (TH)'] || '',
      city: obj['City'] || '',
      province: obj['Province'] || '',
      lat,
      lng,
      courts: parseInt(obj['Courts'], 10) || 0,
      surface: obj['Surface'] || '',
      website: obj['Website'] || '',
      instagram: obj['Instagram'] || '',
      phone: obj['Phone'] || '',
      googleMapsUrl: obj['Google Maps URL'] || '',
      imageUrl: toDirectImageUrl(obj['Image URL'] || ''),
      description: obj['Description'] || '',
      descriptionTh: obj['Description (TH)'] || '',
      indoorOutdoor: obj['Indoor/Outdoor'] || '',
      hours: obj['Hours'] || '',
    };
  }).filter(Boolean);
}

function parseCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line, idx) => {
    const cols = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (cols[i] || '').trim();
    });
    // Skip rows with no tournament/league name
    if (!(obj['Tournament Name'] || '').trim()) return null;
    const tbcMonthData = parseTBCMonth(obj['Start Date']);
    const startDate = tbcMonthData
      ? new Date(tbcMonthData.year, tbcMonthData.month, 1)
      : parseDate(obj['Start Date']);
    // Build a stable slug from organizer + name for deep links
    const slugBase = toSlug(`${(obj['Organizer'] || '').trim()}-${(obj['Tournament Name'] || '').trim()}`);
    return {
      id: idx,
      slug: slugBase || `t-${idx}`,
      organizer: obj['Organizer'] || '',
      color: obj['Organizer HEX Color'] || '#666',
      name: obj['Tournament Name'] || '',
      startDate: startDate,
      endDate: tbcMonthData ? null : parseDate(obj['End Date']),
      startDateRaw: obj['Start Date'] || '',
      endDateRaw: obj['End Date'] || '',
      dateTBC: !!tbcMonthData,
      tbcMonth: tbcMonthData ? tbcMonthData.month : null,
      tbcYear: tbcMonthData ? tbcMonthData.year : null,
      city: obj['City'] || '',
      country: obj['Country'] || '',
      club: obj['Club'] || '',
      prize: obj['Prize Pool'] || '',
      regUrl: obj['Tournament Registration URL #1'] || '',
      regUrl2: obj['Tournament Registration URL #2'] || '',
      regUrl1Label: obj['Registration URL Label #1'] || '',
      regUrl2Label: obj['Registration URL Label #2'] || '',
      logoUrl: toDirectImageUrl(obj['Organizer Logo'] || ''),
      instagramUrl: obj['Tournament Instagram URL'] || '',
      categories: (obj['Categories'] || '').split(',').map(s => s.trim()).filter(Boolean),
      featured: (obj['Featured'] || '').toLowerCase() === 'true',
      orgInstagram: obj['Organizer Instagram'] || '',
      orgWebsite: obj['Organizer Website'] || '',
      hidden: (obj['Hide'] || '').trim().toLowerCase() === 'yes',
      type: (obj['Type'] || '').trim().toLowerCase() === 'league' ? 'league'
          : (obj['Type'] || '').trim().toLowerCase() === 'daily' ? 'daily'
          : 'tournament',
      timeSlot: (obj['Time Slot'] || '').trim(),
    };
  }).filter(Boolean);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function parseDate(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split('-');
  if (parts.length !== 3) return null;
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const day = parseInt(parts[0], 10);
  const month = months[parts[1]];
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}

function parseTBCMonth(str) {
  if (!str || !str.trim()) return null;
  const trimmed = str.trim();
  if (!trimmed.startsWith('TBC-')) return null;
  const parts = trimmed.split('-');
  if (parts.length !== 3) return null;
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const month = months[parts[1]];
  const year = parseInt(parts[2], 10);
  if (month === undefined || isNaN(year)) return null;
  return { month, year };
}

// ---- Theme ----
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  safeSetItem('pt-theme', theme);
  // Update map tiles if map is initialized
  if (mapInstance && mapTileLayer) {
    const tileConfig = MAP_TILES[theme] || MAP_TILES.dark;
    mapTileLayer.setUrl(tileConfig.url);
  }
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ---- Language ----
function t(key) {
  return i18n[currentLang][key] || i18n['en'][key] || key;
}

function applyLang(lang) {
  currentLang = lang;
  safeSetItem('pt-lang', lang);
  document.getElementById('lang-label').textContent = lang === 'en' ? 'EN' : 'TH';

  // Update static i18n elements (use textContent to avoid XSS)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val) el.textContent = val;
  });

  // Update calendar day headers
  const calHeader = document.getElementById('cal-header');
  if (calHeader) {
    calHeader.innerHTML = t('days_short').map(d => `<span>${d}</span>`).join('');
  }

  // Update search placeholder
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.placeholder = t('search_placeholder');

  // Update hide-past button
  if (document.getElementById('hide-past-btn')) updateHidePastBtn();
}

function toggleLang() {
  applyLang(currentLang === 'en' ? 'th' : 'en');
  if (IS_ORGANIZER_PAGE || IS_COMPETITION_PAGE) return; // Subpages handle re-render separately
  // Re-render content with new language — buildFilters rebuilds filter buttons,
  // then render() updates the active view, summary, TBC, legend, profiles
  if (tournaments.length) {
    buildFilters();
    buildLocationFilters();
    buildCategoryFilters();
    buildTypeFilters();
    // Restore organizer multi-select state after rebuild
    if (activeFilters.size > 0) {
      document.querySelector('#filters .filter-btn[data-organizer="all"]').classList.remove('active');
      activeFilters.forEach(org => {
        const btn = document.querySelector(`#filters .filter-btn[data-organizer="${org}"]`);
        if (btn) btn.classList.add('active');
      });
      document.querySelectorAll('.filter-btn-org').forEach(b => {
        b.style.opacity = activeFilters.has(b.dataset.organizer) ? '1' : '0.35';
      });
    }
    // Restore location multi-select state
    if (activeLocationFilters.size > 0) {
      document.querySelector('#location-filters .filter-btn[data-location="all"]').classList.remove('active');
      activeLocationFilters.forEach(loc => {
        const btn = document.querySelector(`#location-filters .filter-btn[data-location="${loc}"]`);
        if (btn) btn.classList.add('active');
      });
      document.querySelectorAll('#location-filters .filter-btn:not([data-location="all"])').forEach(b => {
        b.style.opacity = activeLocationFilters.has(b.dataset.location) ? '1' : '0.35';
      });
    }
    // Restore category multi-select state
    if (activeCategoryFilters.size > 0) {
      document.querySelector('#category-filters .filter-btn[data-category="all"]').classList.remove('active');
      activeCategoryFilters.forEach(cat => {
        const btn = document.querySelector(`#category-filters .filter-btn[data-category="${cat}"]`);
        if (btn) btn.classList.add('active');
      });
      document.querySelectorAll('#category-filters .filter-btn:not([data-category="all"])').forEach(b => {
        b.style.opacity = activeCategoryFilters.has(b.dataset.category) ? '1' : '0.35';
      });
    }
    // Restore type multi-select state
    if (activeTypeFilters.size > 0) {
      document.querySelector('#type-filters .filter-btn[data-type="all"]').classList.remove('active');
      activeTypeFilters.forEach(tp => {
        const btn = document.querySelector(`#type-filters .filter-btn[data-type="${tp}"]`);
        if (btn) btn.classList.add('active');
      });
      document.querySelectorAll('#type-filters .filter-btn:not([data-type="all"])').forEach(b => {
        b.style.opacity = activeTypeFilters.has(b.dataset.type) ? '1' : '0.35';
      });
    }
    render();
  }
}

// ---- Organizer Meta ----
function buildOrganizerMeta() {
  organizerMeta = {};
  tournaments.filter(t => !t.hidden).forEach(t => {
    if (t.organizer && !organizerMeta[t.organizer]) {
      organizerMeta[t.organizer] = {
        color: t.color,
        logoUrl: t.logoUrl,
        instagram: t.orgInstagram,
        website: t.orgWebsite,
      };
    }
    // Update with non-empty values (in case first row is missing data)
    if (t.organizer && organizerMeta[t.organizer]) {
      const meta = organizerMeta[t.organizer];
      if (t.logoUrl && !meta.logoUrl) meta.logoUrl = t.logoUrl;
      if (t.orgInstagram && !meta.instagram) meta.instagram = t.orgInstagram;
      if (t.orgWebsite && !meta.website) meta.website = t.orgWebsite;
    }
  });
}

// ---- SVG Icons ----
const SVG_INSTAGRAM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>';
const SVG_GLOBE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
const SVG_STAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

// ---- Filters ----
function buildFilters() {
  const container = document.getElementById('filters');
  const visibleTournaments = tournaments.filter(t => !t.hidden);
  const organizers = [...new Set(visibleTournaments.map(t => t.organizer).filter(Boolean))];

  // Count tournaments per organizer
  const orgCounts = {};
  visibleTournaments.forEach(t => {
    if (t.organizer) orgCounts[t.organizer] = (orgCounts[t.organizer] || 0) + 1;
  });
  const totalCount = visibleTournaments.length;

  container.innerHTML = `<button class="filter-btn active" data-organizer="all">${t('filter_all')}<span class="filter-btn-count">${totalCount}</span></button>`;
  organizers.forEach(org => {
    const meta = organizerMeta[org] || {};
    const color = meta.color || '#666';
    const count = orgCounts[org] || 0;
    const btn = document.createElement('button');
    btn.className = 'filter-btn filter-btn-org';
    btn.dataset.organizer = org;
    btn.dataset.color = color;
    // Add logo if available
    if (meta.logoUrl) {
      const img = document.createElement('img');
      img.src = meta.logoUrl;
      img.alt = org;
      img.className = 'filter-btn-logo';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function() { this.style.display = 'none'; };
      btn.appendChild(img);
    }
    btn.appendChild(document.createTextNode(org));
    // Count badge
    const countSpan = document.createElement('span');
    countSpan.className = 'filter-btn-count';
    countSpan.textContent = count;
    btn.appendChild(countSpan);
    // Always show organizer color
    btn.style.background = color;
    btn.style.color = '#fff';
    btn.style.borderColor = color;
    btn.addEventListener('click', () => setFilter(org, btn));
    container.appendChild(btn);
  });
  // Re-bind all filter click
  container.querySelector('[data-organizer="all"]').addEventListener('click', () => setFilter('all'));
}

function setFilter(organizer, clickedBtn) {
  if (organizer === 'all') {
    activeFilters.clear();
  } else {
    // Toggle: add if not present, remove if present
    if (activeFilters.has(organizer)) {
      activeFilters.delete(organizer);
    } else {
      activeFilters.add(organizer);
    }
  }
  // Update button states
  const allBtn = document.querySelector('#filters .filter-btn[data-organizer="all"]');
  if (activeFilters.size === 0) {
    document.querySelectorAll('#filters .filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
  } else {
    allBtn.classList.remove('active');
    document.querySelectorAll('#filters .filter-btn-org').forEach(b => {
      b.classList.toggle('active', activeFilters.has(b.dataset.organizer));
    });
  }
  // Dim non-active organizer buttons
  document.querySelectorAll('.filter-btn-org').forEach(b => {
    b.style.opacity = (activeFilters.size === 0 || activeFilters.has(b.dataset.organizer)) ? '1' : '0.35';
  });
  updateFilterBadge();
  render();
}

// ---- Location Filters ----
function buildLocationFilters() {
  const container = document.getElementById('location-filters');
  const visibleTournaments = tournaments.filter(t => !t.hidden);
  const cities = [...new Set(visibleTournaments.map(t => t.city).filter(Boolean))].sort();

  const cityCounts = {};
  visibleTournaments.forEach(t => {
    if (t.city) cityCounts[t.city] = (cityCounts[t.city] || 0) + 1;
  });
  const totalCount = visibleTournaments.length;

  container.innerHTML = `<button class="filter-btn active" data-location="all">${t('filter_all')}<span class="filter-btn-count">${totalCount}</span></button>`;
  cities.forEach(city => {
    const count = cityCounts[city] || 0;
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.location = city;
    btn.appendChild(document.createTextNode(city));
    const countSpan = document.createElement('span');
    countSpan.className = 'filter-btn-count';
    countSpan.textContent = count;
    btn.appendChild(countSpan);
    btn.addEventListener('click', () => setLocationFilter(city, btn));
    container.appendChild(btn);
  });
  container.querySelector('[data-location="all"]').addEventListener('click', () => setLocationFilter('all'));
}

function setLocationFilter(location, clickedBtn) {
  if (location === 'all') {
    activeLocationFilters.clear();
  } else {
    if (activeLocationFilters.has(location)) {
      activeLocationFilters.delete(location);
    } else {
      activeLocationFilters.add(location);
    }
  }
  const allBtn = document.querySelector('#location-filters .filter-btn[data-location="all"]');
  if (activeLocationFilters.size === 0) {
    document.querySelectorAll('#location-filters .filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
  } else {
    allBtn.classList.remove('active');
    document.querySelectorAll('#location-filters .filter-btn:not([data-location="all"])').forEach(b => {
      b.classList.toggle('active', activeLocationFilters.has(b.dataset.location));
    });
  }
  document.querySelectorAll('#location-filters .filter-btn:not([data-location="all"])').forEach(b => {
    b.style.opacity = (activeLocationFilters.size === 0 || activeLocationFilters.has(b.dataset.location)) ? '1' : '0.35';
  });
  updateFilterBadge();
  render();
}

// ---- Category Filters ----
function buildCategoryFilters() {
  const container = document.getElementById('category-filters');
  const visibleTournaments = tournaments.filter(t => !t.hidden);
  const allCategories = [...new Set(visibleTournaments.flatMap(t => t.categories))].filter(Boolean).sort();

  const catCounts = {};
  visibleTournaments.forEach(t => {
    t.categories.forEach(cat => {
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
  });
  const totalCount = visibleTournaments.length;

  container.innerHTML = `<button class="filter-btn active" data-category="all">${t('filter_all')}<span class="filter-btn-count">${totalCount}</span></button>`;
  allCategories.forEach(cat => {
    const count = catCounts[cat] || 0;
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat;
    btn.appendChild(document.createTextNode(cat));
    const countSpan = document.createElement('span');
    countSpan.className = 'filter-btn-count';
    countSpan.textContent = count;
    btn.appendChild(countSpan);
    btn.addEventListener('click', () => setCategoryFilter(cat, btn));
    container.appendChild(btn);
  });
  container.querySelector('[data-category="all"]').addEventListener('click', () => setCategoryFilter('all'));
}

function setCategoryFilter(category, clickedBtn) {
  if (category === 'all') {
    activeCategoryFilters.clear();
  } else {
    if (activeCategoryFilters.has(category)) {
      activeCategoryFilters.delete(category);
    } else {
      activeCategoryFilters.add(category);
    }
  }
  const allBtn = document.querySelector('#category-filters .filter-btn[data-category="all"]');
  if (activeCategoryFilters.size === 0) {
    document.querySelectorAll('#category-filters .filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
  } else {
    allBtn.classList.remove('active');
    document.querySelectorAll('#category-filters .filter-btn:not([data-category="all"])').forEach(b => {
      b.classList.toggle('active', activeCategoryFilters.has(b.dataset.category));
    });
  }
  document.querySelectorAll('#category-filters .filter-btn:not([data-category="all"])').forEach(b => {
    b.style.opacity = (activeCategoryFilters.size === 0 || activeCategoryFilters.has(b.dataset.category)) ? '1' : '0.35';
  });
  updateFilterBadge();
  render();
}

// ---- Type Filters ----
function buildTypeFilters() {
  const container = document.getElementById('type-filters');
  const visibleTournaments = tournaments.filter(t => !t.hidden);
  const types = [...new Set(visibleTournaments.map(t => t.type).filter(Boolean))].sort();

  const typeCounts = {};
  visibleTournaments.forEach(t => {
    if (t.type) typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
  });
  const totalCount = visibleTournaments.length;

  container.innerHTML = `<button class="filter-btn active" data-type="all">${t('filter_all')}<span class="filter-btn-count">${totalCount}</span></button>`;
  types.forEach(tp => {
    const count = typeCounts[tp] || 0;
    const label = tp === 'league' ? t('type_league') : tp === 'daily' ? t('type_daily') : t('type_tournament');
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.type = tp;
    btn.appendChild(document.createTextNode(label));
    const countSpan = document.createElement('span');
    countSpan.className = 'filter-btn-count';
    countSpan.textContent = count;
    btn.appendChild(countSpan);
    btn.addEventListener('click', () => setTypeFilter(tp, btn));
    container.appendChild(btn);
  });
  container.querySelector('[data-type="all"]').addEventListener('click', () => setTypeFilter('all'));
}

function setTypeFilter(type, clickedBtn) {
  if (type === 'all') {
    activeTypeFilters.clear();
  } else {
    if (activeTypeFilters.has(type)) {
      activeTypeFilters.delete(type);
    } else {
      activeTypeFilters.add(type);
    }
  }
  const allBtn = document.querySelector('#type-filters .filter-btn[data-type="all"]');
  if (activeTypeFilters.size === 0) {
    document.querySelectorAll('#type-filters .filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
  } else {
    allBtn.classList.remove('active');
    document.querySelectorAll('#type-filters .filter-btn:not([data-type="all"])').forEach(b => {
      b.classList.toggle('active', activeTypeFilters.has(b.dataset.type));
    });
  }
  document.querySelectorAll('#type-filters .filter-btn:not([data-type="all"])').forEach(b => {
    b.style.opacity = (activeTypeFilters.size === 0 || activeTypeFilters.has(b.dataset.type)) ? '1' : '0.35';
  });
  updateFilterBadge();
  render();
}

// ---- Events ----
function bindEvents() {
  // Month navigation
  document.getElementById('prev-month').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => navigateMonth(1));

  // Today button
  document.getElementById('today-btn').addEventListener('click', goToToday);

  // Year navigation
  document.getElementById('prev-week').addEventListener('click', () => navigateWeek(-1));
  document.getElementById('next-week').addEventListener('click', () => navigateWeek(1));
  document.getElementById('week-today-btn').addEventListener('click', goToCurrentWeek);
  document.getElementById('prev-year').addEventListener('click', () => { currentYearView--; renderYear(); });
  document.getElementById('next-year').addEventListener('click', () => { currentYearView++; renderYear(); });

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeView = btn.dataset.view;
      listShouldScroll = true;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });

  // Theme & Language
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('lang-toggle').addEventListener('click', toggleLang);

  // Search input with clear button and debounce
  const searchInput = document.getElementById('search-input');
  const searchWrap = document.getElementById('search-wrap');
  const searchClear = document.getElementById('search-clear');
  let searchDebounceTimer = null;

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    searchWrap.classList.toggle('has-query', searchQuery.length > 0);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => render(), 200);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchWrap.classList.remove('has-query');
    searchInput.focus();
    render();
  });

  // Filter panel toggle
  document.getElementById('filter-toggle-btn').addEventListener('click', toggleFilterPanel);

  // Hide past toggle
  document.getElementById('hide-past-btn').addEventListener('click', () => {
    hidePast = !hidePast;
    safeSetItem('pt-hide-past', hidePast);
    updateHidePastBtn();
    render();
  });
  updateHidePastBtn();

  // Back to top
  const backToTopBtn = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => {
    backToTopBtn.classList.toggle('visible', window.scrollY > 400);
  });
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Keyboard navigation
  document.addEventListener('keydown', handleKeyboard);

  // Swipe gesture navigation for calendar
  let touchStartX = 0;
  let touchStartY = 0;
  const calBody = document.getElementById('cal-body');
  calBody.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  calBody.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Only trigger if horizontal swipe is dominant and > 50px
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) navigateMonth(-1); // swipe right = prev
      else navigateMonth(1); // swipe left = next
    }
  }, { passive: true });
}

function updateHidePastBtn() {
  const btn = document.getElementById('hide-past-btn');
  btn.classList.toggle('active', hidePast);
  btn.innerHTML = hidePast
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> <span class="hide-past-label">${t('show_past')}</span>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> <span class="hide-past-label">${t('hide_past')}</span>`;
  btn.title = hidePast ? t('show_past') : t('hide_past');
}

// ---- Filter Panel Toggle ----
function toggleFilterPanel() {
  filtersExpanded = !filtersExpanded;
  const panel = document.getElementById('filter-panel');
  const btn = document.getElementById('filter-toggle-btn');
  if (filtersExpanded) {
    panel.classList.remove('collapsed');
    btn.setAttribute('aria-expanded', 'true');
  } else {
    panel.classList.add('collapsed');
    btn.setAttribute('aria-expanded', 'false');
  }
}

function updateFilterBadge() {
  const btn = document.getElementById('filter-toggle-btn');
  const badge = document.getElementById('filter-badge');
  if (!btn || !badge) return;
  let count = activeFilters.size + activeLocationFilters.size + activeCategoryFilters.size + activeTypeFilters.size;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    btn.classList.add('has-active');
  } else {
    badge.classList.add('hidden');
    btn.classList.remove('has-active');
  }
}

function handleKeyboard(e) {
  // Don't intercept if user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'Escape') { closeModal(); return; }
  if (IS_ORGANIZER_PAGE || IS_COMPETITION_PAGE) return; // No keyboard nav on subpages

  switch (e.key) {
    case 'ArrowLeft':
      if (!isModalOpen()) {
        if (activeView === 'year') { currentYearView--; renderYear(); }
        else if (activeView === 'week') { navigateWeek(-1); }
        else { navigateMonth(-1); }
        e.preventDefault();
      }
      break;
    case 'ArrowRight':
      if (!isModalOpen()) {
        if (activeView === 'year') { currentYearView++; renderYear(); }
        else if (activeView === 'week') { navigateWeek(1); }
        else { navigateMonth(1); }
        e.preventDefault();
      }
      break;
    case 't':
    case 'T':
      if (!isModalOpen()) { goToToday(); e.preventDefault(); }
      break;
  }
}

function isModalOpen() {
  return document.getElementById('modal-overlay').classList.contains('visible');
}

function navigateMonth(dir) {
  const body = document.getElementById('cal-body');
  body.classList.add('fade-out');
  let hasFired = false;
  const onFadeOut = () => {
    if (hasFired) return;
    hasFired = true;
    body.removeEventListener('transitionend', onFadeOut);
    currentMonth += dir;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
    requestAnimationFrame(() => {
      body.classList.remove('fade-out');
      body.classList.add('fade-in');
      setTimeout(() => body.classList.remove('fade-in'), 250);
    });
  };
  body.addEventListener('transitionend', onFadeOut, { once: true });
  // Fallback in case transitionend doesn't fire (e.g., no transition)
  setTimeout(() => {
    if (body.classList.contains('fade-out')) onFadeOut();
  }, 300);
}

function goToToday() {
  const now = new Date();
  if (activeView === 'week') {
    currentWeekStart = getWeekStart(now);
    renderWeek();
  } else {
    currentMonth = now.getMonth();
    currentYear = now.getFullYear();
    renderCalendar();
  }
}

function navigateWeek(dir) {
  const body = document.getElementById('week-body');
  body.classList.add('fade-out');
  let hasFired = false;
  const onFadeOut = () => {
    if (hasFired) return;
    hasFired = true;
    body.removeEventListener('transitionend', onFadeOut);
    if (!currentWeekStart) currentWeekStart = getWeekStart(new Date());
    currentWeekStart = new Date(currentWeekStart.getTime() + dir * 7 * 86400000);
    renderWeek();
    requestAnimationFrame(() => {
      body.classList.remove('fade-out');
      body.classList.add('fade-in');
      setTimeout(() => body.classList.remove('fade-in'), 250);
    });
  };
  body.addEventListener('transitionend', onFadeOut, { once: true });
  setTimeout(() => { if (body.classList.contains('fade-out')) onFadeOut(); }, 300);
}

function goToCurrentWeek() {
  currentWeekStart = getWeekStart(new Date());
  renderWeek();
}

function renderWeek() {
  if (!currentWeekStart) currentWeekStart = getWeekStart(new Date());

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const dated = getDated();
  const daysShort = t('days_short');
  const monthsShort = t('months_short');

  // Compute 7 dates
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    weekDates.push(d);
  }

  // Title: "Mar 24 – 30, 2026" or "Mar 28 – Apr 3, 2026"
  const first = weekDates[0];
  const last = weekDates[6];
  let title;
  if (first.getMonth() === last.getMonth()) {
    title = `${monthsShort[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`;
  } else if (first.getFullYear() === last.getFullYear()) {
    title = `${monthsShort[first.getMonth()]} ${first.getDate()} – ${monthsShort[last.getMonth()]} ${last.getDate()}, ${first.getFullYear()}`;
  } else {
    title = `${monthsShort[first.getMonth()]} ${first.getDate()}, ${first.getFullYear()} – ${monthsShort[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  }
  document.getElementById('week-title').textContent = title;

  // Today button state
  const currentWeekMonday = getWeekStart(today);
  const weekTodayBtn = document.getElementById('week-today-btn');
  if (currentWeekStart.getTime() === currentWeekMonday.getTime()) {
    weekTodayBtn.classList.add('is-current');
  } else {
    weekTodayBtn.classList.remove('is-current');
  }

  // Build header — same format as monthly view (just day names)
  const header = document.getElementById('week-header');
  header.innerHTML = daysShort.map(d => '<span>' + d + '</span>').join('');

  // Build body
  const body = document.getElementById('week-body');
  body.innerHTML = '';
  let hasEvents = false;

  weekDates.forEach((d, i) => {
    const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const isToday = dateStr === todayStr;
    const isPast = d < stripTime(today);

    const col = document.createElement('div');
    col.className = 'week-day';
    col.setAttribute('data-day-label', daysShort[i] + ' ' + d.getDate() + ' ' + monthsShort[d.getMonth()]);
    if (isToday) col.classList.add('today');
    if (isPast) col.classList.add('past-day');

    // Add day number inside cell — same as monthly view
    const dayNum = document.createElement('span');
    dayNum.className = 'cal-day-number';
    dayNum.textContent = d.getDate();
    col.appendChild(dayNum);

    renderDayEvents(col, d, dated, today, { expanded: true });

    if (col.classList.contains('has-events')) hasEvents = true;
    body.appendChild(col);
  });

  // Empty state
  if (!hasEvents) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'week-empty';
    emptyMsg.innerHTML = '<span class="cal-empty-month-icon">&#127934;</span>' + t('empty_week');
    body.appendChild(emptyMsg);
  }
}

// ---- Rendering ----
function render() {
  const views = ['calendar-view', 'week-view', 'year-view', 'list-view', 'map-view'];
  views.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('view-transition-enter');
    }
  });

  const isMapView = activeView === 'map';

  // Hide TBC and org profiles when in map view
  const tbcSection = document.getElementById('tbc-section');
  const orgSection = document.getElementById('organizer-profiles');
  if (tbcSection) tbcSection.style.display = isMapView ? 'none' : '';
  if (orgSection) orgSection.style.display = isMapView ? 'none' : '';

  let activeEl;
  if (activeView === 'calendar') {
    activeEl = document.getElementById('calendar-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    renderCalendar();
  } else if (activeView === 'week') {
    activeEl = document.getElementById('week-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    renderWeek();
  } else if (activeView === 'year') {
    activeEl = document.getElementById('year-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    renderYear();
  } else if (activeView === 'map') {
    activeEl = document.getElementById('map-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    if (!mapInstance) {
      setTimeout(() => { initMap(); }, 50);
    } else {
      mapInstance.invalidateSize();
      renderMapMarkers();
    }
  } else {
    activeEl = document.getElementById('list-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    renderList();
  }

  if (!isMapView) {
    renderTBC();
    renderOrgProfiles();
    renderSummaryBar();
  }
}

function getFiltered() {
  const today = stripTime(new Date());
  return tournaments.filter(t => {
    if (t.hidden) return false;
    if (activeFilters.size > 0 && !activeFilters.has(t.organizer)) return false;
    if (activeLocationFilters.size > 0 && !activeLocationFilters.has(t.city)) return false;
    if (activeCategoryFilters.size > 0 && !t.categories.some(c => activeCategoryFilters.has(c))) return false;
    if (activeTypeFilters.size > 0 && !activeTypeFilters.has(t.type)) return false;
    if (hidePast && t.startDate) {
      const end = t.endDate ? stripTime(t.endDate) : stripTime(t.startDate);
      if (end < today) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = `${t.name} ${t.city} ${t.club} ${t.organizer} ${t.country}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function getDated() {
  return getFiltered().filter(t => t.startDate);
}

function getFullyDated() {
  return getFiltered().filter(t => t.startDate && !t.dateTBC);
}

function getMonthTBC() {
  return getFiltered().filter(t => t.dateTBC);
}

function getTBC() {
  return getFiltered().filter(t => !t.startDate);
}

// ---- Calendar Rendering ----
// Shared day event renderer — used by both month and week views
function renderDayEvents(cell, dayDate, dated, today, options) {
  const expanded = options && options.expanded;

  // Find events on this day (exclude month-TBC)
  const eventsOnDay = dated.filter(ev => {
    if (ev.dateTBC) return false;
    const start = stripTime(ev.startDate);
    const end = ev.endDate ? stripTime(ev.endDate) : start;
    return dayDate >= start && dayDate <= end;
  });

  const barEvents = eventsOnDay.filter(ev => ev.type !== 'daily');
  const dailyEvents = eventsOnDay.filter(ev => ev.type === 'daily');

  if (barEvents.length > 0 || dailyEvents.length > 0) {
    cell.classList.add('has-events');
  }

  // Sort bar events: leagues first
  barEvents.sort((a, b) => {
    if (a.type === 'league' && b.type !== 'league') return -1;
    if (a.type !== 'league' && b.type === 'league') return 1;
    return 0;
  });

  // Render bar events (tournaments + leagues)
  barEvents.forEach(ev => {
    const start = stripTime(ev.startDate);
    const end = ev.endDate ? stripTime(ev.endDate) : start;
    const isStart = dayDate.getTime() === start.getTime();
    const isEnd = dayDate.getTime() === end.getTime();
    const dow = (dayDate.getDay() + 6) % 7;
    const isWeekStart = dow === 0;
    const nextDay = new Date(dayDate); nextDay.setDate(nextDay.getDate() + 1);
    const nextDow = (nextDay.getDay() + 6) % 7;
    const isWeekEnd = nextDow === 0;

    let barClass = 'bar-single';
    if (start.getTime() === end.getTime()) {
      barClass = 'bar-single';
    } else if (isStart || isWeekStart) {
      barClass = (isEnd || isWeekEnd) ? 'bar-single' : 'bar-start';
    } else if (isEnd || isWeekEnd) {
      barClass = 'bar-end';
    } else {
      barClass = 'bar-middle';
    }

    const isLeague = ev.type === 'league';
    const bar = document.createElement('div');
    bar.className = `cal-event-bar ${barClass}${isLeague ? ' cal-league-bar' : ''}`;
    bar.style.background = ev.color;

    if (isStart || isWeekStart) {
      const leagueBadge = isLeague ? `<span class="cal-league-badge">${t('type_league')}</span>` : '';
      const starBadge = ev.featured ? `<span class="bar-star">${SVG_STAR}</span>` : '';
      bar.innerHTML = leagueBadge + starBadge + esc(ev.name);
    }

    if (end < stripTime(today)) {
      bar.classList.add('past-event');
    }

    bar.addEventListener('click', (e) => { e.stopPropagation(); openModal(ev); });
    bar.addEventListener('mouseenter', (e) => showTooltip(e, ev));
    bar.addEventListener('mousemove', (e) => moveTooltip(e));
    bar.addEventListener('mouseleave', hideTooltip);

    cell.appendChild(bar);
  });

  // Render daily events
  if (dailyEvents.length > 0) {
    if (expanded) {
      // Week view: render as mini-cards with name + time
      dailyEvents.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'week-daily-event';
        card.style.borderLeftColor = ev.color;
        if (stripTime(ev.startDate) < stripTime(today)) card.style.opacity = '0.4';
        card.innerHTML =
          '<span class="week-daily-event-name">' + esc(ev.name) + '</span>' +
          (ev.timeSlot ? '<span class="week-daily-event-time">' + esc(ev.timeSlot) + '</span>' : '');
        card.addEventListener('click', (e) => { e.stopPropagation(); openModal(ev); });
        card.addEventListener('mouseenter', (e) => showTooltip(e, ev));
        card.addEventListener('mousemove', (e) => moveTooltip(e));
        card.addEventListener('mouseleave', hideTooltip);
        cell.appendChild(card);
      });
    } else {
      // Month view: render as dots/count badge
      const dotContainer = document.createElement('div');
      dotContainer.className = 'cal-daily-dots';

      if (dailyEvents.length === 1) {
        const dot = document.createElement('span');
        dot.className = 'cal-daily-dot';
        dot.style.backgroundColor = dailyEvents[0].color;
        dot.title = dailyEvents[0].name + (dailyEvents[0].timeSlot ? ` (${dailyEvents[0].timeSlot})` : '');
        if (stripTime(dailyEvents[0].startDate) < stripTime(today)) dot.classList.add('past-event');
        dot.addEventListener('click', (e) => { e.stopPropagation(); openModal(dailyEvents[0]); });
        dot.addEventListener('mouseenter', (e) => showTooltip(e, dailyEvents[0]));
        dot.addEventListener('mousemove', (e) => moveTooltip(e));
        dot.addEventListener('mouseleave', hideTooltip);
        dotContainer.appendChild(dot);
      } else {
        const badge = document.createElement('span');
        badge.className = 'cal-daily-count';
        badge.textContent = dailyEvents.length;
        badge.style.backgroundColor = dailyEvents[0].color;
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          showDailyEventsPopover(e, dailyEvents, cell);
        });
        badge.addEventListener('mouseenter', (e) => {
          const tip = document.getElementById('tooltip');
          tip.innerHTML = dailyEvents.map(ev =>
            `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">` +
            `<span style="width:6px;height:6px;border-radius:50%;background:${ev.color};flex-shrink:0;display:inline-block;"></span>` +
            `<strong>${esc(ev.name)}</strong>` +
            (ev.timeSlot ? `<span style="opacity:0.7;font-size:10px">${esc(ev.timeSlot)}</span>` : '') +
            `</div>`
          ).join('');
          tip.classList.add('visible');
          moveTooltip(e);
        });
        badge.addEventListener('mousemove', (e) => moveTooltip(e));
        badge.addEventListener('mouseleave', hideTooltip);
        dotContainer.appendChild(badge);
      }

      cell.appendChild(dotContainer);
    }
  }
}

function renderCalendar() {
  document.getElementById('month-title').textContent = `${t('months')[currentMonth]} ${currentYear}`;

  // Today button state
  const now = new Date();
  const todayBtn = document.getElementById('today-btn');
  if (currentMonth === now.getMonth() && currentYear === now.getFullYear()) {
    todayBtn.classList.add('is-current');
  } else {
    todayBtn.classList.remove('is-current');
  }

  const body = document.getElementById('cal-body');
  body.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();
  const prevMonthLast = new Date(currentYear, currentMonth, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const dated = getDated();

  // Check if any events exist this month
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0);
  const monthTBCEvents = getMonthTBC().filter(ev => ev.tbcMonth === currentMonth && ev.tbcYear === currentYear);
  const hasEvents = dated.some(t => {
    if (t.dateTBC) return false;
    const start = stripTime(t.startDate);
    const end = t.endDate ? stripTime(t.endDate) : start;
    return end >= monthStart && start <= monthEnd;
  }) || monthTBCEvents.length > 0;

  // Previous month filler days
  for (let i = startDow - 1; i >= 0; i--) {
    body.appendChild(createDayCell(prevMonthLast - i, true, false, false));
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${currentMonth}-${d}`;
    const isToday = dateStr === todayStr;
    const dayDate = new Date(currentYear, currentMonth, d);
    const isPast = dayDate < stripTime(today);
    const cell = createDayCell(d, false, isToday, isPast);

    renderDayEvents(cell, dayDate, dated, today, { expanded: false });
    body.appendChild(cell);
  }

  // Next month filler days
  const totalCells = body.children.length;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    body.appendChild(createDayCell(i, true, false, false));
  }

  // Month-TBC events for this month
  if (monthTBCEvents.length > 0) {
    const tbcRow = document.createElement('div');
    tbcRow.className = 'cal-month-tbc-row';
    monthTBCEvents.forEach(ev => {
      const bar = document.createElement('div');
      bar.className = 'cal-event-bar bar-single cal-tbc-bar';
      bar.style.borderColor = ev.color;
      bar.style.background = hexToRgba(ev.color, 0.15);
      bar.style.color = ev.color;
      bar.innerHTML = `<span class="cal-tbc-badge" style="background:${ev.color}">${t('date_tbc')}</span> ${esc(ev.name)}`;
      bar.addEventListener('click', (e) => { e.stopPropagation(); openModal(ev); });
      bar.addEventListener('mouseenter', (e) => showTooltip(e, ev));
      bar.addEventListener('mousemove', (e) => moveTooltip(e));
      bar.addEventListener('mouseleave', hideTooltip);
      tbcRow.appendChild(bar);
    });
    body.appendChild(tbcRow);
  }

  // Empty month message
  if (!hasEvents) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'cal-empty-month';
    const hasSearch = searchQuery.length > 0;
    const hasFilter = activeFilters.size > 0 || activeLocationFilters.size > 0 || activeCategoryFilters.size > 0 || activeTypeFilters.size > 0;
    if (hasSearch || hasFilter) {
      const hint = hasSearch ? t('empty_try_search') : t('empty_try_filter');
      emptyMsg.innerHTML = `<span class="cal-empty-month-icon">&#127934;</span>${t('empty_list')}<br><span style="font-size:var(--text-sm);color:var(--text-muted)">${hint}</span>`;
    } else {
      emptyMsg.innerHTML = `<span class="cal-empty-month-icon">&#127934;</span>${t('empty_month')}`;
    }
    body.appendChild(emptyMsg);
  }
}

function createDayCell(dayNum, isOtherMonth, isToday, isPast) {
  const cell = document.createElement('div');
  cell.className = 'cal-day';
  if (isOtherMonth) cell.classList.add('other-month');
  if (isToday) cell.classList.add('today');
  if (isPast && !isOtherMonth) cell.classList.add('past-day');

  const num = document.createElement('div');
  num.className = 'cal-day-number';
  num.textContent = dayNum;
  cell.appendChild(num);
  return cell;
}

// ---- Year View Rendering ----
function renderYear() {
  document.getElementById('year-title').textContent = currentYearView;
  const grid = document.getElementById('year-grid');
  grid.innerHTML = '';

  const dated = getDated();
  const today = new Date();
  const dayLabels = currentLang === 'th' ? ['จ','อ','พ','พฤ','ศ','ส','อา'] : ['M','T','W','T','F','S','S'];

  for (let m = 0; m < 12; m++) {
    const monthCard = document.createElement('div');
    monthCard.className = 'year-month';

    const isCurrentMonth = (m === today.getMonth() && currentYearView === today.getFullYear());
    if (isCurrentMonth) monthCard.classList.add('is-current-month');

    const isPastMonth = (currentYearView < today.getFullYear()) ||
      (currentYearView === today.getFullYear() && m < today.getMonth());
    if (isPastMonth) monthCard.classList.add('past-month');

    // Click to navigate to that month
    monthCard.addEventListener('click', () => {
      currentMonth = m;
      currentYear = currentYearView;
      activeView = 'calendar';
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.view-btn[data-view="calendar"]').classList.add('active');
      render();
    });

    // Month name
    const name = document.createElement('div');
    name.className = 'year-month-name';
    name.textContent = t('months')[m];
    monthCard.appendChild(name);

    // Mini day-of-week header
    const miniHeader = document.createElement('div');
    miniHeader.className = 'year-mini-header';
    dayLabels.forEach(d => {
      const s = document.createElement('span');
      s.textContent = d;
      miniHeader.appendChild(s);
    });
    monthCard.appendChild(miniHeader);

    // Mini calendar grid
    const miniGrid = document.createElement('div');
    miniGrid.className = 'year-mini-grid';

    const firstDay = new Date(currentYearView, m, 1);
    const daysInMonth = new Date(currentYearView, m + 1, 0).getDate();
    const startDow = (firstDay.getDay() + 6) % 7;

    // Filler days
    for (let i = 0; i < startDow; i++) {
      const filler = document.createElement('div');
      filler.className = 'year-mini-day other-month';
      miniGrid.appendChild(filler);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'year-mini-day';

      const dayDate = new Date(currentYearView, m, d);
      const isToday = (d === today.getDate() && m === today.getMonth() && currentYearView === today.getFullYear());
      if (isToday) dayEl.classList.add('today');

      // Find events on this day (exclude month-TBC)
      const eventsOnDay = dated.filter(ev => {
        if (ev.dateTBC) return false;
        const start = stripTime(ev.startDate);
        const end = ev.endDate ? stripTime(ev.endDate) : start;
        return dayDate >= start && dayDate <= end;
      });

      if (eventsOnDay.length > 0) {
        dayEl.classList.add('has-event');

        // Separate daily events from bar events for year view display
        const barEventsOnDay = eventsOnDay.filter(ev => ev.type !== 'daily');
        const dailyEventsOnDay = eventsOnDay.filter(ev => ev.type === 'daily');

        // If only daily events on this day, show a subtle dot instead of full coloring
        if (barEventsOnDay.length === 0 && dailyEventsOnDay.length > 0) {
          dayEl.classList.add('has-daily-only');
          dayEl.style.setProperty('--daily-dot-color', dailyEventsOnDay[0].color);
        }

        // Use bar events for coloring, or fall back to all events if no bar events
        const colorEvents = barEventsOnDay.length > 0 ? barEventsOnDay : eventsOnDay;
        const primaryEvent = colorEvents[0];
        const primaryColor = primaryEvent.color;
        const start = stripTime(primaryEvent.startDate);
        const end = primaryEvent.endDate ? stripTime(primaryEvent.endDate) : start;
        const isSingleDay = start.getTime() === end.getTime();
        const isEventStart = dayDate.getTime() === start.getTime();
        const isEventEnd = dayDate.getTime() === end.getTime();

        // Day of week: 0=Monday ... 6=Sunday (ISO)
        const dow = (dayDate.getDay() + 6) % 7;
        const isWeekStart = (dow === 0);
        const isWeekEnd = (dow === 6);
        const isFirstDayOfMonth = (d === 1);
        const isLastDayOfMonth = (d === daysInMonth);

        // Build background: split colors for multiple tournaments (skip for daily-only)
        const uniqueColors = [...new Set(colorEvents.map(ev => ev.color))];
        const allLeagues = colorEvents.every(ev => ev.type === 'league');
        const alpha = allLeagues ? 0.15 : 0.3;
        const hasDailyOnly = barEventsOnDay.length === 0 && dailyEventsOnDay.length > 0;

        if (hasDailyOnly) {
          // Daily-only days: no cell coloring, just the CSS ::after dot
        } else if (!isToday) {
          if (uniqueColors.length === 1) {
            dayEl.style.backgroundColor = hexToRgba(uniqueColors[0], alpha);
          } else if (isSingleDay) {
            // Conic gradient for split circle (pie slices)
            const stops = uniqueColors.map((c, i) => {
              const pct1 = (i / uniqueColors.length) * 100;
              const pct2 = ((i + 1) / uniqueColors.length) * 100;
              return `${hexToRgba(c, alpha)} ${pct1}% ${pct2}%`;
            }).join(', ');
            dayEl.style.background = `conic-gradient(from 0deg, ${stops})`;
          } else {
            // Linear gradient top-to-bottom for oval segments
            const stops = uniqueColors.map((c, i) => {
              const pct1 = (i / uniqueColors.length) * 100;
              const pct2 = ((i + 1) / uniqueColors.length) * 100;
              return `${hexToRgba(c, alpha)} ${pct1}% ${pct2}%`;
            }).join(', ');
            dayEl.style.background = `linear-gradient(to right, ${stops})`;
          }
        } else {
          // Today with event: ring using multiple colors
          if (uniqueColors.length === 1) {
            dayEl.style.boxShadow = `inset 0 0 0 2px ${uniqueColors[0]}`;
          } else {
            // For today with multiple events, use conic border via pseudo or box-shadow stack
            dayEl.style.boxShadow = uniqueColors.map((c, i) =>
              `inset 0 ${i * 2}px 0 0 ${c}`
            ).join(', ');
          }
        }

        if (!hasDailyOnly) {
          if (isSingleDay) {
            dayEl.classList.add('oval-single');
          } else {
            const hasLeftRound = isEventStart || isWeekStart || isFirstDayOfMonth;
            const hasRightRound = isEventEnd || isWeekEnd || isLastDayOfMonth;

            if (hasLeftRound) dayEl.classList.add('oval-left');
            if (hasRightRound) dayEl.classList.add('oval-right');
            if (!hasLeftRound && !hasRightRound) dayEl.classList.add('oval-mid');
          }
        }

        // Tooltip on hover
        dayEl.addEventListener('mouseenter', (e) => {
          const tip = document.getElementById('tooltip');
          tip.innerHTML = eventsOnDay.map(ev =>
            `<div class="tooltip-meta" style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${ev.color};flex-shrink:0;display:inline-block;"></span>
              <strong>${esc(ev.name)}</strong>
              <span style="opacity:0.7;font-size:10px">${esc(formatDateRange(ev))}</span>
            </div>`
          ).join('');
          tip.classList.add('visible');
          moveTooltip(e);
        });
        dayEl.addEventListener('mousemove', (e) => moveTooltip(e));
        dayEl.addEventListener('mouseleave', hideTooltip);
        // Click to open modal
        dayEl.addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(eventsOnDay[0]);
        });
      }

      dayEl.textContent = d;
      miniGrid.appendChild(dayEl);
    }

    monthCard.appendChild(miniGrid);

    // Event pills below mini-calendar
    const monthStart = new Date(currentYearView, m, 1);
    const monthEnd = new Date(currentYearView, m + 1, 0);
    const monthEvents = dated.filter(ev => {
      const start = stripTime(ev.startDate);
      const end = ev.endDate ? stripTime(ev.endDate) : start;
      return end >= monthStart && start <= monthEnd;
    });

    if (monthEvents.length > 0) {
      const pillContainer = document.createElement('div');
      pillContainer.className = 'year-month-events';

      // Deduplicate by name (same tournament may appear multiple days)
      const unique = [];
      const seen = new Set();
      monthEvents.forEach(ev => {
        if (!seen.has(ev.name)) { seen.add(ev.name); unique.push(ev); }
      });

      const maxPills = 3;
      unique.slice(0, maxPills).forEach(ev => {
        const pill = document.createElement('div');
        pill.className = 'year-event-pill' + (ev.dateTBC ? ' year-event-pill-tbc' : '') + (ev.type === 'league' ? ' year-event-pill-league' : '') + (ev.type === 'daily' ? ' year-event-pill-daily' : '');
        pill.style.background = ev.dateTBC ? hexToRgba(ev.color, 0.15) : ev.color;
        if (ev.dateTBC) pill.style.color = ev.color;
        pill.textContent = ev.dateTBC ? `${ev.name} (TBC)` : ev.name;
        pill.addEventListener('click', (e) => { e.stopPropagation(); openModal(ev); });
        pill.addEventListener('mouseenter', (e) => showTooltip(e, ev));
        pill.addEventListener('mousemove', (e) => moveTooltip(e));
        pill.addEventListener('mouseleave', hideTooltip);
        pillContainer.appendChild(pill);
      });

      if (unique.length > maxPills) {
        const countEl = document.createElement('div');
        countEl.className = 'year-event-count';
        countEl.textContent = t('year_more').replace('{n}', unique.length - maxPills);
        pillContainer.appendChild(countEl);
      }

      monthCard.appendChild(pillContainer);
    }

    grid.appendChild(monthCard);
  }

  // Year view empty state overlay
  if (dated.length === 0) {
    const hasSearch = searchQuery.length > 0;
    const hasFilter = activeFilters.size > 0 || activeLocationFilters.size > 0 || activeCategoryFilters.size > 0 || activeTypeFilters.size > 0;
    const hint = (hasSearch || hasFilter)
      ? `<div class="empty-state-hint">${hasSearch ? t('empty_try_search') : t('empty_try_filter')}</div>`
      : '';
    const emptyOverlay = document.createElement('div');
    emptyOverlay.className = 'empty-state';
    emptyOverlay.style.gridColumn = '1 / -1';
    emptyOverlay.innerHTML = `<span class="empty-state-icon">&#127934;</span><div class="empty-state-title">${t('empty_list')}</div>${hint}`;
    grid.appendChild(emptyOverlay);
  }

  // Year legend
  const yearLegend = document.getElementById('year-legend');
  const organizers = [...new Set(tournaments.filter(t => !t.hidden).map(t => t.organizer).filter(Boolean))];
  yearLegend.innerHTML = '';
  organizers.forEach(org => {
    const color = tournaments.find(t => t.organizer === org)?.color || '#666';
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${esc(org)}`;
    yearLegend.appendChild(item);
  });
}

// ---- Tooltip ----
function showTooltip(e, t) {
  const tip = document.getElementById('tooltip');
  const dateRange = t.dateTBC ? formatMonthTBC(t) : (t.startDate ? formatDateRange(t) : 'TBC');
  const countdown = (t.startDate && !t.dateTBC) ? getCountdownText(t) : '';
  tip.innerHTML = `
    <div class="tooltip-name">${esc(t.name)}</div>
    <div class="tooltip-meta">${esc(dateRange)}${countdown ? ' &middot; ' + countdown : ''}</div>
    <div class="tooltip-meta">${esc(t.city)}${t.country ? ', ' + esc(t.country) : ''}${t.club && t.club !== 'TBC' && t.club !== t.city ? ' &middot; ' + esc(t.club) : ''}</div>
  `;
  tip.classList.add('visible');
  moveTooltip(e);
}

function moveTooltip(e) {
  const tip = document.getElementById('tooltip');
  const tipRect = tip.getBoundingClientRect();
  const tipH = tipRect.height || 80;
  const tipW = tipRect.width || 280;
  let x = e.clientX + 12;
  let y = e.clientY + 12;
  // Clamp horizontally
  if (x + tipW > window.innerWidth - 8) x = e.clientX - tipW - 12;
  // Clamp vertically — flip above cursor if overflowing bottom
  if (y + tipH > window.innerHeight - 8) y = e.clientY - tipH - 12;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').classList.remove('visible');
}

// ---- Daily Events Popover ----
function showDailyEventsPopover(e, dailyEvents, anchorCell) {
  // Remove any existing popover
  const existing = document.querySelector('.daily-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.className = 'daily-popover';

  dailyEvents.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'daily-popover-item';
    item.innerHTML = `
      <span class="daily-popover-dot" style="background:${ev.color}"></span>
      <span class="daily-popover-name">${esc(ev.name)}</span>
      ${ev.timeSlot ? `<span class="daily-popover-time">${esc(ev.timeSlot)}</span>` : ''}
    `;
    item.addEventListener('click', (evt) => { evt.stopPropagation(); popover.remove(); openModal(ev); });
    popover.appendChild(item);
  });

  document.body.appendChild(popover);
  const rect = anchorCell.getBoundingClientRect();
  popover.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  popover.style.left = (rect.left + window.scrollX) + 'px';

  // Close on click outside
  const closeHandler = (evt) => {
    if (!popover.contains(evt.target)) {
      popover.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// ---- List Rendering ----
const LIST_CHEVRON_SVG = '<svg class="list-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const LIST_COLLAPSED_KEY = 'pt-list-collapsed';

function getListCollapsedState() {
  try {
    return JSON.parse(safeGetItem(LIST_COLLAPSED_KEY, null)) || { years: {}, months: {} };
  } catch (e) {
    return { years: {}, months: {} };
  }
}

function saveListCollapsedState(state) {
  safeSetItem(LIST_COLLAPSED_KEY, JSON.stringify(state));
}

function toggleYearCollapse(year, yearHeader) {
  const state = getListCollapsedState();
  const isCollapsed = !state.years[year];

  if (isCollapsed) {
    state.years[year] = true;
  } else {
    delete state.years[year];
  }

  const yearGroup = yearHeader.closest('.list-year-group');
  const yearContent = yearGroup.querySelector('.list-year-content');
  const monthHeaders = yearGroup.querySelectorAll('.list-month-header');
  const monthContents = yearGroup.querySelectorAll('.list-month-content');

  if (isCollapsed) {
    yearHeader.classList.add('collapsed');
    yearContent.classList.add('collapsed');
    monthHeaders.forEach(mh => mh.classList.add('collapsed'));
    monthContents.forEach(mc => mc.classList.add('collapsed'));
    yearGroup.querySelectorAll('.list-month-group').forEach(mg => {
      state.months[mg.dataset.month] = true;
    });
  } else {
    yearHeader.classList.remove('collapsed');
    yearContent.classList.remove('collapsed');
    monthHeaders.forEach(mh => mh.classList.remove('collapsed'));
    monthContents.forEach(mc => mc.classList.remove('collapsed'));
    yearGroup.querySelectorAll('.list-month-group').forEach(mg => {
      delete state.months[mg.dataset.month];
    });
  }

  saveListCollapsedState(state);
}

function toggleMonthCollapse(monthKey, monthHeader) {
  const state = getListCollapsedState();
  const isCollapsed = !state.months[monthKey];

  if (isCollapsed) {
    state.months[monthKey] = true;
  } else {
    delete state.months[monthKey];
  }

  const monthGroup = monthHeader.closest('.list-month-group');
  const monthContent = monthGroup.querySelector('.list-month-content');

  if (isCollapsed) {
    monthHeader.classList.add('collapsed');
    monthContent.classList.add('collapsed');
  } else {
    monthHeader.classList.remove('collapsed');
    monthContent.classList.remove('collapsed');
  }

  saveListCollapsedState(state);
}

function renderList() {
  const container = document.getElementById('list-container');
  container.innerHTML = '';

  const dated = getDated().sort((a, b) => {
    // Group by month first
    const monthA = a.startDate.getFullYear() * 12 + a.startDate.getMonth();
    const monthB = b.startDate.getFullYear() * 12 + b.startDate.getMonth();
    if (monthA !== monthB) return monthA - monthB;
    // Within same month: fully-dated before month-TBC
    if (a.dateTBC !== b.dateTBC) return a.dateTBC ? 1 : -1;
    // Featured tournaments float to top within their group
    if (a.featured !== b.featured) return b.featured ? 1 : -1;
    return a.startDate - b.startDate;
  });
  if (dated.length === 0) {
    const hasSearch = searchQuery.length > 0;
    const hasFilter = activeFilters.size > 0 || activeLocationFilters.size > 0 || activeCategoryFilters.size > 0 || activeTypeFilters.size > 0;
    let hint = '';
    if (hasSearch || hasFilter) {
      hint = `<div class="empty-state-hint">${hasSearch ? t('empty_try_search') : t('empty_try_filter')}</div>`;
    }
    container.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">&#127934;</span>
      <div class="empty-state-title">${t('empty_list')}</div>
      ${hint}
    </div>`;
    return;
  }

  const collapsed = getListCollapsedState();

  let currentYearGroup = null;
  let currentYearContent = null;
  let currentMonthContent = null;
  let lastYear = null;
  let lastMonthKey = '';

  dated.forEach(ev => {
    const year = ev.startDate.getFullYear();
    const monthKey = `${year}-${ev.startDate.getMonth()}`;

    // --- Year Group ---
    if (year !== lastYear) {
      currentYearGroup = document.createElement('div');
      currentYearGroup.className = 'list-year-group';
      currentYearGroup.dataset.year = year;

      const yearHeader = document.createElement('div');
      yearHeader.className = 'list-year-header';
      yearHeader.innerHTML = `<span class="list-header-label">${year}</span>${LIST_CHEVRON_SVG}`;

      const isYearCollapsed = collapsed.years && collapsed.years[year];
      if (isYearCollapsed) yearHeader.classList.add('collapsed');

      yearHeader.addEventListener('click', () => toggleYearCollapse(year, yearHeader));

      currentYearContent = document.createElement('div');
      currentYearContent.className = 'list-year-content';
      if (isYearCollapsed) currentYearContent.classList.add('collapsed');

      currentYearGroup.appendChild(yearHeader);
      currentYearGroup.appendChild(currentYearContent);
      container.appendChild(currentYearGroup);

      lastYear = year;
      lastMonthKey = '';
    }

    // --- Month Group ---
    if (monthKey !== lastMonthKey) {
      const monthGroup = document.createElement('div');
      monthGroup.className = 'list-month-group';
      monthGroup.dataset.month = monthKey;

      const monthHeader = document.createElement('div');
      monthHeader.className = 'list-month-header';
      monthHeader.innerHTML = `<span class="list-header-label">${t('months')[ev.startDate.getMonth()]} ${year}</span>${LIST_CHEVRON_SVG}`;

      const isMonthCollapsed = collapsed.months && collapsed.months[monthKey];
      if (isMonthCollapsed) monthHeader.classList.add('collapsed');

      monthHeader.addEventListener('click', () => toggleMonthCollapse(monthKey, monthHeader));

      currentMonthContent = document.createElement('div');
      currentMonthContent.className = 'list-month-content';
      if (isMonthCollapsed) currentMonthContent.classList.add('collapsed');

      monthGroup.appendChild(monthHeader);
      monthGroup.appendChild(currentMonthContent);
      currentYearContent.appendChild(monthGroup);

      lastMonthKey = monthKey;
    }

    // --- Tournament Card ---
    currentMonthContent.appendChild(createTournamentCard(ev));
  });

  // --- Expand/Collapse All toolbar ---
  if (dated.length > 0) {
    const toolbar = document.createElement('div');
    toolbar.className = 'list-toolbar';
    const state = getListCollapsedState();
    const hasCollapsed = Object.keys(state.years).length > 0 || Object.keys(state.months).length > 0;
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'list-toggle-all-btn';
    toggleBtn.innerHTML = hasCollapsed
      ? `<svg class="list-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> ${t('expand_all')}`
      : `<svg class="list-chevron collapsed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> ${t('collapse_all')}`;
    toggleBtn.addEventListener('click', () => {
      if (hasCollapsed) {
        // Expand all
        try { localStorage.removeItem(LIST_COLLAPSED_KEY); } catch(e) {}
        container.querySelectorAll('.collapsed').forEach(el => el.classList.remove('collapsed'));
      } else {
        // Collapse all
        const newState = { years: {}, months: {} };
        container.querySelectorAll('.list-year-group').forEach(yg => {
          newState.years[yg.dataset.year] = true;
          yg.querySelector('.list-year-header').classList.add('collapsed');
          yg.querySelector('.list-year-content').classList.add('collapsed');
        });
        container.querySelectorAll('.list-month-group').forEach(mg => {
          newState.months[mg.dataset.month] = true;
          mg.querySelector('.list-month-header').classList.add('collapsed');
          mg.querySelector('.list-month-content').classList.add('collapsed');
        });
        saveListCollapsedState(newState);
      }
      // Re-render the toolbar to update the button label
      renderList();
    });
    toolbar.appendChild(toggleBtn);
    container.insertBefore(toolbar, container.firstChild);
  }

  // --- Auto-scroll to current month (#7) ---
  if (listShouldScroll) {
    listShouldScroll = false;
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${now.getMonth()}`;
    const allMonthGroups = container.querySelectorAll('.list-month-group');
    let target = null;
    for (const mg of allMonthGroups) {
      const key = mg.dataset.month;
      const [y, m] = key.split('-').map(Number);
      if (y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth())) {
        target = mg;
        break;
      }
    }
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }
}

function createTournamentCard(ev) {
  const card = document.createElement('div');
  card.className = 'tournament-card';
  card.style.borderLeftColor = ev.color;
  card.addEventListener('click', () => openModal(ev));

  const today = stripTime(new Date());
  let isPast = false;
  if (ev.dateTBC) {
    const monthEnd = new Date(ev.tbcYear, ev.tbcMonth + 1, 0);
    if (monthEnd < today) { card.classList.add('past-card'); isPast = true; }
  } else {
    const end = ev.endDate ? stripTime(ev.endDate) : stripTime(ev.startDate);
    if (end < today) { card.classList.add('past-card'); isPast = true; }
  }

  // Featured flag
  if (ev.featured) card.classList.add('featured-card');
  // League flag
  if (ev.type === 'league') card.classList.add('league-card');
  if (ev.type === 'daily') card.classList.add('daily-card');

  const dateRange = formatDateRange(ev);
  const countdown = getCountdownBadge(ev);
  const meta = organizerMeta[ev.organizer] || {};
  const logoHtml = meta.logoUrl ? `<img class="badge-logo" src="${esc(meta.logoUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : '';
  const categoriesHtml = ev.categories.length > 0 ? `<div class="card-tags">${ev.categories.map(c => `<span class="card-tag">${esc(c)}</span>`).join('')}</div>` : '';

  // Instagram icon
  const igHtml = ev.instagramUrl ? `<a href="${esc(ev.instagramUrl)}" target="_blank" rel="noopener" class="card-social-link" onclick="event.stopPropagation()" title="Instagram">${SVG_INSTAGRAM}</a>` : '';

  card.innerHTML = `
    ${ev.featured ? `<span class="featured-star">${SVG_STAR}</span>` : ''}
    <div class="card-date">
      <div class="card-date-day${ev.dateTBC ? ' card-date-tbc' : ''}">${ev.dateTBC ? t('date_tbc') : ev.startDate.getDate()}</div>
      <div class="card-date-month">${t('months_short')[ev.startDate.getMonth()]}</div>
      <div class="card-date-year">${ev.startDate.getFullYear()}</div>
    </div>
    <div class="card-org-logo-col">
      ${meta.logoUrl
        ? `<img class="card-org-logo" src="${esc(meta.logoUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : `<div class="card-org-dot" style="background:${ev.color}"></div>`}
    </div>
    <div class="card-info">
      <span class="card-organizer-badge" style="background:${ev.color}">${esc(ev.organizer)}</span>${ev.type === 'league' ? `<span class="card-type-badge">${t('type_league')}</span>` : ''}${ev.type === 'daily' ? `<span class="card-type-badge card-type-badge-daily">${t('type_daily')}</span>` : ''}
      <div class="card-title">${esc(ev.name)}${countdown}</div>
      <div class="card-meta">
        <span class="card-meta-item">${esc(dateRange)}</span>
        ${ev.timeSlot ? `<span class="card-meta-item">\u{1F554} ${esc(ev.timeSlot)}</span>` : ''}
      </div>
      ${categoriesHtml}
    </div>
    <div class="card-right">
      <div class="card-location">
        <span class="card-location-city">${esc(ev.city)}${ev.country ? ', ' + esc(ev.country) : ''}</span>
        ${ev.club && ev.club !== ev.city ? `<span class="card-location-club">${esc(ev.club)}</span>` : ''}
      </div>
      <div class="card-actions">
        ${igHtml}
        ${ev.regUrl ? `<a href="${esc(ev.regUrl)}" target="_blank" rel="noopener" class="register-btn" onclick="event.stopPropagation()">${isPast ? t('tournament_details') : (ev.regUrl1Label ? esc(ev.regUrl1Label) : t('register'))}</a>` : ''}
        ${ev.regUrl2 ? `<a href="${esc(ev.regUrl2)}" target="_blank" rel="noopener" class="register-btn" onclick="event.stopPropagation()">${isPast ? t('tournament_details') : (ev.regUrl2Label ? esc(ev.regUrl2Label) : t('register_2'))}</a>` : ''}
      </div>
    </div>
  `;
  return card;
}

// ---- Countdown ----
function getCountdownDays(ev) {
  if (!ev.startDate || ev.dateTBC) return null;
  const today = stripTime(new Date());
  const start = stripTime(ev.startDate);
  const end = ev.endDate ? stripTime(ev.endDate) : start;
  if (end < today) return null; // past
  const diff = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
  return diff;
}

function isHappeningNow(ev) {
  if (!ev.startDate || ev.dateTBC) return false;
  const today = stripTime(new Date());
  const start = stripTime(ev.startDate);
  const end = ev.endDate ? stripTime(ev.endDate) : start;
  return today >= start && today <= end;
}

function getCountdownText(ev) {
  const days = getCountdownDays(ev);
  if (days === null) return '';
  if (days < 0) {
    // Already started — check if still in progress
    if (isHappeningNow(ev)) return t('countdown_live');
    return '';
  }
  if (days === 0) return t('countdown_today');
  if (days === 1) return t('countdown_tomorrow');
  if (days <= 14) return t('countdown_days').replace('{n}', days);
  const weeks = Math.round(days / 7);
  return t('countdown_weeks').replace('{n}', weeks);
}

function getCountdownBadge(ev) {
  // Check "happening now" first
  if (isHappeningNow(ev)) {
    return `<span class="countdown-badge live">${t('countdown_live')}</span>`;
  }
  const days = getCountdownDays(ev);
  if (days === null || days < 0) return '';
  let cls = 'countdown-badge';
  if (days <= 3) cls += ' imminent';
  else if (days <= 14) cls += ' soon';
  const text = getCountdownText(ev);
  if (!text) return '';
  return `<span class="${cls}">${text}</span>`;
}

// ---- TBC Rendering ----
function renderTBC() {
  const container = document.getElementById('tbc-container');
  const section = document.getElementById('tbc-section');
  const tbc = getTBC();

  if (tbc.length === 0) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  container.innerHTML = '';

  tbc.forEach(ev => {
    const card = document.createElement('div');
    card.className = 'tbc-card';
    card.style.borderLeftColor = ev.color;
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="tbc-card-info">
        <div class="tbc-card-title">${esc(ev.name)}</div>
        <div class="tbc-card-meta">${esc(ev.organizer)} &middot; ${esc(ev.city)}${ev.country ? ', ' + esc(ev.country) : ''}${ev.club && ev.club !== 'TBC' ? ' &middot; ' + esc(ev.club) : ''}</div>
      </div>
      <span class="card-organizer-badge" style="background:${ev.color}">${esc(ev.organizer)}</span>
    `;
    card.addEventListener('click', () => openModal(ev));
    container.appendChild(card);
  });
}

// ---- Organizer Profiles ----
function renderOrgProfiles() {
  const container = document.getElementById('org-profiles-grid');
  if (!container) return;
  const section = document.getElementById('organizer-profiles');
  const organizers = Object.keys(organizerMeta);
  if (organizers.length === 0) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');
  document.getElementById('org-profiles-title').textContent = t('organizers_title');
  container.innerHTML = '';

  organizers.forEach(org => {
    const meta = organizerMeta[org];
    const card = document.createElement('div');
    card.className = 'org-profile-card';
    card.style.border = `2px solid ${meta.color}`;

    const logoHtml = meta.logoUrl
      ? `<img class="org-profile-logo" src="${esc(meta.logoUrl)}" alt="${esc(org)}" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=\\'org-profile-dot\\' style=\\'background:${meta.color}\\'></span>'">`
      : `<span class="org-profile-dot" style="background:${meta.color}"></span>`;

    const socialLinks = [];
    if (meta.instagram) socialLinks.push(`<a href="${esc(meta.instagram)}" target="_blank" rel="noopener" class="org-social-link" title="Instagram">${SVG_INSTAGRAM}</a>`);
    if (meta.website) socialLinks.push(`<a href="${esc(meta.website)}" target="_blank" rel="noopener" class="org-social-link" title="Website">${SVG_GLOBE}</a>`);

    card.innerHTML = `
      <div class="org-profile-logo-wrap">${logoHtml}</div>
      <span class="org-profile-name">${esc(org)}</span>
      ${socialLinks.length > 0 ? `<div class="org-social-links">${socialLinks.join('')}</div>` : ''}
    `;
    card.addEventListener('click', (e) => {
      // Don't navigate if clicking a social link
      if (e.target.closest('.org-social-link')) return;
      showOrganizerProfile(org);
    });
    container.appendChild(card);
  });
}

// ---- Organizer Profile ----
function showOrganizerProfile(orgName) {
  window.location.href = '/organizer/' + toSlug(orgName);
}

function renderOrganizerDetail() {
  if (!selectedOrganizer) return;
  const meta = organizerMeta[selectedOrganizer] || {};
  const headerEl = document.getElementById('org-detail-header');
  const titleEl = document.getElementById('org-detail-events-title');
  const eventsEl = document.getElementById('org-detail-events');
  const backBtn = document.getElementById('org-detail-back');

  // Update back button text
  backBtn.textContent = t('org_back');

  // Build header
  const logoHtml = meta.logoUrl
    ? `<img class="org-detail-logo" src="${esc(meta.logoUrl)}" alt="${esc(selectedOrganizer)}" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=\\'org-detail-dot\\' style=\\'background:${meta.color}\\'></span>'">`
    : `<span class="org-detail-dot" style="background:${meta.color}"></span>`;

  // Social links
  const links = [];
  if (meta.instagram) links.push(`<a href="${esc(meta.instagram)}" target="_blank" rel="noopener" class="org-detail-link">${SVG_INSTAGRAM} Instagram</a>`);
  if (meta.website) links.push(`<a href="${esc(meta.website)}" target="_blank" rel="noopener" class="org-detail-link">${SVG_GLOBE} Website</a>`);

  // Count events
  const allEvents = tournaments.filter(ev => !ev.hidden && ev.organizer === selectedOrganizer);
  const tournamentCount = allEvents.filter(ev => ev.type === 'tournament').length;
  const leagueCount = allEvents.filter(ev => ev.type === 'league').length;
  const dailyCount = allEvents.filter(ev => ev.type === 'daily').length;
  let statsText = `${tournamentCount} ${t('type_tournament')}${tournamentCount !== 1 ? 's' : ''}`;
  if (leagueCount > 0) statsText += ` · ${leagueCount} ${t('type_league')}${leagueCount !== 1 ? 's' : ''}`;
  if (dailyCount > 0) statsText += ` · ${dailyCount} ${t('type_daily')}`;

  headerEl.innerHTML = `
    ${logoHtml}
    <div class="org-detail-info">
      <div class="org-detail-name">${esc(selectedOrganizer)}</div>
      <div class="org-detail-stats">${statsText}</div>
      ${links.length > 0 ? `<div class="org-detail-links">${links.join('')}</div>` : ''}
    </div>
  `;

  // Build events list
  const today = stripTime(new Date());
  const upcoming = allEvents.filter(ev => {
    if (!ev.startDate) return true; // TBC = upcoming
    const end = ev.endDate ? stripTime(ev.endDate) : stripTime(ev.startDate);
    return end >= today;
  }).sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate - b.startDate;
  });

  const past = allEvents.filter(ev => {
    if (!ev.startDate) return false;
    const end = ev.endDate ? stripTime(ev.endDate) : stripTime(ev.startDate);
    return end < today;
  }).sort((a, b) => b.startDate - a.startDate);

  eventsEl.innerHTML = '';

  if (upcoming.length === 0 && past.length === 0) {
    titleEl.textContent = '';
    eventsEl.innerHTML = `<div class="org-detail-empty">${t('org_no_events')}</div>`;
    return;
  }

  titleEl.textContent = '';

  if (upcoming.length > 0) {
    const group = document.createElement('div');
    group.className = 'org-detail-group';

    const header = document.createElement('div');
    header.className = 'org-detail-group-header';
    header.innerHTML = `<span class="org-detail-group-label">${t('org_upcoming')}</span>${LIST_CHEVRON_SVG}`;

    const content = document.createElement('div');
    content.className = 'org-detail-group-content';
    upcoming.forEach(ev => content.appendChild(createTournamentCard(ev)));

    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      content.classList.toggle('collapsed');
    });

    group.appendChild(header);
    group.appendChild(content);
    eventsEl.appendChild(group);
  }

  if (past.length > 0) {
    const group = document.createElement('div');
    group.className = 'org-detail-group';

    const header = document.createElement('div');
    header.className = 'org-detail-group-header collapsed';
    header.innerHTML = `<span class="org-detail-group-label">${t('org_past')}</span>${LIST_CHEVRON_SVG}`;

    const content = document.createElement('div');
    content.className = 'org-detail-group-content collapsed';
    past.forEach(ev => content.appendChild(createTournamentCard(ev)));

    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      content.classList.toggle('collapsed');
    });

    group.appendChild(header);
    group.appendChild(content);
    eventsEl.appendChild(group);
  }
}

// ---- Summary Bar ----
function renderSummaryBar() {
  const bar = document.getElementById('summary-bar');
  if (!bar) return;
  const today = stripTime(new Date());
  const filtered = getFiltered();
  const upcoming = filtered.filter(t => t.startDate && stripTime(t.startDate) >= today).length;
  const now = new Date();
  const thisMonth = filtered.filter(t => t.startDate && t.startDate.getMonth() === now.getMonth() && t.startDate.getFullYear() === now.getFullYear()).length;
  const orgCount = new Set(filtered.map(t => t.organizer).filter(Boolean)).size;

  bar.innerHTML = `
    <span class="summary-item">${t('summary_upcoming').replace('{n}', `<strong>${upcoming}</strong>`)}</span>
    <span class="summary-sep">&middot;</span>
    <span class="summary-item">${t('summary_this_month').replace('{n}', `<strong>${thisMonth}</strong>`)}</span>
    <span class="summary-sep">&middot;</span>
    <span class="summary-item">${t('summary_organizers').replace('{n}', `<strong>${orgCount}</strong>`)}</span>
  `;
}

// ---- Modal ----
function openModal(ev) {
  const content = document.getElementById('modal-content');
  const dateRange = ev.dateTBC ? formatMonthTBC(ev) : (ev.startDate ? formatDateRange(ev) : 'TBC');
  const countdown = (ev.startDate && !ev.dateTBC) ? getCountdownText(ev) : '';
  const gcalUrl = (ev.startDate && !ev.dateTBC) ? buildGoogleCalendarUrl(ev) : '';
  const shareUrl = buildShareUrl(ev);

  const today = stripTime(new Date());
  let isPast = false;
  if (ev.dateTBC) {
    isPast = new Date(ev.tbcYear, ev.tbcMonth + 1, 0) < today;
  } else {
    const end = ev.endDate ? stripTime(ev.endDate) : (ev.startDate ? stripTime(ev.startDate) : null);
    isPast = end ? end < today : false;
  }

  const meta = organizerMeta[ev.organizer] || {};
  const logoHtml = meta.logoUrl ? `<img class="modal-org-logo" src="${esc(meta.logoUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : '';
  const igEmbedHtml = ev.instagramUrl
    ? `<div class="modal-ig-embed"><blockquote class="instagram-media" data-instgrm-permalink="${esc(ev.instagramUrl)}" style="max-width:100%; min-width:280px; width:100%;"></blockquote></div>`
    : '';
  const categoriesHtml = ev.categories.length > 0 ? `<div class="modal-tags">${ev.categories.map(c => `<span class="modal-tag">${esc(c)}</span>`).join('')}</div>` : '';
  const featuredBadge = ev.featured ? `<span class="modal-featured-badge">${SVG_STAR} ${t('featured')}</span>` : '';
  const leagueBadge = ev.type === 'league' ? `<span class="modal-league-badge">${t('type_league')}</span>` : '';
  const dailyBadge = ev.type === 'daily' ? `<span class="modal-daily-badge">${t('type_daily')}</span>` : '';
  const igAction = ev.instagramUrl ? `<a href="${esc(ev.instagramUrl)}" target="_blank" rel="noopener" class="modal-action-btn">${SVG_INSTAGRAM} ${t('view_instagram')}</a>` : '';

  content.innerHTML = `
    <div class="modal-header-row">
      <span class="modal-organizer" style="background:${ev.color}">${logoHtml}${esc(ev.organizer)}</span>
      ${leagueBadge}${dailyBadge}${featuredBadge}
    </div>
    <h2 class="modal-title">${esc(ev.name)}${countdown ? ` <span class="countdown-badge${getCountdownDays(ev) <= 3 ? ' imminent' : getCountdownDays(ev) <= 14 ? ' soon' : ''}">${countdown}</span>` : ''}</h2>
    ${categoriesHtml}
    <div class="modal-details">
      <div class="modal-detail">
        <span class="modal-detail-icon">&#128197;</span>
        <span class="modal-detail-label">${t('modal_date')}</span>
        <span class="modal-detail-value">${esc(dateRange)}</span>
      </div>
      ${ev.timeSlot ? `<div class="modal-detail">
        <span class="modal-detail-icon">&#128340;</span>
        <span class="modal-detail-label">${t('modal_time')}</span>
        <span class="modal-detail-value">${esc(ev.timeSlot)}</span>
      </div>` : ''}
      <div class="modal-detail">
        <span class="modal-detail-icon">&#128205;</span>
        <span class="modal-detail-label">${t('modal_city')}</span>
        <span class="modal-detail-value">${esc(ev.city)}${ev.country ? ', ' + esc(ev.country) : ''}</span>
      </div>
      ${ev.club && ev.club !== 'TBC' ? `
      <div class="modal-detail">
        <span class="modal-detail-icon">&#127934;</span>
        <span class="modal-detail-label">${t('modal_club')}</span>
        <span class="modal-detail-value">${esc(ev.club)}</span>
      </div>` : ''}
      ${ev.prize ? `
      <div class="modal-detail">
        <span class="modal-detail-icon">&#127942;</span>
        <span class="modal-detail-label">${t('modal_prize')}</span>
        <span class="modal-detail-value">${esc(ev.prize)}</span>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      ${ev.regUrl ? `<a href="${esc(ev.regUrl)}" target="_blank" rel="noopener" class="modal-register" style="background:${ev.color}">${isPast ? t('tournament_details') : (ev.regUrl1Label ? esc(ev.regUrl1Label) : t('register'))}</a>` : ''}
      ${ev.regUrl2 ? `<a href="${esc(ev.regUrl2)}" target="_blank" rel="noopener" class="modal-register" style="background:${ev.color}">${isPast ? t('tournament_details') : (ev.regUrl2Label ? esc(ev.regUrl2Label) : t('register_2'))}</a>` : ''}
      <div class="modal-secondary-actions">
        ${gcalUrl ? `<a href="${gcalUrl}" target="_blank" rel="noopener" class="modal-action-btn">&#128197; ${t('add_gcal')}</a>` : ''}
        ${igAction}
        <button class="modal-action-btn modal-share-btn" data-share-url="${esc(shareUrl)}">&#128279; ${t('share')}</button>
      </div>
    </div>
    ${igEmbedHtml}
  `;

  // Bind share button click (avoids inline onclick with string concatenation)
  const shareBtn = content.querySelector('.modal-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => shareTournament(shareBtn.dataset.shareUrl));
  }

  // Save scroll position before locking
  modalScrollY = window.scrollY;

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  // Trigger reflow, then add visible class for animation
  overlay.offsetHeight;
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${modalScrollY}px`;
  document.body.style.width = '100%';

  // Focus trap for accessibility
  document.addEventListener('keydown', modalFocusTrap);
  // Focus the close button on open
  setTimeout(() => document.getElementById('modal-close').focus(), 100);

  // Trigger Instagram embed rendering
  if (ev.instagramUrl && window.instgrm) {
    window.instgrm.Embeds.process();
  }
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('visible');
  // Restore scroll position
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, modalScrollY);
  // Remove focus trap
  document.removeEventListener('keydown', modalFocusTrap);
  setTimeout(() => overlay.classList.add('hidden'), 200);
}

// Focus trap for modal accessibility
function modalFocusTrap(e) {
  if (e.key !== 'Tab') return;
  const modal = document.getElementById('modal');
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

// ---- Google Calendar ----
function buildGoogleCalendarUrl(ev) {
  if (!ev.startDate) return '';

  // Daily events with time slot: use specific times
  if (ev.timeSlot && ev.type === 'daily') {
    const timeParts = ev.timeSlot.split('-').map(s => s.trim());
    if (timeParts.length === 2 && timeParts[0].includes(':') && timeParts[1].includes(':')) {
      const fmtDateTime = (d, time) => {
        const [hh, mm] = time.split(':');
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${day}T${(hh || '00').padStart(2, '0')}${(mm || '00').padStart(2, '0')}00`;
      };
      const startStr = fmtDateTime(ev.startDate, timeParts[0]);
      const endStr = fmtDateTime(ev.startDate, timeParts[1]);
      const details = [ev.organizer, ev.club, ev.city].filter(Boolean).join(' - ');
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: ev.name,
        dates: `${startStr}/${endStr}`,
        details: details,
        location: [ev.club, ev.city, ev.country].filter(x => x && x !== 'TBC').join(', '),
      });
      return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }
  }

  // All-day events: use date-only format
  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };
  const startStr = fmtDate(ev.startDate);
  const endDate = ev.endDate ? new Date(ev.endDate) : new Date(ev.startDate);
  endDate.setDate(endDate.getDate() + 1); // Google Calendar all-day end is exclusive
  const endStr = fmtDate(endDate);
  const details = [ev.organizer, ev.club, ev.city].filter(Boolean).join(' - ');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.name,
    dates: `${startStr}/${endStr}`,
    details: details,
    location: [ev.club, ev.city, ev.country].filter(x => x && x !== 'TBC').join(', '),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ---- Share ----
function buildShareUrl(ev) {
  return window.location.origin + '/competitions/' + encodeURIComponent(ev.slug);
}

function shareTournament(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast(t('copied'));
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast(t('copied'));
  });
}

// ---- Toast ----
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.offsetHeight; // reflow
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2000);
}

// ---- Deep Link ----
function checkDeepLink() {
  const params = new URLSearchParams(window.location.search);

  // Organizer deep link
  const orgParam = params.get('organizer');
  if (orgParam) {
    const org = Object.keys(organizerMeta).find(o => toSlug(o) === orgParam);
    if (org) {
      // Redirect to new organizer page
      window.location.replace('/organizer/' + toSlug(org));
      return;
    }
  }

  // Tournament deep link
  // Redirect old ?tournament=slug to new /competitions/slug URL
  const tid = params.get('tournament');
  if (tid !== null) {
    let ev = tournaments.find(t => t.slug === tid);
    if (!ev) {
      const numId = parseInt(tid, 10);
      if (!isNaN(numId)) ev = tournaments.find(t => t.id === numId);
    }
    if (ev) {
      window.location.replace('/competitions/' + encodeURIComponent(ev.slug));
      return;
    }
  }
}


// ---- Helpers ----
function formatMonthTBC(ev) {
  const monthName = t('months')[ev.tbcMonth];
  return `${monthName} ${ev.tbcYear} (TBC)`;
}

function formatFullDate(d) {
  // days_short is Mon-indexed: 0=Mon,1=Tue,...,6=Sun
  // JS getDay() is 0=Sun,1=Mon,...,6=Sat → convert
  const jsDay = d.getDay();
  const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const dayName = t('days_short')[dayIdx];
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = t('months_short')[d.getMonth()];
  return `${dayName} ${dd} ${mon} ${d.getFullYear()}`;
}

function formatDateRange(ev) {
  if (ev.dateTBC) return formatMonthTBC(ev);
  if (!ev.startDate) return 'TBC';
  const start = formatFullDate(ev.startDate);
  if (!ev.endDate || ev.startDate.getTime() === ev.endDate.getTime()) {
    return ev.timeSlot ? `${start}, ${ev.timeSlot}` : start;
  }
  const end = formatFullDate(ev.endDate);
  return `${start} \u2013 ${end}`;
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(102, 102, 102, ${alpha})`;
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return `rgba(102, 102, 102, ${alpha})`;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---- Map View ----
function initMap() {
  if (mapInstance) return;

  mapInstance = L.map('map-container', {
    center: [13.7563, 100.5018],
    zoom: 6,
    zoomControl: true,
    scrollWheelZoom: true,
  });

  const tileConfig = MAP_TILES[currentTheme] || MAP_TILES.dark;
  mapTileLayer = L.tileLayer(tileConfig.url, {
    attribution: tileConfig.attribution,
    maxZoom: 19,
  }).addTo(mapInstance);

  mapMarkerCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      let size = 'small';
      if (count >= 10) size = 'medium';
      if (count >= 20) size = 'large';
      return L.divIcon({
        html: '<div class="map-cluster map-cluster-' + size + '"><span>' + count + '</span></div>',
        className: 'map-cluster-icon',
        iconSize: L.point(40, 40),
      });
    }
  });

  mapInstance.addLayer(mapMarkerCluster);
  renderMapMarkers();
}

function createClubIcon() {
  return L.divIcon({
    html: '<div class="map-pin"><svg width="24" height="32" viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="var(--map-pin-fill, #e74c3c)"/><circle cx="12" cy="11" r="5" fill="white" opacity="0.9"/></svg></div>',
    className: 'map-pin-icon',
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -32],
  });
}

function getFilteredClubs() {
  let result = clubs;
  if (activeLocationFilters.size > 0) {
    result = result.filter(c => activeLocationFilters.has(c.city));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(c => {
      const haystack = (c.name + ' ' + c.nameTh + ' ' + c.city + ' ' + c.province).toLowerCase();
      return haystack.includes(q);
    });
  }
  return result;
}

function getClubUpcomingEvents(club) {
  const today = stripTime(new Date());
  return tournaments
    .filter(t =>
      !t.hidden &&
      t.club &&
      t.club.toLowerCase() === club.name.toLowerCase() &&
      t.startDate &&
      stripTime(t.startDate) >= today
    )
    .sort((a, b) => a.startDate - b.startDate);
}

function formatShortDate(d) {
  if (!d) return '';
  const months = t('months_short');
  return d.getDate() + ' ' + months[d.getMonth()];
}

function renderMapMarkers() {
  if (!mapMarkerCluster) return;
  mapMarkerCluster.clearLayers();

  const filtered = getFilteredClubs();

  if (filtered.length === 0) {
    // Show empty state
    const container = document.getElementById('map-container');
    let emptyMsg = container.querySelector('.map-empty');
    if (!emptyMsg) {
      emptyMsg = document.createElement('div');
      emptyMsg.className = 'map-empty';
      container.appendChild(emptyMsg);
    }
    emptyMsg.textContent = t('map_no_clubs');
    emptyMsg.style.display = '';
    return;
  }

  // Hide empty state if visible
  const emptyMsg = document.getElementById('map-container').querySelector('.map-empty');
  if (emptyMsg) emptyMsg.style.display = 'none';

  filtered.forEach(club => {
    const marker = L.marker([club.lat, club.lng], {
      icon: createClubIcon(),
    });

    const clubName = currentLang === 'th' && club.nameTh ? club.nameTh : club.name;
    const clubDesc = currentLang === 'th' && club.descriptionTh ? club.descriptionTh : club.description;
    const upcomingEvents = getClubUpcomingEvents(club);

    const eventsHtml = upcomingEvents.length > 0
      ? '<div class="map-popup-events">' +
          '<strong>' + t('map_upcoming_events') + '</strong>' +
          upcomingEvents.slice(0, 3).map(ev =>
            '<div class="map-popup-event" data-event-id="' + ev.id + '">' +
              '<span class="map-popup-event-dot" style="background:' + ev.color + '"></span>' +
              '<span class="map-popup-event-name">' + esc(ev.name) + '</span>' +
              '<span class="map-popup-event-date">' + formatShortDate(ev.startDate) + '</span>' +
            '</div>'
          ).join('') +
          (upcomingEvents.length > 3 ? '<div class="map-popup-more">+' + (upcomingEvents.length - 3) + ' more</div>' : '') +
        '</div>'
      : '';

    const popupContent =
      '<div class="map-popup">' +
        (club.imageUrl ? '<img class="map-popup-img" src="' + esc(club.imageUrl) + '" alt="' + esc(clubName) + '" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' : '') +
        '<h3 class="map-popup-title">' + esc(clubName) + '</h3>' +
        '<div class="map-popup-meta">' +
          (club.city ? '<span>&#128205; ' + esc(club.city) + (club.province ? ', ' + esc(club.province) : '') + '</span>' : '') +
          (club.courts ? '<span>&#127934; ' + club.courts + ' ' + t('map_courts') + '</span>' : '') +
          (club.surface ? '<span>' + esc(club.surface) + '</span>' : '') +
          (club.indoorOutdoor ? '<span>' + esc(club.indoorOutdoor) + '</span>' : '') +
          (club.hours ? '<span>&#128340; ' + esc(club.hours) + '</span>' : '') +
        '</div>' +
        (clubDesc ? '<p class="map-popup-desc">' + esc(clubDesc) + '</p>' : '') +
        eventsHtml +
        '<div class="map-popup-actions">' +
          (club.googleMapsUrl ? '<a href="' + esc(club.googleMapsUrl) + '" target="_blank" rel="noopener" class="map-popup-btn">&#128204; ' + t('map_directions') + '</a>' : '') +
          (club.website ? '<a href="' + esc(club.website) + '" target="_blank" rel="noopener" class="map-popup-btn">' + SVG_GLOBE + ' ' + t('map_website') + '</a>' : '') +
          (club.instagram ? '<a href="' + esc(club.instagram) + '" target="_blank" rel="noopener" class="map-popup-btn">' + SVG_INSTAGRAM + '</a>' : '') +
          (club.phone ? '<a href="tel:' + esc(club.phone) + '" class="map-popup-btn">&#128222; ' + esc(club.phone) + '</a>' : '') +
        '</div>' +
      '</div>';

    marker.bindPopup(popupContent, {
      maxWidth: 300,
      minWidth: 240,
      className: 'map-custom-popup',
    });

    marker.on('popupopen', () => {
      const popupEl = marker.getPopup().getElement();
      if (popupEl) {
        popupEl.querySelectorAll('.map-popup-event').forEach(el => {
          el.addEventListener('click', () => {
            const evId = parseInt(el.dataset.eventId, 10);
            const ev = tournaments.find(t => t.id === evId);
            if (ev) openModal(ev);
          });
        });
      }
    });

    mapMarkerCluster.addLayer(marker);
  });

  // Fit bounds to all markers
  if (filtered.length > 0) {
    const bounds = L.latLngBounds(filtered.map(c => [c.lat, c.lng]));
    mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showLoading() {
  // Calendar skeleton: 5 rows × 7 columns of day cells
  const calSkeletonDays = Array.from({ length: 35 }, () =>
    `<div class="skeleton skeleton-cal-day"></div>`
  ).join('');
  document.getElementById('cal-body').innerHTML =
    `<div class="skeleton-cal-grid">${calSkeletonDays}</div>`;

  // List skeleton: header + cards
  const skeletonCards = Array.from({ length: 5 }, (_, i) =>
    `<div class="skeleton skeleton-card" style="width:100%;opacity:${1 - i * 0.15}"></div>`
  ).join('');
  document.getElementById('list-container').innerHTML = `
    <div style="padding: 12px 0;">
      <div class="skeleton skeleton-header"></div>
      ${skeletonCards}
    </div>
  `;
}

function showError() {
  const msg = `<div class="empty-state">
    <span class="empty-state-icon">&#9888;</span>
    <div class="empty-state-title">${t('error')}</div>
  </div>`;
  document.getElementById('cal-body').innerHTML = msg;
  document.getElementById('list-container').innerHTML = msg;
}
