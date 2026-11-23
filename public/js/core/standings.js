// A shared rank belongs to a verified time, not just to a matching pilot name.
// A quicker local run may still be awaiting a successful submission.
export function bestStanding(localBest, personal, status = 'ready') {
  const valid = value => Number.isFinite(value) && value > 0 ? value : Infinity;
  const time = Math.min(valid(localBest?.time), valid(personal?.time));
  const ranked = status === 'ready' && Number.isInteger(personal?.rank) && personal.rank > 0 && Math.abs(time - personal.time) < .0001;
  return { time: Number.isFinite(time) ? time : null, rank: ranked ? personal.rank : null,
    label: status === 'loading' ? '…' : status === 'error' ? 'Rank unavailable' : ranked ? `#${personal.rank}` : 'Unranked' };
}
