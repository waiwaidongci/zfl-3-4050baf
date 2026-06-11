import { computed } from 'vue';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.floor((d2 - d1) / DAY_MS);
}

function daysAgo(dateStr) {
  return daysBetween(dateStr, new Date().toISOString().slice(0, 10));
}

function buildBorrowerHistory(requests, handovers) {
  const map = new Map();
  requests.forEach((req) => {
    if (!req.borrower) return;
    if (!map.has(req.borrower)) {
      map.set(req.borrower, { name: req.borrower, count: 0, lastDate: null });
    }
    const entry = map.get(req.borrower);
    entry.count += 1;
    if (!entry.lastDate || (req.end && req.end > entry.lastDate)) {
      entry.lastDate = req.end || req.start;
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.lastDate || '').localeCompare(a.lastDate || '');
  });
}

function buildTimelineEvents({ gear, requests, handovers, maintenanceRecords, depositRecords }) {
  const events = [];

  maintenanceRecords.forEach((r) => {
    events.push({
      id: `m-${r.id}`,
      date: r.date,
      type: 'maintenance',
      subType: r.type,
      title: `${r.type}保养`,
      description: r.description,
      meta: { handler: r.handler }
    });
  });

  requests.forEach((req) => {
    events.push({
      id: `req-${req.id}`,
      date: req.start,
      type: 'borrow',
      subType: req.status,
      title: `${req.borrower} 申请借用`,
      description: req.reason || '',
      meta: { status: req.status, start: req.start, end: req.end }
    });
  });

  handovers.forEach((h) => {
    const completed = h.ownerConfirmed && h.borrowerConfirmed;
    events.push({
      id: `ho-${h.id}`,
      date: h.createdAt,
      type: h.type === '借出' ? 'handover-out' : 'handover-in',
      subType: completed ? 'completed' : 'pending',
      title: h.type === '借出' ? '借出交接' : '归还交接',
      description: h.handoverNotes || '',
      meta: {
        owner: h.owner,
        borrower: h.borrower,
        completed,
        damageRecord: h.damageRecord,
        deductAmount: h.deductAmount,
        deductReason: h.deductReason
      }
    });
  });

  depositRecords.forEach((d) => {
    const dedNum = Number(d.deductedAmount) || 0;
    if (dedNum > 0) {
      events.push({
        id: `dep-${d.id}`,
        date: d.updatedAt || d.createdAt,
        type: 'deposit-deduct',
        subType: d.status,
        title: `押金扣除 ¥${dedNum}`,
        description: d.deductReason || '',
        meta: { borrower: d.borrower, amount: dedNum }
      });
    }
  });

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

function computeRiskTags({ gear, borrowCount, damageCount, depositDeductCount, daysSinceLastMaintenance, hasActiveBorrow }) {
  const tags = [];

  if (gear.damage && gear.damage.trim()) {
    tags.push({ key: 'damage', level: 'danger', label: '存在损耗记录', icon: '⚠️' });
  }

  if (damageCount > 0) {
    tags.push({ key: 'damage-history', level: 'danger', label: `历史损耗 ${damageCount} 次`, icon: '🔧' });
  }

  if (depositDeductCount > 0) {
    tags.push({ key: 'deposit-deduct', level: 'warning', label: `押金扣除 ${depositDeductCount} 次`, icon: '💰' });
  }

  if (daysSinceLastMaintenance === null) {
    tags.push({ key: 'no-maintenance', level: 'warning', label: '尚无保养记录', icon: '🧽' });
  } else if (daysSinceLastMaintenance > 60) {
    tags.push({ key: 'overdue-maintenance', level: 'warning', label: `超 ${daysSinceLastMaintenance} 天未保养`, icon: '⏰' });
  }

  if (borrowCount >= 10) {
    tags.push({ key: 'high-usage', level: 'info', label: `高频使用 · ${borrowCount}次`, icon: '📊' });
  } else if (borrowCount >= 5) {
    tags.push({ key: 'mid-usage', level: 'info', label: `已使用 ${borrowCount} 次`, icon: '📈' });
  }

  if (hasActiveBorrow) {
    tags.push({ key: 'active', level: 'info', label: '当前借出中', icon: '🔄' });
  }

  return tags;
}

function computeSuggestedActions({ gear, riskTags, daysSinceLastMaintenance, borrowCount, damageCount, depositDeductTotal }) {
  const actions = [];

  if (gear.damage && gear.damage.trim()) {
    actions.push({
      key: 'repair',
      priority: 'high',
      title: '及时维修或更新',
      description: `当前记录损耗：${gear.damage}，建议尽快处理以避免影响下次使用。`
    });
  }

  if (daysSinceLastMaintenance === null || daysSinceLastMaintenance > 60) {
    actions.push({
      key: 'maintenance',
      priority: 'high',
      title: daysSinceLastMaintenance === null ? '建议进行首次保养' : `安排定期保养（超 ${daysSinceLastMaintenance} 天）`,
      description: '建议进行清洁、检查，必要时更换易损件，延长装备使用寿命。'
    });
  }

  if (depositDeductTotal > 0) {
    actions.push({
      key: 'review-deposit',
      priority: 'medium',
      title: `复核押金扣除情况（累计 ¥${depositDeductTotal}）`,
      description: '确认损耗是否已妥善处理，必要时调整押金标准或使用规则。'
    });
  }

  if (borrowCount >= 8) {
    actions.push({
      key: 'inspect',
      priority: 'medium',
      title: '进行深度检查',
      description: `该装备已累计借出 ${borrowCount} 次，建议对关键部位进行全面检查。`
    });
  }

  if (damageCount >= 2) {
    actions.push({
      key: 'usage-guide',
      priority: 'medium',
      title: '更新使用注意事项',
      description: `历史损耗记录达 ${damageCount} 次，建议补充使用说明或对借用人做专项提示。`
    });
  }

  if (actions.length === 0) {
    actions.push({
      key: 'keep',
      priority: 'low',
      title: '状态良好，继续保持',
      description: '装备使用、保养情况良好，请继续按当前节奏维护。'
    });
  }

  return actions;
}

function resolve(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && 'value' in val) return val.value;
  return val;
}

