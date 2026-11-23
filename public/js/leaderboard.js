import { formatTime } from './core/race.js';
import { getRecord } from './core/storage.js';
import { bestStanding } from './core/standings.js';
import { AIRCRAFT, getAircraft } from './core/aircraft-data.js';

const $ = id => document.getElementById(id);
export class Leaderboard {
  constructor(getScope) {
    this.getScope = getScope; this.generation = 0;
    for (const aircraft of AIRCRAFT) {
      const option = document.createElement('option'); option.value = aircraft.id; option.textContent = aircraft.name;
      $('leaderboard-aircraft').append(option);
    }
    $('leaderboard-aircraft').onchange = event => { this.browsingAircraft = event.target.value; this.refresh(true); };
    $('leaderboard-refresh').onclick = () => this.refresh(true);
  }
  renderBest(scope, localBest, data, status) {
    const standing = bestStanding(localBest, data?.personal, status);
    $('menu-best-label').textContent = `${scope.name} best`;
    $('menu-best').textContent = standing.time === null ? '—' : formatTime(standing.time);
    $('menu-rank').textContent = standing.label;
    $('menu-rank').classList.toggle('is-ranked', standing.rank !== null);
    $('menu-rank').title = standing.rank ? `Rank ${standing.rank} of ${data.totalPilots} on the ${scope.name} leaderboard for this course.` :
      status === 'error' ? `Couldn’t check your ${scope.name} rank. Refresh to try again.` : status === 'loading' ? `Checking your ${scope.name} rank…` : `Finish and submit a ${scope.name} race to rank this best time.`;
  }
  async refresh(force = false) {
    const selected = this.getScope();
    if (this.selectedAircraft !== selected.aircraft) {
      this.selectedAircraft = selected.aircraft; this.browsingAircraft = selected.aircraft;
    }
    const aircraft = getAircraft(this.browsingAircraft);
    const scope = { ...selected, aircraft: aircraft.id, name: aircraft.name }, key = JSON.stringify({ selected, scope });
    if (!force && this.pending === key) return;
    const generation = ++this.generation; this.pending = key;
    $('leaderboard-aircraft').value = scope.aircraft;
    $('leaderboard-course').textContent = `${scope.shared ? 'Shared' : "Today's"} course · ${scope.name} rankings`;
    $('leaderboard-list').setAttribute('aria-label', `Fastest ${scope.name} race times for this course`);
    $('plane-ranking-note').textContent = `${selected.name} races have their own Top 10.`;
    let localBest = null, bestData = null, status = 'loading';
    const renderBest = () => { if (generation === this.generation) this.renderBest(selected, localBest, bestData, status); };
    renderBest();
    const local = getRecord(selected.seed, selected.aircraft).then(best => { localBest = best; renderBest(); });
    $('leaderboard-list').hidden = true; $('leaderboard-list').replaceChildren();
    $('leaderboard-status').hidden = false; $('leaderboard-status').textContent = 'Loading times…';
    $('leaderboard-refresh').disabled = true;
    const load = async board => {
      const query = new URLSearchParams({ seed: board.seed, aircraft: board.aircraft });
      const response = await fetch(`/api/leaderboard?${query}`, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error('Couldn’t load times. Try refreshing.');
      return response.json();
    };
    const boardRequest = load(scope), bestRequest = scope.aircraft === selected.aircraft ? boardRequest : load(selected);
    const personal = (async () => {
      try { bestData = await bestRequest; status = 'ready'; }
      catch { status = 'error'; }
      renderBest();
    })();
    try {
      const { entries } = await boardRequest;
      if (generation !== this.generation) return;
      for (const entry of entries) {
        const row = document.createElement('li'), pilot = document.createElement('span'), time = document.createElement('time');
        pilot.className = 'pilot-name'; pilot.textContent = entry.isYou ? `${entry.name} (you)` : entry.name; pilot.title = pilot.textContent;
        time.textContent = formatTime(entry.time); time.setAttribute('datetime', `PT${entry.time.toFixed(3)}S`);
        row.classList.toggle('is-you', entry.isYou); row.append(pilot, time); $('leaderboard-list').append(row);
      }
      $('leaderboard-list').hidden = !entries.length;
      $('leaderboard-status').hidden = !!entries.length;
      $('leaderboard-status').textContent = `No ${scope.name} times yet. Finish a race in this plane to set one.`;
    } catch {
      if (generation === this.generation) $('leaderboard-status').textContent = 'Couldn’t load times. Try refreshing.';
    } finally {
      await Promise.all([local, personal]);
      if (generation === this.generation) { this.pending = null; $('leaderboard-refresh').disabled = false; }
    }
  }
  async submit(run) {
    const response = await fetch('/api/leaderboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run), signal: AbortSignal.timeout(16000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Couldn’t submit this time.');
    const scope = this.getScope();
    if (scope.seed === run.seed && scope.aircraft === run.aircraft) this.refresh(true);
    return result;
  }
}
