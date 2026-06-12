const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const RESERVATION_STATUSES = ['候补中', '已转正', '已取消', '已过期'];
export const RESERVATION_REASONS = ['装备借出中', '日期冲突', '装备不可借', '其他'];

export function createReservation({ gearId, gearName, owner, borrower, start, end, reason = '', notes = '', requestId = '' }) {
  return {
    id: crypto.randomUUID(),
    gearId,
    gearName: gearName || '未知装备',
    owner: owner || '',
    borrower: borrower || '',
    start: start || iso(0),
    end: end || iso(0),
    status: '候补中',
    reason: reason || '装备借出中',
    notes: notes || '',
    requestId: requestId || '',
    priorityScore: 0,
    queuePosition: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activatedAt: null
  };
}

export function calculatePriorityScore(reservation, { requests, handovers, healthInfo }) {
  let score = 0;

  const daysUntilStart = Math.floor(
    (new Date(reservation.start) - new Date()) / (24 * 60 * 60 * 1000)
  );
  if (daysUntilStart <= 0) score += 50;
  else if (daysUntilStart <= 3) score += 40;
  else if (daysUntilStart <= 7) score += 30;
  else if (daysUntilStart <= 14) score += 20;
  else score += 10;

  const relatedRequests = (requests || []).filter(
    (r) => r.borrower === reservation.borrower && r.status !== '已拒绝' && r.status !== '已归还'
  );
  const activeBorrowCount = relatedRequests.filter(
    (r) => r.status === '已同意' || r.status === '借出中'
  ).length;
  if (activeBorrowCount === 0) score += 20;
  else if (activeBorrowCount === 1) score += 10;

  const completedHandovers = (handovers || []).filter(
    (h) => h.borrower === reservation.borrower && h.ownerConfirmed && h.borrowerConfirmed
  );
  score += Math.min(completedHandovers.length * 5, 15);

  const health = healthInfo || {};
  const healthScore = health.overallHealthScore;
  if (healthScore !== undefined && healthScore < 50) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function computeQueuePositions(reservations) {
  const active = reservations
    .filter((r) => r.status === '候补中')
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return a.createdAt.localeCompare(b.createdAt);
    });

  return active.map((r, index) => ({
    ...r,
    queuePosition: index + 1
  }));
}

export function findActivatableReservations(reservations, { requests, gears }) {
  const activeReservations = reservations.filter((r) => r.status === '候补中');
  const activatable = [];

  for (const reservation of activeReservations) {
    const gear = (gears || []).find((g) => g.id === reservation.gearId);
    if (!gear) continue;

    const conflictingRequests = (requests || []).filter((req) => {
      if (req.gearId !== reservation.gearId) return false;
      if (req.status === '已拒绝' || req.status === '已归还') return false;
      if (req.id === reservation.requestId) return false;
      const reqStart = new Date(req.start);
      const reqEnd = new Date(req.end);
      const resStart = new Date(reservation.start);
      const resEnd = new Date(reservation.end);
      return resStart <= reqEnd && resEnd >= reqStart;
    });

    if (conflictingRequests.length === 0 && gear.status === '可借') {
      activatable.push(reservation);
    }
  }

  const sorted = activatable.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return sorted.length > 0 ? sorted[0] : null;
}

export function activateReservation(reservation) {
  return {
    ...reservation,
    status: '已转正',
    activatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function cancelReservation(reservation) {
  return {
    ...reservation,
    status: '已取消',
    updatedAt: new Date().toISOString()
  };
}

export function expireOutdatedReservations(reservations) {
  const today = new Date().toISOString().slice(0, 10);
  return reservations.map((r) => {
    if (r.status !== '候补中') return r;
    if (r.end < today) {
      return { ...r, status: '已过期', updatedAt: new Date().toISOString() };
    }
    return r;
  });
}

export function recalcAllPriorities(reservations, context) {
  return reservations.map((r) => {
    if (r.status !== '候补中') return r;
    const priorityScore = calculatePriorityScore(r, context);
    return { ...r, priorityScore, updatedAt: new Date().toISOString() };
  });
}

export function normalizeReservations(rawReservations, gearList, memberList) {
  const warnings = [];
  if (!Array.isArray(rawReservations)) {
    warnings.push('候补预约数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const memberNames = new Set((memberList || []).map((m) => m.nickname));
  const data = rawReservations.map((record, index) => {
    if (!record || typeof record !== 'object') {
      warnings.push(`候补预约第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const gear = gearList
      ? gearList.find((g) => g.id === record.gearId)
        || gearList.find((g) => g.name === record.gearName && g.owner === record.owner)
      : null;
    const status = RESERVATION_STATUSES.includes(record.status) ? record.status : '候补中';
    return {
      id: record.id || crypto.randomUUID(),
      gearId: gear ? gear.id : (record.gearId || ''),
      gearName: gear ? gear.name : (record.gearName || '未知装备'),
      owner: gear ? gear.owner : (record.owner || ''),
      borrower: memberNames.has(record.borrower) ? record.borrower : (record.borrower || ''),
      start: record.start || iso(0),
      end: record.end || record.start || iso(0),
      status,
      reason: record.reason || '',
      notes: record.notes || '',
      requestId: record.requestId || '',
      priorityScore: typeof record.priorityScore === 'number' ? record.priorityScore : 0,
      queuePosition: typeof record.queuePosition === 'number' ? record.queuePosition : 0,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: record.updatedAt || new Date().toISOString(),
      activatedAt: record.activatedAt || null
    };
  }).filter(Boolean);
  return { data, warnings };
}

export function getReservationStats(reservations) {
  const total = reservations.length;
  const active = reservations.filter((r) => r.status === '候补中').length;
  const activated = reservations.filter((r) => r.status === '已转正').length;
  const cancelled = reservations.filter((r) => r.status === '已取消').length;
  const expired = reservations.filter((r) => r.status === '已过期').length;
  return { total, active, activated, cancelled, expired };
}
