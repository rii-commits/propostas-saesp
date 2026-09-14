function yearScopedRoute() {
  return ['/dashboard', '/kanban', '/copa', '/propostas'].includes(normalizeRoute(state.route));
}
function initializeRealizationYear() {
  const key = `saesp:realization-year:${state.user.id}`;
  const selected = state.yearPreferenceKey === key ? state.realizationYear : localStorage.getItem(key);
  const years = availableRealizationYears();
  const current = String(new Date().getFullYear());
  state.yearPreferenceKey = key;
  state.realizationYear = ['all', 'undefined', ...years].includes(selected)
    ? selected : years.includes(current) ? current : years[0] || 'all';
  localStorage.setItem(key, state.realizationYear);
}
function availableRealizationYears() {
  return [...new Set((state.data?.proposals || []).map(p => String(p.realizationYear || '')).filter(y => /^\d{4}$/.test(y)))].sort((a, b) => Number(b) - Number(a));
}
function realizationYearLabel() {
  return state.realizationYear === 'all' ? 'Todos os anos' : state.realizationYear === 'undefined' ? 'Ano a definir' : state.realizationYear;
}
function matchesRealizationYear(item) {
  if (state.realizationYear === 'all') return true;
  if (state.realizationYear === 'undefined') return !item.realizationYear;
  return String(item.realizationYear || '') === state.realizationYear;
}
function realizationYearField(item) {
  const value = item ? item.realizationYear || '' : /^\d{4}$/.test(state.realizationYear) ? state.realizationYear : '';
  return `<label class="field"><span>Ano de realização</span><input name="realizationYear" type="number" min="1900" max="2199" step="1" value="${escapeAttr(value)}" placeholder="Ex.: 2027" required ${!canWrite() ? 'disabled' : ''}><small>O ano pertence a esta proposta, independentemente do evento e do código de controle.</small></label>`;
}
function setRealizationYear(value) {
  state.realizationYear = value;
  localStorage.setItem(state.yearPreferenceKey, value);
  renderApp();
}
function yearHeaderSelect() {
  const years = availableRealizationYears();
  const editing = /\/propostas\/(nova|[^/]+\/editar)$/.test(state.route);
  return `<label class="year-header-select"><span>Ano de realização</span><select id="globalYear" aria-label="Ano de realização" onchange="setRealizationYear(this.value)" ${editing ? 'disabled title="Edite o ano no formulário da proposta"' : ''}>
    ${years.map(y => `<option value="${escapeAttr(y)}" ${state.realizationYear === y ? 'selected' : ''}>${escapeHtml(y)}</option>`).join('')}
    <option value="all" ${state.realizationYear === 'all' ? 'selected' : ''}>Todos os anos</option>
    <option value="undefined" ${state.realizationYear === 'undefined' ? 'selected' : ''}>Ano a definir</option>
  </select></label>`;
}
function otherYearPending() {
  return state.data.proposals.filter(p => p.realizationYear && !matchesRealizationYear(p) && !['Final','Recusada','Cancelada'].includes(p.status) && !['Finalizado','Declinios','Concluido','Proposta recusada'].includes(p.workflowStage));
}
function yearAlerts() {
  if (!yearScopedRoute() || sessionStorage.getItem(`saesp:year-alert-dismissed:${state.user.id}`)) return '';
  const pending = otherYearPending().length;
  const undefinedCount = state.realizationYear === 'undefined' ? 0 : state.data.proposals.filter(p => !p.realizationYear).length;
  if (!pending && !undefinedCount) return '';
  return `<aside class="year-alert" aria-label="Pendências por ano"><span aria-hidden="true">⚠</span><div class="year-alert-content">
    ${pending ? `<span>${pending} proposta${pending === 1 ? '' : 's'} em andamento em outros anos <button type="button" onclick="showOtherYearPending()">Ver pendências</button></span>` : ''}
    ${pending && undefinedCount ? '<span class="year-alert-dot" aria-hidden="true">•</span>' : ''}
    ${undefinedCount ? `<span>${undefinedCount} ${undefinedCount === 1 ? 'aguarda' : 'aguardam'} definição de ano <button type="button" onclick="setRealizationYear('undefined'); navigate('/propostas')">Revisar</button></span>` : ''}
    </div><button type="button" class="year-alert-close" aria-label="Dispensar aviso nesta sessão" onclick="dismissYearAlert(this)">×</button></aside>`;
}
function dismissYearAlert(button) {
  sessionStorage.setItem(`saesp:year-alert-dismissed:${state.user.id}`, '1');
  button.closest('.year-alert').remove();
  document.querySelector('.year-pending-details')?.remove();
}
function showOtherYearPending() {
  const existing = document.querySelector('.year-pending-details');
  if (existing) { existing.remove(); return; }
  const panel = document.createElement('section');
  panel.className = 'panel year-pending-details';
  panel.innerHTML = `<h2>Pendências em outros anos</h2>${otherYearPending().map(p => `<p><button class="btn" data-pending-id="${escapeAttr(p.id)}">${escapeHtml(p.title)} · ${escapeHtml(p.realizationYear)}</button> <span>${escapeHtml(workflowLabels[p.workflowStage] || p.workflowStage || p.status)}</span></p>`).join('')}`;
  document.querySelector('.year-alert')?.insertAdjacentElement('afterend', panel);
  panel.querySelectorAll('[data-pending-id]').forEach(b => b.addEventListener('click', () => navigate(`/propostas/${b.dataset.pendingId}/editar`)));
}
function kanbanYearBadge(item) {
  if (!item.realizationYear) return '<span class="year-badge year-badge-undefined">Ano a definir</span>';
  return state.realizationYear === 'all' ? `<span class="year-badge">${escapeHtml(item.realizationYear)}</span>` : '';
}

