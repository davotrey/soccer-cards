// Search and filter logic
// Case-insensitive partial match on player name and card number

function searchCards(query) {
  if (!query || query.trim().length === 0) return [];

  const q = query.trim().toLowerCase();

  return CARDS.filter(card => {
    return card.name.toLowerCase().includes(q) ||
           card.number.toLowerCase().includes(q) ||
           getTeamName(card.team).toLowerCase().includes(q);
  });
}

function getTeamName(teamId) {
  const team = TEAMS.find(t => t.id === teamId);
  return team ? team.name : teamId;
}

function getCategoryName(categoryId) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  return cat ? cat.name : categoryId;
}
