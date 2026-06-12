export const SETTLEMENT_STATUSES = ['草稿', '已确认', '已结算'];
export const PAYMENT_STATUSES = ['未支付', '部分支付', '已支付'];

export function createSettlement({ tripId, tripName, members = [], name = '' }) {
  return {
    id: crypto.randomUUID(),
    tripId: tripId || '',
    tripName: tripName || '',
    name: name || (tripName ? `${tripName} 结算单` : '新结算单'),
    status: '草稿',
    members: members.map((m) => ({
      memberId: m.id || '',
      nickname: m.nickname || '',
      depositItems: [],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    })),
    extraExpenses: [],
    totalDeposit: '0',
    totalDeducted: '0',
    totalExtraExpenses: '0',
    totalPerMember: '0',
    notes: '',
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10)
  };
}

export function linkDepositsToSettlement(settlement, depositRecords, tripMembers, tripGears = []) {
  const memberNames = new Set(tripMembers.map((m) => m.nickname || m));
  const tripGearIds = new Set(tripGears.map((g) => g.gearId).filter(Boolean));
  const useGearFilter = tripGearIds.size > 0;

  const relevantDeposits = depositRecords.filter((d) => {
    if (!memberNames.has(d.borrower)) return false;
    if (useGearFilter && d.gearId && !tripGearIds.has(d.gearId)) return false;
    return true;
  });

  const updatedMembers = settlement.members.map((sm) => {
    const memberDeposits = relevantDeposits.filter((d) => d.borrower === sm.nickname);
    const depositItems = memberDeposits.map((d) => ({
      depositId: d.id,
      gearName: d.gearName,
      depositAmount: d.depositAmount || '0',
      deductedAmount: d.deductedAmount || '0',
      actualDeduct: d.deductedAmount || '0'
    }));
    return { ...sm, depositItems };
  });

  return { ...settlement, members: updatedMembers };
}

export function calculateSettlement(settlement) {
  const memberCount = settlement.members.length || 1;
  const totalExtraExpenses = (settlement.extraExpenses || []).reduce(
    (sum, e) => sum + (Number(e.amount) || 0), 0
  );
  const extraPerMember = totalExtraExpenses / memberCount;

  let totalDeposit = 0;
  let totalDeducted = 0;

  const updatedMembers = settlement.members.map((sm) => {
    const memberDepositTotal = sm.depositItems.reduce(
      (sum, d) => sum + (Number(d.depositAmount) || 0), 0
    );
    const memberDeductTotal = sm.depositItems.reduce(
      (sum, d) => sum + (Number(d.actualDeduct) || 0), 0
    );
    const extraShare = Math.round(extraPerMember * 100) / 100;
    const totalOwed = Math.round((memberDeductTotal + extraShare) * 100) / 100;
    const paidAmount = Number(sm.paidAmount) || 0;

    totalDeposit += memberDepositTotal;
    totalDeducted += memberDeductTotal;

    let paymentStatus = '未支付';
    if (paidAmount >= totalOwed && totalOwed > 0) {
      paymentStatus = '已支付';
    } else if (paidAmount > 0) {
      paymentStatus = '部分支付';
    } else if (totalOwed === 0) {
      paymentStatus = '已支付';
    }

    return {
      ...sm,
      extraShare: String(extraShare),
      totalOwed: String(totalOwed),
      paymentStatus
    };
  });

  const totalPerMember = memberCount > 0
    ? String(Math.round(((totalDeducted + totalExtraExpenses) / memberCount) * 100) / 100)
    : '0';

  return {
    ...settlement,
    members: updatedMembers,
    totalDeposit: String(Math.round(totalDeposit * 100) / 100),
    totalDeducted: String(Math.round(totalDeducted * 100) / 100),
    totalExtraExpenses: String(Math.round(totalExtraExpenses * 100) / 100),
    totalPerMember,
    updatedAt: new Date().toISOString().slice(0, 10)
  };
}

export function addExtraExpense(settlement, expense) {
  const extraExpenses = [
    ...(settlement.extraExpenses || []),
    {
      id: crypto.randomUUID(),
      name: expense.name || '',
      amount: expense.amount || '0',
      paidBy: expense.paidBy || ''
    }
  ];
  return calculateSettlement({ ...settlement, extraExpenses });
}

