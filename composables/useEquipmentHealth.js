import { computed } from 'vue';

const DAY_MS = 24 * 60 * 60 * 1000;

const REMINDER_LEVEL_DAYS = {
  '宽松': 7,
  '标准': 14,
  '严格': 30
};

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.floor((d2 - d1) / DAY_MS);
}

function daysAgo(dateStr) {
  return daysBetween(dateStr, new Date().toISOString().slice(0, 10));
}

function daysUntil(dateStr) {
  return daysBetween(new Date().toISOString().slice(0, 10), dateStr);
}

function getMaintenancePlanStatus(gear) {
  if (!gear || !gear.nextMaintenanceDate) {
    return { status: 'normal', daysUntil: null, label: '未设置计划' };
  }

  const cycle = Number(gear.maintenanceCycleDays) || 30;
  const reminderLevel = gear.maintenanceReminderLevel || '标准';
  const reminderDays = REMINDER_LEVEL_DAYS[reminderLevel] || 14;
  const daysLeft = daysUntil(gear.nextMaintenanceDate);

  if (daysLeft < 0) {
    return {
      status: 'overdue',
      daysUntil: daysLeft,
      daysOverdue: Math.abs(daysLeft),
      label: `已逾期 ${Math.abs(daysLeft)} 天`,
      cycle,
      reminderLevel,
      nextDate: gear.nextMaintenanceDate
    };
  } else if (daysLeft <= reminderDays) {
    return {
      status: 'upcoming',
      daysUntil: daysLeft,
      label: `还剩 ${daysLeft} 天`,
      cycle,
      reminderLevel,
      nextDate: gear.nextMaintenanceDate
    };
  }

  return {
    status: 'normal',
    daysUntil: daysLeft,
    label: `还剩 ${daysLeft} 天`,
    cycle,
    reminderLevel,
    nextDate: gear.nextMaintenanceDate
  };
}

function getCompletedBorrowHandovers(handovers) {
  return handovers.filter(
    (h) => h.type === '借出' && h.ownerConfirmed && h.borrowerConfirmed
  );
}

