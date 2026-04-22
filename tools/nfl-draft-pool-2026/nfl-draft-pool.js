(() => {
  'use strict';

  const draftPicks = [
    "Fernando Mendoza",
    "Arvell Reese",
    "David Bailey",
    "Jeremiyah Love",
    "Sonny Styles",
    "Carnell Tate",
    "Mansoor Delane",
    "Rueben Bain Jr.",
    "Spencer Fano",
    "Jordyn Tyson",
    "Francis Mauigoa",
    "Dillon Thieneman",
    "Caleb Downs",
    "Colton Hood",
    "Makai Lemon",
    "Kadyn Proctor",
    "Olaivavega Ioane",
    "Kayden McDonald",
    "Kenyon Sadiq",
    "T.J. Parker",
    "Akheem Mesidor",
    "Monroe Freeling",
    "Keldric Faulk",
    "Omar Cooper Jr.",
    "Zion Young",
    "Ty Simpson",
    "Caleb Lomu",
    "Jermod McCoy",
    "Blake Miller",
    "Jadarian Price",
    "Avieon Terrell",
    "Anthony Hill Jr."
  ];

  const playersList = document.getElementById('players-list');
  const copyBtn = document.getElementById('copy-btn');
  const statusMessage = document.getElementById('status-message');

  function renderPlayers() {
    playersList.innerHTML = '';
    draftPicks.forEach((pick, index) => {
      const item = document.createElement('div');
      item.className = 'player-item';
      
      const rank = document.createElement('span');
      rank.className = 'player-rank';
      rank.textContent = `${index + 1}.`;
      
      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = pick;
      
      item.appendChild(rank);
      item.appendChild(name);
      playersList.appendChild(item);
    });
  }

  async function copyToClipboard() {
    const textToCopy = draftPicks.join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      
      // Visual feedback
      copyBtn.classList.add('copied');
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      statusMessage.textContent = 'All players copied to clipboard!';
      statusMessage.classList.add('valid');

      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.textContent = originalText;
        statusMessage.textContent = "";
        statusMessage.classList.remove('valid');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      statusMessage.textContent = 'Failed to copy to clipboard.';
      statusMessage.classList.add('error');
    }
  }

  copyBtn.addEventListener('click', copyToClipboard);

  // Initialize
  renderPlayers();

})();
