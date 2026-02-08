// PadelThailand.com — Tournament Calendar App
// Data source: Google Sheets (published CSV)
// Features: Calendar/List views, multi-day bars, countdown, tooltips,
//           Google Calendar, share, dark/light mode, Thai/English, keyboard nav

const SHEET_ID = '1uEk015Jv8tNGFYlQ7f5Q_DuO4FZbL8ls3cmZLPwsjsk';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

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
    search_placeholder: 'Search tournaments...',
    register_2: 'Register',
    tournament_details: 'Tournament Details',
    empty_try_search: 'Try a different search term or clear the search',
    empty_try_filter: 'Try selecting a different organizer filter',
    countdown_live: 'Happening Now',
    year_more: '+{n} more',
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
    search_placeholder: 'ค้นหาทัวร์นาเมนต์...',
    register_2: 'ลงทะเบียน',
    tournament_details: 'รายละเอียดทัวร์นาเมนต์',
    empty_try_search: 'ลองค้นหาด้วยคำอื่น หรือล้างการค้นหา',
    empty_try_filter: 'ลองเลือกตัวกรองผู้จัดงานอื่น',
    countdown_live: 'กำลังแข่งขัน',
    year_more: '+{n} เพิ่มเติม',
  }
};

// ---- State ----
let tournaments = [];
let organizerMeta = {}; // { name: { color, logoUrl, instagram, facebook, website } }
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let activeFilter = 'all';
let activeLocationFilter = 'all';
let activeCategoryFilter = 'all';
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
let listShouldScroll = true;
let modalScrollY = 0;

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);
  applyLang(currentLang);
  fetchTournaments();
  bindEvents();
});

