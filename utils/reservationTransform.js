const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const RESERVATION_STATUSES = ['候补中', '已转正', '已取消', '已过期', '审核跳过'];
export const RESERVATION_REASONS = ['装备借出中', '日期冲突', '装备不可借', '其他'];

export const PRIORITY_FACTORS = {
  URGENCY: 'urgency',
  BORROW_HISTORY: 'borrowHistory',
  HANDOVER_HISTORY: 'handoverHistory',
  HEALTH_ADJUSTMENT: 'healthAdjustment'
};

export const CONFLICT_TYPES = {
  DATE: 'date',
  GEAR_STATUS: 'gearStatus',
  HEALTH_RISK: 'healthRisk',
  ALREADY_HAS_REQUEST: 'alreadyHasRequest',
  EXPIRED: 'expired'
};

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
    generatedRequestId: '',
    priorityScore: 0,
    queuePosition: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activatedAt: null
  };
}

export function calculatePriorityScore(reservation, { requests, handovers, healthInfoMap }) {
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

  const map = healthInfoMap || {};
  const health = map[reservation.gearId] || {};
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

  const positionMap = new Map();
  active.forEach((r, index) => {
    positionMap.set(r.id, index + 1);
  });

  return reservations.map((r) => ({
    ...r,
    queuePosition: r.status === '候补中' ? (positionMap.get(r.id) || 0) : 0
  }));
}