function buildBorrowerHistory(completedHandovers, requests) {
  const map = new Map();
  completedHandovers.forEach((h) => {
    if (!h.borrower) return;
    const req = requests.find((r) => r.id === h.requestId);
    if (!map.has(h.borrower)) {
      map.set(h.borrower, { name: h.borrower, count: 0, lastDate: null });
    }
    const entry = map.get(h.borrower);
    entry.count += 1;
    const date = req ? (req.end || req.start) : h.createdAt;
    if (!entry.lastDate || (date && date > entry.lastDate)) {
      entry.lastDate = date;
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

function computeRiskTags({ gear, borrowCount, damageCount, depositDeductCount, daysSinceLastMaintenance, hasActiveBorrow, maintenancePlanStatus }) {
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

  if (maintenancePlanStatus?.status === 'overdue') {
    tags.push({ key: 'plan-overdue', level: 'danger', label: `保养计划逾期 ${maintenancePlanStatus.daysOverdue} 天`, icon: '🚨' });
  } else if (maintenancePlanStatus?.status === 'upcoming') {
    tags.push({ key: 'plan-upcoming', level: 'warning', label: `保养临近 · 还剩 ${maintenancePlanStatus.daysUntil} 天`, icon: '⏰' });
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

function computeSuggestedActions({ gear, riskTags, daysSinceLastMaintenance, borrowCount, damageCount, depositDeductTotal, maintenancePlanStatus }) {
  const actions = [];

  if (gear.damage && gear.damage.trim()) {
    actions.push({
      key: 'repair',
      priority: 'high',
      title: '及时维修或更新',
      description: `当前记录损耗：${gear.damage}，建议尽快处理以避免影响下次使用。`
    });
  }

  if (maintenancePlanStatus?.status === 'overdue') {
    actions.push({
      key: 'maintenance-plan-overdue',
      priority: 'high',
      title: `立即执行保养（已逾期 ${maintenancePlanStatus.daysOverdue} 天）`,
      description: `保养计划已逾期，请立即进行 ${maintenancePlanStatus.cycle} 天周期的常规保养，完成后将自动更新下次保养日期。`,
      canCreateMaintenance: true,
      maintenanceType: '检查'
    });
  } else if (maintenancePlanStatus?.status === 'upcoming') {
    actions.push({
      key: 'maintenance-plan-upcoming',
      priority: 'high',
      title: `近期安排保养（还剩 ${maintenancePlanStatus.daysUntil} 天）`,
      description: `保养计划将于 ${maintenancePlanStatus.nextDate} 到期，建议提前安排 ${maintenancePlanStatus.cycle} 天周期的常规保养。`,
      canCreateMaintenance: true,
      maintenanceType: '检查'
    });
  } else if (daysSinceLastMaintenance === null || daysSinceLastMaintenance > 60) {
    actions.push({
      key: 'maintenance',
      priority: 'high',
      title: daysSinceLastMaintenance === null ? '建议进行首次保养' : `安排定期保养（超 ${daysSinceLastMaintenance} 天）`,
      description: '建议进行清洁、检查，必要时更换易损件，延长装备使用寿命。',
      canCreateMaintenance: true,
      maintenanceType: '清洁'
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
      description: `该装备已累计借出 ${borrowCount} 次，建议对关键部位进行全面检查。`,
      canCreateMaintenance: true,
      maintenanceType: '检查'
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

export function calcOverallHealthScore({ gear, damageCount, depositDeductCount, daysSinceLastMaintenance, borrowCount, maintenancePlanStatus }) {
  let score = 100;
  if ((gear?.damage || '').trim()) score -= 25;
  if (damageCount > 0) score -= Math.min(damageCount * 8, 25);
  if (depositDeductCount > 0) score -= Math.min(depositDeductCount * 5, 15);
  if (maintenancePlanStatus?.status === 'overdue') {
    score -= Math.min(maintenancePlanStatus.daysOverdue * 2, 25);
  } else if (maintenancePlanStatus?.status === 'upcoming') {
    score -= 5;
  }
  if (daysSinceLastMaintenance === null) score -= 10;
  else if (daysSinceLastMaintenance > 90) score -= 20;
  else if (daysSinceLastMaintenance > 60) score -= 10;
  if (borrowCount > 15) score -= Math.min((borrowCount - 15) * 2, 10);
  return Math.max(0, Math.min(100, score));
}

function getInventoryAbnormalByGear(gearId, inventoryLists) {
  const actions = [];
  const lists = inventoryLists || [];
  for (const list of lists) {
    for (const item of list.items || []) {
      if (item.gearId !== gearId) continue;
      (item.abnormalActions || []).forEach((action) => {
        actions.push({
          ...action,
          inventoryId: list.id,
          inventoryName: list.name,
          inventoryDate: list.date,
          inventoryType: list.type
        });
      });
    }
  }
  return actions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function buildAllHealthInfoMap({ gears, requests, handovers, maintenanceRecords, depositRecords, inventoryLists }) {
  const map = {};
  const gearList = gears || [];
  const reqList = requests || [];
  const hoList = handovers || [];
  const mList = maintenanceRecords || [];
  const dList = depositRecords || [];

  for (const gear of gearList) {
    const relatedHandovers = hoList.filter((h) => h.gearId === gear.id);
    const completedHandovers = relatedHandovers.filter(
      (h) => h.type === '借出' && h.ownerConfirmed && h.borrowerConfirmed
    );
    const borrowCount = completedHandovers.length;

    const relatedMaintenance = mList.filter((r) => r.gearId === gear.id);
    const lastMaintenance = relatedMaintenance.length
      ? relatedMaintenance.reduce((a, b) => (a.date > b.date ? a : b))
      : null;
    const daysSinceLastMaintenance = lastMaintenance ? daysAgo(lastMaintenance.date) : null;

    const handoverDamageCount = relatedHandovers.filter((h) => h.damageRecord && h.damageRecord.trim()).length;
    const abnormalActions = getInventoryAbnormalByGear(gear.id, inventoryLists);
    const inventoryDamageCount = abnormalActions.filter((a) => a.type === '装备损耗' && a.status !== '已取消').length;
    const damageCount = handoverDamageCount + inventoryDamageCount;

    const relatedDeposits = dList.filter((d) => d.gearId === gear.id);
    const depositDeductCount = relatedDeposits.filter((d) => Number(d.deductedAmount) > 0).length;
    const inventoryDepositDeductCount = abnormalActions.filter(
      (a) => a.type === '押金扣除' && a.status !== '已取消'
    ).length;
    const totalDepositDeductCount = depositDeductCount + inventoryDepositDeductCount;

    const inventoryMaintenanceCount = abnormalActions.filter(
      (a) => a.type === '保养记录' && a.status === '已处理'
    ).length;

    const maintenancePlanStatus = getMaintenancePlanStatus(gear);

    map[gear.id] = {
      gearId: gear.id,
      borrowCount,
      damageCount,
      depositDeductCount: totalDepositDeductCount,
      daysSinceLastMaintenance,
      maintenancePlanStatus,
      inventoryAbnormalActions: abnormalActions,
      inventoryDamageCount,
      inventoryMaintenanceCount,
      overallHealthScore: calcOverallHealthScore({
        gear,
        damageCount,
        depositDeductCount: totalDepositDeductCount,
        daysSinceLastMaintenance,
        borrowCount,
        maintenancePlanStatus
      })
    };
  }
  return map;
}

export function useEquipmentHealth({ gearId, gears, requests, handovers, maintenanceRecords, depositRecords, inventoryLists }) {
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

  const inventoryAbnormalActions = computed(() => {
    const id = resolve(gearId);
    const lists = resolve(inventoryLists) || [];
    return getInventoryAbnormalByGear(id, lists);
  });

  const inventoryDamageCount = computed(() =>
    inventoryAbnormalActions.value.filter((a) => a.type === '装备损耗' && a.status !== '已取消').length
  );

  const inventoryMaintenanceCount = computed(() =>
    inventoryAbnormalActions.value.filter((a) => a.type === '保养记录' && a.status === '已处理').length
  );

  const inventoryDepositDeductCount = computed(() =>
    inventoryAbnormalActions.value.filter((a) => a.type === '押金扣除' && a.status !== '已取消').length
  );

  const inventoryDepositDeductTotal = computed(() =>
    inventoryAbnormalActions.value
      .filter((a) => a.type === '押金扣除' && a.status !== '已取消')
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  );

  const completedBorrowHandovers = computed(() =>
    getCompletedBorrowHandovers(relatedHandovers.value)
  );

  const borrowCount = computed(() => completedBorrowHandovers.value.length);

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

  const maintenancePlanStatus = computed(() =>
    gear.value ? getMaintenancePlanStatus(gear.value) : null
  );

  const handoverDamageRecords = computed(() =>
    relatedHandovers.value.filter((h) => h.damageRecord && h.damageRecord.trim())
  );

  const damageCount = computed(() => handoverDamageRecords.value.length + inventoryDamageCount.value);

  const depositDeductRecords = computed(() =>
    relatedDeposits.value.filter((d) => Number(d.deductedAmount) > 0)
  );

  const depositDeductCount = computed(() => depositDeductRecords.value.length + inventoryDepositDeductCount.value);

  const depositDeductTotal = computed(() => {
    const handoverTotal = depositDeductRecords.value.reduce((sum, d) => sum + (Number(d.deductedAmount) || 0), 0);
    return handoverTotal + inventoryDepositDeductTotal.value;
  });

  const borrowerHistory = computed(() =>
    buildBorrowerHistory(completedBorrowHandovers.value, relatedRequests.value)
  );

  const timeline = computed(() => {
    const baseEvents = buildTimelineEvents({
      gear: gear.value,
      requests: relatedRequests.value,
      handovers: relatedHandovers.value,
      maintenanceRecords: relatedMaintenance.value,
      depositRecords: relatedDeposits.value
    });
    const inventoryEvents = inventoryAbnormalActions.value.map((a) => ({
      id: `inv-${a.id}`,
      date: a.createdAt.slice(0, 10),
      type: a.type === '装备损耗' ? 'inventory-damage' : (a.type === '保养记录' ? 'inventory-maintenance' : 'inventory-deposit'),
      subType: a.status,
      title: `${a.type}（盘点异常）`,
      description: a.description,
      meta: {
        inventoryName: a.inventoryName,
        inventoryType: a.inventoryType,
        handler: a.handler,
        amount: a.amount,
        status: a.status
      }
    }));
    return [...baseEvents, ...inventoryEvents].sort((a, b) => b.date.localeCompare(a.date));
  });

  const riskTags = computed(() =>
    computeRiskTags({
      gear: gear.value || {},
      borrowCount: borrowCount.value,
      damageCount: damageCount.value,
      depositDeductCount: depositDeductCount.value,
      daysSinceLastMaintenance: daysSinceLastMaintenance.value,
      hasActiveBorrow: !!activeBorrow.value,
      maintenancePlanStatus: maintenancePlanStatus.value
    })
  );

  const suggestedActions = computed(() =>
    computeSuggestedActions({
      gear: gear.value || {},
      riskTags: riskTags.value,
      daysSinceLastMaintenance: daysSinceLastMaintenance.value,
      borrowCount: borrowCount.value,
      damageCount: damageCount.value,
      depositDeductTotal: depositDeductTotal.value,
      maintenancePlanStatus: maintenancePlanStatus.value
    })
  );

  const overallHealthScore = computed(() =>
    calcOverallHealthScore({
      gear: gear.value,
      damageCount: damageCount.value,
      depositDeductCount: depositDeductCount.value,
      daysSinceLastMaintenance: daysSinceLastMaintenance.value,
      borrowCount: borrowCount.value,
      maintenancePlanStatus: maintenancePlanStatus.value
    })
  );

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
    maintenancePlanStatus,
    damageCount,
    depositDeductCount,
    depositDeductTotal,
    borrowerHistory,
    timeline,
    riskTags,
    suggestedActions,
    overallHealthScore,
    healthLevel,
    inventoryAbnormalActions,
    inventoryDamageCount,
    inventoryMaintenanceCount,
    inventoryDepositDeductCount
  };
}
