import { computed, ref } from 'vue';

function resolve(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && 'value' in val) return val.value;
  return val;
}

export const WRAPUP_STEPS = [
  { key: 'handover', label: '未归还交接', icon: '📦', description: '检查出行中借出的装备是否全部归还' },
  { key: 'inventory', label: '未完成盘点', icon: '📋', description: '检查出行后装备盘点是否完成' },
  { key: 'abnormal', label: '盘点异常处理', icon: '⚠️', description: '处理盘点中发现的异常（缺失、损坏、配件缺失等）' },
  { key: 'deposit', label: '押金扣除确认', icon: '💰', description: '确认盘点异常转为押金扣除的金额' },
  { key: 'expense', label: '公共费用录入', icon: '🧾', description: '录入并分摊本次出行的公共费用' },
  { key: 'payment', label: '成员付款状态', icon: '💳', description: '确认每位成员的付款状态' },
  { key: 'settlement', label: '生成结算单', icon: '📄', description: '生成或刷新最终结算单并完成结算' }
];

export function useTripWrapUp({
  trips,
  members,
  gears,
  requests,
  handoverRecords,
  depositRecords,
  inventoryLists,
  settlementRecords,
  currentUser
}) {
  const tripList = computed(() => resolve(trips) || []);
  const memberList = computed(() => resolve(members) || []);
  const gearList = computed(() => resolve(gears) || []);
  const requestList = computed(() => resolve(requests) || []);
  const handoverList = computed(() => resolve(handoverRecords) || []);
  const depositList = computed(() => resolve(depositRecords) || []);
  const inventoryList = computed(() => resolve(inventoryLists) || []);
  const settlementList = computed(() => resolve(settlementRecords) || []);
  const user = computed(() => resolve(currentUser) || '');

  const selectedTripId = ref(null);

  const selectedTrip = computed(() =>
    tripList.value.find((t) => t.id === selectedTripId.value) || null
  );

  const completedTrips = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tripList.value.filter((t) => t.endDate && t.endDate <= today);
  });

  const tripGearIds = computed(() => {
    if (!selectedTrip.value) return new Set();
    return new Set((selectedTrip.value.gears || []).map((g) => g.gearId).filter(Boolean));
  });

  const tripMembers = computed(() => {
    if (!selectedTrip.value) return [];
    const names = new Set(selectedTrip.value.members || []);
    return memberList.value.filter((m) => names.has(m.nickname));
  });

  const tripRequests = computed(() => {
    if (!selectedTrip.value) return [];
    const gearIds = tripGearIds.value;
    const memberNames = new Set(selectedTrip.value.members || []);
    const tripDate = selectedTrip.value.startDate ? new Date(selectedTrip.value.startDate) : null;
    return requestList.value.filter((req) => {
      if (!gearIds.has(req.gearId)) return false;
      if (!memberNames.has(req.borrower)) return false;
      if (!tripDate || !req.start || !req.end) return true;
      const start = new Date(req.start);
      const end = new Date(req.end);
      return tripDate >= start && tripDate <= end;
    });
  });

  const unreturnedHandovers = computed(() => {
    if (!selectedTrip.value) return [];
    const requestIds = new Set(tripRequests.value.map((r) => r.id));
    const borrowed = handoverList.value.filter(
      (h) => h.type === '借出' && requestIds.has(h.requestId)
    );
    const returned = handoverList.value.filter(
      (h) => h.type === '归还' && requestIds.has(h.requestId)
    );
    const returnedRequestIds = new Set(returned.map((h) => h.requestId));
    return borrowed.filter((b) => !returnedRequestIds.has(b.requestId));
  });

  const pendingInventories = computed(() => {
    if (!selectedTrip.value) return [];
    const tripId = selectedTrip.value.id;
    return inventoryList.value.filter(
      (l) => l.tripId === tripId && l.type === '出行后' && l.status !== '已完成'
    );
  });

  const tripInventories = computed(() => {
    if (!selectedTrip.value) return [];
    const tripId = selectedTrip.value.id;
    return inventoryList.value.filter((l) => l.tripId === tripId && l.type === '出行后');
  });

  const abnormalItems = computed(() => {
    const items = [];
    for (const list of tripInventories.value) {
      for (const item of list.items) {
        if (item.hasAbnormal) {
          items.push({
            ...item,
            inventoryId: list.id,
            inventoryName: list.name,
            inventoryDate: list.date,
            inventoryStatus: list.status
          });
        }
      }
    }
    return items;
  });

  const pendingAbnormalActions = computed(() => {
    const actions = [];
    for (const list of tripInventories.value) {
      for (const item of list.items) {
        (item.abnormalActions || []).forEach((action) => {
          if (action.status === '待处理') {
            actions.push({
              ...action,
              itemId: item.id,
              gearId: item.gearId,
              gearName: item.gearName,
              owner: item.owner,
              inventoryId: list.id,
              inventoryName: list.name,
              inventoryDate: list.date
            });
          }
        });
      }
    }
    return actions;
  });

  const pendingDepositDeductions = computed(() => {
    return pendingAbnormalActions.value.filter((a) => a.type === '押金扣除');
  });

  const tripDeposits = computed(() => {
    if (!selectedTrip.value) return [];
    const requestIds = new Set(tripRequests.value.map((r) => r.id));
    const memberNames = new Set(selectedTrip.value.members || []);
    return depositList.value.filter((d) => {
      if (!memberNames.has(d.borrower)) return false;
      if (requestIds.size > 0 && d.requestId && !requestIds.has(d.requestId)) return false;
      return true;
    });
  });

  const pendingDepositConfirmations = computed(() => {
    return tripDeposits.value.filter((d) => {
      const deducted = Number(d.deductedAmount) || 0;
      const received = Number(d.receivedAmount) || 0;
      if (deducted > 0) {
        return deducted > Number(d.refundedAmount || 0);
      }
      if (received > 0 && d.status === '已收取') {
        return Number(d.refundedAmount || 0) === 0;
      }
      return false;
    });
  });

  const existingSettlement = computed(() => {
    if (!selectedTrip.value) return null;
    return settlementList.value.find((s) => s.tripId === selectedTrip.value.id) || null;
  });

  const stepStatuses = computed(() => {
    if (!selectedTrip.value) return {};
    return {
      handover: unreturnedHandovers.value.length === 0 ? 'completed' : 'pending',
      inventory: pendingInventories.value.length === 0 ? 'completed' : 'pending',
      abnormal: pendingAbnormalActions.value.length === 0 ? 'completed' : 'pending',
      deposit:
        pendingDepositDeductions.value.length === 0 && pendingDepositConfirmations.value.length === 0
          ? 'completed'
          : 'pending',
      expense: existingSettlement.value ? 'completed' : 'pending',
      payment: existingSettlement.value
        ? existingSettlement.value.members.every((m) => m.paymentStatus === '已支付')
          ? 'completed'
          : 'pending'
        : 'pending',
      settlement: existingSettlement.value?.status === '已结算' ? 'completed' : 'pending'
    };
  });

  const overallProgress = computed(() => {
    if (!selectedTrip.value) return 0;
    const statuses = stepStatuses.value;
    const completed = Object.values(statuses).filter((s) => s === 'completed').length;
    const total = WRAPUP_STEPS.length;
    return Math.round((completed / total) * 100);
  });

  const isAllCompleted = computed(() => overallProgress.value === 100);

  function selectTrip(tripId) {
    selectedTripId.value = tripId;
  }

  function getStepDetails(stepKey) {
    const step = WRAPUP_STEPS.find((s) => s.key === stepKey);
    if (!step) return null;
    const status = stepStatuses.value[stepKey] || 'pending';
    let details = { ...step, status, items: [] };

    switch (stepKey) {
      case 'handover':
        details.items = unreturnedHandovers.value;
        details.count = unreturnedHandovers.value.length;
        break;
      case 'inventory':
        details.items = pendingInventories.value;
        details.count = pendingInventories.value.length;
        break;
      case 'abnormal':
        details.items = abnormalItems.value;
        details.count = abnormalItems.value.length;
        details.pendingActions = pendingAbnormalActions.value;
        break;
      case 'deposit':
        details.items = [
          ...pendingDepositDeductions.value,
          ...pendingDepositConfirmations.value.map((d) => ({ ...d, type: 'deposit_record' }))
        ];
        details.count = pendingDepositDeductions.value.length + pendingDepositConfirmations.value.length;
        break;
      case 'expense':
        details.items = existingSettlement.value?.extraExpenses || [];
        details.count = existingSettlement.value?.extraExpenses?.length || 0;
        break;
      case 'payment':
        details.items = existingSettlement.value?.members?.filter((m) => m.paymentStatus !== '已支付') || [];
        details.count = details.items.length;
        break;
      case 'settlement':
        details.items = existingSettlement.value ? [existingSettlement.value] : [];
        details.count = existingSettlement.value ? 1 : 0;
        break;
    }

    return details;
  }

  function getChecklist() {
    if (!selectedTrip.value) return [];
    return WRAPUP_STEPS.map((step) => getStepDetails(step.key)).filter(Boolean);
  }

  function canProceedToStep(stepKey) {
    const stepIndex = WRAPUP_STEPS.findIndex((s) => s.key === stepKey);
    if (stepIndex <= 0) return true;
    const prevSteps = WRAPUP_STEPS.slice(0, stepIndex);
    return prevSteps.every((s) => stepStatuses.value[s.key] === 'completed');
  }

  function getNextIncompleteStep() {
    for (const step of WRAPUP_STEPS) {
      if (stepStatuses.value[step.key] !== 'completed') {
        return step.key;
      }
    }
    return null;
  }

  return {
    selectedTripId,
    selectedTrip,
    completedTrips,
    tripMembers,
    tripRequests,
    tripDeposits,
    tripInventories,
    unreturnedHandovers,
    pendingInventories,
    abnormalItems,
    pendingAbnormalActions,
    pendingDepositDeductions,
    pendingDepositConfirmations,
    existingSettlement,
    stepStatuses,
    overallProgress,
    isAllCompleted,
    selectTrip,
    getStepDetails,
    getChecklist,
    canProceedToStep,
    getNextIncompleteStep
  };
}