export function findActivatableReservations(reservations, { requests, gears }) {
  const activeReservations = reservations.filter((r) => r.status === '候补中' && !r.generatedRequestId);
  const activatable = [];

  for (const reservation of activeReservations) {
    const gear = (gears || []).find((g) => g.id === reservation.gearId);
    if (!gear) continue;

    const conflictingRequests = (requests || []).filter((req) => {
      if (req.gearId !== reservation.gearId) return false;
      if (req.status === '已拒绝' || req.status === '已归还') return false;
      if (req.id === reservation.requestId) return false;
      if (req.id === reservation.generatedRequestId) return false;
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

export function createRequestFromReservation(reservation, gear = null) {
  return {
    id: crypto.randomUUID(),
    gearId: reservation.gearId,
    gearName: reservation.gearName || '未知装备',
    owner: reservation.owner || (gear ? gear.owner : ''),
    borrower: reservation.borrower || '',
    start: reservation.start,
    end: reservation.end,
    status: '待处理',
    reason: `候补转正（原候补原因：${reservation.reason || '其他'}）`,
    damage: '',
    fromReservationId: reservation.id
  };
}

export function activateReservation(reservation, generatedRequestId = '') {
  return {
    ...reservation,
    status: '已转正',
    generatedRequestId: generatedRequestId || reservation.generatedRequestId || '',
    activatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function validateActivation(reservation, { requests, gears }) {
  const errors = [];
  if (!reservation) {
    errors.push({ code: 'not_found', message: '候补记录不存在' });
    return { ok: false, errors };
  }

  if (reservation.status !== '候补中') {
    errors.push({ code: 'invalid_status', message: `当前状态为「${reservation.status}」，仅「候补中」可转正` });
  }

  if (reservation.generatedRequestId) {
    errors.push({ code: 'already_has_request', message: '该候补已生成过借用申请，请勿重复操作' });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (reservation.end < today) {
    errors.push({ code: 'expired', message: `候补已过期（期望归还日期 ${reservation.end} 早于今日）` });
  }

  const gear = (gears || []).find((g) => g.id === reservation.gearId);
  if (!gear) {
    errors.push({ code: 'gear_missing', message: `装备「${reservation.gearName || '未知装备'}」不存在于装备库` });
  } else if (gear.status !== '可借') {
    errors.push({ code: 'gear_unavailable', message: `装备「${gear.name}」当前状态为「${gear.status}」，不可借出` });
  }

  const conflictingRequests = (requests || []).filter((req) => {
    if (req.gearId !== reservation.gearId) return false;
    if (req.status === '已拒绝' || req.status === '已归还') return false;
    if (req.id === reservation.requestId) return false;
    if (req.id === reservation.generatedRequestId) return false;
    const reqStart = new Date(req.start);
    const reqEnd = new Date(req.end);
    const resStart = new Date(reservation.start);
    const resEnd = new Date(reservation.end);
    return resStart <= reqEnd && resEnd >= reqStart;
  });

  if (conflictingRequests.length > 0) {
    const details = conflictingRequests.map((c) => `${c.borrower}（${c.start}~${c.end}，${c.status}）`).join('；');
    errors.push({ code: 'date_conflict', message: `装备借用日期存在冲突：${details}` });
  }

  return { ok: errors.length === 0, errors };
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
      generatedRequestId: record.generatedRequestId || '',
      priorityScore: typeof record.priorityScore === 'number' ? record.priorityScore : 0,
      queuePosition: typeof record.queuePosition === 'number' ? record.queuePosition : 0,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: record.updatedAt || new Date().toISOString(),
      activatedAt: record.activatedAt || null
    };
  }).filter(Boolean);
  return { data, warnings };
}

export function getPriorityScoreBreakdown(reservation, { requests, handovers, healthInfoMap }) {
  const breakdown = [];
  let totalScore = 0;

  const daysUntilStart = Math.floor(
    (new Date(reservation.start) - new Date()) / (24 * 60 * 60 * 1000)
  );
  let urgencyScore = 0;
  let urgencyReason = '';
  if (daysUntilStart <= 0) {
    urgencyScore = 50;
    urgencyReason = '借用日期已到或已过期';
  } else if (daysUntilStart <= 3) {
    urgencyScore = 40;
    urgencyReason = `借用日期临近（还剩 ${daysUntilStart} 天）`;
  } else if (daysUntilStart <= 7) {
    urgencyScore = 30;
    urgencyReason = `一周内借用（还剩 ${daysUntilStart} 天）`;
  } else if (daysUntilStart <= 14) {
    urgencyScore = 20;
    urgencyReason = `两周内借用（还剩 ${daysUntilStart} 天）`;
  } else {
    urgencyScore = 10;
    urgencyReason = `借用日期较远（还剩 ${daysUntilStart} 天）`;
  }
  totalScore += urgencyScore;
  breakdown.push({
    key: PRIORITY_FACTORS.URGENCY,
    label: '紧急程度',
    score: urgencyScore,
    maxScore: 50,
    reason: urgencyReason
  });

  const relatedRequests = (requests || []).filter(
    (r) => r.borrower === reservation.borrower && r.status !== '已拒绝' && r.status !== '已归还'
  );
  const activeBorrowCount = relatedRequests.filter(
    (r) => r.status === '已同意' || r.status === '借出中'
  ).length;
  let borrowScore = 0;
  let borrowReason = '';
  if (activeBorrowCount === 0) {
    borrowScore = 20;
    borrowReason = '无活跃借用记录，信用良好';
  } else if (activeBorrowCount === 1) {
    borrowScore = 10;
    borrowReason = `当前有 ${activeBorrowCount} 个活跃借用`;
  } else {
    borrowScore = 0;
    borrowReason = `当前有 ${activeBorrowCount} 个活跃借用，借用较多`;
  }
  totalScore += borrowScore;
  breakdown.push({
    key: PRIORITY_FACTORS.BORROW_HISTORY,
    label: '借用历史',
    score: borrowScore,
    maxScore: 20,
    reason: borrowReason,
    details: { activeBorrowCount }
  });

  const completedHandovers = (handovers || []).filter(
    (h) => h.borrower === reservation.borrower && h.ownerConfirmed && h.borrowerConfirmed
  );
  const handoverScore = Math.min(completedHandovers.length * 5, 15);
  totalScore += handoverScore;
  breakdown.push({
    key: PRIORITY_FACTORS.HANDOVER_HISTORY,
    label: '交接记录',
    score: handoverScore,
    maxScore: 15,
    reason: handoverScore > 0
      ? `已完成 ${completedHandovers.length} 次交接，信誉良好`
      : '暂无交接记录',
    details: { completedCount: completedHandovers.length }
  });

  const map = healthInfoMap || {};
  const health = map[reservation.gearId] || {};
  const healthScore = health.overallHealthScore;
  let healthAdjustment = 0;
  let healthReason = '装备健康状态良好';
  if (healthScore !== undefined && healthScore < 50) {
    healthAdjustment = -10;
    healthReason = `装备健康评分较低（${healthScore}分），适当降低优先级`;
  }
  totalScore += healthAdjustment;
  breakdown.push({
    key: PRIORITY_FACTORS.HEALTH_ADJUSTMENT,
    label: '装备健康',
    score: healthAdjustment,
    maxScore: 15,
    reason: healthReason,
    details: { healthScore: healthScore !== undefined ? healthScore : null }
  });

  const finalScore = Math.max(0, Math.min(100, totalScore));
  return {
    breakdown,
    totalScore,
    finalScore
  };
}

export function analyzeConflicts(reservation, { requests, gears, healthInfoMap }) {
  const conflicts = [];
  const gear = (gears || []).find((g) => g.id === reservation.gearId);

  const today = new Date().toISOString().slice(0, 10);
  if (reservation.end < today) {
    conflicts.push({
      type: CONFLICT_TYPES.EXPIRED,
      severity: 'critical',
      message: `候补已过期（期望归还日期 ${reservation.end} 早于今日）`,
      canResolve: false
    });
  }

  if (reservation.generatedRequestId) {
    conflicts.push({
      type: CONFLICT_TYPES.ALREADY_HAS_REQUEST,
      severity: 'critical',
      message: '该候补已生成过借用申请，请勿重复操作',
      canResolve: false
    });
  }

  if (!gear) {
    conflicts.push({
      type: CONFLICT_TYPES.GEAR_STATUS,
      severity: 'critical',
      message: `装备「${reservation.gearName || '未知装备'}」不存在于装备库`,
      canResolve: false
    });
  } else if (gear.status !== '可借') {
    conflicts.push({
      type: CONFLICT_TYPES.GEAR_STATUS,
      severity: 'warning',
      message: `装备「${gear.name}」当前状态为「${gear.status}」`,
      canResolve: gear.status === '借出中',
      details: { gearStatus: gear.status }
    });
  }

  const conflictingRequests = (requests || []).filter((req) => {
    if (req.gearId !== reservation.gearId) return false;
    if (req.status === '已拒绝' || req.status === '已归还') return false;
    if (req.id === reservation.requestId) return false;
    if (req.id === reservation.generatedRequestId) return false;
    const reqStart = new Date(req.start);
    const reqEnd = new Date(req.end);
    const resStart = new Date(reservation.start);
    const resEnd = new Date(reservation.end);
    return resStart <= reqEnd && resEnd >= reqStart;
  });

  if (conflictingRequests.length > 0) {
    const details = conflictingRequests.map((c) => ({
      id: c.id,
      borrower: c.borrower,
      start: c.start,
      end: c.end,
      status: c.status,
      reason: c.reason
    }));
    conflicts.push({
      type: CONFLICT_TYPES.DATE,
      severity: 'warning',
      message: `装备借用日期存在 ${conflictingRequests.length} 条冲突记录`,
      canResolve: true,
      details: { conflictingRequests: details }
    });
  }

  const healthMap = healthInfoMap || {};
  const healthInfo = healthMap[reservation.gearId];
  if (healthInfo && healthInfo.overallHealthScore < 50) {
    const risks = [];
    if (healthInfo.damageCount > 0) {
      risks.push(`历史损耗记录 ${healthInfo.damageCount} 次`);
    }
    if (healthInfo.maintenancePlanStatus?.status === 'overdue') {
      risks.push(`保养计划已逾期 ${healthInfo.maintenancePlanStatus.daysOverdue} 天`);
    }
    if (healthInfo.depositDeductCount > 0) {
      risks.push(`押金扣除记录 ${healthInfo.depositDeductCount} 次`);
    }
    conflicts.push({
      type: CONFLICT_TYPES.HEALTH_RISK,
      severity: 'info',
      message: `装备健康评分较低（${healthInfo.overallHealthScore}分），存在使用风险`,
      canResolve: true,
      details: {
        healthScore: healthInfo.overallHealthScore,
        risks,
        damageCount: healthInfo.damageCount,
        depositDeductCount: healthInfo.depositDeductCount,
        maintenancePlanStatus: healthInfo.maintenancePlanStatus
      }
    });
  }

  return {
    hasConflicts: conflicts.length > 0,
    hasCriticalConflicts: conflicts.some(c => c.severity === 'critical'),
    hasResolvableConflicts: conflicts.some(c => c.canResolve),
    conflicts
  };
}

export function assessHealthRisks(gearId, healthInfoMap) {
  const map = healthInfoMap || {};
  const healthInfo = map[gearId];
  if (!healthInfo) return { risks: [], overallLevel: 'good' };

  const risks = [];

  if (healthInfo.damageCount > 0) {
    risks.push({
      type: 'damage',
      level: healthInfo.damageCount >= 3 ? 'danger' : 'warning',
      label: `历史损耗 ${healthInfo.damageCount} 次`,
      description: '该装备有多次损耗记录，需注意检查状态'
    });
  }

  if (healthInfo.maintenancePlanStatus?.status === 'overdue') {
    risks.push({
      type: 'maintenance',
      level: 'danger',
      label: `保养逾期 ${healthInfo.maintenancePlanStatus.daysOverdue} 天`,
      description: '建议先完成保养再借出'
    });
  } else if (healthInfo.maintenancePlanStatus?.status === 'upcoming') {
    risks.push({
      type: 'maintenance',
      level: 'warning',
      label: `保养临近（还剩 ${healthInfo.maintenancePlanStatus.daysUntil} 天）`,
      description: '借出期间可能需要保养'
    });
  }

  if (healthInfo.depositDeductCount > 0) {
    risks.push({
      type: 'deposit',
      level: 'warning',
      label: `押金扣除 ${healthInfo.depositDeductCount} 次`,
      description: '历史使用中曾有损坏赔偿记录'
    });
  }

  if (healthInfo.daysSinceLastMaintenance === null) {
    risks.push({
      type: 'maintenance',
      level: 'info',
      label: '尚无保养记录',
      description: '建议首次使用前进行检查'
    });
  } else if (healthInfo.daysSinceLastMaintenance > 60) {
    risks.push({
      type: 'maintenance',
      level: 'warning',
      label: `超 ${healthInfo.daysSinceLastMaintenance} 天未保养`,
      description: '距上次保养时间较长，建议检查'
    });
  }

  let overallLevel = 'good';
  if (risks.some(r => r.level === 'danger')) {
    overallLevel = 'danger';
  } else if (risks.some(r => r.level === 'warning')) {
    overallLevel = 'warning';
  } else if (risks.some(r => r.level === 'info')) {
    overallLevel = 'info';
  }

  return {
    risks,
    overallLevel,
    healthScore: healthInfo.overallHealthScore
  };
}

export function findAlternativeDates(reservation, { requests, gears }, daysToCheck = 30) {
  const alternatives = [];
  const gear = (gears || []).find((g) => g.id === reservation.gearId);
  if (!gear) return alternatives;

  const originalDuration = Math.ceil(
    (new Date(reservation.end) - new Date(reservation.start)) / (24 * 60 * 60 * 1000)
  ) + 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < daysToCheck; offset++) {
    const candidateStart = new Date(today);
    candidateStart.setDate(today.getDate() + offset);
    const candidateEnd = new Date(candidateStart);
    candidateEnd.setDate(candidateStart.getDate() + originalDuration - 1);

    const startStr = candidateStart.toISOString().slice(0, 10);
    const endStr = candidateEnd.toISOString().slice(0, 10);

    if (endStr < reservation.start) continue;

    const conflicts = (requests || []).filter((req) => {
      if (req.gearId !== reservation.gearId) return false;
      if (req.status === '已拒绝' || req.status === '已归还') return false;
      if (req.id === reservation.requestId) return false;
      const reqStart = new Date(req.start);
      const reqEnd = new Date(req.end);
      return candidateStart <= reqEnd && candidateEnd >= reqStart;
    });

    alternatives.push({
      start: startStr,
      end: endStr,
      conflictCount: conflicts.length,
      conflicts: conflicts.map(c => ({
        borrower: c.borrower,
        start: c.start,
        end: c.end,
        status: c.status
      })),
      isOriginalDates: startStr === reservation.start && endStr === reservation.end,
      daysFromOriginal: Math.ceil(
        (new Date(startStr) - new Date(reservation.start)) / (24 * 60 * 60 * 1000)
      )
    });
  }

  return alternatives.sort((a, b) => a.conflictCount - b.conflictCount || a.daysFromOriginal - b.daysFromOriginal);
}

export function analyzeAllActivatableReservations(reservations, context) {
  const { requests, gears, healthInfoMap, handovers } = context || {};
  const activeReservations = reservations.filter(
    (r) => (r.status === '候补中' || r.status === '审核跳过') && !r.generatedRequestId
  );

  const reviewItems = activeReservations.map((reservation) => {
    const priorityBreakdown = getPriorityScoreBreakdown(reservation, {
      requests,
      handovers,
      healthInfoMap
    });

    const conflictAnalysis = analyzeConflicts(reservation, {
      requests,
      gears,
      healthInfoMap
    });

    const healthRisks = assessHealthRisks(reservation.gearId, healthInfoMap);

    const alternativeDates = conflictAnalysis.hasResolvableConflicts
      ? findAlternativeDates(reservation, { requests, gears }).filter(a => a.conflictCount === 0).slice(0, 5)
      : [];

    const gear = (gears || []).find((g) => g.id === reservation.gearId);

    const occupancy = {
      currentRequest: (requests || []).find(r =>
        r.gearId === reservation.gearId &&
        (r.status === '借出中' || r.status === '已同意')
      ) || null,
      otherReservations: reservations.filter(r =>
        r.gearId === reservation.gearId &&
        r.id !== reservation.id &&
        r.status === '候补中'
      ).sort((a, b) => b.priorityScore - a.priorityScore)
    };

    return {
      id: reservation.id,
      reservation,
      gear,
      canActivate: !conflictAnalysis.hasCriticalConflicts && conflictAnalysis.conflicts.filter(c => c.severity !== 'info').length === 0,
      activationBlockers: conflictAnalysis.conflicts.filter(c => c.severity === 'critical'),
      warnings: conflictAnalysis.conflicts.filter(c => c.severity === 'warning' || c.severity === 'info'),
      priorityScore: reservation.priorityScore,
      priorityBreakdown,
      conflictAnalysis,
      healthRisks,
      alternativeDates,
      occupancy,
      queuePosition: reservation.queuePosition,
      selected: false,
      action: null,
      adjustedStart: null,
      adjustedEnd: null,
      reviewNotes: ''
    };
  });

  return reviewItems.sort((a, b) => {
    if (a.canActivate && !b.canActivate) return -1;
    if (!a.canActivate && b.canActivate) return 1;
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return a.reservation.createdAt.localeCompare(b.reservation.createdAt);
  });
}

export function skipReservation(reservation, notes = '') {
  return {
    ...reservation,
    status: '审核跳过',
    updatedAt: new Date().toISOString(),
    reviewNotes: notes || reservation.reviewNotes || ''
  };
}

export function unskipReservation(reservation) {
  return {
    ...reservation,
    status: '候补中',
    updatedAt: new Date().toISOString()
  };
}

export function adjustReservationDates(reservation, newStart, newEnd) {
  return {
    ...reservation,
    start: newStart,
    end: newEnd,
    updatedAt: new Date().toISOString()
  };
}

export function batchActivateReservations(reviewItems, { gears, requests }, context) {
  const results = [];
  const newRequests = [];
  const updatedReservations = [];
  const errors = [];

  for (const item of reviewItems) {
    const reservation = item.reservation;

    const validation = validateActivation(reservation, {
      requests: [...requests, ...newRequests],
      gears
    });

    if (!validation.ok) {
      errors.push({
        reservationId: reservation.id,
        gearName: reservation.gearName,
        errors: validation.errors
      });
      continue;
    }

    const gear = gears.find((g) => g.id === reservation.gearId);
    const finalStart = item.adjustedStart || reservation.start;
    const finalEnd = item.adjustedEnd || reservation.end;

    const adjustedReservation = {
      ...reservation,
      start: finalStart,
      end: finalEnd
    };

    const newRequest = createRequestFromReservation(adjustedReservation, gear);
    const activatedReservation = activateReservation(adjustedReservation, newRequest.id);

    newRequests.push(newRequest);
    updatedReservations.push(activatedReservation);
    results.push({
      ok: true,
      reservationId: reservation.id,
      reservation: activatedReservation,
      request: newRequest
    });
  }

  return {
    results,
    newRequests,
    updatedReservations,
    errors,
    successCount: results.length,
    errorCount: errors.length
  };
}

export function getReservationStats(reservations) {
  const total = reservations.length;
  const active = reservations.filter((r) => r.status === '候补中').length;
  const activated = reservations.filter((r) => r.status === '已转正').length;
  const cancelled = reservations.filter((r) => r.status === '已取消').length;
  const expired = reservations.filter((r) => r.status === '已过期').length;
  const skipped = reservations.filter((r) => r.status === '审核跳过').length;
  return { total, active, activated, cancelled, expired, skipped };
}
