// Screen rendering — builds all the HTML for each view

const contentEl = () => document.getElementById('content');

// Thumbnail cache: cardNumber -> objectURL
const thumbCache = {};

async function getThumbnailURL(cardNumber) {
  if (thumbCache[cardNumber]) return thumbCache[cardNumber];
  const photoData = await getPhoto(cardNumber);
  if (photoData && photoData.thumbnailBlob) {
    const url = URL.createObjectURL(photoData.thumbnailBlob);
    thumbCache[cardNumber] = url;
    return url;
  }
  return null;
}

// ── Dashboard ──────────────────────────────────────────

async function renderDashboard() {
  const stats = getOverallStats();
  const recent = await getRecentCards(8);

  let recentHTML = '';
  if (recent.length > 0) {
    const recentCards = await Promise.all(recent.map(async (card) => {
      const thumbURL = await getThumbnailURL(card.number);
      return `
        <div class="card-mini" onclick="navigateTo('/card/${card.number}')">
          ${thumbURL
            ? `<img src="${thumbURL}" alt="${card.name}" class="card-thumb">`
            : `<div class="card-placeholder-mini"><span>#${card.number}</span></div>`
          }
          <div class="card-mini-name">${card.name}</div>
        </div>`;
    }));
    recentHTML = `
      <div class="section">
        <h2 class="section-title">Recently Added</h2>
        <div class="recent-grid">${recentCards.join('')}</div>
      </div>`;
  }

  // Category progress
  const catHTML = CATEGORIES.map(cat => {
    const s = getCategoryStats(cat.id);
    return `
      <div class="stat-row" onclick="navigateTo('/categories/${cat.id}')">
        <span class="stat-label">${cat.name}</span>
        <span class="stat-value">${s.collected}/${s.total}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${s.percent}%"></div></div>
      </div>`;
  }).join('');

  contentEl().innerHTML = `
    <div class="dashboard">
      <div id="auth-strip" class="auth-strip"></div>
      <div class="hero-stats">
        <div class="hero-circle">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#2a2a4a" stroke-width="8"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e2b714" stroke-width="8"
              stroke-dasharray="${2 * Math.PI * 54}"
              stroke-dashoffset="${2 * Math.PI * 54 * (1 - stats.percent / 100)}"
              stroke-linecap="round" transform="rotate(-90 60 60)"/>
          </svg>
          <div class="hero-text">
            <div class="hero-percent">${stats.percent}%</div>
            <div class="hero-count">${stats.collected}/${stats.total}</div>
          </div>
        </div>
      </div>

      ${recentHTML}

      <div class="section">
        <h2 class="section-title">Categories</h2>
        ${catHTML}
      </div>

      <div class="section">
        <div class="backup-actions">
          <button class="btn btn-secondary" onclick="handleExport()">Export Backup</button>
          <button class="btn btn-secondary" onclick="handleImport()">Import Backup</button>
        </div>
        <div id="sync-now-wrap" class="backup-actions" style="margin-top:8px"></div>
        <div class="storage-info" id="storage-info"></div>
      </div>
    </div>`;

  updateStorageInfo();

  // Update auth strip and sync button now that DOM is ready
  if (typeof updateAuthUI === 'function') updateAuthUI();
  const syncWrap = document.getElementById('sync-now-wrap');
  if (syncWrap && typeof getCurrentUser === 'function' && getCurrentUser()) {
    syncWrap.innerHTML = '<button class="btn btn-secondary" style="flex:1" onclick="syncOnSignIn()">Sync Now</button>';
  }
}

async function updateStorageInfo() {
  const est = await getStorageEstimate();
  const el = document.getElementById('storage-info');
  if (el && est.used > 0) {
    const usedMB = (est.used / 1024 / 1024).toFixed(1);
    const quotaMB = (est.quota / 1024 / 1024).toFixed(0);
    el.textContent = `Storage: ${usedMB} MB used of ${quotaMB} MB`;
  }
}

// ── Team List ──────────────────────────────────────────

async function renderTeamList() {
  const teamsHTML = TEAMS.map(team => {
    const s = getTeamStats(team.id);
    return `
      <div class="team-card" onclick="navigateTo('/teams/${team.id}')">
        <div class="team-name">${team.name}</div>
        <div class="team-progress">
          <span>${s.collected}/${s.total}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${s.percent}%"></div></div>
        </div>
      </div>`;
  }).join('');

  contentEl().innerHTML = `
    <div class="screen-header">
      <h1>Teams</h1>
    </div>
    <div class="team-list">${teamsHTML}</div>`;
}

// ── Team Detail ────────────────────────────────────────

async function renderTeamDetail(teamId) {
  const team = TEAMS.find(t => t.id === teamId);
  if (!team) { renderNotFound(); return; }

  const cards = getTeamCards(teamId);
  const s = getTeamStats(teamId);

  contentEl().innerHTML = `
    <div class="screen-header">
      <button class="back-btn" onclick="history.back()">&larr;</button>
      <h1>${team.name}</h1>
      <span class="header-stat">${s.collected}/${s.total}</span>
    </div>
    <div id="binder-container"></div>`;

  await initBinderView('binder-container', cards);
}

// ── Category List ──────────────────────────────────────

async function renderCategoryList() {
  const catsHTML = CATEGORIES.map(cat => {
    const s = getCategoryStats(cat.id);
    return `
      <div class="team-card" onclick="navigateTo('/categories/${cat.id}')">
        <div class="team-name">${cat.name}</div>
        <div class="team-progress">
          <span>${s.collected}/${s.total}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${s.percent}%"></div></div>
        </div>
      </div>`;
  }).join('');

  contentEl().innerHTML = `
    <div class="screen-header">
      <h1>Categories</h1>
    </div>
    <div class="team-list">${catsHTML}</div>`;
}

// ── Category Detail ────────────────────────────────────

async function renderCategoryDetail(categoryId) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  if (!cat) { renderNotFound(); return; }

  const cards = getCategoryCards(categoryId);
  const s = getCategoryStats(categoryId);

  contentEl().innerHTML = `
    <div class="screen-header">
      <button class="back-btn" onclick="history.back()">&larr;</button>
      <h1>${cat.name}</h1>
      <span class="header-stat">${s.collected}/${s.total}</span>
    </div>
    <div id="binder-container"></div>`;

  await initBinderView('binder-container', cards);
}

// ── Search Screen ──────────────────────────────────────

async function renderSearch() {
  contentEl().innerHTML = `
    <div class="screen-header">
      <h1>Search</h1>
    </div>
    <div class="search-container">
      <input type="text" id="search-input" class="search-input"
        placeholder="Player name, card # or team..."
        autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
    <div id="search-results" class="card-grid"></div>
    <div id="search-empty" class="empty-state" style="display:none">
      Type a name, number, or team to search
    </div>`;

  const input = document.getElementById('search-input');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = input.value;
      const resultsEl = document.getElementById('search-results');
      const emptyEl = document.getElementById('search-empty');

      if (!query.trim()) {
        resultsEl.innerHTML = '';
        emptyEl.style.display = 'block';
        emptyEl.textContent = 'Type a name, number, or team to search';
        return;
      }

      const results = searchCards(query);
      if (results.length === 0) {
        resultsEl.innerHTML = '';
        emptyEl.style.display = 'block';
        emptyEl.textContent = 'No cards found';
      } else {
        emptyEl.style.display = 'none';
        resultsEl.innerHTML = await renderCardGrid(results);
      }
    }, 200);
  });

  // Auto-focus on desktop, not on mobile (keyboard popup)
  if (window.innerWidth > 768) input.focus();
}

// ── Binder Page View (18 cards per page, like a real binder) ──

const CARDS_PER_PAGE = 18; // 3 columns x 6 rows = one binder spread

// Track current page per container so back-navigation remembers position
const binderPageState = {};

async function initBinderView(containerId, cards) {
  binderPageState[containerId] = binderPageState[containerId] || 0;
  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);

  // Clamp page
  if (binderPageState[containerId] >= totalPages) binderPageState[containerId] = 0;

  await renderBinderPage(containerId, cards, binderPageState[containerId]);
}

async function renderBinderPage(containerId, cards, page) {
  binderPageState[containerId] = page;
  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);
  const start = page * CARDS_PER_PAGE;
  const pageCards = cards.slice(start, start + CARDS_PER_PAGE);

  const items = await Promise.all(pageCards.map(async (card) => {
    const collected = isCollected(card.number);
    const thumbURL = collected ? await getThumbnailURL(card.number) : null;

    const rarity = collected ? getRarity(card.number) : '';

    return `
      <div class="card-slot ${collected ? 'collected' : ''} ${collected ? 'rarity-' + rarity : ''}" onclick="navigateTo('/card/${card.number}')">
        ${thumbURL
          ? `<img src="${thumbURL}" alt="${card.name}" class="card-thumb" loading="lazy">`
          : `<div class="card-placeholder">
               <span class="card-number">#${card.number}</span>
               <span class="card-name-small">${card.name}</span>
             </div>`
        }
        ${collected ? '<div class="collected-badge">&#10003;</div>' : ''}
      </div>`;
  }));

  // Pad with empty slots if less than 18 cards on last page
  const empty = CARDS_PER_PAGE - pageCards.length;
  for (let i = 0; i < empty; i++) {
    items.push('<div class="card-slot empty-slot"><div class="card-placeholder empty"></div></div>');
  }

  // Split into left page (9) and right page (9)
  const leftItems = items.slice(0, 9).join('');
  const rightItems = items.slice(9, 18).join('');

  const container = document.getElementById(containerId);
  // Store cards reference on the container for pagination
  container._binderCards = cards;

  container.innerHTML = `
    <div class="binder-spread">
      <div class="binder-page binder-page-left">
        <div class="binder-grid">${leftItems}</div>
      </div>
      <div class="binder-spine"></div>
      <div class="binder-page binder-page-right">
        <div class="binder-grid">${rightItems}</div>
      </div>
    </div>
    <div class="binder-nav">
      <button class="binder-btn ${page === 0 ? 'disabled' : ''}"
        onclick="binderPrev('${containerId}')" ${page === 0 ? 'disabled' : ''}>
        &larr; Prev
      </button>
      <span class="binder-page-info">Page ${page + 1} of ${totalPages}</span>
      <button class="binder-btn ${page >= totalPages - 1 ? 'disabled' : ''}"
        onclick="binderNext('${containerId}')" ${page >= totalPages - 1 ? 'disabled' : ''}>
        Next &rarr;
      </button>
    </div>`;
}

async function binderPrev(containerId) {
  const page = binderPageState[containerId] || 0;
  if (page > 0) {
    const container = document.getElementById(containerId);
    await renderBinderPage(containerId, container._binderCards, page - 1);
  }
}

async function binderNext(containerId) {
  const page = binderPageState[containerId] || 0;
  const container = document.getElementById(containerId);
  const totalPages = Math.ceil(container._binderCards.length / CARDS_PER_PAGE);
  if (page < totalPages - 1) {
    await renderBinderPage(containerId, container._binderCards, page + 1);
  }
}

// Simple grid for search results (no pagination needed for filtered results)
async function renderCardGrid(cards) {
  const items = await Promise.all(cards.map(async (card) => {
    const collected = isCollected(card.number);
    const thumbURL = collected ? await getThumbnailURL(card.number) : null;
    const rarity = collected ? getRarity(card.number) : '';

    return `
      <div class="card-slot ${collected ? 'collected' : ''} ${collected ? 'rarity-' + rarity : ''}" onclick="navigateTo('/card/${card.number}')">
        ${thumbURL
          ? `<img src="${thumbURL}" alt="${card.name}" class="card-thumb" loading="lazy">`
          : `<div class="card-placeholder">
               <span class="card-number">#${card.number}</span>
               <span class="card-name-small">${card.name}</span>
             </div>`
        }
        ${collected ? '<div class="collected-badge">&#10003;</div>' : ''}
      </div>`;
  }));
  return items.join('');
}

// ── Card Detail Modal ──────────────────────────────────

async function renderCardDetail(cardNumber) {
  const card = CARDS.find(c => c.number === cardNumber);
  if (!card) { renderNotFound(); return; }

  const collected = isCollected(card.number);
  const rarity = collected ? getRarity(card.number) : 'white';
  const photoData = await getPhoto(card.number);
  const photoURL = photoData && photoData.photoBlob
    ? URL.createObjectURL(photoData.photoBlob) : null;

  const teamName = getTeamName(card.team);
  const catName = getCategoryName(card.category);

  const rarityOptions = [
    { id: 'white', label: 'W', color: 'rgba(255,255,255,0.5)' },
    { id: 'blue', label: 'B', color: '#3b82f6' },
    { id: 'yellow', label: 'Y', color: '#eab308' },
    { id: 'green', label: 'G', color: '#22c55e' },
    { id: 'gold', label: 'Gold', color: '#e2b714' }
  ];

  const raritySelectorHTML = collected ? `
      <div class="rarity-selector">
        <span class="rarity-label">Rarity:</span>
        <div class="rarity-options">
          ${rarityOptions.map(r => `
            <button class="rarity-circle ${r.id === rarity ? 'active' : ''}"
              style="background:${r.color}"
              onclick="handleRarityChange('${card.number}', '${r.id}')"
              title="${r.label}">
            </button>
          `).join('')}
        </div>
      </div>` : '';

  contentEl().innerHTML = `
    <div class="screen-header">
      <button class="back-btn" onclick="history.back()">&larr;</button>
      <h1>#${card.number}</h1>
    </div>
    <div class="card-detail">
      <div class="card-detail-image">
        ${photoURL
          ? `<img src="${photoURL}" alt="${card.name}" class="card-full-image rarity-border-${rarity}">`
          : `<div class="card-placeholder-large">
               <img src="img/placeholder.svg" alt="Not collected">
             </div>`
        }
      </div>
      <div class="card-detail-info">
        <h2 class="card-detail-name">${card.name}</h2>
        <div class="card-detail-meta">
          <span class="badge" onclick="navigateTo('/teams/${card.team}')">${teamName}</span>
          <span class="badge" onclick="navigateTo('/categories/${card.category}')">${catName}</span>
        </div>
      </div>
      <div class="card-detail-actions">
        ${collected
          ? `<button class="btn btn-primary" onclick="handleRetakePhoto('${card.number}')">
               Retake Photo
             </button>
             <button class="btn btn-danger" onclick="handleRemoveCard('${card.number}')">
               Remove from Collection
             </button>`
          : `<button class="btn btn-primary btn-large" onclick="handleCollectCard('${card.number}')">
               Mark as Collected
             </button>`
        }
      </div>
      ${raritySelectorHTML}
    </div>`;
}

// ── Card Actions ───────────────────────────────────────

async function handleCollectCard(cardNumber) {
  // Open camera FIRST — must be synchronous with user tap, before any await,
  // otherwise mobile browsers block the programmatic file-input click
  createPhotoInput(async (file) => {
    let photoResult;
    try {
      if (typeof openPhotoEditor === 'function') {
        photoResult = await openPhotoEditor(file);
        if (!photoResult) return; // User cancelled
      } else {
        photoResult = await processPhoto(file);
      }
    } catch (e) {
      console.error('Photo processing error:', e);
      photoResult = await processPhoto(file);
    }
    await savePhoto(cardNumber, photoResult.photoBlob, photoResult.thumbnailBlob);
    delete thumbCache[cardNumber];
    renderCardDetail(cardNumber);
  });

  // Then mark as collected and re-render
  await markCollected(cardNumber);
  await refreshCollectedSet();
  delete thumbCache[cardNumber];
  renderCardDetail(cardNumber);
}

async function handleRetakePhoto(cardNumber) {
  createPhotoInput(async (file) => {
    let photoResult;
    try {
      if (typeof openPhotoEditor === 'function') {
        photoResult = await openPhotoEditor(file);
        if (!photoResult) return; // User cancelled
      } else {
        photoResult = await processPhoto(file);
      }
    } catch (e) {
      console.error('Photo processing error:', e);
      photoResult = await processPhoto(file);
    }
    await savePhoto(cardNumber, photoResult.photoBlob, photoResult.thumbnailBlob);
    delete thumbCache[cardNumber];
    renderCardDetail(cardNumber);
  });
}

async function handleRemoveCard(cardNumber) {
  if (!confirm('Remove this card from your collection?')) return;
  await markUncollected(cardNumber);
  await refreshCollectedSet();
  delete thumbCache[cardNumber];
  renderCardDetail(cardNumber);
}

async function handleRarityChange(cardNumber, rarity) {
  await updateRarity(cardNumber, rarity);
  await refreshCollectedSet();
  delete thumbCache[cardNumber];
  renderCardDetail(cardNumber);
}

// ── Export/Import ──────────────────────────────────────

async function handleExport() {
  try {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soccer-cards-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('This will replace your entire collection. Are you sure?')) return;

    try {
      const text = await file.text();
      await importData(text);
      await refreshCollectedSet();
      // Clear all thumbnail caches
      Object.keys(thumbCache).forEach(k => delete thumbCache[k]);
      alert('Import successful!');
      navigateTo('/');
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  });

  input.click();
}

// ── Not Found ──────────────────────────────────────────

function renderNotFound() {
  contentEl().innerHTML = `
    <div class="empty-state">
      <p>Page not found</p>
      <button class="btn btn-primary" onclick="navigateTo('/')">Go Home</button>
    </div>`;
}