// ---- Data Fetching ----
async function fetchTournaments() {
  showLoading();
  try {
    const resp = await fetch(SHEET_URL);
    if (!resp.ok) throw new Error('Failed to fetch');
    const csv = await resp.text();
    tournaments = parseCSV(csv);
    buildOrganizerMeta();
    buildFilters();
    buildLocationFilters();
    buildCategoryFilters();
    render();
    checkDeepLink();
  } catch (err) {
    console.error('Error loading tournaments:', err);
    showError();
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
    const tbcMonthData = parseTBCMonth(obj['Start Date']);
    const startDate = tbcMonthData
      ? new Date(tbcMonthData.year, tbcMonthData.month, 1)
      : parseDate(obj['Start Date']);
    // Build a stable slug from organizer + name for deep links
    const slugBase = `${(obj['Organizer'] || '').trim()}-${(obj['Tournament Name'] || '').trim()}`
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
    };
  });
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
  // Re-render content with new language — buildFilters rebuilds filter buttons,
  // then render() updates the active view, summary, TBC, legend, profiles
  if (tournaments.length) {
    buildFilters();
    buildLocationFilters();
    buildCategoryFilters();
    // Restore organizer filter active state after rebuild
    if (activeFilter !== 'all') {
      const btn = document.querySelector(`#filters .filter-btn[data-organizer="${activeFilter}"]`);
      if (btn) {
        document.querySelectorAll('#filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.filter-btn-org').forEach(b => {
          b.style.opacity = b.dataset.organizer === activeFilter ? '1' : '0.35';
        });
      }
    }
    // Restore location filter active state
    if (activeLocationFilter !== 'all') {
      const btn = document.querySelector(`#location-filters .filter-btn[data-location="${activeLocationFilter}"]`);
      if (btn) {
        document.querySelectorAll('#location-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#location-filters .filter-btn:not([data-location="all"])').forEach(b => {
          b.style.opacity = b.dataset.location === activeLocationFilter ? '1' : '0.35';
        });
      }
    }
    // Restore category filter active state
    if (activeCategoryFilter !== 'all') {
      const btn = document.querySelector(`#category-filters .filter-btn[data-category="${activeCategoryFilter}"]`);
      if (btn) {
        document.querySelectorAll('#category-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#category-filters .filter-btn:not([data-category="all"])').forEach(b => {
          b.style.opacity = b.dataset.category === activeCategoryFilter ? '1' : '0.35';
        });
      }
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
  activeFilter = organizer;
  // Reset organizer buttons only
  document.querySelectorAll('#filters .filter-btn').forEach(b => b.classList.remove('active'));
  // Dim non-active organizer buttons
  document.querySelectorAll('.filter-btn-org').forEach(b => {
    if (organizer === 'all' || b.dataset.organizer === organizer) {
      b.style.opacity = '1';
    } else {
      b.style.opacity = '0.35';
    }
  });
  if (organizer === 'all') {
    document.querySelector('#filters .filter-btn[data-organizer="all"]').classList.add('active');
  } else {
    clickedBtn.classList.add('active');
  }
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
  activeLocationFilter = location;
  document.querySelectorAll('#location-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (location === 'all') {
    document.querySelector('#location-filters .filter-btn[data-location="all"]').classList.add('active');
  } else {
    clickedBtn.classList.add('active');
  }
  document.querySelectorAll('#location-filters .filter-btn:not([data-location="all"])').forEach(b => {
    b.style.opacity = (location === 'all' || b.dataset.location === location) ? '1' : '0.35';
  });
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
  activeCategoryFilter = category;
  document.querySelectorAll('#category-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (category === 'all') {
    document.querySelector('#category-filters .filter-btn[data-category="all"]').classList.add('active');
  } else {
    clickedBtn.classList.add('active');
  }
  document.querySelectorAll('#category-filters .filter-btn:not([data-category="all"])').forEach(b => {
    b.style.opacity = (category === 'all' || b.dataset.category === category) ? '1' : '0.35';
  });
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

function handleKeyboard(e) {
  // Don't intercept if user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'Escape':
      closeModal();
      break;
    case 'ArrowLeft':
      if (!isModalOpen()) {
        if (activeView === 'year') { currentYearView--; renderYear(); }
        else { navigateMonth(-1); }
        e.preventDefault();
      }
      break;
    case 'ArrowRight':
      if (!isModalOpen()) {
        if (activeView === 'year') { currentYearView++; renderYear(); }
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
  currentMonth = now.getMonth();
  currentYear = now.getFullYear();
  renderCalendar();
}

// ---- Rendering ----
function render() {
  const views = ['calendar-view', 'year-view', 'list-view'];
  views.forEach(id => {
    const el = document.getElementById(id);
    el.classList.add('hidden');
    el.classList.remove('view-transition-enter');
  });

  let activeEl;
  if (activeView === 'calendar') {
    activeEl = document.getElementById('calendar-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    renderCalendar();
  } else if (activeView === 'year') {
    activeEl = document.getElementById('year-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    renderYear();
  } else {
    activeEl = document.getElementById('list-view');
    activeEl.classList.remove('hidden');
    activeEl.classList.add('view-transition-enter');
    renderList();
  }
  renderTBC();
  renderSummaryBar();
}

function getFiltered() {
  const today = stripTime(new Date());
  return tournaments.filter(t => {
    if (t.hidden) return false;
    if (activeFilter !== 'all' && t.organizer !== activeFilter) return false;
    if (activeLocationFilter !== 'all' && t.city !== activeLocationFilter) return false;
    if (activeCategoryFilter !== 'all' && !t.categories.includes(activeCategoryFilter)) return false;
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

    // Find tournaments on this day with bar position info (exclude month-TBC)
    const eventsOnDay = dated.filter(ev => {
      if (ev.dateTBC) return false;
      const start = stripTime(ev.startDate);
      const end = ev.endDate ? stripTime(ev.endDate) : start;
      return dayDate >= start && dayDate <= end;
    });

    if (eventsOnDay.length > 0) {
      cell.classList.add('has-events');
    }

    eventsOnDay.forEach(ev => {
      const start = stripTime(ev.startDate);
      const end = ev.endDate ? stripTime(ev.endDate) : start;
      const isStart = dayDate.getTime() === start.getTime();
      const isEnd = dayDate.getTime() === end.getTime();
      // Also break at week boundaries (Monday)
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

      const bar = document.createElement('div');
      bar.className = `cal-event-bar ${barClass}`;
      bar.style.background = ev.color;
      bar.innerHTML = (isStart || isWeekStart) ? (ev.featured ? `<span class="bar-star">${SVG_STAR}</span>` : '') + esc(ev.name) : '';

      // Past event dimming
      if (end < stripTime(today)) {
        bar.classList.add('past-event');
      }

      bar.addEventListener('click', (e) => { e.stopPropagation(); openModal(ev); });

      // Tooltip
      bar.addEventListener('mouseenter', (e) => showTooltip(e, ev));
      bar.addEventListener('mousemove', (e) => moveTooltip(e));
      bar.addEventListener('mouseleave', hideTooltip);

      cell.appendChild(bar);
    });

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
    const hasFilter = activeFilter !== 'all';
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

        const primaryEvent = eventsOnDay[0];
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

        // Build background: split colors for multiple tournaments
        const uniqueColors = [...new Set(eventsOnDay.map(ev => ev.color))];
        const alpha = 0.3;

        if (!isToday) {
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

        if (isSingleDay) {
          dayEl.classList.add('oval-single');
        } else {
          const hasLeftRound = isEventStart || isWeekStart || isFirstDayOfMonth;
          const hasRightRound = isEventEnd || isWeekEnd || isLastDayOfMonth;

          if (hasLeftRound) dayEl.classList.add('oval-left');
          if (hasRightRound) dayEl.classList.add('oval-right');
          if (!hasLeftRound && !hasRightRound) dayEl.classList.add('oval-mid');
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
        pill.className = 'year-event-pill' + (ev.dateTBC ? ' year-event-pill-tbc' : '');
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
    const hasFilter = activeFilter !== 'all';
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
    const hasFilter = activeFilter !== 'all';
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
    </div>
    <div class="card-org-logo-col">
      ${meta.logoUrl
        ? `<img class="card-org-logo" src="${esc(meta.logoUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : `<div class="card-org-dot" style="background:${ev.color}"></div>`}
    </div>
    <div class="card-info">
      <span class="card-organizer-badge" style="background:${ev.color}">${esc(ev.organizer)}</span>
      <div class="card-title">${esc(ev.name)}${countdown}</div>
      <div class="card-meta">
        <span class="card-meta-item">${esc(dateRange)}</span>
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
  const igAction = ev.instagramUrl ? `<a href="${esc(ev.instagramUrl)}" target="_blank" rel="noopener" class="modal-action-btn">${SVG_INSTAGRAM} ${t('view_instagram')}</a>` : '';

  content.innerHTML = `
    <div class="modal-header-row">
      <span class="modal-organizer" style="background:${ev.color}">${logoHtml}${esc(ev.organizer)}</span>
      ${featuredBadge}
    </div>
    <h2 class="modal-title">${esc(ev.name)}${countdown ? ` <span class="countdown-badge${getCountdownDays(ev) <= 3 ? ' imminent' : getCountdownDays(ev) <= 14 ? ' soon' : ''}">${countdown}</span>` : ''}</h2>
    ${categoriesHtml}
    <div class="modal-details">
      <div class="modal-detail">
        <span class="modal-detail-icon">&#128197;</span>
        <span class="modal-detail-label">${t('modal_date')}</span>
        <span class="modal-detail-value">${esc(dateRange)}</span>
      </div>
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
  // Use date-only format for all-day events
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
  const base = window.location.origin + window.location.pathname;
  return `${base}?tournament=${encodeURIComponent(ev.slug)}`;
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
  const tid = params.get('tournament');
  if (tid !== null) {
    // Support both slug-based (new) and numeric id-based (legacy) deep links
    let ev = tournaments.find(t => t.slug === tid);
    if (!ev) {
      const numId = parseInt(tid, 10);
      if (!isNaN(numId)) ev = tournaments.find(t => t.id === numId);
    }
    if (ev) {
      setTimeout(() => openModal(ev), 300);
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
  if (!ev.endDate || ev.startDate.getTime() === ev.endDate.getTime()) return start;
  const end = formatFullDate(ev.endDate);
  return `${start} \u2013 ${end}`;
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
