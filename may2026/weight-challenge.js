(function() {
  const tableBody = document.getElementById('challenge-body');
  const tableHead = document.querySelector('#challenge-table thead');
  const challengeData = window.WEIGHT_CHALLENGE_DATA;

  function calculatePercentage(start, current) {
    if (!start || !current || isNaN(start) || isNaN(current)) return null;
    const diff = current - start;
    return (diff / start) * 100;
  }

  function getWeight(person, weekIndex) {
    return person.weights[weekIndex] || null;
  }

  function getLatestWeight(person) {
    for (let i = person.weights.length - 1; i >= 0; i--) {
      const weight = getWeight(person, i);
      if (weight && !isNaN(weight)) return weight;
    }
    return null;
  }

  function renderMissingDataMessage() {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '<tr><td>Missing weight challenge data.</td></tr>';
  }

  function render() {
    if (!challengeData || !challengeData.people || !challengeData.weeks) {
      renderMissingDataMessage();
      return;
    }

    const people = challengeData.people;
    const weeks = challengeData.weeks;

    // 1. Render Header (People's names as columns)
    tableHead.innerHTML = `
      <tr>
        <th>Week</th>
        ${people.map(person => `<th>${person.name}</th>`).join('')}
      </tr>
    `;

    // 2. Render Rows (Weeks)
    tableBody.innerHTML = '';
    weeks.forEach((week, i) => {
      const tr = document.createElement('tr');
      
      let rowHtml = `<td><strong>${week.label}</strong></td>`;
      
      people.forEach(person => {
        const weight = getWeight(person, i);
        if (!weight) {
          rowHtml += '<td>&mdash;</td>';
          return;
        }

        let changeHtml = '';
        if (i > 0) {
          const prevWeight = getWeight(person, i - 1);
          if (prevWeight) {
            const lbs = weight - prevWeight;
            const pct = calculatePercentage(prevWeight, weight);
            const colorClass = lbs <= 0 ? 'percent-loss' : 'percent-gain';
            const sign = lbs > 0 ? '+' : '';
            changeHtml = `<div class="change-sub ${colorClass}">${sign}${lbs.toFixed(1)} lbs (${sign}${pct.toFixed(1)}%)</div>`;
          }
        }
        
        rowHtml += `<td>
          <div class="weight-value">${weight}</div>
          ${changeHtml}
        </td>`;
      });
      tr.innerHTML = rowHtml;
      tableBody.appendChild(tr);
    });

    // 3. Render Total Change Row
    const totalTr = document.createElement('tr');
    totalTr.classList.add('total-row');
    let totalHtml = '<td><strong>Total Change</strong></td>';
    people.forEach(person => {
      const start = getWeight(person, 0);
      const latest = getLatestWeight(person);
      const lbs = latest - start;
      const pct = calculatePercentage(start, latest);
      
      if (pct !== null) {
        const colorClass = lbs <= 0 ? 'percent-loss' : 'percent-gain';
        const sign = lbs > 0 ? '+' : '';
        totalHtml += `
          <td class="${colorClass}">
            <strong>${sign}${lbs.toFixed(1)} lbs</strong><br>
            <small>${sign}${pct.toFixed(2)}%</small>
          </td>`;
      } else {
        totalHtml += '<td>&mdash;</td>';
      }
    });
    totalTr.innerHTML = totalHtml;
    tableBody.appendChild(totalTr);
  }

  render();
})();