export function useEquipmentHealth({ gearId, gears, requests, handovers, maintenanceRecords, depositRecords }) {
  const gear = computed(() => {
    const g = resolve(gears) || [];
    const id = resolve(gearId);
    return g.find((x) => x.id === id) || null;
  });

  const relatedRequests = computed(() => {
    const list = resolve(requests) || [];
    const id = resolve(gearId);
    return list.filter((r) => r.gearId === id);
  });

  const relatedHandovers = computed(() => {
    const list = resolve(handovers) || [];
    const id = resolve(gearId);
    return list.filter((h) => h.gearId === id);
  });

  const relatedMaintenance = computed(() => {
    const list = resolve(maintenanceRecords) || [];
    const id = resolve(gearId);
    return list.filter((r) => r.gearId === id);
  });

  const relatedDeposits = computed(() => {
    const list = resolve(depositRecords) || [];
    const id = resolve(gearId);
    return list.filter((d) => d.gearId === id);
  });

  const borrowCount = computed(() => relatedRequests.value.length);

  const activeBorrow = computed(() =>
    relatedRequests.value.find((r) => r.status === '已同意' || r.status === '借出中') || null
  );

  const lastMaintenance = computed(() => {
    const records = relatedMaintenance.value;
    if (!records.length) return null;
    return records.reduce((a, b) => (a.date > b.date ? a : b));
  });

  const daysSinceLastMaintenance = computed(() =>
    lastMaintenance.value ? daysAgo(lastMaintenance.value.date) : null
  );

  const damageRecords = computed(() =>
    relatedHandovers.value.filter((h) => h.damageRecord && h.damageRecord.trim())
  );

  const damageCount = computed(() => damageRecords.value.length);

  const depositDeductRecords = computed(() =>
    relatedDeposits.value.filter((d) => Number(d.deductedAmount) > 0)
  );

  const depositDeductCount = computed(() => depositDeductRecords.value.length);

  const depositDeductTotal = computed(() =>
    depositDeductRecords.value.reduce((sum, d) => sum + (Number(d.deductedAmount) || 0), 0)
  );

  const borrowerHistory = computed(() =>
    buildBorrowerHistory(relatedRequests.value, relatedHandovers.value)
  );

  const timeline = computed(() =>
    buildTimelineEvents({
      gear: gear.value,
      requests: relatedRequests.value,
      handovers: relatedHandovers.value,
      maintenanceRecords: relatedMaintenance.value,
      depositRecords: relatedDeposits.value
    })
  );

  const riskTags = computed(() =>
    computeRiskTags({
      gear: gear.value || {},
      borrowCount: borrowCount.value,
      damageCount: damageCount.value,
      depositDeductCount: depositDeductCount.value,
      daysSinceLastMaintenance: daysSinceLastMaintenance.value,
      hasActiveBorrow: !!activeBorrow.value
    })
  );

  const suggestedActions = computed(() =>
    computeSuggestedActions({
      gear: gear.value || {},
      riskTags: riskTags.value,
      daysSinceLastMaintenance: daysSinceLastMaintenance.value,
      borrowCount: borrowCount.value,
      damageCount: damageCount.value,
      depositDeductTotal: depositDeductTotal.value
    })
  );

  const overallHealthScore = computed(() => {
    let score = 100;
    if ((gear.value?.damage || '').trim()) score -= 25;
    if (damageCount.value > 0) score -= Math.min(damageCount.value * 8, 25);
    if (depositDeductCount.value > 0) score -= Math.min(depositDeductCount.value * 5, 15);
    if (daysSinceLastMaintenance.value === null) score -= 10;
    else if (daysSinceLastMaintenance.value > 90) score -= 20;
    else if (daysSinceLastMaintenance.value > 60) score -= 10;
    if (borrowCount.value > 15) score -= Math.min((borrowCount.value - 15) * 2, 10);
    return Math.max(0, Math.min(100, score));
  });

  const healthLevel = computed(() => {
    const s = overallHealthScore.value;
    if (s >= 85) return { label: '优秀', color: '#2f7a3a' };
    if (s >= 70) return { label: '良好', color: '#5a8f3d' };
    if (s >= 50) return { label: '一般', color: '#c58a2b' };
    if (s >= 30) return { label: '关注', color: '#c25a2a' };
    return { label: '需维修', color: '#b02a2a' };
  });

  return {
    gear,
    relatedRequests,
    relatedHandovers,
    relatedMaintenance,
    relatedDeposits,
    borrowCount,
    activeBorrow,
    lastMaintenance,
    daysSinceLastMaintenance,
    damageCount,
    depositDeductCount,
    depositDeductTotal,
    borrowerHistory,
    timeline,
    riskTags,
    suggestedActions,
    overallHealthScore,
    healthLevel
  };
}
