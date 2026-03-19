// Collection progress calculations

// Cache for collected card numbers + rarity (refreshed on each stats call)
let _collectedSet = new Map();

async function refreshCollectedSet() {
  const all = await getAllCollected();
  _collectedSet = new Map(all.map(c => [c.cardNumber, c.rarity || 'white']));
  return _collectedSet;
}

function isCollected(cardNumber) {
  return _collectedSet.has(cardNumber);
}

function getRarity(cardNumber) {
  return _collectedSet.get(cardNumber) || 'white';
}

function getOverallStats() {
  const total = CARDS.length;
  const collected = CARDS.filter(c => _collectedSet.has(c.number)).length;
  return { total, collected, percent: total ? Math.round((collected / total) * 100) : 0 };
}

function getTeamStats(teamId) {
  const teamCards = CARDS.filter(c => c.team === teamId);
  const collected = teamCards.filter(c => _collectedSet.has(c.number)).length;
  return {
    total: teamCards.length,
    collected,
    percent: teamCards.length ? Math.round((collected / teamCards.length) * 100) : 0
  };
}

function getCategoryStats(categoryId) {
  const catCards = CARDS.filter(c => c.category === categoryId);
  const collected = catCards.filter(c => _collectedSet.has(c.number)).length;
  return {
    total: catCards.length,
    collected,
    percent: catCards.length ? Math.round((collected / catCards.length) * 100) : 0
  };
}

function getRecentCards(limit = 10) {
  // Get recently added cards sorted by date
  const all = Array.from(_collectedSet);
  // We need dateAdded info, so we fetch from the collection
  return getAllCollected().then(items => {
    return items
      .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
      .slice(0, limit)
      .map(item => {
        const card = CARDS.find(c => c.number === item.cardNumber);
        return card ? { ...card, dateAdded: item.dateAdded } : null;
      })
      .filter(Boolean);
  });
}

function getTeamCards(teamId) {
  return CARDS.filter(c => c.team === teamId);
}

function getCategoryCards(categoryId) {
  return CARDS.filter(c => c.category === categoryId);
}
