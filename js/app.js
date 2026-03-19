// Main app logic + hash router

async function initApp() {
  try {
    await initDB();
    await refreshCollectedSet();
    handleRoute();
  } catch (e) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state"><p>Failed to initialize database</p><p>' + e.message + '</p></div>';
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// Hash-based router
function navigateTo(path) {
  window.location.hash = path;
}

async function handleRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const content = document.getElementById('content');

  // Scroll to top on navigation
  content.scrollTop = 0;

  // Update active tab
  document.querySelectorAll('.tab').forEach(tab => {
    const route = tab.dataset.route;
    if (route === '/' && hash === '/') {
      tab.classList.add('active');
    } else if (route !== '/' && hash.startsWith(route)) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Route matching
  if (hash === '/') {
    await renderDashboard();
  } else if (hash === '/teams') {
    await renderTeamList();
  } else if (hash.startsWith('/teams/')) {
    const teamId = hash.split('/')[2];
    await renderTeamDetail(teamId);
  } else if (hash === '/categories') {
    await renderCategoryList();
  } else if (hash.startsWith('/categories/')) {
    const catId = hash.split('/')[2];
    await renderCategoryDetail(catId);
  } else if (hash === '/search') {
    await renderSearch();
  } else if (hash.startsWith('/card/')) {
    const cardNumber = decodeURIComponent(hash.slice(6));
    await renderCardDetail(cardNumber);
  } else {
    renderNotFound();
  }
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', initApp);