export function updateExtraExpense(settlement, expenseId, updates) {
  const extraExpenses = (settlement.extraExpenses || []).map((e) =>
    e.id === expenseId ? { ...e, ...updates } : e
  );
  return calculateSettlement({ ...settlement, extraExpenses });
}

export function removeExtraExpense(settlement, expenseId) {
  const extraExpenses = (settlement.extraExpenses || []).filter(
    (e) => e.id !== expenseId
  );
  return calculateSettlement({ ...settlement, extraExpenses });
}

export function updateMemberDepositDeduct(settlement, memberIndex, depositIndex, actualDeduct) {
  const members = settlement.members.map((sm, i) => {
    if (i !== memberIndex) return sm;
    const depositItems = sm.depositItems.map((d, j) =>
      j === depositIndex ? { ...d, actualDeduct: String(actualDeduct) } : d
    );
    return { ...sm, depositItems };
  });
  return calculateSettlement({ ...settlement, members });
}

export function updateMemberPayment(settlement, memberIndex, paidAmount) {
  const members = settlement.members.map((sm, i) => {
    if (i !== memberIndex) return sm;
    return { ...sm, paidAmount: String(paidAmount) };
  });
  return calculateSettlement({ ...settlement, members });
}

export function updateMemberNotes(settlement, memberIndex, notes) {
  const members = settlement.members.map((sm, i) => {
    if (i !== memberIndex) return sm;
    return { ...sm, notes };
  });
  return { ...settlement, members, updatedAt: new Date().toISOString().slice(0, 10) };
}

export function propagateMemberRename(settlements, oldNickname, newNickname) {
  return settlements.map((s) => {
    const members = s.members.map((sm) =>
      sm.nickname === oldNickname ? { ...sm, nickname: newNickname } : sm
    );
    const extraExpenses = (s.extraExpenses || []).map((e) =>
      e.paidBy === oldNickname ? { ...e, paidBy: newNickname } : e
    );
    return { ...s, members, extraExpenses };
  });
}

export function cleanupDeletedTrip(settlements, tripId) {
  return settlements.map((s) => {
    if (s.tripId !== tripId) return s;
    return {
      ...s,
      tripId: '',
      tripName: s.tripName + '（出行已删除）',
      updatedAt: new Date().toISOString().slice(0, 10)
    };
  });
}

export function syncDepositChanges(settlement, depositRecords, tripGears = []) {
  const tripGearIds = new Set(tripGears.map((g) => g.gearId).filter(Boolean));
  const useGearFilter = tripGearIds.size > 0;

  const members = settlement.members.map((sm) => {
    const memberDeposits = depositRecords.filter((d) => {
      if (d.borrower !== sm.nickname) return false;
      if (useGearFilter && d.gearId && !tripGearIds.has(d.gearId)) return false;
      return true;
    });
    const existingMap = {};
    sm.depositItems.forEach((d) => {
      existingMap[d.depositId] = d;
    });

    const depositItems = memberDeposits.map((d) => {
      const existing = existingMap[d.id];
      return {
        depositId: d.id,
        gearName: d.gearName,
        depositAmount: d.depositAmount || '0',
        deductedAmount: d.deductedAmount || '0',
        actualDeduct: existing ? existing.actualDeduct : (d.deductedAmount || '0')
      };
    });

    return { ...sm, depositItems };
  });

  return calculateSettlement({ ...settlement, members });
}

export function getSettlementStats(settlement) {
  if (!settlement) return null;
  const memberCount = settlement.members.length;
  const totalOwed = settlement.members.reduce((sum, m) => sum + (Number(m.totalOwed) || 0), 0);
  const totalPaid = settlement.members.reduce((sum, m) => sum + (Number(m.paidAmount) || 0), 0);
  const paidMembers = settlement.members.filter((m) => m.paymentStatus === '已支付').length;
  const unpaidMembers = settlement.members.filter((m) => m.paymentStatus === '未支付').length;
  const partialMembers = settlement.members.filter((m) => m.paymentStatus === '部分支付').length;
  return {
    memberCount,
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalUnpaid: Math.round((totalOwed - totalPaid) * 100) / 100,
    paidMembers,
    unpaidMembers,
    partialMembers
  };
}
